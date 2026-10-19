# Releasing Aurora and publishing updates

This is the exact, step-by-step process. Your GitHub user is `Kailu687` and the repository is called `Aurora`, so:

| What | Address |
|---|---|
| Website | `https://kailu687.github.io/Aurora/` |
| Downloads page | `https://kailu687.github.io/Aurora/downloads/` |
| Web app | `https://kailu687.github.io/Aurora/app/` |
| Update feed the apps read | `https://kailu687.github.io/Aurora/app/update-manifest.json` |
| Source code | `https://github.com/Kailu687/Aurora` |

The update address is built into the apps through `web/config.json`. If you ever rename the repository or user,
change it there, in `tools/site/**`, in `tools/publish-web.js` (the `REPO` constant) and in `package.json`.

## A. One-time setup (about 10 minutes)

1. **Publish the repository** with GitHub Desktop. File, Add local repository, choose `D:\GitHub\Aurora`
   (it is already a git repository with the first commit made). Press **Publish repository**, name it `Aurora`,
   keep it **Public** (GitHub Pages is free for public repositories), and make sure the branch is `main`.
2. **Turn on GitHub Pages.** On github.com open the repository, **Settings, Pages**, and under *Build and deployment,
   Source* choose **GitHub Actions**.
3. **First deploy.** Open the **Actions** tab. The workflow "Publish website and updates" runs on every push to
   `main` (or press *Run workflow*). When it shows a green tick the site is live.
4. **Create the first GitHub Release** (this is where the Windows installer lives, section C).
5. **Back up the signing key folder** `D:\GitHub\Aurora-keys\`. It is deliberately *not* in the repository.

## B. Publishing a new version (every time)

1. Change whatever you want under `web/` (or have it changed for you).
2. Bump the version. Separate release-note bullets with `|`; they appear on the Downloads page:
   ```
   npm run bump -- --notes "New equalizer presets|Fixed a crash when seeking"
   ```
   This updates the version everywhere (web, Android, Windows) and adds the entry to `docs/changelog.json`.
3. Build the files (only needed when you want users to get a *new APK or installer*, see section D):
   ```
   npm run release        # APK + Windows installer + checksums
   ```
   or separately `npm run android` / `npm run windows` and then `npm run hash`.
4. In GitHub Desktop: write a summary, **Commit to main**, then **Push origin**.
5. GitHub Actions rebuilds the website in about a minute. Every installed Aurora then notices the new build number,
   shows *"Update available"*, and after the user taps **Update now** downloads it and restarts.

## C. Attaching the files to a GitHub Release (so the Windows button works)

The Windows installer (about 87 MB) is too large for git, so it is published as a GitHub **Release**:

1. github.com, the repository, **Releases, Draft a new release**.
2. Tag: `v<version>` (for example `v1.6.0`). Title: `Aurora <version>`. Paste the release notes.
3. Attach these files (installer from `dist\`, APK from `downloads\`):
   * `Aurora-Setup-<version>.exe`
   * `Aurora.apk` (the file in `downloads\`; use exactly this name)
   Keep these exact names; the Downloads page builds its per-release links from them.
4. **Publish release.**

The Downloads page lists the latest APK straight from the website (`/downloads/Aurora.apk`, which is committed to git),
and the Windows installer plus all older versions from the Releases.

## D. Which changes reach users how

| You changed | Users get it by |
|---|---|
| Anything under `web/` (screens, features, DJ, styles, fixes) | **Over-the-air update**, no reinstall |
| `android/` Java code, permissions, icons | A **new APK**: `npm run android`, commit `downloads/Aurora.apk`, publish; the user installs it *over* the old one |
| `electron/main.js`, `electron/preload.js` | A **new Windows installer** |

A new APK or installer also contains the latest `web/`, so fresh installs are always current.

## E. Checking that updates work

1. Install the current release on a phone or PC.
2. Make a small visible change in `web/`, run `npm run bump -- --notes "test"`, commit, push, wait for the green tick.
3. Open Aurora. Within seconds you should get *Update available*. (Or Settings, Cloud updates, **Check for updates**.)

## F. Troubleshooting releases

* **Site shows 404**: Pages is not set to *GitHub Actions* (step A2), or the first workflow run has not finished.
* **Apps say "up to date" after a push**: the build number did not change. Run `npm run bump` and push again.
* **Windows button says "not found"**: the GitHub Release (section C) has not been published yet.
* **"App not installed" when updating the APK**: the new APK was signed with a different key. Always build with
  `npm run android` on this PC (it uses `D:\GitHub\Aurora-keys`). An installed copy signed with another key must be
  uninstalled once (its saved data is lost).
* **Actions fails at "deploy"**: check Settings, Pages, Source = GitHub Actions, and that the repository is public.
* **Gradle says "Unable to establish loopback connection"**: run `npm run android` from a normal terminal.
