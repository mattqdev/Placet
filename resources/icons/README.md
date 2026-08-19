Provider mark SVGs vendored from [Simple Icons](https://simpleicons.org) (CC0-1.0 — public domain, no
attribution required). Pulled from the `simple-icons` npm package (`icons/claudecode.svg`,
`icons/opencode.svg`) rather than hand-drawn, so they match each project's actual mark.

Root `<svg>` gets a `fill="#RRGGBB"` attribute injected at render time in
`src/panel/taskPanelProvider.ts` (brand hex from the same package's `data/simple-icons.json`) — the
files here are the untouched, colorless originals.

`icon.svg` / `icon.png` are the extension's own Marketplace icon (unrelated to the provider marks
above) — `icon.png` (256×256) is what `package.json`'s `icon` field points to; `icon.svg` is the
source, kept in sync by hand.
