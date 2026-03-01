import { cosmiconfig } from "cosmiconfig";
import { DEFAULT_CONFIG } from "./defaults.js";
import { type Config, ConfigSchema } from "./schema.js";

const MODULE_NAME = "stacksmith";

const explorer = cosmiconfig(MODULE_NAME, {
  searchPlaces: [
    `.${MODULE_NAME}rc`,
    `.${MODULE_NAME}rc.json`,
    `.${MODULE_NAME}rc.yaml`,
    `.${MODULE_NAME}rc.yml`,
    `${MODULE_NAME}.config.js`,
    `${MODULE_NAME}.config.ts`,
    `${MODULE_NAME}.config.mjs`,
    `${MODULE_NAME}.config.cjs`,
  ],
});

export async function loadConfig(searchFrom?: string): Promise<Config> {
  const result = await explorer.search(searchFrom);
  if (!result || result.isEmpty) {
    return DEFAULT_CONFIG;
  }
  const parsed = ConfigSchema.parse(result.config);
  return parsed;
}

export async function loadConfigFromPath(filePath: string): Promise<Config> {
  const result = await explorer.load(filePath);
  if (!result || result.isEmpty) {
    return DEFAULT_CONFIG;
  }
  const parsed = ConfigSchema.parse(result.config);
  return parsed;
}
