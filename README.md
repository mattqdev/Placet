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

## Status

- [x] Extension scaffold, sidebar webview panel, local event server + task store
- [ ] Claude Code adapter (hooks → forwarder → local server)
- [ ] opencode adapter (plugin → local server)
- [ ] Approve-to-commit flow (scoped diff, confirmation panel, commit message generation, push)
