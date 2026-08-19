#!/usr/bin/env bash
#
# release.sh — cut a new Placet release end-to-end.
#
#   npm run release            # bump patch, build, package, tag and push
#   npm run release -- minor   # or: major, or an explicit version like 0.2.0
#
# Steps:
#   1. verify the working tree is clean
#   2. run typecheck, compile and the test suite
#   3. package a .vsix locally as a sanity check
#   4. bump the version in package.json, commit it, and create the vX.Y.Z tag
#      (via `npm version`)
#   5. push the branch and the tag to origin — this triggers the Release
#      GitHub Action (.github/workflows/release.yml), which re-runs the
#      checks, publishes to the VS Code Marketplace and creates a GitHub
#      Release with the .vsix attached.
#
# Options:
#   --no-push   stop after the tag is created (you push manually later)
#   --dry-run   run checks and packaging, but skip version bump and push
#
set -euo pipefail

cd "$(dirname "$0")/.."

BUMP=""
PUSH=1
DRY=0

for arg in "$@"; do
  case "$arg" in
    --no-push) PUSH=0 ;;
    --dry-run) DRY=1 ;;
    *)
      if [ -n "$BUMP" ]; then
        echo "usage: $0 [patch|minor|major|<version>] [--no-push] [--dry-run]" >&2
        exit 1
      fi
      BUMP="$arg"
      ;;
  esac
done

BUMP="${BUMP:-patch}"
case "$BUMP" in
  patch|minor|major) ;;
  v[0-9]*|[0-9]*) ;;
  *) echo "error: bump must be patch, minor, major or a version like 0.2.0 (got '$BUMP')" >&2; exit 1 ;;
esac

# 1. clean tree
if [ -n "$(git status --porcelain)" ]; then
  echo "error: working tree is not clean. Commit or stash your changes first." >&2
  exit 1
fi

CURRENT_VERSION="$(node -p "require('./package.json').version")"
echo "==> current version: $CURRENT_VERSION"

# 2. checks
echo "==> typecheck"
npm run typecheck
echo "==> compile"
npm run compile
echo "==> test"
npm test

# 3. local packaging sanity check
echo "==> packaging .vsix"
npm run vsce:package

# 4. bump version + tag
if [ "$DRY" -eq 1 ]; then
  echo "==> [dry-run] would run: npm version $BUMP"
  echo "==> [dry-run] done — no tag created, nothing pushed."
  exit 0
fi

echo "==> bumping version ($BUMP) and creating tag"
npm version "$BUMP"

TAG="v$(node -p "require('./package.json').version")"
echo "==> tag created: $TAG"
echo "==> sanity .vsix built above (pre-bump version); the Release action"
echo "    packages the final $TAG artifact on GitHub."

# 5. push
if [ "$PUSH" -eq 0 ]; then
  echo "==> --no-push: done. Push when ready:"
  echo "    git push origin $(git branch --show-current) && git push origin $TAG"
  exit 0
fi

echo "==> pushing $(git branch --show-current) and $TAG to origin"
git push origin "$(git branch --show-current)"
git push origin "$TAG"

echo
echo "done. The Release GitHub Action will publish $TAG to the"
echo "VS Code Marketplace and create a GitHub Release."
echo "Watch it at: https://github.com/mattqdev/Placet/actions"