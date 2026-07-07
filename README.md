# SM PUMA Bunker Calculator Android Port

This folder is a separate Android-ready port of the desktop sounding calculator.

The app is designed to run offline. The original Python FastAPI backend has been replaced with browser-side JavaScript calculation logic, and the original tank table data is included at `www/data/tanks.json`.

## Folder Layout

- `www/`: mobile web app loaded by Capacitor.
- `www/calculator.js`: JavaScript port of the Python calculator.
- `www/data/tanks.json`: original tank calibration data.
- `capacitor.config.json`: Capacitor Android app configuration.
- `.github/workflows/android-apk.yml`: cloud build workflow that creates a debug APK without Android Studio.

## Cloud APK Build With GitHub Actions

1. Upload this `android apk` folder as its own GitHub repository, or move its contents to the root of a repository.
2. Open the repository on GitHub.
3. Go to `Actions`.
4. Run `Build Android APK`.
5. Download the APK from the workflow artifacts.

The APK artifact is a debug build, suitable for direct device testing. For Google Play distribution, build an AAB release and sign it with a private keystore.

## Ionic Appflow

This project is also shaped for Ionic Appflow. Connect the repository in Appflow, choose Android native build, and use the Capacitor project settings.

## Local Preview

If Node.js is available:

```powershell
npm install
npm run serve
```

Then open `http://127.0.0.1:4173`.
