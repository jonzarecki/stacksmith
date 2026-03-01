import type { DepEdge, DiffFile, FileRole, PreAnalysis } from "../types/index.js";
import { buildDepGraph } from "./dep-graph.js";
import { computeDiffStats } from "./diff-parser.js";
import { classifyFiles } from "./file-classifier.js";

const ROLE_ORDER: FileRole[] = [
  "types",
  "core",
  "integration",
  "tests",
  "docs",
  "config",
  "unknown",
];

export interface SlicerBucket {
  role: FileRole;
  files: string[];
}

export function buildPreAnalysis(files: DiffFile[]): PreAnalysis {
  const fileRoles = classifyFiles(files.map((f) => f.path));
  const depGraph = buildDepGraph(files);
  const stats = computeDiffStats(files);

  return {
    files,
    depGraph,
    fileRoles,
    totalAdditions: stats.totalAdditions,
    totalDeletions: stats.totalDeletions,
  };
}

export function bucketByRole(fileRoles: Map<string, FileRole>): SlicerBucket[] {
  const bucketMap = new Map<FileRole, string[]>();

  for (const role of ROLE_ORDER) {
    bucketMap.set(role, []);
  }

  for (const [path, role] of fileRoles) {
    const bucket = bucketMap.get(role);
    if (bucket) {
      bucket.push(path);
    }
  }

  return ROLE_ORDER.map((role) => ({ role, files: bucketMap.get(role) ?? [] })).filter(
    (b) => b.files.length > 0,
  );
}

export function topologicalSort(files: string[], edges: DepEdge[]): string[] {
  const fileSet = new Set(files);
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const file of files) {
    adjacency.set(file, []);
    inDegree.set(file, 0);
  }

  // Edge: from imports to, so "to" (dependency) must come before "from" (importer).
  // Build precedence graph: when we process "to", we decrement "from"'s inDegree.
  for (const edge of edges) {
    if (fileSet.has(edge.from) && fileSet.has(edge.to)) {
      const deps = adjacency.get(edge.to);
      if (deps) deps.push(edge.from);
      inDegree.set(edge.from, (inDegree.get(edge.from) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [file, degree] of inDegree) {
    if (degree === 0) {
      queue.push(file);
    }
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    queue.sort();
    const current = queue.shift();
    if (current === undefined) break;
    sorted.push(current);

    for (const neighbor of adjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  // Add any remaining files (cycles) at the end
  for (const file of files) {
    if (!sorted.includes(file)) {
      sorted.push(file);
    }
  }

  return sorted;
}

export function orderFilesInBucket(bucket: SlicerBucket, edges: DepEdge[]): string[] {
  if (bucket.files.length <= 1) return bucket.files;
  return topologicalSort(bucket.files, edges);
}
