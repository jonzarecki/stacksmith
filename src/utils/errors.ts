export class StacksmithError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "StacksmithError";
  }
}

export class PlanValidationError extends StacksmithError {
  constructor(
    message: string,
    public readonly details: string[],
  ) {
    super(message, "PLAN_VALIDATION_ERROR");
    this.name = "PlanValidationError";
  }
}

export class GitOperationError extends StacksmithError {
  constructor(message: string) {
    super(message, "GIT_OPERATION_ERROR");
    this.name = "GitOperationError";
  }
}

export class LlmAdapterError extends StacksmithError {
  constructor(message: string) {
    super(message, "LLM_ADAPTER_ERROR");
    this.name = "LlmAdapterError";
  }
}

export class GithubApiError extends StacksmithError {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message, "GITHUB_API_ERROR");
    this.name = "GithubApiError";
  }
}

export class ConfigError extends StacksmithError {
  constructor(message: string) {
    super(message, "CONFIG_ERROR");
    this.name = "ConfigError";
  }
}
