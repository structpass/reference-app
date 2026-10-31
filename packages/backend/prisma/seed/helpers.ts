/**
 * Seeded PRNG and utility functions for deterministic seed data generation.
 */

export type Rng = () => number;

/** Mulberry32 seeded PRNG — returns a function that produces [0,1) floats. */
export function seededRandom(seed: number): Rng {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random integer in [min, max] inclusive. */
export function randomInt(min: number, max: number, rng: Rng): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/** Pick one random element from an array. */
export function pickRandom<T>(arr: readonly T[], rng: Rng): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** Pick min..max unique elements from an array (Fisher-Yates partial shuffle). */
export function randomSubset<T>(arr: readonly T[], min: number, max: number, rng: Rng): T[] {
  const count = randomInt(min, Math.min(max, arr.length), rng);
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

/** Random date between start and end (inclusive). */
export function randomDate(start: Date, end: Date, rng: Rng): Date {
  const s = start.getTime();
  const e = end.getTime();
  return new Date(s + Math.floor(rng() * (e - s + 1)));
}

/** Zero-pad a number to the given width. */
export function padNum(n: number, width: number): string {
  return String(n).padStart(width, '0');
}
