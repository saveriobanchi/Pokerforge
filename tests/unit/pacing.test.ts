import { describe, expect, it } from 'vitest';
import { Bot } from '../bot';

const fmt = (t: number) => `${(t / 3600).toFixed(2)}h`;

describe('pacing (scripted player)', () => {
  it('reaches the late game and the Pokerforge in a reasonable time', () => {
    const bot = new Bot(11);
    bot.verbose = !!process.env.BOT_VERBOSE;
    bot.run(Number(process.env.BOT_HOURS ?? 32), (s) => s.wonder.stage >= 3);
    const at = (id: string) => bot.timeline.find((x) => x.id === id)?.t ?? Infinity;
    const report = ['level5', 'level10', 'level15', 'level20', 'level25', 'level27', 'build_blackjack', 'build_roulette', 'build_poker', 'build_crash', 'build_holdem', 'wonder1', 'wonder3'].map((k) => `${k}: ${fmt(at(k))}`).join(' · ');
    console.log(report, `| chips ${Math.floor(bot.s.chips)} level ${bot.s.renown.level} tables ${[...bot.s.buildings.values()].length}`);
    // measured: level10 ≈ 0.7h, level20 ≈ 4h, every table ≈ 5.7h, the Pokerforge ≈ 19h (a tireless, sensible player)
    expect(at('level5')).toBeLessThan(0.5 * 3600);
    expect(at('level10')).toBeLessThan(2 * 3600);
    expect(at('level20')).toBeLessThan(8 * 3600);
    expect(at('build_holdem')).toBeLessThan(12 * 3600);
    expect(at('wonder3')).toBeLessThan(30 * 3600);
    // and not trivially fast
    expect(at('level10')).toBeGreaterThan(0.3 * 3600);
    expect(at('level20')).toBeGreaterThan(1.5 * 3600);
    expect(at('wonder3')).toBeGreaterThan(8 * 3600);
  });
});
