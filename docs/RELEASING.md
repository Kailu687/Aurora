# Releasing Aurora and publishing updates

This is the exact, step-by-step process. Your GitHub user is `Kailu687` and the repository is called `Aurora`, so:

| What | Address |
|---|---|
| Website | `https://kailashamarnath.me/Aurora/` |
| Downloads page | `https://kailashamarnath.me/Aurora/downloads/` |
| Web app | `https://kailashamarnath.me/Aurora/app/` |
| Update feed the apps read | `https://kailashamarnath.me/Aurora/app/update-manifest.json` |
| Source code | `https://github.com/Kailu687/Aurora` |

Because your GitHub account already publishes `kailashamarnath.me` (custom domain), every project site under the account is served from it, so Aurora lives at `kailashamarnath.me/Aurora/`. The old `kailu687.github.io/Aurora/` address redirects there. The apps know both: `web/config.json` has `updateUrl` (the custom domain) and `updateUrlFallback` (the `github.io` address), and they try them in that order. If you ever rename the repository or user,
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
6. **Update signing key (once).** Every over-the-air update is signed, and the apps refuse anything that isn't.
   * On your PC, in `D:\GitHub\Aurora`, run `node tools/publish-web.js --new-key`. It creates
     `D:\GitHub\Aurora-keys\update-signing-key.pem` (private, never commit it; `*.pem` is git-ignored) and writes the
     matching *public* key into `web/js/updater.js` and `electron/update-key.txt`. Commit those two files.
   * On github.com: **Settings, Secrets and variables, Actions, New repository secret**. Name `AURORA_UPDATE_KEY`,
     value: the whole contents of `update-signing-key.pem` (including the BEGIN/END lines).
   * The website workflow signs `update-manifest.json` with it. Without the secret the workflow stops on purpose, so an
     unsigned update can never be published. If the key is ever lost, make a new one the same way; installed apps
     then need one new APK / installer before they accept updates signed with the new key.
   * Test locally without the secret: `AURORA_UPDATE_KEY_FILE=path\to\key.pem npm run site`.

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

**The website updates itself.** The Downloads page reads your GitHub Releases live (GitHub's public API), so a new
release, its notes, file sizes and download links appear as soon as you publish it. Nothing else to do. The release
notes you write are shown as the "what changed" list (bullet points; lines like "Windows: Aurora-Setup-1.6.1.exe" are
hidden). The workflow also rebuilds the site on every Release event and keeps a saved copy (`releases.json`) that the
page uses if GitHub's API is unreachable.

## D. Which changes reach users how

| You changed | Users get it by |
|---|---|
| Anything under `web/` (screens, features, DJ, styles, fixes) | **Over-the-air update**, no reinstall |
| `android/` Java code, permissions, icons | A **new APK**: `npm run android`, commit `downloads/Aurora.apk`, publish; the user installs it *over* the old one |
| `electron/main.js`, `electron/preload.js` | A **new Windows installer** |

Version 1.7.0 changed both: the Windows installer adds the mini player window, global shortcuts and encrypted key
storage, and the APK lets Aurora tell when a newer app (not just a web update) is available. Older installs still
get all the web features over the air; the app shows a small "new app version available" note for the rest.

A new APK or installer also contains the latest `web/`, so fresh installs are always current.

### How an update is installed (and why data is safe)

1. The app reads `update-manifest.json`, checks the signature and that the build is newer.
2. Before downloading it takes a snapshot of the library data (playlists, likes, play counts, history, edits, lyrics,
   settings). Snapshots live inside the app (last 6) and, on Windows, also in `%APPDATA%\Aurora\backups`.
3. Every file is downloaded and checked against its SHA-256 from the signed manifest, then *staged*.
4. The update switches on at the next start (or when the user presses **Restart now**). If it fails to start three
   times in a row, the app throws it away and goes back to the version it was installed with. User data is never
   part of an update, and restoring a snapshot only adds things back, it never deletes.

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
