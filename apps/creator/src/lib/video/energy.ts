// Browser-only: audio loudness envelope of a local video, used to place cuts on pauses.

// Decoding audio needs the whole file in memory; above this cuts are spaced evenly
export const MAX_ANALYSIS_BYTES = 1.5 * 1024 * 1024 * 1024;
const ENERGY_STEP = 0.1;

export interface AudioEnergy {
  values: Float32Array;
  step: number;
}

/** RMS energy per ENERGY_STEP seconds, decoded at a low sample rate to save memory. */
export async function audioEnergy(file: File): Promise<AudioEnergy> {
  const ctx = new OfflineAudioContext(1, 1, 8000);
  const audio = await ctx.decodeAudioData(await file.arrayBuffer());
  const window = Math.round(audio.sampleRate * ENERGY_STEP);
  const values = new Float32Array(Math.ceil(audio.length / window));
  const channels = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
  for (let w = 0; w < values.length; w++) {
    let sum = 0;
    const end = Math.min(audio.length, (w + 1) * window);
    for (let i = w * window; i < end; i++) {
      let s = 0;
      for (const ch of channels) s += ch[i]!;
      s /= channels.length;
      sum += s * s;
    }
    values[w] = Math.sqrt(sum / Math.max(1, end - w * window));
  }
  return { values, step: ENERGY_STEP };
}
