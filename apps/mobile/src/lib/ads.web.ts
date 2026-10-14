// Web build: the Google Mobile Ads SDK is native-only (it cannot even be
// bundled for web), so rewarded ads are simply unavailable here.

export const adsAvailable = false;

export async function prepareAds(): Promise<void> {}

export async function adPrivacyOptionsRequired(): Promise<boolean> {
  return false;
}

export async function showAdPrivacyOptions(): Promise<void> {}

export type RewardedResult = "earned" | "dismissed" | "unavailable";

export async function showRewardedAd(_input: { userId: string; episodeId: string }): Promise<RewardedResult> {
  return "unavailable";
}
