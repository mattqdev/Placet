# Releasing

Releases are cut manually and published automatically.

## One-time setup

1. Publisher `placet` must exist on the
   [Marketplace management page](https://marketplace.visualstudio.com/manage),
   created from an Azure DevOps Personal Access Token (Marketplace → Manage
   scope).
2. That PAT is stored as a repository secret named `VSCE_PAT`
   (Settings → Secrets and variables → Actions).

## Cutting a release

1. Make sure `main` is green (CI passing) and has everything you want to ship.
2. Bump the version and create the tag:

   ```bash
   npm version patch   # or: minor / major
   git push && git push --tags
   ```

   `npm version` updates `package.json`, commits it, and creates a matching
   `vX.Y.Z` git tag.
3. Pushing the tag triggers `.github/workflows/release.yml`, which:
   - runs typecheck, compile, and tests,
   - verifies the tag matches `package.json`'s version,
   - packages the extension with `vsce package`,
   - publishes it to the VS Code Marketplace with `vsce publish`,
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
