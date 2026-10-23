import { describe, expect, it } from 'vitest';
import * as BJ from '../../src/core/games/blackjack';
import { HAND_NAMES, category, eval5, best } from '../../src/core/games/cards';
import * as Q from '../../src/core/games/quick';
import * as SL from '../../src/core/games/slots';
import * as T from '../../src/core/games/tables';
import { makeRand } from '../../src/core/rng';

describe('exact returns', () => {
  it('slots return about 97% before the jackpot', () => {
    const t = SL.theory();
    expect(t.withFree).toBeGreaterThan(0.95);
    expect(t.withFree).toBeLessThan(0.985);
    expect(t.trigger).toBeGreaterThan(0.002);
  });
  it('plinko tables return 97–100%', () => {
    for (const rows of Q.PLINKO_ROWS) for (const risk of ['low', 'medium', 'high'] as Q.Risk[]) {
      expect(Q.PLINKO[rows][risk].length).toBe(rows + 1);
      const r = Q.plinkoRtp(rows, risk);
      expect(r, `${rows} ${risk}`).toBeGreaterThan(0.96);
      expect(r, `${rows} ${risk}`).toBeLessThan(1.0);
    }
  });
  it('fortune wheel risks return about 97%', () => {
    for (const risk of ['low', 'medium', 'high'] as Q.Risk[]) {
      expect(Q.WHEEL[risk].length).toBe(30);
      expect(Q.wheelRtp(risk)).toBeGreaterThan(0.95);
      expect(Q.wheelRtp(risk)).toBeLessThan(0.99);
    }
  });
  it('keno paytables return 90–97%', () => {
    for (let n = 1; n <= 10; n++) {
      expect(Q.KENO_PAY[n].length).toBe(n + 1);
      const r = Q.kenoRtp(n);
      expect(r, `picks ${n}`).toBeGreaterThan(0.9);
      expect(r, `picks ${n}`).toBeLessThan(0.975);
    }
  });
  it('scratch cards return about 93%', () => {
    for (const t of Q.TICKETS) {
      expect(Q.ticketRtp(t)).toBeGreaterThan(0.9);
      expect(Q.ticketRtp(t)).toBeLessThan(0.97);
    }
  });
  it('dice pays 98% at any target', () => {
    for (const t of [100, 2500, 5000, 9000, 9800]) for (const over of [true, false]) {
      const p = Q.diceChance(t, over);
      if (p < 0.01 || p > 0.98) continue;
      expect(p * Q.diceMult(t, over)).toBeCloseTo(0.98, 3);
    }
  });
  it('mines multiplier is fair less 3%', () => {
    expect(Q.minesMult(1, 1)).toBeCloseTo(0.97 * 25 / 24, 2);
    expect(Q.minesMult(24, 1)).toBeCloseTo(0.97 * 25, 1);
  });
});

describe('scratch cards are honest', () => {
  it('a card shows exactly one triple when it wins and none when it loses', () => {
    const r = makeRand(5);
    for (const t of Q.TICKETS) for (let i = 0; i < 2000; i++) {
      const c = Q.scratchCard(r, t);
      const counts = new Map<number, number>();
      for (const x of c.cells) counts.set(x, (counts.get(x) ?? 0) + 1);
      const triples = [...counts.entries()].filter(([, n]) => n >= 3);
      expect(c.cells.length).toBe(9);
      if (c.tier >= 0) { expect(triples).toEqual([[c.tier, 3]]); expect(c.win).toBe(t.prizes[c.tier][0]); }
      else expect(triples.length).toBe(0);
    }
  });
});

describe('poker hands', () => {
  const C = (s: string) => {
    const rank = '23456789TJQKA'.indexOf(s[0]);
    const suit = 'shdc'.indexOf(s[1]);
    return suit * 13 + rank;
  };
  const cat = (h: string) => HAND_NAMES[category(eval5(h.split(' ').map(C)))];
  it('ranks categories', () => {
    expect(cat('As Ks Qs Js Ts')).toBe('Royal Flush');
    expect(cat('5h 4h 3h 2h Ah')).toBe('Straight Flush');
    expect(cat('9c 9d 9h 9s 2c')).toBe('Four of a Kind');
    expect(cat('9c 9d 9h 2s 2c')).toBe('Full House');
    expect(cat('Ac 9c 7c 4c 2c')).toBe('Flush');
    expect(cat('5c 4d 3h 2s Ac')).toBe('Straight');
    expect(cat('5c 5d 5h Ks 2c')).toBe('Three of a Kind');
    expect(cat('5c 5d Kh Ks 2c')).toBe('Two Pair');
    expect(cat('5c 5d Qh Ks 2c')).toBe('Pair');
    expect(cat('5c 7d Qh Ks 2c')).toBe('High Card');
  });
  it('compares within a category', () => {
    expect(eval5(['Ac', 'Ad', '2h', '3s', '4c'].map((x) => C(x[0] + x[1])))).toBeGreaterThan(eval5(['Kc', 'Kd', 'Qh', 'Js', 'Tc'].map((x) => C(x[0] + x[1]))));
    expect(best('As Ks 2d 3c 9h Qs Js Ts'.split(' ').map(C)).score).toBe(eval5('As Ks Qs Js Ts'.split(' ').map(C)));
  });
  it('video poker pays jacks or better', () => {
    expect(T.vpScore('Jc Jd 2h 5s 9c'.split(' ').map(C)).mult).toBe(1);
    expect(T.vpScore('Tc Td 2h 5s 9c'.split(' ').map(C)).mult).toBe(0);
    expect(T.vpScore('As Ks Qs Js Ts'.split(' ').map(C)).mult).toBe(800);
  });
});

