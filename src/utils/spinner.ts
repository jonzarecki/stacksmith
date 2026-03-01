import ora, { type Ora } from "ora";

const PROGRESS_INTERVAL_MS = 10_000;

const PROGRESS_HINTS = [
  "still working...",
  "this can take a minute for large diffs...",
  "AI is analyzing your code...",
  "almost there...",
];

export async function withSpinner<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const spinner = ora(label).start();
  const startTime = Date.now();
  let hintIndex = 0;

  const timer = setInterval(() => {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const hint = PROGRESS_HINTS[hintIndex % PROGRESS_HINTS.length] ?? "";
    spinner.text = `${label} (${elapsed}s) — ${hint}`;
    hintIndex++;
  }, PROGRESS_INTERVAL_MS);

  try {
    const result = await fn();
    clearInterval(timer);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    spinner.succeed(`${label} (${elapsed}s)`);
    return result;
  } catch (error) {
    clearInterval(timer);
    spinner.fail(label);
    throw error;
  }
}

export class ProgressSpinner {
  private spinner: Ora;
  private baseLabel: string;
  private startTime: number;

  constructor(label: string) {
    this.baseLabel = label;
    this.startTime = Date.now();
    this.spinner = ora(label).start();
  }

  update(step: string): void {
    const elapsed = Math.round((Date.now() - this.startTime) / 1000);
    this.spinner.text = `${this.baseLabel} (${elapsed}s) — ${step}`;
  }

  succeed(message?: string): void {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    this.spinner.succeed(message ?? `${this.baseLabel} (${elapsed}s)`);
  }

  fail(message?: string): void {
    this.spinner.fail(message ?? this.baseLabel);
  }
}
