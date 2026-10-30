# FilmGo Android

This is the Android WebView shell for FilmGo. It loads the live FilmGo site, shows a native offline fallback, and checks the version manifest from the configured GitHub Gist.

## Production signing

Copy `keystore.properties.example` to `keystore.properties`, place the matching `filmgo-release.keystore` beside it, and replace the placeholder passwords. Do not commit either secret file. Future APKs must use the same keystore and a higher `versionCode`.

## Build

```bash
source /workspace/android-env.sh
gradle assembleRelease
```

The release build enables R8 obfuscation and resource shrinking. The update manifest must contain a GitHub Release APK URL and its SHA-256 digest before publishing an update.
