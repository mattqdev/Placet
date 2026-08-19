# Testing Placet

Two layers, deliberately kept separate: an automated suite that never calls
an AI provider (fast, free, run it constantly), and a couple of manual
checks for the parts that genuinely need a real Claude Code / opencode
session — kept as small as possible so you don't burn time or tokens
re-verifying things the automated suite already covers.

## 1. Automated suite — `npm test`

```bash
npm test
```

This builds the extension + forwarder bundles, bundles `test/*.test.ts` with
esbuild, and runs them with Node's built-in test runner (`node:test` — no
extra test framework dependency). No network calls, no AI provider calls,
no VS Code host required. Safe to run on every change.

| File | Covers |
|---|---|
| `test/translate.test.ts` | Claude Code hook → `TaskEvent` translation: todo lifecycle, stable todo ids, file attribution to the active todo, test-command detection, the turn-task-suppression fix |
| `test/opencodePlugin.test.ts` | Same coverage, driven through the real bundled opencode plugin hooks |
| `test/forwarder.test.ts` | End-to-end: spawns the real `dist/forwarder.js`, like Claude Code actually invokes it, against a fake local server |
| `test/gitOps.test.ts` | Diff/stage/commit/push scoped to exactly the given files, against a real temp git repo |
| `test/ensureGitignore.test.ts` | All the `.gitignore`-patching edge cases (missing file, no trailing newline, already covered, idempotency) |
| `test/installers.test.ts` | Both "Connect" commands: hook JSON shape, idempotent re-run, which file gets gitignored and which doesn't |
| `test/taskStore.test.ts` | Event folding, `filesTouched` accumulation, `markReviewed` |
| `test/generateMessage.test.ts` | Commit message prompt/cleanup logic, and the fallback template when `claude` isn't on `PATH` — **no live model call** |

What's *not* covered here, on purpose: `extension.ts`, `logger.ts`,
`taskPanelProvider.ts`, `approvalPanel.ts` — the thin `vscode`-API wiring
layer, which needs a real extension host to exercise meaningfully. That's
what the F5 dev host + the manual checks below are for.

## 2. Manual UI / approve-to-commit check — zero AI cost

`scripts/simulate-task.js` POSTs a synthetic task lifecycle straight to a
**running** Placet instance's local server. It never touches Claude Code or
opencode, so it costs nothing and takes seconds.

```bash
# 1. Press F5 in VS Code to open the Extension Development Host.
# 2. In that window, open a scratch git repo as the workspace folder.
# 3. Make a couple of real, uncommitted edits yourself (no AI needed),
#    e.g. `echo hi >> a.txt && echo hi >> b.txt`.
# 4. From a normal terminal, outside the dev host:
node /path/to/Placet/scripts/simulate-task.js --dir /path/to/that/scratch/repo --files a.txt,b.txt --title "Refactor auth"
```

Watch the sidebar: a row appears and walks through thinking → coding →
testing → completed. Click 👍 to exercise the real approve-to-commit flow
(scoped diff, `claude -p` commit message generation, the confirmation
panel) against those two real files. Run `node scripts/simulate-task.js
--help` for all options.

## 3. Manual real-AI smoke test — only when validating actual hook wiring

Everything simulate-task.js can't cover: whether "Placet: Connect Claude
Code" / "Placet: Connect opencode" actually wire up correctly in a real
session. You only need this after touching the installer/hook/plugin code
itself — not for UI or approve-flow changes. Two prompts, chosen to be as
cheap as a real session gets:

**Single-task check** (validates `UserPromptSubmit`/`chat.message` →
`Edit` → `Stop`):
> Add a one-line comment `// placet test` at the top of README.md

**Multi-task check** (validates the todo-switch attribution logic, the same
thing `translate.test.ts` / `opencodePlugin.test.ts` already verify with
synthetic payloads — use this only to confirm the *real* hook wiring
matches what those tests assume):
> Make two trivial edits and track them as two separate todo items: 1) add
> `// step 1` to a.txt, 2) add `// step 2` to b.txt

Both are single-file-or-two, no exploration, minimal tokens. If either
misbehaves, check `.placet/placet.log` in the workspace first — most wiring
issues show up there (rejected auth, invalid payload shape, hook not
firing at all).
