/**
 * Seeded PRNG so simulation runs, defect distributions and dataset generation
 * are reproducible from a single seed.
 */
export interface Rng {
  next(): number;
  range(min: number, max: number): number;
  int(minInclusive: number, maxExclusive: number): number;
  bool(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Weighted pick. Weights need not sum to 1. */
  weighted<T extends string>(weights: Readonly<Record<T, number>>): T;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const range = (min: number, max: number): number => min + next() * (max - min);

  return {
    next,
    range,
    int: (minInclusive, maxExclusive) =>
      Math.floor(range(minInclusive, maxExclusive)),
    bool: (probability) => next() < probability,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('rng.pick: empty collection');
      const item = items[Math.floor(next() * items.length)];
      // noUncheckedIndexedAccess: index is provably in range above.
      return item as T;
    },
    weighted<T extends string>(weights: Readonly<Record<T, number>>): T {
      const entries = Object.entries(weights) as Array<[T, number]>;
      const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
      if (total <= 0) throw new Error('rng.weighted: weights must sum above zero');

      let threshold = next() * total;
      for (const [key, weight] of entries) {
        threshold -= weight;
        if (threshold <= 0) return key;
      }
      return entries[entries.length - 1]![0];
    },
  };
}
