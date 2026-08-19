# Contributing to Placet

Thanks for wanting to help! This project is small and deliberately simple, and
every contribution — a bug report, a doc fix, a feature, a test — is welcome.

## Quick links

- [README.md](./README.md) — what Placet is and how to install/connect it.
- [TESTING.md](./TESTING.md) — the two-layer testing strategy in detail.
- [RELEASING.md](./RELEASING.md) — how releases are cut (for maintainers).

## Getting started

Placet is a VS Code extension (TypeScript) with two companion pieces of glue:

- a **Claude Code adapter** (`src/adapters/claudeCode/`) driven by hooks and a
  small Node forwarder (`src/adapters/claudeCode/forwarder.ts`);
- an **opencode adapter** (`src/adapters/opencode/`) that's a plugin copied
  into the user's project.

Set up the dev environment:

```bash
npm install
npm run compile   # or: npm run watch for incremental rebuilds
```

Then press **F5** in VS Code to open the Extension Development Host and
exercise the UI. Logs go to the "Placet" Output channel and to
`.placet/placet.log` in the connected workspace.

## Project layout

| Path | What it is |
|---|---|
| `src/extension.ts` | Extension activation, commands, wiring |
| `src/adapters/` | Claude Code + opencode adapters (hooks → forwarder/plugin → local server) |
| `src/panel/` | Sidebar webview + approval panel |
| `src/server/` | Local event server |
| `src/store/` | Task store (event folding, `filesTouched`, reviewed state) |
| `src/commit/` | Diff, stage, commit, push, commit-message generation |
| `src/git/` | Low-level git helpers |
| `src/ai/` | AI provider calls (commit message synthesis, title synthesis) |
| `scripts/simulate-task.js` | Zero-cost way to exercise the UI without an AI tool |
| `test/` | Automated suite (Node's built-in test runner, no AI provider) |

## Before you write code

1. **Check existing issues and PRs** — someone may already be working on the
   same thing. If in doubt, open an issue first to discuss the approach for
   anything non-trivial.
2. **Keep the scope small.** Placet is tiny by design. A PR that adds a feature
   plus unrelated refactors is hard to review and easy to reject.
3. **Match the existing conventions** — TypeScript with strict mode, no
   external test framework (uses `node:test`), no new runtime dependencies
   unless the feature genuinely needs them.

## Testing

Everything you write must keep the automated suite green:

```bash
npm test
```

`npm test` compiles everything, bundles `test/*.test.ts`, and runs the suite
with Node's built-in test runner. It makes **no** network calls and **no** AI
provider calls, so it's safe to run constantly.

When your change touches behavior that the suite covers (hook translation,
forwarder, git ops, gitignore patching, installers, task store, message
generation), **add or update a test in `test/`** — see [TESTING.md](./TESTING.md)
for what each test file covers and what's intentionally *not* covered.

For UI-only changes, run `node scripts/simulate-task.js` against a running dev
host (details in [TESTING.md](./TESTING.md)). Only reach for a real Claude Code
/ opencode session when you've touched the hook/plugin wiring itself.

## Before you open a PR

- [ ] `npm run typecheck` passes
- [ ] `npm run compile` passes
- [ ] `npm test` passes
- [ ] New behavior has test coverage where the suite already covers that area
- [ ] No unrelated changes bundled in
- [ ] README/docs updated if the change is user-visible

## Commit message style

The repo uses [conventional commits](https://www.conventionalcommits.org/):

```
feat: add a "retry failed task" action
fix: attribute edits to the correct todo when a turn starts
docs: clarify the Connect opencode flow
test: cover title synthesis fallback
```

A `feat:` or `fix:` commit should mention the user-visible behavior; keep the
subject under ~72 chars.

## Submitting changes

1. Fork the repo and create a branch with a descriptive name.
2. Make your change, keeping commits small and focused.
3. Run the checks above.
4. Open a PR against `main` using the PR template. Link any related issue.

PRs are reviewed by a human; expect questions, not grudges. If a PR needs
rework, prefer new commits over rewriting history.

## Reporting bugs

Use the **Bug report** issue template. A good bug report includes:

- Placet version (see the Extensions view) and VS Code version;
- which adapter (Claude Code / opencode) and its version;
- the steps to reproduce;
- the relevant lines from `.placet/placet.log` in the affected workspace;
- expected vs. actual behavior.

## Feature requests

Use the **Feature request** template and describe the problem you're trying to
solve, not just the solution you have in mind — it makes it much easier to
design something that fits Placet's small scope.

## Code of conduct

Be kind and constructive. This project has no corporate backing and no
tolerance for hostility; unconstructive or harassing behavior will simply not
be welcome. If you see something that needs attention, contact the maintainers
via the issues page.

## License

By contributing you agree that your contributions are licensed under the
[MIT License](./LICENSE).