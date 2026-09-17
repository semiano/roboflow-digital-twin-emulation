export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

export const lerp = (from: number, to: number, t: number): number =>
  from + (to - from) * clamp(t, 0, 1);

/** Moves `current` toward `target` by at most `maxDelta`. */
export const moveToward = (current: number, target: number, maxDelta: number): number => {
  const difference = target - current;
  if (Math.abs(difference) <= maxDelta) return target;
  return current + Math.sign(difference) * maxDelta;
};

export const degreesToRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export const radiansToDegrees = (radians: number): number => (radians * 180) / Math.PI;

export const roundTo = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/** Nearest-rank percentile over an unsorted sample. */
export function percentile(samples: readonly number[], fraction: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = clamp(Math.ceil(fraction * sorted.length) - 1, 0, sorted.length - 1);
  return sorted[index]!;
}

export const mean = (samples: readonly number[]): number =>
  samples.length === 0 ? 0 : samples.reduce((sum, value) => sum + value, 0) / samples.length;
