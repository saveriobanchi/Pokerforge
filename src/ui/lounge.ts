import * as A from '../core/actions';
import { GAMES, MASTERY_AT, masteryBonus, masteryStar, nextStarAt } from '../core/content/games';
import { FORTUNE_PERK, PERKS, PERK_BRANCHES } from '../core/content/perks';
import { TOKEN, TOKEN_SETS } from '../core/content/tokens';
import { xpForLevel } from '../core/content/world';
import { compRate, limitMult, profitBonus, xpMult } from '../core/economy';
import { boostOn, perkRank } from '../core/state';
import { audio } from '../platform/audio';
import { art } from '../render/artpack';
import { h, img } from './dom';
import { thumb, uiIcon } from './glyphs';
import { fmtN, short } from './games/common';
import { STAR } from './table';
import type { UI } from './ui';

let tab = 'perks';

export function openLounge(ui: UI, which?: string): void {
  if (which) tab = which;
  const s = ui.g.s;
  const rn = s.renown;
  const tabs = h('div', { class: 'tabs' });
  for (const [id, name] of [['perks', `Perks${rn.points ? ` (${rn.points})` : ''}`], ['mastery', 'Mastery'], ['codex', 'Lucky tokens'], ['bonus', 'Your edge']] as const) {
    tabs.append(h('button', { class: 'tab' + (tab === id ? ' on' : ''), onclick: () => { audio.play('tap'); openLounge(ui, id); } }, name));
  }
  const body = h('div', { class: 'lounge scroll' });
  if (tab === 'perks') {
    for (const br of PERK_BRANCHES) {
      const col = h('div', { class: 'perk-col' }, h('div', { class: 'caps', text: br.name }));
      for (const p of PERKS.filter((x) => x.branch === br.id)) {
        const r = perkRank(s, p.id);
        const can = A.perkAvailable(s, p.id).ok;
        const locked = rn.level < p.level;
        col.append(h('button', { class: 'perk' + (can ? ' avail' : '') + (locked ? ' locked' : '') + (r >= p.max ? ' maxed' : ''), onclick: () => { const res = ui.g.act(() => A.buyPerk(ui.g.s, p.id), 'discover'); if (res.ok) openLounge(ui); } },
          h('div', { class: 'ph' }, h('span', { class: 'nm', text: p.name }), h('span', { class: 'pips', text: '◆'.repeat(r) + '◇'.repeat(p.max - r) })),
          h('div', { class: 'pd', text: locked ? `Renown ${p.level}` : p.desc(Math.max(1, r + (r < p.max ? 1 : 0))) + (r && r < p.max ? ` (now: ${p.desc(r)})` : '') })));
      }
      body.append(col);
    }
    const fr = perkRank(s, FORTUNE_PERK.id);
    body.append(h('div', { class: 'perk-col wide' }, h('div', { class: 'caps', text: 'Endless' }), h('button', { class: 'perk' + (A.perkAvailable(s, FORTUNE_PERK.id).ok ? ' avail' : ' locked'), onclick: () => { const res = ui.g.act(() => A.buyPerk(ui.g.s, FORTUNE_PERK.id), 'discover'); if (res.ok) openLounge(ui); } }, h('div', { class: 'ph' }, h('span', { class: 'nm', text: FORTUNE_PERK.name }), h('span', { class: 'num', text: `rank ${fr}` })), h('div', { class: 'pd', text: `${FORTUNE_PERK.desc(fr + 1)} · unlocks once every other perk is full` }))));
    body.append(h('div', { class: 'actions' }, h('button', { class: 'btn small', onclick: () => { const r = ui.g.act(() => A.respec(ui.g.s), 'tap'); if (r.ok) openLounge(ui); } }, `Refund all perks · ${A.RESPEC_GEMS}`, img(uiIcon('gem')))));
  } else if (tab === 'mastery') {
    body.append(h('p', { class: 'muted small', text: `Every round you play counts toward mastery. Stars at ${MASTERY_AT.join(', ')} plays, then a grandmaster star every 5,000. Each of the first five adds +0.6% to win profits at that game.` }));
    const grid = h('div', { class: 'mastery-grid' });
    for (const g of GAMES) {
      const plays = s.stats.playsBy[g.id] ?? 0;
      const star = masteryStar(plays);
      const nxt = nextStarAt(plays);
      const owned = [...s.buildings.values()].some((b) => b.type === g.building);
      grid.append(h('div', { class: 'm-card' + (owned || plays ? '' : ' off') },
        img(thumb(g.building)), h('div', { class: 't' }, h('div', { class: 'nm', text: g.name }), h('div', { class: 'stars', text: STAR(star) }),
          h('div', { class: 'bar' }, h('i', { style: `width:${Math.round((plays / nxt) * 100)}%` })),
          h('div', { class: 'muted tiny', text: `${fmtN(plays)} / ${fmtN(nxt)} plays · +${(masteryBonus(star) * 100).toFixed(1)}% · best ${(s.stats.bestBy[g.id] ?? 0).toFixed(1)}×` }))));
    }
    body.append(grid);
  } else if (tab === 'codex') {
    body.append(h('p', { class: 'muted small', text: 'Tokens turn up from any bet, more often from big wins and scratch cards. A full set grants a lasting bonus; spares become gems.' }));
    for (const set of TOKEN_SETS) {
      const done = s.codex.includes(set.id);
      body.append(h('div', { class: 'token-set' + (done ? ' done' : '') },
        h('div', { class: 'sect-h' }, h('span', { text: set.name }), h('span', { class: 'r', text: done ? `✓ ${set.bonus}` : set.bonus })),
        h('div', { class: 'tokens' }, ...set.tokens.map((id) => { const n = s.tokens[id] ?? 0; return h('div', { class: 'token' + (n ? '' : ' missing'), title: TOKEN[id].name }, img(art.url('tok:' + id), 'px'), h('span', { class: 'tiny', text: n ? TOKEN[id].name : '?' }), n > 1 ? h('span', { class: 'cnt', text: '×' + n }) : null); }))));
    }
  } else {
    const rows: [string, string][] = [
      ['Win profit bonus (here, now)', `+${(profitBonus(s, 'coin') * 100).toFixed(1)}% (coin) — varies by table`],
      ['Bet limits', `×${limitMult(s).toFixed(2)}`],
      ['Comps on every wager', `${(compRate(s) * 100).toFixed(1)}%`],
      ['Renown XP', `×${xpMult(s).toFixed(2)}`],
      ['Second chance', `${perkRank(s, 'second') * 2}% of losses half back`],
      ['Charms active', ['hot_streak', 'tonic', 'crowd', 'magnet'].filter((id) => boostOn(s, id)).join(', ') || 'none'],
      ['Wagered', fmtN(s.stats.wagered)],
      ['Returned to you', `${fmtN(s.stats.returned)} (${s.stats.wagered ? ((s.stats.returned / s.stats.wagered) * 100).toFixed(1) : '0'}%)`],
      ['Patrons’ take', fmtN(s.stats.houseTake)],
    ];
    body.append(h('div', { class: 'stats' }, ...rows.flatMap(([k, v]) => [h('span', { text: k }), h('span', { class: 'num', text: v })])));
  }
  const head = ui.modalHead(`Renown ${rn.level}`, `${short(rn.xp)} / ${short(xpForLevel(rn.level))} XP · ${rn.points} perk point${rn.points === 1 ? '' : 's'}`, uiIcon('lounge'));
  ui.openModal(h('div', { class: 'col-modal' }, head, tabs, body), true, 'lounge-m');
}

