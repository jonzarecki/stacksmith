import parseDiff from "parse-diff";
import type { DiffFile, DiffHunk } from "../types/index.js";

export function parseDiffString(diffText: string): DiffFile[] {
  const parsed = parseDiff(diffText);
  return parsed.map(mapFileToDiffFile);
}

function mapFileToDiffFile(file: parseDiff.File): DiffFile {
  const path = file.to === "/dev/null" ? (file.from ?? "") : (file.to ?? "");
  const oldPath =
    file.from !== file.to && file.from !== "/dev/null" ? (file.from ?? undefined) : undefined;

  return {
    path,
    oldPath,
    additions: file.additions,
    deletions: file.deletions,
    isNew: file.new === true,
    isDeleted: file.deleted === true,
    isRenamed: file.from !== file.to && file.from !== "/dev/null" && file.to !== "/dev/null",
    hunks: file.chunks.map(mapChunkToHunk),
  };
}

function mapChunkToHunk(chunk: parseDiff.Chunk): DiffHunk {
  const lines = chunk.changes.map((c) => {
    if (c.type === "add") return `+${c.content}`;
    if (c.type === "del") return `-${c.content}`;
    return ` ${c.content}`;
  });

  return {
    oldStart: chunk.oldStart,
    oldLines: chunk.oldLines,
    newStart: chunk.newStart,
    newLines: chunk.newLines,
    content: lines.join("\n"),
  };
}

export function computeDiffStats(files: DiffFile[]): {
  totalAdditions: number;
  totalDeletions: number;
  totalFiles: number;
} {
  let totalAdditions = 0;
  let totalDeletions = 0;
  for (const file of files) {
    totalAdditions += file.additions;
    totalDeletions += file.deletions;
  }
  return { totalAdditions, totalDeletions, totalFiles: files.length };
}
