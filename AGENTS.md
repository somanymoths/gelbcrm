# AGENTS.md

## New Task Bootstrap

When the first user message in a new chat contains the exact phrase `Новая задача`, treat it as a task bootstrap trigger for this repository.

Required behavior:

1. Extract the task title from the user's message.
2. Run the project bootstrap command immediately from the repo root:

```bash
scripts/start-task.sh "Название задачи" --type fix --push
```

3. Replace `"Название задачи"` with the actual task title in quotes.
4. Use `fix` as the default branch type unless the user explicitly asks for a feature, chore, or hotfix.
5. Do not ask for confirmation before running the bootstrap unless the repository is in a risky state that blocks the command.
6. After the bootstrap finishes, continue the implementation work in the created branch context.

Task title parsing rules:

- If the user message starts with `Новая задача:`, use the text after the colon as the task title.
- If the phrase `Новая задача` appears in another form, derive the shortest clean task title that preserves the user's intent.
- Preserve the original user language in the title.

Examples:

- User: `Новая задача: исправь deprecated props antd`
  Command: `scripts/start-task.sh "исправь deprecated props antd" --type fix --push`

- User: `Новая задача — добавить фильтр по преподавателю`
  Command: `scripts/start-task.sh "добавить фильтр по преподавателю" --type fix --push`

If `scripts/start-task.sh` fails because the git tree is dirty, report that clearly and stop before making unrelated changes.

## PR Language

All pull request content must be generated in Russian:

- PR title
- PR description/body
- Section headings and checklist items
- Any auto-generated summaries or review notes inside the PR

Do not mix English labels in PR text unless a technical term has no natural Russian equivalent.

## Task Execution Workflow

After bootstrap, follow this order:

1. Fill `.codex/tasks/<branch>/TASK.md` before coding:
   - detailed scope;
   - implementation plan (3-7 steps);
   - at least 3 edge cases that can break the future implementation.
2. Implement in small batches and run checkpoint regularly:
   - `npm run task:checkpoint`
   - soft limits: `>4` changed files or `>150` changed lines.
3. After each meaningful chat/work block, append summary:
   - `npm run task:summary -- "<short status>"`
4. Before PR, run final review preparation:
   - `npm run task:review`
   - this produces `.codex/tasks/<branch>/FINAL_REVIEW.md`.
5. Use `TASK.md` + `SUMMARY.md` + `FINAL_REVIEW.md` as mandatory context for final review and PR text.

If limits are exceeded, stop and report progress before continuing with new large edits.
