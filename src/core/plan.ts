import { readFile, writeFile } from "node:fs/promises";
import { type StackPlan, StackPlanSchema } from "../types/index.js";

const PLAN_FILENAME = "stack.plan.json";

export function getPlanFilename(): string {
  return PLAN_FILENAME;
}

export async function writePlan(plan: StackPlan, dir: string): Promise<string> {
  const filePath = `${dir}/${PLAN_FILENAME}`;
  const json = JSON.stringify(plan, null, 2);
  await writeFile(filePath, json, "utf-8");
  return filePath;
}

export async function readPlan(dir: string): Promise<StackPlan> {
  const filePath = `${dir}/${PLAN_FILENAME}`;
  const raw = await readFile(filePath, "utf-8");
  const data: unknown = JSON.parse(raw);
  return StackPlanSchema.parse(data);
}

export function validatePlan(data: unknown): StackPlan {
  return StackPlanSchema.parse(data);
}
