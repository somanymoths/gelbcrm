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
6. After the bootstrap finishes, continue the implementation work in the created branch/worktree context.

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
