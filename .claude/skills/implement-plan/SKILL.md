# Implement Plan Skill

Execute the next task from TASKS.md following project conventions.

## Trigger
Invoke via `/plan` command or when asked to implement the next task.

## Process
1. Read `TASKS.md` — find the first unchecked item (`- [ ]`). Checked items (`- [x]`) are done.
2. Read `SPEC.md` for product requirements relevant to the task
3. Read `ARCH.md` for architectural constraints, patterns, and file tree
4. Read `.context/activeContext.md` for current session context
5. Implement the task following repo conventions
6. Write tests alongside implementation (TDD when possible)
7. Run tests scoped to the affected module
8. Mark the task done in `TASKS.md` (`- [ ]` → `- [x]`)
9. Update `.context/progress.md` with what was completed
10. Update `.context/activeContext.md` if focus has shifted

## TASKS.md Format
```markdown
## Completed
- [x] Task that is done

## In Progress
- [ ] Task being worked on  ← pick this one

## Backlog
- [ ] Future task
```

## Constraints
- Strict typing — no `any` (TS) or untyped functions (Python)
- Every module must have corresponding tests
- Update `.context/progress.md` after completing tasks
- Reference `SPEC.md` for product requirements
