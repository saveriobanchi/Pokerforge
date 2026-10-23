import { DAY_LENGTH } from './world';

/** Seasons turn the sky (snow in winter, leaves in autumn) and bring a small festival each. */
export type SeasonId = 'spring' | 'summer' | 'autumn' | 'winter';

export interface SeasonDef {
  id: SeasonId;
  name: string;
  desc: string;
  /** Patron arrival multiplier. */
  arrivals: number;
  /** Patron take multiplier. */
  take: number;
}

export const SEASON_DAYS = 4;
export const SEASONS: SeasonDef[] = [
  { id: 'spring', name: 'Spring Fair', desc: 'Day-trippers: patrons arrive 10% faster.', arrivals: 1.1, take: 1 },
  { id: 'summer', name: 'Summer Season', desc: 'Holiday crowds: patrons arrive 20% faster.', arrivals: 1.2, take: 1 },
  { id: 'autumn', name: 'Harvest Purses', desc: 'Full pockets: patrons’ take +10%.', arrivals: 1, take: 1.1 },
  { id: 'winter', name: 'Winter Lights', desc: 'Cosy nights: patrons’ take +15%, but fewer arrive.', arrivals: 0.9, take: 1.15 },
];

export const seasonFor = (time: number): SeasonDef => SEASONS[Math.floor(time / DAY_LENGTH / SEASON_DAYS) % SEASONS.length];
export const yearFor = (time: number): number => Math.floor(time / DAY_LENGTH / SEASON_DAYS / SEASONS.length) + 1;
export const seasonProgress = (time: number): number => ((time / DAY_LENGTH) % SEASON_DAYS) / SEASON_DAYS;
