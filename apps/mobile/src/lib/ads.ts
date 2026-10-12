import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

type AdsModule = typeof import("react-native-google-mobile-ads");

/**
 * Rewarded ads need the native Google Mobile Ads SDK, which exists only in a
 * development/store build — not in Expo Go (web uses ads.web.ts). The module is
 * required lazily so those environments never load it (it would crash).
 */
export const adsAvailable =
  Platform.OS !== "web" && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

let ads: AdsModule | null = null;
let initialized: Promise<unknown> | null = null;

function loadAds(): AdsModule | null {
  if (!adsAvailable) return null;
  if (!ads) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ads = require("react-native-google-mobile-ads") as AdsModule;
    } catch {
      return null;
    }
  }
  return ads;
}

function rewardedUnitId(m: AdsModule) {
  const configured =
    Platform.OS === "ios"
      ? process.env.EXPO_PUBLIC_ADMOB_REWARDED_IOS
      : process.env.EXPO_PUBLIC_ADMOB_REWARDED_ANDROID;
  // Google's test unit until the real AdMob ad unit exists
  return configured || m.TestIds.REWARDED;
}

export type RewardedResult = "earned" | "dismissed" | "unavailable";

/**
 * Loads and shows one rewarded ad. The ids are passed to AdMob for its signed
 * server callback, which is what actually unlocks the episode in production.
 */
export async function showRewardedAd(input: { userId: string; episodeId: string }): Promise<RewardedResult> {
  const m = loadAds();
  if (!m) return "unavailable";

  initialized ??= m.default().initialize();
  await initialized;

  const ad = m.RewardedAd.createForAdRequest(rewardedUnitId(m), {
    serverSideVerificationOptions: { userId: input.userId, customData: input.episodeId },
  });

  return new Promise<RewardedResult>((resolve) => {
    let earned = false;
    const subs = [
      ad.addAdEventListener(m.RewardedAdEventType.LOADED, () => {
        ad.show().catch(() => finish("unavailable"));
      }),
      ad.addAdEventListener(m.RewardedAdEventType.EARNED_REWARD, () => {
        earned = true;
      }),
      ad.addAdEventListener(m.AdEventType.CLOSED, () => finish(earned ? "earned" : "dismissed")),
      ad.addAdEventListener(m.AdEventType.ERROR, () => finish("unavailable")),
    ];

    function finish(result: RewardedResult) {
      subs.forEach((unsubscribe) => unsubscribe());
      resolve(result);
    }

    ad.load();
  });
}
