# Releasing

Releases are cut with one command and published automatically.

## How the marketplace update works

When you publish a **new version** of the extension to the VS Code
Marketplace, every installed VS Code instance picks it up automatically —
the Marketplace itself is the update server, so nothing needs to "pull from
a GitHub release". The workflow below does the publishing for you.

## One-time setup

1. Publisher `placet` must exist on the
   [Marketplace management page](https://marketplace.visualstudio.com/manage),
   created from an Azure DevOps Personal Access Token (Marketplace → Manage
   scope).
2. That PAT is stored as a repository secret named `VSCE_PAT`
   (Settings → Secrets and variables → Actions). **Without this secret the
   automatic publish step fails** — that's why a manual .vsix upload may be
   needed until it's configured.

## Cutting a release

One command does it all: verifies a clean tree, runs typecheck/compile/tests,
packages a sanity `.vsix`, bumps the version, tags, and pushes — which
triggers the Release GitHub Action.

```bash
npm run release            # bump patch → vX.Y.(Z+1)
npm run release -- minor   # or: major, or an explicit version like 0.2.0
```

`npm run release:prepare` does everything except the final push, in case you
want to review the tag first.

### Releasing from GitHub (no local commands)

Run the **Release (manual)** workflow from the repo's *Actions* tab ("Run
workflow"): pick the version bump and whether to also publish to the
Marketplace. It bumps the version, builds the `.vsix`, pushes the `vX.Y.Z`
tag and creates a GitHub Release with the `.vsix` attached (and, if
requested, publishes to the Marketplace).

The pushed `vX.Y.Z` tag triggers `.github/workflows/release.yml`, which:
- runs typecheck, compile, and tests,
- verifies the tag matches `package.json`'s version,
- packages the extension with `vsce package`,
- publishes it to the VS Code Marketplace with `vsce publish` (via the
  `VSCE_PAT` secret),
- creates a GitHub Release with the `.vsix` attached and auto-generated
  release notes.

No manual `vsce publish` should be needed — if a release fails, fix the issue,
delete the tag (`git tag -d vX.Y.Z && git push --delete origin vX.Y.Z`), and
re-tag once ready.

## Testing a package locally without publishing

```bash
npm run vsce:package
```

Produces a `.vsix` you can install locally via
`code --install-extension placet-X.Y.Z.vsix` or the Extensions view's
"Install from VSIX" command.
