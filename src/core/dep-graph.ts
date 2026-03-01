import type { DepEdge, DiffFile } from "../types/index.js";

const TS_IMPORT_PATTERNS = [
  /import\s+(?:.*\s+from\s+)?['"]([^'"]+)['"]/g,
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

const PY_IMPORT_PATTERNS = [/^from\s+([\w.]+)\s+import/gm, /^import\s+([\w.]+)/gm];

export function extractImports(filePath: string, content: string): string[] {
  const isTypescript = /\.[jt]sx?$/.test(filePath);
  const isPython = /\.py$/.test(filePath);
  const imports: string[] = [];

  const patterns = isTypescript ? TS_IMPORT_PATTERNS : isPython ? PY_IMPORT_PATTERNS : [];

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null = regex.exec(content);
    while (match !== null) {
      const importPath = match[1];
      if (importPath && isRelativeImport(importPath, isTypescript)) {
        imports.push(importPath);
      }
      match = regex.exec(content);
    }
  }

  return [...new Set(imports)];
}

function isRelativeImport(importPath: string, isTypescript: boolean): boolean {
  if (isTypescript) {
    return importPath.startsWith("./") || importPath.startsWith("../");
  }
  return !importPath.startsWith("__") && importPath.includes(".");
}

export function resolveImportPath(fromFile: string, importSpecifier: string): string {
  const fromDir = fromFile.substring(0, fromFile.lastIndexOf("/"));
  if (importSpecifier.startsWith("./") || importSpecifier.startsWith("../")) {
    const parts = `${fromDir}/${importSpecifier}`.split("/");
    const resolved: string[] = [];
    for (const part of parts) {
      if (part === "..") {
        resolved.pop();
      } else if (part !== ".") {
        resolved.push(part);
      }
    }
    let result = resolved.join("/");
    result = result.replace(/\.[jt]sx?$/, "").replace(/\.js$/, "");
    return result;
  }
  return importSpecifier;
}

export function buildDepGraph(files: DiffFile[]): DepEdge[] {
  const edges: DepEdge[] = [];
  const changedPaths = new Set(files.map((f) => f.path));

  for (const file of files) {
    const fullContent = file.hunks.map((h) => h.content).join("\n");
    const addedLines = fullContent
      .split("\n")
      .filter((line) => line.startsWith("+"))
      .map((line) => line.substring(1))
      .join("\n");

    const imports = extractImports(file.path, addedLines);

    for (const imp of imports) {
      const resolved = resolveImportPath(file.path, imp);
      const matchedFile = findMatchingFile(resolved, changedPaths);
      if (matchedFile && matchedFile !== file.path) {
        edges.push({ from: file.path, to: matchedFile });
      }
    }
  }

  return deduplicateEdges(edges);
}

function findMatchingFile(resolvedPath: string, changedPaths: Set<string>): string | undefined {
  if (changedPaths.has(resolvedPath)) return resolvedPath;

  const extensions = [".ts", ".tsx", ".js", ".jsx", ".py"];
  for (const ext of extensions) {
    if (changedPaths.has(`${resolvedPath}${ext}`)) return `${resolvedPath}${ext}`;
  }

  for (const ext of extensions) {
    if (changedPaths.has(`${resolvedPath}/index${ext}`)) return `${resolvedPath}/index${ext}`;
  }

  return undefined;
}

function deduplicateEdges(edges: DepEdge[]): DepEdge[] {
  const seen = new Set<string>();
  return edges.filter((e) => {
    const key = `${e.from}->${e.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
