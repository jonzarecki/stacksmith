import { z } from "zod/v4";

export const SliceContentSchema = z.object({
  slice: z.number().int().positive(),
  content: z.string(),
  description: z.string(),
});

export type SliceContent = z.infer<typeof SliceContentSchema>;

export const FileAssignmentSchema = z.object({
  path: z.string().min(1),
  splitStrategy: z.enum(["whole", "dissect", "delete"]),
  targetSlice: z.number().int().positive().optional(),
  sliceContents: z.array(SliceContentSchema).optional(),
});

export type FileAssignment = z.infer<typeof FileAssignmentSchema>;

export const SliceSchema = z.object({
  order: z.number().int().positive(),
  title: z.string().min(1),
  rationale: z.string(),
  branch: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export type Slice = z.infer<typeof SliceSchema>;

export const SliceVerificationSchema = z.object({
  sliceOrder: z.number().int().positive(),
  check: z.string(),
  passed: z.boolean(),
  testsRun: z.number().int().nonnegative().optional(),
  testsPassed: z.number().int().nonnegative().optional(),
});

export type SliceVerification = z.infer<typeof SliceVerificationSchema>;

export const PlanMetadataSchema = z.object({
  totalFiles: z.number().int().nonnegative(),
  totalLoc: z.number().int().nonnegative(),
  generatedAt: z.string().datetime(),
  model: z.string(),
  provider: z.string(),
  verification: z.array(SliceVerificationSchema).optional(),
});

export type PlanMetadata = z.infer<typeof PlanMetadataSchema>;

export const StackPlanSchema = z.object({
  version: z.literal(1),
  baseBranch: z.string().min(1),
  sourceBranch: z.string().min(1),
  slices: z.array(SliceSchema).min(1).max(10),
  fileAssignments: z.array(FileAssignmentSchema).min(1),
  metadata: PlanMetadataSchema,
});

export type StackPlan = z.infer<typeof StackPlanSchema>;

/** File classification roles used by the heuristic slicer */
export type FileRole = "types" | "core" | "integration" | "tests" | "docs" | "config" | "unknown";

/** Structured representation of a parsed diff file */
export interface DiffFile {
  path: string;
  oldPath?: string;
  additions: number;
  deletions: number;
  isNew: boolean;
  isDeleted: boolean;
  isRenamed: boolean;
  hunks: DiffHunk[];
}

/** A single hunk within a diff file */
export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  content: string;
}

/** A dependency edge in the import graph */
export interface DepEdge {
  from: string;
  to: string;
}

/** Result of the heuristic pre-analysis passed to the AI planner */
export interface PreAnalysis {
  files: DiffFile[];
  depGraph: DepEdge[];
  fileRoles: Map<string, FileRole>;
  totalAdditions: number;
  totalDeletions: number;
}
