import * as Application from "expo-application";
import Constants from "expo-constants";

// Installed version name and build number (Play versionCode). The build number
// comes from the native binary because EAS increments it remotely; the web
// preview has neither, so it falls back to app.json.
export const appVersion = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? "";
export const buildNumber = Application.nativeBuildVersion;

/** "1.0.1 (6)" — shown in Settings and sent with feedback */
export const versionLabel = buildNumber ? `${appVersion} (${buildNumber})` : appVersion;
