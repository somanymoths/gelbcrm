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

## Critical Flow Guardrails (Do Not Break)

These rules are mandatory for all agents and all tasks, including tasks that do not directly mention payments.

### 1) Protected modules

Without explicit user approval in the current chat, the agent must not change behavior in these paths:

- `src/app/api/v1/payments/**`
- `src/app/api/v1/funnel/cards/[id]/payment-links/**`
- `src/app/payment-links/**`
- `src/lib/funnel.ts` (payment link and payment sync logic)
- `src/lib/db.ts` (payment persistence and payment history blocks)
- `src/lib/payments/**`
- `scripts/backfill-payments-sync.cjs`

Allowed without extra approval:

- non-functional refactors (rename, formatting, comments) that do not change runtime behavior;
- adding tests that only increase coverage for existing behavior.

### 2) Scope gate before editing

Before making edits, the agent must list target files and confirm they are in scope of the user request.
If a protected file must be changed for an unrelated task, stop and ask for explicit confirmation.

### 3) Payment regression suite is required

For any PR that touches at least one protected module, the agent must run and report:

- `npm run typecheck`
- `npm run test`

And must ensure regression coverage exists for:

- successful payment transition `pending -> paid`;
- lesson balance increment for the student;
- payment history status update from pending to paid/succeeded;
- `paid_at` persistence with ISO input converted to MySQL-compatible datetime.

If required tests are missing, the agent must add them in the same task.

### 4) No silent contract changes

The agent must not change these contracts unless user explicitly requests it:

- payment status mapping semantics (`pending`, `paid`, `failed`, `expired`, provider `succeeded`);
- metadata keys used for linking (`payment_link_id`, `lessons_count`, payer metadata);
- fallback reconciliation behavior between provider status and local payment links.

If a contract change is necessary, the agent must:

1. explain the change;
2. update tests;
3. mention migration/rollback impact.

### 5) Diff safety check

Before finalizing, if protected modules are touched, the agent must provide:

- file-by-file reason for each protected file changed;
- explicit confirmation whether behavior changed (`yes/no`);
- if `yes`, list the exact user-approved requirement that allowed it.

### 6) Stop conditions

The agent must stop and ask the user before proceeding when any of the following happens:

- changes exceed task scope and require editing protected modules;
- test failures in payment regression flows;
- uncertainty about behavior in payment status synchronization.
