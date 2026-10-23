import { DAY_LENGTH } from './world';

/**
 * Lady Luck's mood: each day rolls a deterministic "luck" (shown in the sky
 * as weather). Day 1 is always fair.
 */
export type WeatherId = 'clear' | 'breezy' | 'calm' | 'rain' | 'fog' | 'starfall';

export interface WeatherDef {
  id: WeatherId;
  name: string;
  desc: string;
  weight: number;
  /** Token drop multiplier. */
  tokens: number;
  /** Patron arrival multiplier. */
  arrivals: number;
  /** Patron stay multiplier. */
  stay: number;
  /** Hot table profit bonus. */
  hot: number;
  /** XP multiplier. */
  xp: number;
}

export const WEATHER: WeatherDef[] = [
  { id: 'clear', name: 'Fair Skies', desc: 'A fair day. Today’s hot table pays 5% more.', weight: 35, tokens: 1, arrivals: 1, stay: 1, hot: 0.05, xp: 1 },
  { id: 'breezy', name: 'Lucky Breeze', desc: 'Lucky tokens blow in twice as often.', weight: 20, tokens: 2, arrivals: 1, stay: 1, hot: 0.05, xp: 1 },
  { id: 'calm', name: 'Lazy Calm', desc: 'Patrons linger 30% longer at the tables.', weight: 12, tokens: 1, arrivals: 1, stay: 1.3, hot: 0.05, xp: 1 },
  { id: 'rain', name: 'Rainy Day', desc: 'Everyone wants to be indoors: patrons arrive 40% faster.', weight: 18, tokens: 1, arrivals: 1.4, stay: 1, hot: 0.05, xp: 1 },
  { id: 'fog', name: 'Mystery Fog', desc: 'The hot table burns: it pays 12% more today.', weight: 10, tokens: 1, arrivals: 1, stay: 1, hot: 0.12, xp: 1 },
  { id: 'starfall', name: 'Starfall', desc: 'Wishes come true: XP +30% and tokens ×1.5.', weight: 5, tokens: 1.5, arrivals: 1, stay: 1, hot: 0.05, xp: 1.3 },
];
export const WEATHER_BY_ID: Record<WeatherId, WeatherDef> = Object.fromEntries(WEATHER.map((w) => [w.id, w])) as Record<WeatherId, WeatherDef>;

function mix(day: number, seed: number, salt: number): number {
  let h = (Math.imul(day + 1, 2654435761) ^ Math.imul((seed | 0) + salt, 1597334677)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/** Luck for a day index (0-based) of a world. */
export function weatherFor(day: number, seed: number): WeatherDef {
  if (day <= 0) return WEATHER[0];
  const total = WEATHER.reduce((a, w) => a + w.weight, 0);
  let t = mix(day, seed, 0) * total;
  for (const w of WEATHER) { if (t < w.weight) return w; t -= w.weight; }
  return WEATHER[0];
}

/** A day's hot-table pick among `ids` (stable for the day). */
export function hotPick<T>(day: number, seed: number, ids: T[]): T | null {
  if (!ids.length) return null;
  return ids[Math.floor(mix(day, seed, 77) * ids.length)];
}

export const dayIndex = (time: number) => Math.floor(time / DAY_LENGTH);
