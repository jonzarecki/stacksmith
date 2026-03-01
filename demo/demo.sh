#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STACKSMITH="$REPO_ROOT/dist/index.js"
DEMO_DIR=""
FAST_MODE=false
REPLAY_MODE=false

for arg in "$@"; do
  case "$arg" in
    --fast) FAST_MODE=true ;;
    --replay) REPLAY_MODE=true ;;
  esac
done

GOLDEN_PLAN="$REPO_ROOT/tests/fixtures/plans/demo-golden-plan.json"

# Make stacksmith available on PATH
DEMO_BIN=$(mktemp -d "${TMPDIR:-/tmp}/stacksmith-bin-XXXXXX")
ln -sf "$STACKSMITH" "$DEMO_BIN/stacksmith"
export PATH="$DEMO_BIN:$PATH"

# ── ANSI helpers ─────────────────────────────────────────────────────────────

CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

cleanup() {
  [[ -n "$DEMO_DIR" && -d "$DEMO_DIR" ]] && rm -rf "$DEMO_DIR"
  [[ -n "$DEMO_BIN" && -d "$DEMO_BIN" ]] && rm -rf "$DEMO_BIN"
}
trap cleanup EXIT

type_cmd() {
  printf "${GREEN}\$ ${RESET}"
  if [[ "$FAST_MODE" == true ]]; then
    printf "${BOLD}%s${RESET}\n" "$1"
  else
    local cmd="$1"
    for ((i=0; i<${#cmd}; i++)); do
      printf "${BOLD}%s${RESET}" "${cmd:$i:1}"
      sleep 0.03
    done
    echo ""
  fi
}

pe() { type_cmd "$1"; eval "$1"; }

section() {
  local title="$1"
  local len=${#title}
  echo ""
  printf "${CYAN}╔═"; printf '═%.0s' $(seq 1 "$len"); printf "═╗${RESET}\n"
  printf "${CYAN}║ ${BOLD}%s${RESET}${CYAN} ║${RESET}\n" "$title"
  printf "${CYAN}╚═"; printf '═%.0s' $(seq 1 "$len"); printf "═╝${RESET}\n"
}

commentary() {
  echo ""
  for line in "$@"; do
    printf "  ${DIM}%s${RESET}\n" "$line"
  done
}

warning_box() {
  echo ""
  printf "  ${RED}${BOLD}⚠  %s${RESET}\n" "$1"
  shift
  for line in "$@"; do
    printf "  ${RED}   %s${RESET}\n" "$line"
  done
  echo ""
}

press_enter() {
  if [[ "$FAST_MODE" == true ]]; then return; fi
  printf "\n${DIM}  press enter to continue...${RESET}"
  read -r
  clear
}

# ── Prereqs ──────────────────────────────────────────────────────────────────

check_prereqs() {
  local missing=0

  if ! command -v node &>/dev/null; then
    printf "  ${RED}✗ node not found.${RESET} Install Node.js >= 20\n"
    missing=1
  fi

  if [[ ! -f "$STACKSMITH" ]]; then
    printf "  ${RED}✗ stacksmith not built.${RESET} Run: pnpm build\n"
    missing=1
  fi

  if [[ "$REPLAY_MODE" != true ]]; then
    local has_llm=0
    [[ -n "${ANTHROPIC_API_KEY:-}" ]] && has_llm=1
    [[ -n "${OPENAI_API_KEY:-}" ]] && has_llm=1
    [[ -n "${GOOGLE_GENERATIVE_AI_KEY:-}" ]] && has_llm=1
    command -v claude &>/dev/null && has_llm=1

    if [[ $has_llm -eq 0 ]]; then
      printf "  ${RED}✗ No LLM provider found.${RESET}\n"
      echo "    Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_GENERATIVE_AI_KEY"
      echo "    Or install Claude CLI"
      missing=1
    fi
  fi

  if [[ $missing -eq 1 ]]; then
    echo ""; echo "  Fix the above and re-run."; exit 1
  fi

  printf "  ${GREEN}✓ All prerequisites met.${RESET}\n"
}

# ── Acts ─────────────────────────────────────────────────────────────────────

act_opening() {
  [[ "$FAST_MODE" != true ]] && clear

  echo ""
  printf "${CYAN}${BOLD}"
  echo "  ╔═╗╔╦╗╔═╗╔═╗╦╔═╔═╗╔╦╗╦╔╦╗╦ ╦"
  echo "  ╚═╗ ║ ╠═╣║  ╠╩╗╚═╗║║║║ ║ ╠═╣"
  echo "  ╚═╝ ╩ ╩ ╩╚═╝╩ ╩╚═╝╩ ╩╩ ╩ ╩ ╩"
  printf "${RESET}"
  printf "  ${DIM}Forging clean stacks from messy code${RESET}\n"
  echo ""

  commentary \
    "Stacksmith takes a large, messy diff from AI-assisted coding" \
    "and splits it into a clean, ordered stack of reviewable PRs." \
    "" \
    "This demo walks through the full workflow:" \
    "  diff → split (AI) → apply → push"

  echo ""
  check_prereqs
  press_enter
}

act_problem() {
  section "Act 1: The Problem"

  commentary \
    "Imagine you just finished a vibe-coding session with an AI." \
    "You asked it to add a full REST API with users and posts." \
    "It wrote everything in one shot — types, services, routes," \
    "middleware, tests — all in a single branch."

  press_enter

  pe "git log --oneline --all"
  pe "git diff main..feat/full-rest-api --stat"

  warning_box \
    "This is ONE pull request." \
    "11 files. 362 insertions. Types, services, routes," \
    "middleware, tests — all tangled together." \
    "" \
    "Nobody wants to review this."

  press_enter
}

act_split() {
  section "Act 2: stacksmith split"

  commentary \
    "Stacksmith analyzes the diff with an AI planner." \
    "It parses imports, builds a dependency graph," \
    "and proposes an ordered stack of PRs."

  press_enter

  git checkout -q feat/full-rest-api

  if [[ "$REPLAY_MODE" == true ]]; then
    commentary "Analyzing diff with AI..."
    echo ""
    type_cmd "stacksmith split"

    printf "  ${GREEN}✔${RESET} Loading config\n"
    sleep 0.3
    printf "  ${GREEN}✔${RESET} Resolving LLM adapter\n"
    sleep 0.3
    printf "  ${GREEN}✔${RESET} Getting diff vs base branch\n"
    sleep 0.2
    printf "  Found 14 changed files\n"
    sleep 0.5

    # Simulate AI thinking time
    for i in 1 2 3 4 5 6 7 8; do
      local elapsed=$((i * 2))
      printf "\r  ⠙ Generating plan (${elapsed}s)..."
      sleep 1
    done
    printf "\r  ${GREEN}✔${RESET} Generating plan (16.2s)    \n"
    sleep 0.5

    # Simulate boundary verification
    printf "  ⠙ Verifying boundaries — checking slice 1/5..."
    sleep 1
    printf "\r  ⠙ Verifying boundaries — checking slice 3/5..."
    sleep 1
    printf "\r  ⠙ Verifying boundaries — checking slice 5/5..."
    sleep 1
    printf "\r  ${GREEN}✔${RESET} Verifying boundaries — 5/5 slices passed (tsc + tests)\n"
    sleep 0.3

    cp "$GOLDEN_PLAN" stack.plan.json
    printf "\n  ${GREEN}✔${RESET} Plan written to stack.plan.json\n"

    # Display plan summary from the golden plan
    local slice_count
    slice_count=$(node -e "const p=JSON.parse(require('fs').readFileSync('stack.plan.json','utf8')); console.log(p.slices.length)")
    printf "\n  ${GREEN}✓ Stack Plan: ${slice_count} slices${RESET}\n\n"

    node -e "
      const p = JSON.parse(require('fs').readFileSync('stack.plan.json', 'utf8'));
      const slices = p.slices.sort((a,b) => a.order - b.order);
      for (const s of slices) {
        const files = p.fileAssignments.filter(f => f.targetSlice === s.order || (f.sliceContents && f.sliceContents.some(c => c.slice === s.order))).length;
        const v = (p.metadata.verification || []).find(v => v.sliceOrder === s.order);
        const lint = v ? '✓ ' + v.check : '';
        const tests = v && v.testsRun ? v.testsPassed + '/' + v.testsRun + ' passed' : '';
        console.log('  ' + s.order + '. ' + s.title);
        console.log('     ' + files + ' files  |  ' + lint + (tests ? '  |  ' + tests : ''));
      }
    "
  else
    commentary "Running a real AI call..."
    echo ""
    pe "stacksmith split"
  fi

  press_enter
}

act_apply() {
  section "Act 3: stacksmith apply"

  commentary \
    "Now stacksmith creates one branch per slice." \
    "Each branch builds on the previous one," \
    "forming a clean, ordered stack."

  press_enter

  pe "stacksmith apply"

  press_enter

  commentary "And the commit graph:"
  echo ""

  pe "git log --oneline --graph --all --decorate"

  press_enter
}

act_push() {
  section "Act 4: stacksmith push"

  commentary \
    "In a real repo with a GitHub remote," \
    "stacksmith push would push branches and create PRs." \
    "PR #1 is marked Ready; the rest are Drafts" \
    "with depends-on links between them." \
    "" \
    "(Skipping in this demo — no real GitHub remote.)"

  press_enter
}

act_closing() {
  echo ""
  printf "${CYAN}${BOLD}"
  echo "  ╔═══════════════════════════════════╗"
  echo "  ║                                   ║"
  echo "  ║       One messy diff.             ║"
  echo "  ║       Clean, focused PRs.         ║"
  echo "  ║       Zero manual work.           ║"
  echo "  ║                                   ║"
  echo "  ╚═══════════════════════════════════╝"
  printf "${RESET}\n"
}

# ── Main ─────────────────────────────────────────────────────────────────────

main() {
  act_opening

  commentary "Setting up demo repository..."
  DEMO_DIR=$(bash "$SCRIPT_DIR/setup-fixture.sh")
  cd "$DEMO_DIR"
  printf "  ${GREEN}✓ Demo repo ready at ${DEMO_DIR}${RESET}\n"

  act_problem
  act_split
  act_apply
  act_push
  act_closing
}

main "$@"