describe('simulated returns with good play', () => {
  it('blackjack with basic strategy returns about 99%', () => {
    const r = makeRand(11);
    let rd = BJ.newRound(r);
    let staked = 0, ret = 0;
    for (let i = 0; i < 60000; i++) {
      rd = BJ.newRound(r, rd);
      BJ.deal(rd, 10);
      while (rd.phase === 'play') {
        const a = BJ.basic(rd);
        if (a === 'double' && BJ.canDouble(rd)) BJ.double(rd);
        else if (a === 'split' && BJ.canSplit(rd)) BJ.split(rd);
        else if (a === 'stand') BJ.stand(rd);
        else BJ.hit(rd);
      }
      staked += rd.hands.reduce((a, h) => a + h.bet, 0);
      ret += rd.results.reduce((a, x) => a + x.ret, 0);
    }
    const rtp = ret / staked;
    expect(rtp).toBeGreaterThan(0.975);
    expect(rtp).toBeLessThan(1.02);
  });
  it('video poker with the advisor returns 95–101%', () => {
    const r = makeRand(12);
    let staked = 0, ret = 0;
    for (let i = 0; i < 60000; i++) {
      const rd = T.vpDeal(r, 1);
      rd.held = T.vpAdvice(rd.hand);
      T.vpDraw(rd);
      staked += 1;
      ret += rd.result!.mult;
    }
    expect(ret / staked).toBeGreaterThan(0.95);
    expect(ret / staked).toBeLessThan(1.02);
  });
  it('baccarat banker and player return about 98.8%', () => {
    const r = makeRand(13);
    let rd = T.bacNew(r);
    let bank = 0, play = 0;
    const n = 80000;
    for (let i = 0; i < n; i++) {
      rd = T.bacNew(r, rd);
      T.bacPlay(rd);
      bank += T.bacReturn(rd, 'banker', 1);
      play += T.bacReturn(rd, 'player', 1);
    }
    expect(bank / n).toBeGreaterThan(0.975);
    expect(bank / n).toBeLessThan(1.0);
    expect(play / n).toBeGreaterThan(0.975);
    expect(play / n).toBeLessThan(1.0);
  });
  it('casino hold’em with the advisor returns about 98%', () => {
    const r = makeRand(14);
    let staked = 0, ret = 0;
    for (let i = 0; i < 40000; i++) {
      const rd = T.holdemDeal(r, 1);
      const call = T.holdemAdvice(rd) === 'call';
      T.holdemFinish(rd, call);
      staked += call ? 3 : 1;
      ret += rd.ret;
    }
    // edge measured per ante
    const edge = (staked - ret) / (40000);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(0.04);
  });
  it('derby odds return about 95% on wins and places', () => {
    const r = makeRand(15);
    let w = 0, p = 0;
    const n = 30000;
    for (let i = 0; i < n; i++) {
      const card = T.derbyCard(r);
      const order = T.derbyRun(r, card);
      const pick = Math.floor(r() * 6);
      if (order[0] === pick) w += T.derbyOdds(card.field[pick].p);
      if (order.indexOf(pick) < 2) p += T.derbyOdds(card.field[pick].place);
    }
    expect(w / n).toBeGreaterThan(0.9);
    expect(w / n).toBeLessThan(1.0);
    expect(p / n).toBeGreaterThan(0.9);
    expect(p / n).toBeLessThan(1.0);
  });
  it('crash bursts at the advertised rate', () => {
    const r = makeRand(16);
    let reach2 = 0;
    const n = 50000;
    for (let i = 0; i < n; i++) if (Q.crashPoint(r) >= 2) reach2++;
    expect(reach2 / n).toBeGreaterThan(0.47);
    expect(reach2 / n).toBeLessThan(0.5);
  });
});
