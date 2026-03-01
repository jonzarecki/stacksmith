#!/usr/bin/env bash
# Blocks edits to protected config files unless explicitly requested.

PROTECTED_FILES=(
  "SPEC.md"
  ".env"
  ".env.local"
  ".env.production"
  ".claude/settings.json"
)

for file in "${PROTECTED_FILES[@]}"; do
  if echo "$CLAUDE_TOOL_INPUT" | grep -q "$file"; then
    echo "BLOCKED: $file is a protected file. Ask the user before editing."
    exit 1
  fi
done

exit 0