export function openShop(ui: UI): void {
  const s = ui.g.s;
  const list = h('div', { class: 'shop scroll' });
  for (const c of A.CHARMS) {
    const on = boostOn(s, c.id);
    const b = s.boosts.find((x) => x.id === c.id);
    const left = b ? (b.until !== undefined ? `${Math.max(0, Math.ceil((b.until - s.time) / 60))} min left` : `${b.bets} bets left`) : '';
    list.append(h('div', { class: 'shop-row' + (on ? ' on' : '') },
      h('div', { class: 't' }, h('div', { class: 'nm', text: c.name }), h('div', { class: 'muted small', text: c.desc }), on ? h('div', { class: 'good small', text: 'Active · ' + left }) : null),
      h('button', { class: 'btn' + (s.gems >= c.gems ? ' primary' : ' off'), onclick: () => { const r = ui.g.act(() => A.buyCharm(ui.g.s, c.id), 'bell'); if (r.ok) openShop(ui); } }, img(uiIcon('gem')), String(c.gems))));
  }
  list.append(h('p', { class: 'muted small', text: 'Gems come from feats, goals, renown milestones, complete token sets and spare tokens. They can never be bought.' }));
  ui.openModal(h('div', { class: 'col-modal' }, ui.modalHead('Lucky charms', `${s.gems} gem${s.gems === 1 ? '' : 's'} to spend`, uiIcon('gem')), list));
}
