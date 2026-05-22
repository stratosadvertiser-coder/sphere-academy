# Building the Sphere Academy phone app

This guide walks you through turning the web app into a real
Android `.apk` (and optionally iOS `.ipa`) using **Capacitor**.

> You only run these commands **on your own machine** — they
> never touch the GitHub Pages site. The web version keeps
> working as before.

## ✅ What's already done (committed to the repo)

- ✅ Capacitor 6 + plugins installed (`package.json`)
- ✅ Project config (`capacitor.config.json`) — app id, splash,
  status bar, push opts, Android+iOS overrides
- ✅ Web → native bundle script (`scripts/sync-web.js`)
- ✅ Native Android project generated under `android/`
- ✅ Source icon + splash assets in `assets/` (1024×1024 + 2732×2732)
- ✅ 74 launcher + splash images generated for every Android density
- ✅ AndroidManifest permissions: Internet, Camera, Photo gallery,
  Push notifications, Audio (for Jitsi voice channels)
- ✅ JS bridge in `script.js` that auto-detects Capacitor and
  routes avatar upload → native camera, push token registration,
  hardware back button, splash hide, status bar styling

**Only thing still needed:** Install Android Studio so you can
open `android/` and tap **Build → APK**. The whole project is
already wired and waiting.

---

## What you need (one-time installs)

### For Android (works on Windows, Mac, Linux)
1. **Node.js 20+** — https://nodejs.org/
2. **Android Studio** — https://developer.android.com/studio
   - During setup, accept the SDK license + install Android SDK + Android Virtual Device (AVD)

### For iOS (Mac only — you can skip this entirely if you're Android-first)
1. **Xcode 15+** from the Mac App Store
2. **CocoaPods**: open Terminal → `sudo gem install cocoapods`
3. **Apple Developer account** ($99/year) — only if you want to publish to App Store. For testing on your own device, the free account works.

---

## First-time setup (run once)

Open a terminal in the project folder:

```bash
cd "C:\Users\ADMIN\Documents\marketing intern new"

# 1. Install Capacitor and plugins
npm install

# 2. Copy web assets into www/ (the WebView bundle)
npm run sync-web

# 3. Add the Android native project
npx cap add android

# 4. (Optional, Mac only) Add the iOS native project
npx cap add ios

# 5. Sync the web bundle into both platforms
npx cap sync
```

After this, you'll have new folders `android/` and (optionally)
`ios/`. These are real native projects — open them in Android
Studio / Xcode to build.

---

## Building an Android `.apk` (debug install for your phone)

```bash
# 1. Make sure the latest web code is bundled
npm run build

# 2. Open Android Studio
npx cap open android
```

Then in Android Studio:
1. Wait for Gradle sync to finish (~2-5 min first time)
2. Top menu → **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**
3. After ~1 min, click the "locate" link in the notification
4. The `.apk` is at `android/app/build/outputs/apk/debug/app-debug.apk`

**Install on your phone:**
- Enable **Developer Options** + **Install from unknown sources** on the phone
- Copy the `.apk` to the phone (via USB, Drive, Telegram to yourself, etc.)
- Tap the file → install

OR use **wireless install** via Android Studio:
1. Enable **USB debugging** on phone (Developer Options)
2. Connect via USB
3. In Android Studio top bar, select your phone from the device dropdown
4. Click ▶ Run → installs and launches in one step

---

## Building an iOS `.ipa` (Mac only)

```bash
npm run build
npx cap open ios
```

Then in Xcode:
1. Click on the project in the left tree
2. Under "Signing & Capabilities", select your Apple ID team
3. Plug in your iPhone via USB
4. Select your phone in the top device picker
5. Click ▶ Run

The first install requires you to trust the developer profile:
**Settings → General → VPN & Device Management → Trust**.

---

## Publishing to the stores

### Google Play
1. In Android Studio: **Build** → **Generate Signed Bundle / APK** → **Android App Bundle (AAB)**
2. Create or pick a keystore (save it forever — losing it locks you out of updates)
3. Upload the `.aab` to https://play.google.com/console
4. One-time developer fee: ₱1,300 (~$25)

### App Store
1. In Xcode: **Product** → **Archive**
2. **Window** → **Organizer** → **Distribute App** → **App Store Connect**
3. Submit via https://appstoreconnect.apple.com
4. Apple Developer fee: $99/year

---

## Updating the app after code changes

Every time you change the web code (HTML/JS/CSS):

```bash
# Re-sync web → native
npm run build

# Then rebuild in Android Studio / Xcode (Run ▶ or Build APK)
```

For **published apps**, you also need to bump the version
number in `android/app/build.gradle` (versionCode + versionName)
or `ios/App/App.xcodeproj` (Build / Version) before uploading
the new build to the stores.

---

## What features are native vs web?

The same web code runs in both, BUT Capacitor automatically
upgrades a few features to their native equivalents:

| Feature              | Web (browser/PWA)         | Native app (Capacitor)         |
|----------------------|---------------------------|--------------------------------|
| Camera / file picker | HTML5 `<input type=file>` | Native camera UI with crop     |
| Push notifications   | Browser push (limited)    | Real iOS APNS / Android FCM    |
| Splash screen        | Browser default           | Custom violet splash with logo |
| Status bar           | OS default                | Dark themed (#18181B)          |
| Hardware back button | Browser back              | In-app: closes modals first    |
| Offline mode         | Service worker cache      | Same + full app shell bundled  |

The web users on GitHub Pages keep their PWA experience.
Native users get the upgraded experience automatically.

---

## Troubleshooting

**`npm install` fails on Windows** — make sure you ran in a
**fresh terminal after installing Node.js**, and that you're
NOT inside OneDrive (path issues with native deps).

**Android Studio Gradle sync fails** — open `android/local.properties`
and set `sdk.dir=C:\\Users\\YOU\\AppData\\Local\\Android\\Sdk`.

**Camera doesn't work on Android** — Add `<uses-permission android:name="android.permission.CAMERA"/>` to `android/app/src/main/AndroidManifest.xml`.
Capacitor camera plugin usually does this automatically — if not, add manually.

**Push notifications need FCM** — you'll need to set up a
Firebase Cloud Messaging project + download `google-services.json`
into `android/app/`. See https://capacitorjs.com/docs/guides/push-notifications-firebase

**iOS push needs APNS** — generate an APNS auth key in Apple
Developer portal + upload to Firebase Console. Same Firebase
project as Android can serve both.

---

## File map

- `package.json` — npm dependencies (Capacitor + plugins)
- `capacitor.config.json` — app id, splash, status bar, plugin settings
- `scripts/sync-web.js` — copies HTML/JS/CSS → `www/` for the WebView
- `manifest.json` — PWA manifest (also bundled in native shell)
- `service-worker.js` — offline shell (also bundled)
- `www/` — generated; the bundle that Capacitor injects into native
- `android/`, `ios/` — generated; the native projects (open in IDEs)

Don't commit `www/`, `android/`, `ios/`, or `node_modules/` — they
regenerate from source.
