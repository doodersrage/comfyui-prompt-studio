# Releases

Prompt Studio ships from **GitHub Releases** on `vX.Y.Z` tags. Each release publishes a container image to [GHCR](https://github.com/doodersrage/comfyui-prompt-studio/pkgs/container/comfyui-prompt-studio) and desktop installers (`.dmg`, `.exe`, `.deb`). See [Desktop app](desktop.md).

The first tagged GitHub Release was [`Initial-Release`](https://github.com/doodersrage/comfyui-prompt-studio/releases/tag/Initial-Release) (July 2026). Later cuts use semver tags (`v0.2.0`, …) so notes and images stay comparable.

## Cut a release (preferred)

1. Merge whatever should ship to `main`.
2. Actions → **Release** → **Run workflow**.
3. Choose **patch** / **minor** / **major** (from `package.json`, currently the 0.x line).
4. Run. The workflow:
   - runs lint, unit tests, and `next build`
   - bumps `package.json` / `package-lock.json` and pushes `Release vX.Y.Z` plus tag `vX.Y.Z`
   - creates the GitHub Release with generated notes
   - builds and pushes `ghcr.io/doodersrage/comfyui-prompt-studio:vX.Y.Z` and `:latest`
   - builds desktop installers and attaches them to the GitHub Release

Use **dry run** to print the next version without tagging.

Releases must be cut from **`main`**. `GITHUB_TOKEN` cannot start a second workflow, so the same run both tags and publishes.

## Tag from a checkout

If you already bumped the version locally:

```bash
npm version minor --no-git-tag-version   # or patch / major
git add package.json package-lock.json
git commit -m "Release v$(node -p "require('./package.json').version")"
git tag "v$(node -p "require('./package.json').version")"
git push origin main --tags
```

Pushing `v*.*.*` runs the same publish path (tests, GitHub Release, image) without a second version bump.

## Install a release

```bash
docker pull ghcr.io/doodersrage/comfyui-prompt-studio:latest
docker run -d --name comfyui-prompt-studio -p 127.0.0.1:47832:47832 \
  ghcr.io/doodersrage/comfyui-prompt-studio:latest
```

Pin a version with the `vX.Y.Z` tag instead of `latest`. Env vars and Compose: [Configuration & deployment](configuration.md).

## Docker Hub (optional)

The workflow also pushes `doodersrage/comfyui-prompt-studio` when these repository secrets exist:

| Secret | Value |
| --- | --- |
| `DOCKERHUB_USERNAME` | Docker Hub user |
| `DOCKERHUB_TOKEN` | Access token (not the account password) |

If login fails, GHCR still publishes and the GitHub Release still goes out.

The first GHCR package is **private** until you open **Packages → comfyui-prompt-studio → Package settings → Change visibility → Public**.

## Notes

- GitHub auto-generates the changelog from commits since the previous **published** release (today that is `Initial-Release` until the next cut).
- Source zip/tarball attachments are added by GitHub; there is no npm publish (`private`: true).
- Playwright e2e is not part of the release job (CI already runs it on `main`). Fix `main` before cutting if CI is red.
