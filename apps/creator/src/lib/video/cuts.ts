// Pure helpers for splitting a long video into episodes. Shared by the browser
// (suggestions, editor validation) and the server (final validation).

export interface Segment {
  start: number;
  end: number;
}

export const MIN_SEGMENT_SECONDS = 5;

/** Cut points (whole seconds) → consecutive segments covering the video. */
export function segmentsFromCuts(cuts: number[], duration: number): Segment[] {
  const points = [0, ...[...cuts].sort((a, b) => a - b), duration];
  return points.slice(1).map((end, i) => ({ start: points[i]!, end }));
}

export function validateCuts(cuts: number[], duration: number, maxSeconds: number): string | null {
  if (cuts.some((c) => !Number.isInteger(c) || c <= 0 || c >= duration)) {
    return "Kesim noktaları videonun içinde olmalı";
  }
  if (new Set(cuts).size !== cuts.length) return "Aynı noktada iki kesim olamaz";
  for (const [i, s] of segmentsFromCuts(cuts, duration).entries()) {
    const len = s.end - s.start;
    if (len > maxSeconds) return `Bölüm ${i + 1} ${Math.floor(maxSeconds / 60)} dakikadan uzun`;
    if (len < MIN_SEGMENT_SECONDS) return `Bölüm ${i + 1} ${MIN_SEGMENT_SECONDS} saniyeden kısa`;
  }
  return null;
}

/**
 * Suggests cut points near `target` seconds apart, never exceeding `max`.
 * With an audio energy envelope (one value per `step` seconds) each cut is
 * moved to the quietest moment in its search window, so cuts land on pauses
 * instead of mid-sentence. Without audio it falls back to even spacing.
 */
export function suggestCuts(
  duration: number,
  target: number,
  max: number,
  energy?: { values: Float32Array; step: number }
): number[] {
  const total = Math.floor(duration);
  const cuts: number[] = [];
  let start = 0;

  while (total - start > max) {
    const lo = start + Math.max(MIN_SEGMENT_SECONDS, target - 45);
    const hi = Math.min(start + max, total - MIN_SEGMENT_SECONDS);
    let cut = Math.min(start + target, hi);

    if (energy) {
      // Average energy over a ~0.6s window around each candidate second
      const half = Math.max(1, Math.round(0.3 / energy.step));
      let best = Infinity;
      for (let t = lo; t <= hi; t++) {
        const center = Math.round(t / energy.step);
        let sum = 0;
        let n = 0;
        for (let k = center - half; k <= center + half; k++) {
          if (k >= 0 && k < energy.values.length) {
            sum += energy.values[k]!;
            n++;
          }
        }
        // Slight preference for points close to the target length
        const score = (n ? sum / n : Infinity) * (1 + Math.abs(t - start - target) / (4 * target));
        if (score < best) {
          best = score;
          cut = t;
        }
      }
    }

    cuts.push(cut);
    start = cut;
  }
  return cuts;
}
