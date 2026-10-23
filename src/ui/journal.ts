import { ACHIEVEMENTS, ACH_BRANCHES } from '../core/content/achievements';
import { GAMES } from '../core/content/games';
import { GOALS, rewardText } from '../core/content/goals';
import { audio } from '../platform/audio';
import { duration, h, img } from './dom';
import { glyph, thumb, uiIcon } from './glyphs';
import { fmtN, short } from './games/common';
import type { UI } from './ui';

let tab = 'goals';

const HELP: [string, string][] = [
  ['Play to win', 'Tap a table to play it. Every chip you wager earns renown (win or lose), a little comp back, and progress toward that game’s mastery stars.'],
  ['The house', 'Patrons arrive at your casino and sit at your tables. Each table fills a till with the house’s take: tap the table to collect it, or build a Cashier Cage nearby to do it for you.'],
  ['Glamour', 'Decor, fine floors and services raise glamour. Glamour brings patrons faster. Some decor needs grass; card tables need paving.'],
  ['Upgrades', 'Upgrading a table raises its bet limit and the house take its patrons bring. Higher-tier games have far richer patrons.'],
  ['Luck', 'Each day Lady Luck picks a mood (see the clock) and one hot table pays extra. The almanac shows the coming days.'],
  ['Tokens & gems', 'Lucky tokens drop from bets, more from big wins. Complete sets for permanent bonuses. Gems buy short charms and perk refunds.'],
  ['Broke?', 'The wishing well always has a few coins, and when you are completely broke it hands back a purse once a day. Comps can be cashed at the well or a cashier.'],
  ['Fair play', 'Every game uses real odds: house edges are shown on each table. Perks, mastery, comps and the hot table tilt them your way. All chips are play money.'],
];

export function openJournal(ui: UI, which?: string): void {
  if (which) tab = which;
  const s = ui.g.s;
  const tabs = h('div', { class: 'tabs' });
  for (const [id, name] of [['goals', 'Goals'], ['feats', `Feats ${s.achieved.size}/${ACHIEVEMENTS.length}`], ['records', 'Records'], ['help', 'How to play']] as const) {
    tabs.append(h('button', { class: 'tab' + (tab === id ? ' on' : ''), onclick: () => { audio.play('tap'); openJournal(ui, id); } }, name));
  }
  const body = h('div', { class: 'journal scroll' });
  if (tab === 'goals') {
    let shownNext = 0;
    for (const g of GOALS) {
      const done = s.goals.has(g.id);
      if (!done && shownNext >= 4) continue;
      if (!done) shownNext++;
      const [cur, target] = g.check(s);
      body.append(h('div', { class: 'goal' + (done ? ' done' : '') },
        h('span', { class: 'mark', text: done ? '✓' : '•' }),
        h('div', { class: 't' }, h('div', { class: 'nm', text: g.text }), done ? null : h('div', { class: 'muted small', text: g.hint }), done ? null : h('div', { class: 'bar' }, h('i', { style: `width:${Math.round(Math.min(1, cur / target) * 100)}%` }))),
        h('span', { class: 'rw small', text: rewardText(g.reward) })));
    }
    const left = GOALS.filter((g) => !s.goals.has(g.id)).length;
    if (left > 4) body.append(h('div', { class: 'muted small', style: 'padding:6px', text: `…and ${left - 4} more to uncover.` }));
  } else if (tab === 'feats') {
    for (const br of ACH_BRANCHES) {
      const list = ACHIEVEMENTS.filter((a) => a.branch === br.id);
      body.append(h('div', { class: 'caps', text: `${br.name} · ${list.filter((a) => s.achieved.has(a.id)).length}/${list.length}` }));
      const grid = h('div', { class: 'feat-grid' });
      for (const a of list) {
        const got = s.achieved.has(a.id);
        grid.append(h('div', { class: 'feat' + (got ? ' got' : '') }, h('div', { class: 'nm', text: got || !a.secret ? a.name : '???' }), h('div', { class: 'muted tiny', text: got || !a.secret ? a.desc : 'A secret feat.' }), a.gems ? h('span', { class: 'gm tiny' }, img(uiIcon('gem'), 'px'), String(a.gems)) : null));
      }
      body.append(grid);
    }
  } else if (tab === 'records') {
    const st = s.stats;
    const rows: [string, string][] = [
      ['Time at the tables', duration(st.playSeconds)],
      ['Rounds played', fmtN(st.plays)],
      ['Rounds won', `${fmtN(st.wins)} (${st.plays ? Math.round((st.wins / st.plays) * 100) : 0}%)`],
      ['Biggest win', fmtN(st.biggestWin)],
      ['Best multiplier', st.biggestMult.toFixed(2) + '×'],
      ['Most chips held', fmtN(st.maxChips)],
      ['Wagered', fmtN(st.wagered)],
      ['Patrons welcomed', fmtN(st.patrons)],
      ['High rollers hosted', fmtN(st.vips)],
      ['House take', fmtN(st.houseTake)],
      ['Jackpots', fmtN(st.jackpots)],
      ['Lucky tokens found', fmtN(st.tokens)],
      ['Coins fished from the well', fmtN(st.wellTaps)],
    ];
    body.append(h('div', { class: 'stats' }, ...rows.flatMap(([k, v]) => [h('span', { text: k }), h('span', { class: 'num', text: v })])));
    body.append(h('div', { class: 'caps', style: 'margin-top:12px', text: 'By game' }));
    const tbl = h('div', { class: 'stats bygame' });
    for (const g of GAMES) {
      const n = st.playsBy[g.id] ?? 0;
      if (!n) continue;
      const net = st.netBy[g.id] ?? 0;
      tbl.append(h('span', {}, img(thumb(g.building), 'px mini'), ' ', g.name), h('span', { class: 'num ' + (net >= 0 ? 'good' : 'bad'), text: `${fmtN(n)} plays · ${net >= 0 ? '+' : '−'}${short(Math.abs(net))}` }));
    }
    body.append(tbl);
  } else {
    for (const [t, p] of HELP) body.append(h('div', { class: 'entry' }, h('div', { class: 'h', text: t }), h('p', { text: p })));
  }
  ui.openModal(h('div', { class: 'col-modal' }, ui.modalHead('Journal', tab === 'feats' ? 'Feats earn gems' : tab === 'goals' ? 'Your path to the Pokerforge' : 'Your casino in numbers', glyph('journal')), tabs, body), false, 'journal');
}
