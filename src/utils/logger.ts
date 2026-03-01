import { type ConsolaInstance, consola } from "consola";

export const logger: ConsolaInstance = consola.withTag("stacksmith");

export function setLogLevel(level: "debug" | "info" | "warn" | "error" | "silent"): void {
  const levels: Record<string, number> = {
    debug: 4,
    info: 3,
    warn: 2,
    error: 1,
    silent: 0,
  };
  logger.level = levels[level] ?? 3;
}
