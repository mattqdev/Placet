# Placet

Tracks what your AI coding assistant (Claude Code, opencode, ...) is doing,
task by task, in a panel at the bottom of the Explorer sidebar — and lets you
👍 a finished, tested task to stage + commit *only the files that task
touched*, with a generated commit message and a push confirmation.

See `.claude/plans/facciamo-un-po-di-lively-bumblebee.md` for the full design.

## Development

```bash
npm install
npm run compile   # or: npm run watch
```

Then press F5 in VS Code (`Run Extension` launch config) to open an Extension
Development Host with Placet loaded.

Logs go to the "Placet" Output channel and to `.placet/placet.log` in the
connected workspace.

## Testing

```bash
npm test
```

Runs the automated suite (no AI provider calls). See [`TESTING.md`](./TESTING.md)
for what's covered, plus `scripts/simulate-task.js` for exercising the
sidebar UI and approve-to-commit flow without spending any tokens, and the
two minimal real-AI prompts for validating actual hook wiring.

## Connecting an AI tool

Run one of these from the Command Palette in the connected project (not in
this repo — in whatever project you're using Claude Code / opencode on):

- **Placet: Connect Claude Code** — writes hooks into
  `.claude/settings.local.json` (personal, gitignored automatically since it
  embeds an absolute path to this install of Placet). Start a **new** Claude
  Code session afterwards — hooks are only read at session start.
- **Placet: Connect opencode** — copies a plugin to
  `.opencode/plugin/placet.ts`. No machine-specific paths, so it's fine to
  commit and share with teammates. Start a **new** opencode session
  afterwards.

## Status

- [x] Extension scaffold, sidebar webview panel, local event server + task store
- [x] Claude Code adapter (hooks → forwarder → local server)
- [x] opencode adapter (plugin → local server)
- [x] Approve-to-commit flow (scoped diff, confirmation panel, commit message generation, push)
