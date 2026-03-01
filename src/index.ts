import { program } from "commander";
import { applyCommand } from "./cli/apply.js";
import { pushCommand } from "./cli/push.js";
import { splitCommand } from "./cli/split.js";

program
  .name("stacksmith")
  .description("Split large AI-generated diffs into clean, ordered stacks of reviewable PRs")
  .version("0.1.0");

program
  .command("split")
  .description("Analyze diff and generate a stack plan")
  .action(async () => {
    try {
      await splitCommand();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

program
  .command("apply")
  .description("Create commits and branches from a stack plan")
  .action(async () => {
    try {
      await applyCommand();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

program
  .command("push")
  .description("Push branches and open GitHub PRs")
  .action(async () => {
    try {
      await pushCommand();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

program.parse();
