# Aurora

A glass-smooth music player for the songs **already on your device**, with an **AI DJ** that mixes by mood.
One code base, three apps: **web**, **Android** and **Windows**.

* Plays straight from your music folder. **Nothing is copied.**
* Notification-bar, lock-screen and Samsung media-panel player on Android
* Album covers: from the files, from a `cover.jpg` in the folder, or looked up once online and saved
* AI DJ with 12 vibes, spoken intros, live requests, on/off switch
* Crossfade, equalizer (web/Windows), synced lyrics, queue, playlists, stats, dark/light themes
* **Over-the-air updates**: publish once, every installed copy offers the update

## Get it

| | |
|---|---|
| Website / web app | https://kailu687.github.io/Aurora/ |
| Android APK | https://kailu687.github.io/Aurora/download/ |
| Windows installer | GitHub Releases, "latest" |

## Documentation

* [`docs/Aurora-Documentation.pdf`](docs/Aurora-Documentation.pdf): **the whole documentation as one PDF** (project guide + release guide)
* [`docs/PROJECT.md`](docs/PROJECT.md): **the full guide**: what each part does, where it is, how it works
* [`docs/RELEASING.md`](docs/RELEASING.md): publishing the website and updates step by step

## Quick start for developers

```
npm install
npm run web        # open http://localhost:5173
npm start          # desktop app from source
npm run bump -- --notes "What changed"
npm run android    # signed APK -> downloads/Aurora.apk
npm run windows    # installer  -> dist/
```

Everything the user sees lives in `web/`. Android native code is in `android/app/src/main/java/app/aurora/player/`,
the Windows shell in `electron/`, and the build/release scripts in `tools/`.

## License

MIT
