# AI_RULES.md

Contains strict behavioral rules:

- Never hallucinate.
- Never invent APIs.
- Never invent database tables.
- Read all relevant files before editing.
- Build after every major change.
- Fix errors before continuing.
- Never claim a task is complete without verification.
- Reuse existing code instead of duplicating it.

## Extra Rules for Small Open-Source Models (Qwen, DeepSeek, GLM, Mistral, Llama, etc.)

- Never modify more than 5 files at once.
- Never generate code without reading the related files.
- Never rewrite an entire file if only a small section needs changing.
- Never guess the project structure.
- If a dependency is missing, search the project first.
- Always prefer existing utilities.
- Always verify imports before editing.

### After each edit:
- Build
- Fix errors
- Continue

- Never queue multiple unverified changes.
- Never continue after a failed build.
- Stop and fix first.
