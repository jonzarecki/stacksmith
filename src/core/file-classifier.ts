import type { FileRole } from "../types/index.js";

interface ClassificationRule {
  role: FileRole;
  patterns: RegExp[];
}

const RULES: ClassificationRule[] = [
  {
    role: "tests",
    patterns: [
      /\.test\.[jt]sx?$/,
      /\.spec\.[jt]sx?$/,
      /__tests__\//,
      /tests?\//,
      /test_.*\.py$/,
      /.*_test\.py$/,
      /.*_test\.go$/,
      /conftest\.py$/,
      /pytest\.ini$/,
      /jest\.config/,
      /vitest\.config/,
    ],
  },
  {
    role: "docs",
    patterns: [/\.md$/, /\.mdx$/, /\.rst$/, /docs?\//, /README/i, /CHANGELOG/i, /LICENSE/i],
  },
  {
    role: "config",
    patterns: [
      /\.config\.[jt]sx?$/,
      /\.json$/,
      /\.ya?ml$/,
      /\.toml$/,
      /\.env/,
      /Dockerfile/,
      /docker-compose/,
      /\.github\//,
      /tsconfig/,
      /package\.json$/,
      /pyproject\.toml$/,
      /setup\.py$/,
      /setup\.cfg$/,
      /Makefile$/,
      /\.eslintrc/,
      /\.prettierrc/,
      /biome\.json$/,
    ],
  },
  {
    role: "types",
    patterns: [
      /types?\.[jt]sx?$/,
      /interfaces?\.[jt]sx?$/,
      /schemas?\.[jt]sx?$/,
      /models?\.[jt]sx?$/,
      /\.d\.ts$/,
      /types?\//,
      /schemas?\//,
      /models?\//,
      /\.proto$/,
      /\.graphql$/,
    ],
  },
  {
    role: "integration",
    patterns: [
      /routes?\.[jt]sx?$/,
      /routes?\//,
      /controllers?\.[jt]sx?$/,
      /controllers?\//,
      /middleware\.[jt]sx?$/,
      /router\.[jt]sx?$/,
      /endpoints?\.[jt]sx?$/,
      /endpoints?\//,
      /handlers?\.[jt]sx?$/,
      /handlers?\//,
      /app\.[jt]sx?$/,
      /server\.[jt]sx?$/,
      /index\.[jt]sx?$/,
      /main\.[jt]sx?$/,
    ],
  },
  {
    role: "core",
    patterns: [/\.[jt]sx?$/, /\.py$/, /\.go$/, /\.rs$/],
  },
];

export function classifyFile(filePath: string): FileRole {
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(filePath))) {
      return rule.role;
    }
  }
  return "unknown";
}

export function classifyFiles(filePaths: string[]): Map<string, FileRole> {
  const result = new Map<string, FileRole>();
  for (const path of filePaths) {
    result.set(path, classifyFile(path));
  }
  return result;
}
