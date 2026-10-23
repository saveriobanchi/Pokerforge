import { ACHIEVEMENTS } from './content/achievements';
import { GOALS, type Reward } from './content/goals';
import type { GameState } from './state';

export function grant(s: GameState, r: Reward): void {
  if (r.chips) s.chips += r.chips;
  if (r.gems) s.gems += r.gems;
  if (r.points) s.renown.points += r.points;
}

/** Goals and achievements: checked twice a second by the sim. */
export function checkProgress(s: GameState): void {
  for (const g of GOALS) {
    if (s.goals.has(g.id)) continue;
    const [cur, target] = g.check(s);
    if (cur >= target) {
      s.goals.add(g.id);
      grant(s, g.reward);
      s.events.push({ type: 'goal', id: g.id });
    }
  }
  for (const a of ACHIEVEMENTS) {
    if (s.achieved.has(a.id)) continue;
    if (a.check(s)) {
      s.achieved.set(a.id, s.time);
      s.gems += a.gems;
      s.events.push({ type: 'achievement', id: a.id });
    }
  }
  const milestones = [25, 50, 100, 200, 400, 800];
  for (const m of milestones) {
    const f = 'glam' + m;
    if (!s.flags.has(f) && s.cache.glamour >= m) { s.flags.add(f); s.events.push({ type: 'glamour', milestone: m }); }
  }
}
