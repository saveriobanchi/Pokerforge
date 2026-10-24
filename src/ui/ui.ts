import * as A from '../core/actions';
import { BUILDINGS, BUILDING_LIST, type BuildCategory, WELL, WONDER_STAGES, legendCost } from '../core/content/buildings';
import { GAME, GAMES } from '../core/content/games';
import { ACH } from '../core/content/achievements';
import { GOAL_BY_ID, currentGoal, rewardText } from '../core/content/goals';
import { SEASONS, seasonFor } from '../core/content/seasons';
import { TOKEN, TOKEN_SETS } from '../core/content/tokens';
import { WEATHER, dayIndex, hotPick } from '../core/content/weather';
import { LANDS, LAND, landCost, xpForLevel } from '../core/content/world';
import { claimComps, gameOfType, hotGame, ownedGames, weatherNow } from '../core/economy';
import type { OfflineReport } from '../core/offline';
import { arrivalInterval, fullTakePerMin, glamourOf } from '../core/sim';
import { type Building, type SimEvent, dayFraction, isNight, perkRank } from '../core/state';
import type { Game } from '../game';
import { audio } from '../platform/audio';
import { art } from '../render/artpack';
import { LENS_COLORS } from '../render/world';
import { clear, duration, fmt, h, img, setOnly } from './dom';
import { glyph, landThumb, thumb, uiIcon } from './glyphs';
import { fmtN, short } from './games/common';
import { openJournal } from './journal';
import { openLounge, openShop } from './lounge';
import { type OpenTable, STAR, openTable } from './table';

const CATS: { id: BuildCategory | 'land'; name: string }[] = [
  { id: 'land', name: 'Land' },
  { id: 'games', name: 'Games' },
  { id: 'services', name: 'Services' },
  { id: 'decor', name: 'Casino decor' },
  { id: 'garden', name: 'Garden' },
  { id: 'wonder', name: 'Wonder' },
];

const GEAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="#efe2c4" stroke-width="1.8" stroke-linejoin="round"><path d="M10.3 2.6h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.6.5v3.4l-2.6.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.6h-3.4l-.5-2.6-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9-2.6-.5v-3.4l2.6-.5.8-1.9-1.5-2.2 2.4-2.4 2.2 1.5 1.9-.8z"/><circle cx="12" cy="12" r="3.4"/></svg>';

export class UI {
  g: Game;
  private root: HTMLElement;
  private chipsNum!: HTMLElement;
  private gemsNum!: HTMLElement;
  private compsEl!: HTMLElement;
  private lvlEl!: HTMLElement;
  private lvlBar!: HTMLElement;
  private bannerEl!: HTMLElement;
  private clockEl!: HTMLElement;
  private luckImg!: HTMLImageElement;
  private quest!: HTMLElement;
  private questText!: HTMLElement;
  private questCaps!: HTMLElement;
  private questIcon!: HTMLImageElement;
  private questBar!: HTMLElement;
  private btnBuild!: HTMLButtonElement;
  private btnLounge!: HTMLButtonElement;
  private btnJournal!: HTMLButtonElement;
  private btnShop!: HTMLButtonElement;
  private patronsEl!: HTMLElement;
  private savedEl!: HTMLElement;
  private build!: HTMLElement;
  private side!: HTMLElement;
  private modalWrap!: HTMLElement;
  private modal!: HTMLElement;
  private toasts!: HTMLElement;
  private hintEl!: HTMLElement;
  private bannerFx!: HTMLElement;
  private observeExit!: HTMLElement;
  private devEl!: HTMLElement;
  private fpsEl!: HTMLElement;
  private tab: BuildCategory | 'land' = 'games';
  private buildOpen = false;
  private hudTimer = 0;
  private hintTimer = 0;
  private panelSig = '';
  private devTaps = 0;
  private fpsAcc = { t: 0, n: 0 };
  private buildSig = '';
  private shownChips = 0;
  private hidden = 0;
  private table: OpenTable | null = null;
  private lastGoal = '';

  constructor(g: Game, root: HTMLElement) {
    this.g = g;
    this.root = root;
    this.mount();
    this.shownChips = g.s.chips;
  }

  private mount(): void {
    const r = this.root;
    clear(r);
    this.chipsNum = h('span', { class: 'num' });
    this.gemsNum = h('span', { class: 'num' });
    this.compsEl = h('button', { class: 'chip comps', title: 'Comps: a share of every wager. Tap to cash them in.', onclick: () => this.claimComps() }, img(uiIcon('comp')), h('span', { class: 'num' }));
    const res = h('div', { class: 'res-strip panel' },
      h('span', { class: 'chip chips', title: 'Chips' }, img(uiIcon('chips')), this.chipsNum),
      h('span', { class: 'chip gems', title: 'Gems' }, img(uiIcon('gem')), this.gemsNum),
      this.compsEl);
    this.lvlEl = h('span', { class: 'lvl' });
    this.lvlBar = h('i');
    this.patronsEl = h('span', { class: 'patrons-n' });
    this.bannerEl = h('button', { class: 'banner panel', 'aria-label': 'Lounge', onclick: () => this.openLounge() },
      h('div', { class: 'portrait' }, img(thumb('pokerforge') || uiIcon('island'))),
      h('div', { class: 't' }, h('div', { class: 'isle', text: 'Pokerforge' }), h('div', { class: 'lvlrow' }, this.lvlEl, h('div', { class: 'bar xp' }, this.lvlBar)), this.patronsEl));
    this.luckImg = img(uiIcon('w_clear'));
    this.clockEl = h('button', { class: 'clock', title: 'Today’s luck', onclick: () => this.showLuck() }, this.luckImg, h('span', { class: 'time' }));
    const menu = this.iconBtn('gear', 'Menu', () => this.openSettings());
    menu.innerHTML = GEAR_SVG;
    const top = h('div', { class: 'hud-top' }, this.bannerEl, h('div', { class: 'hud-right' }, h('div', { class: 'res-wrap' }, res), menu));
    const left = h('div', { class: 'hud-left' },
      this.iconBtn('eye', 'Watch the casino (hide the interface)', () => this.g.toggleObserve()),
      this.iconBtn('compass', 'Centre view', () => this.g.centre()));
    this.questText = h('div', { class: 'qtext' });
    this.questIcon = img(uiIcon('book'));
    this.questBar = h('i');
    this.quest = h('button', { class: 'quest panel hide', onclick: () => this.openJournal('goals') },
      h('div', { class: 'qicon' }, this.questIcon),
      h('div', { class: 'qbody' }, this.questCaps = h('div', { class: 'caps', text: 'Next step' }), this.questText, h('div', { class: 'bar qbar' }, this.questBar)),
      h('span', { class: 'chev', text: '›' }));
    this.btnBuild = this.mainBtn('build', 'Build', () => this.toggleBuild());
    this.btnBuild.classList.add('big');
    this.btnLounge = this.mainBtn('lounge', 'Lounge', () => this.openLounge());
    this.btnShop = this.mainBtn('gem', 'Charms', () => this.openShop());
    this.btnJournal = this.mainBtn('book', 'Journal', () => this.openJournal());
    const tables = this.mainBtn('cards', 'Tables', () => this.openTables());
    const bottom = h('div', { class: 'hud-bottom nav panel' }, tables, this.btnLounge, this.btnBuild, this.btnShop, this.btnJournal);
    this.savedEl = h('div', { class: 'saved' }, h('i'), 'Saved');
    const hud = h('div', { class: 'hud' }, top, left, this.clockEl, this.quest, bottom, this.savedEl);
    hud.style.position = 'absolute';
    hud.style.inset = '0';
    this.build = h('div', { class: 'sheet' });
    this.side = h('div', { class: 'side auto' });
    this.modalWrap = h('div', { class: 'modal-wrap', onclick: (e: MouseEvent) => { if (e.target === this.modalWrap) this.closeModal(); } });
    this.modal = h('div', { class: 'modal panel' });
    this.modalWrap.append(this.modal);
    this.toasts = h('div', { class: 'toasts' });
    this.hintEl = h('div', { class: 'hint-toast' });
    this.bannerFx = h('div', { class: 'win-banner' });
    this.observeExit = h('button', { class: 'icon-btn observe-exit', onclick: () => this.g.toggleObserve() }, img(glyph('eye')));
    this.devEl = h('div', { class: 'dev panel' });
    this.fpsEl = h('div', { class: 'fps' });
    r.append(hud, this.build, this.side, this.modalWrap, this.bannerFx, this.toasts, this.hintEl, this.observeExit, this.devEl, this.fpsEl);
    this.renderDev();
  }

  reset(): void {
    this.closeAll();
    this.shownChips = this.g.s.chips;
    this.hidden = 0;
    this.refreshAll();
  }

  private iconBtn(name: string, title: string, fn: () => void): HTMLButtonElement {
    return h('button', { class: 'icon-btn', title, 'aria-label': title, onclick: () => { audio.unlock(); fn(); } }, img(uiIcon(name)));
  }

  private mainBtn(name: string, label: string, fn: () => void): HTMLButtonElement {
    return h('button', { class: 'main-btn', 'aria-label': label, onclick: () => { audio.unlock(); fn(); } }, h('span', { class: 'ico' }, img(uiIcon(name))), h('span', { class: 'lbl', text: label }));
  }

  // ───────────────────────── per frame ─────────────────────────

  frame(dt: number): void {
    // the chip counter rolls toward the real value (minus winnings still being animated)
    const target = this.g.s.chips - this.hidden;
    const diff = target - this.shownChips;
    this.shownChips = Math.abs(diff) < 1 ? target : this.shownChips + diff * Math.min(1, dt * 8);
    const txt = fmtN(this.shownChips);
    if (this.chipsNum.textContent !== txt) this.chipsNum.textContent = txt;
    this.table?.frame(dt);
    this.hudTimer += dt;
    if (this.hudTimer > 0.25) {
      this.hudTimer = 0;
      this.refreshHud();
      this.refreshPanel();
      if (this.buildOpen && this.g.mode.kind === 'play') this.renderBuildIfChanged();
      if (this.g.mode.kind !== 'play') this.renderPlacing();
    }
    if (this.hintTimer > 0) {
      this.hintTimer -= dt * 1000;
      if (this.hintTimer <= 0) this.hintEl.classList.remove('show');
    }
    if (this.g.settings.fps) {
      this.fpsAcc.t += dt;
      this.fpsAcc.n++;
      if (this.fpsAcc.t > 0.5) {
        const st = this.g.view.stats();
        this.fpsEl.textContent = `${Math.round(this.fpsAcc.n / this.fpsAcc.t)} fps · ${this.g.view.frameMs.toFixed(1)}ms · ${st.sprites}b ${st.people}p ${st.particles}fx`;
        this.fpsAcc = { t: 0, n: 0 };
      }
    }
  }

  /** Hold back (or release, with a negative amount) chips the HUD should not show yet. */
  hideChips(delta: number, reset = false): void {
    this.hidden = reset ? 0 : Math.max(0, this.hidden + delta);
  }

  refreshAll(): void {
    this.refreshHud();
    this.panelSig = '';
    this.refreshPanel();
    if (this.buildOpen) this.renderBuild();
    this.renderPlacing();
  }

  private refreshHud(): void {
    const s = this.g.s;
    this.gemsNum.textContent = fmt(s.gems);
    const comps = Math.floor(s.comps);
    (this.compsEl.querySelector('.num') as HTMLElement).textContent = fmt(comps);
    this.compsEl.classList.toggle('ready', comps >= 1);
    const rn = s.renown;
    const lvl = `Renown ${rn.level}`;
    if (this.lvlEl.textContent !== lvl) this.lvlEl.textContent = lvl;
    this.lvlBar.style.width = `${Math.round((rn.xp / xpForLevel(rn.level)) * 100)}%`;
    const playing = s.patrons.filter((p) => p.phase === 'play').length;
    this.patronsEl.textContent = `${playing} playing · ${Math.round(s.cache.glamour)} glamour`;
    this.setDot(this.bannerEl, rn.points > 0);
    this.setDot(this.btnLounge, rn.points > 0);
    // clock: daylight spans 05:00–20:00
    const df = dayFraction(s);
    const hours = df < 0.68 ? 5 + (df / 0.68) * 15 : 20 + ((df - 0.68) / 0.32) * 9;
    const mins = Math.floor((hours % 24) * 60);
    const hh = String(Math.floor(mins / 60)).padStart(2, '0'), mm = String(Math.floor((mins % 60) / 10) * 10).padStart(2, '0');
    const time = this.clockEl.querySelector('.time')!;
    if (time.textContent !== `${hh}:${mm}`) {
      time.textContent = `${hh}:${mm}`;
      this.clockEl.classList.toggle('night', isNight(s));
      const w = weatherNow(s).id;
      if (this.clockEl.dataset.w !== w) { this.clockEl.dataset.w = w; this.luckImg.src = uiIcon('w_' + w); }
    }
    // quest card
    const goal = this.g.observe ? null : currentGoal(s);
    if (goal) {
      const [cur, target] = goal.check(s);
      const sig = goal.id + cur;
      if (sig !== this.lastGoal) {
        this.lastGoal = sig;
        this.questText.textContent = goal.text + (target > 1 ? ` · ${short(cur)}/${short(target)}` : '');
        this.questCaps.textContent = `Next step · ${rewardText(goal.reward)}`;
        const named = BUILDING_LIST.find((d) => goal.text.includes(d.name));
        this.questIcon.src = named ? thumb(named.id) : uiIcon('book');
        this.questBar.style.width = `${Math.round(Math.min(1, cur / target) * 100)}%`;
        this.quest.classList.remove('hide');
      }
    } else this.quest.classList.add('hide');
    this.setDot(this.btnBuild, this.unseen().length > 0 && !this.buildOpen);
    this.btnBuild.classList.toggle('on', this.buildOpen || this.g.mode.kind !== 'play');
    document.body.classList.toggle('sheet-open', this.buildOpen || this.g.mode.kind !== 'play');
    this.setDot(this.btnJournal, !s.flags.has('seen:ach:' + s.achieved.size));
    this.setDot(this.btnShop, s.gems >= 2 && !s.flags.has('seen:shop'));
  }

  private setDot(el: HTMLElement, on: boolean): void {
    const d = el.querySelector('.dot');
    if (on && !d) el.append(h('i', { class: 'dot' }));
    else if (!on && d) d.remove();
  }

  // ───────────────────────── build tray ─────────────────────────

  toggleBuild(): void {
    if (this.g.mode.kind !== 'play') { this.g.setMode({ kind: 'play' }); this.openBuild(); return; }
    if (this.buildOpen) this.closeBuild(); else this.openBuild();
  }

  private openBuild(): void {
    this.g.select(null, false);
    this.buildOpen = true;
    const fresh = this.unseen();
    if (fresh.length) this.tab = fresh[0].cat;
    this.renderBuild();
    this.build.classList.add('open');
    audio.play('open');
    this.refreshHud();
  }

  private closeBuild(): void {
    if (!this.buildOpen && this.g.mode.kind === 'play') return;
    this.buildOpen = false;
    this.build.classList.remove('open');
    if (this.g.mode.kind !== 'play') this.g.setMode({ kind: 'play' });
    this.refreshHud();
  }

  private unseen(): { id: string; cat: BuildCategory | 'land' }[] {
    const s = this.g.s;
    const out: { id: string; cat: BuildCategory | 'land' }[] = [];
    for (const l of LANDS) if (A.landUnlocked(s, l.id) && !s.seen.has('l:' + l.id)) out.push({ id: l.id, cat: 'land' });
    for (const b of BUILDING_LIST) if (b.level < 90 && A.buildingUnlocked(s, b.id) && !s.seen.has('b:' + b.id)) out.push({ id: b.id, cat: b.category });
    return out;
  }

  private renderBuildIfChanged(): void {
    const s = this.g.s;
    const sig = `${this.tab}|${Math.floor(s.chips)}|${s.renown.level}|${s.tiles.size}|${s.gems}`;
    if (sig !== this.buildSig) this.renderBuild();
  }

  private renderBuild(): void {
    this.build.classList.remove('placing-mode');
    if (this.g.mode.kind !== 'play') return this.renderPlacing();
    const s = this.g.s;
    this.buildSig = `${this.tab}|${Math.floor(s.chips)}|${s.renown.level}|${s.tiles.size}|${s.gems}`;
    const panel = h('div', { class: 'panel tray' });
    const tabs = h('div', { class: 'tabs' });
    const fresh = new Set(this.unseen().map((u) => u.cat));
    for (const c of CATS) {
      tabs.append(h('button', { class: 'tab' + (c.id === this.tab ? ' on' : ''), onclick: () => { this.tab = c.id; audio.play('tap'); this.renderBuild(); } }, c.name, fresh.has(c.id) ? h('i', { class: 'dot' }) : null));
    }
    tabs.append(h('div', { style: 'flex:1' }));
    tabs.append(h('button', { class: 'tab', title: 'Sell buildings', onclick: () => { this.g.setMode({ kind: 'remove' }); audio.play('tap'); } }, img(glyph('trash'), 'px', 'Remove')));
    tabs.append(h('button', { class: 'tab', onclick: () => this.closeBuild(), 'aria-label': 'Close' }, img(glyph('close'))));
    const cards = h('div', { class: 'cards' });
    const lockCard = (pic: string, name: string, level: number) => h('div', { class: 'card locked', title: `Unlocks at renown ${level}` }, h('div', { class: 'pic' }, img(pic)), h('div', { class: 'nm', text: name }), h('div', { class: 'cost muted', text: `Renown ${level}` }));
    if (this.tab === 'land') {
      for (const l of LANDS) {
        if (!A.landUnlocked(s, l.id)) { cards.append(lockCard(landThumb(l.floor), l.name, l.level)); continue; }
        const cost = landCost(l.id, s.tiles.size);
        cards.append(h('button', { class: 'card' + (s.chips >= cost ? '' : ' poor'), title: l.desc, onclick: () => { audio.play('select'); this.g.setMode({ kind: 'land', land: l.id }); } },
          !s.seen.has('l:' + l.id) ? h('span', { class: 'new', text: 'NEW' }) : null,
          h('div', { class: 'pic' }, img(landThumb(l.floor))), h('div', { class: 'nm', text: l.name }), this.costEl(cost)));
      }
    } else {
      let locked = 0;
      for (const b of BUILDING_LIST) {
        if (b.category !== this.tab || b.level >= 90) continue;
        if (b.kind === 'wonder' && s.buildings.has(s.wonder.id)) continue;
        if (!A.buildingUnlocked(s, b.id)) { if (locked++ < 2) cards.append(lockCard(thumb(b.id), b.name, b.level)); continue; }
        const g = gameOfType(b.id);
        const count = [...s.buildings.values()].filter((x) => x.type === b.id).length;
        cards.append(h('button', { class: 'card' + (s.chips >= b.cost && s.gems >= (b.gems ?? 0) ? '' : ' poor'), title: b.desc, onclick: () => this.pickBuilding(b.id) },
          !s.seen.has('b:' + b.id) ? h('span', { class: 'new', text: 'NEW' }) : count ? h('span', { class: 'count', text: '×' + count }) : null,
          h('div', { class: 'pic' }, img(thumb(b.id))), h('div', { class: 'nm', text: b.name }),
          g ? h('div', { class: 'muted tiny', text: GAME[g].flavor }) : b.glamour && b.kind === 'decor' ? h('div', { class: 'muted tiny', text: `+${b.glamour} glamour` }) : null,
          this.costEl(b.cost, b.gems)));
      }
    }
    panel.append(tabs, cards);
    setOnly(this.build, panel);
    for (const u of this.unseen()) if (u.cat === this.tab) s.seen.add((u.cat === 'land' ? 'l:' : 'b:') + u.id);
  }

  private pickBuilding(type: string): void {
    audio.play('select');
    const def = BUILDINGS[type];
    const s = this.g.s;
    if (s.chips < def.cost) { this.g.fail(`Needs ${fmtN(def.cost)} chips.`); return; }
    if ((def.gems ?? 0) > s.gems) { this.g.fail(`Needs ${def.gems} gems.`); return; }
    this.g.setMode({ kind: 'build', type, dir: 0 });
  }

  onMode(): void {
    if (this.g.mode.kind !== 'play') {
      this.buildOpen = true;
      this.build.classList.add('open');
      this.renderPlacing();
    } else if (this.buildOpen) this.renderBuild();
    this.refreshHud();
  }

  private renderPlacing(): void {
    const m = this.g.mode;
    if (m.kind === 'play') return;
    const s = this.g.s;
    let pic = '', name = '', hint = '', cost: number | null = null, gems = 0, rot = false;
    if (m.kind === 'build') {
      const d = BUILDINGS[m.type];
      pic = thumb(m.type); name = d.name; cost = d.cost; gems = d.gems ?? 0; rot = !!d.rotatable;
      hint = d.draggable ? 'Tap to place · drag to lay a line' : d.edge ? 'Tap a spot touching the edge' : d.floors && !d.floors.includes('grass') ? 'Needs a paved floor (Build → Land)' : d.floors?.includes('grass') ? 'Needs grass' : 'Tap to place';
    } else if (m.kind === 'land') {
      const l = LAND[m.land];
      pic = landThumb(l.floor); name = l.name; cost = landCost(m.land, s.tiles.size);
      hint = l.mode === 'new' ? 'Tap beside the edge · drag to lay several' : 'Tap tiles to re-floor them · drag for more';
    } else if (m.kind === 'remove') {
      pic = glyph('trash'); name = 'Sell'; hint = 'Tap a building to sell it for half its cost';
    } else if (m.kind === 'move') {
      const b = s.buildings.get(m.id);
      pic = b ? thumb(b.type) : ''; name = 'Move ' + (b ? BUILDINGS[b.type].name : ''); hint = 'Tap the new spot'; rot = !!(b && BUILDINGS[b.type].rotatable);
    }
    const sig = `${m.kind}|${name}|${cost}|${cost !== null ? s.chips >= cost : ''}|${'dir' in m ? m.dir : ''}`;
    if (this.build.dataset.sig === sig && this.build.querySelector('.placing')) return;
    this.build.dataset.sig = sig;
    const bar = h('div', { class: 'panel placing' },
      h('button', { class: 'close', 'aria-label': 'Back', onclick: () => { this.g.setMode({ kind: 'play' }); this.openBuild(); } }, h('span', { class: 'title', style: 'font-size:1.3rem', text: '‹' })),
      h('div', { class: 'pic' }, img(pic)),
      h('div', { class: 't' }, h('div', { class: 'nm', text: name }), cost !== null ? this.costEl(cost, gems) : null, h('div', { class: 'hint', text: hint })),
      rot ? h('button', { class: 'btn', onclick: () => this.g.rotateMode(), 'aria-label': 'Rotate' }, img(glyph('rotate'))) : null,
      h('button', { class: 'btn primary', onclick: () => { this.g.setMode({ kind: 'play' }); this.closeBuild(); audio.play('close'); } }, img(glyph('check')), 'Done'));
    this.build.classList.add('placing-mode');
    setOnly(this.build, bar);
  }

  costEl(chips: number, gems = 0): HTMLElement {
    const s = this.g.s;
    const el = h('span', { class: 'cost' });
    if (chips > 0 || !gems) el.append(h('span', { class: s.chips < chips ? 'lack' : '' }, img(uiIcon('chips')), chips ? short(chips) : 'Free'));
    if (gems) el.append(h('span', { class: s.gems < gems ? 'lack' : '' }, img(uiIcon('gem')), String(gems)));
    return el;
  }

  // ───────────────────────── selection panel ─────────────────────────

  onSelect(): void {
    this.panelSig = '';
    this.refreshPanel();
  }

  private refreshPanel(): void {
    const id = this.g.selected;
    const b = id !== null ? this.g.s.buildings.get(id) : undefined;
    if (!b) { if (this.side.classList.contains('open')) this.side.classList.remove('open'); return; }
    const s = this.g.s;
    const sig = `${b.id}|${b.type}|${b.stock}|${Math.floor(s.comps)}|${s.wonder.stage}|${s.wonder.legend}|${Math.floor(s.chips / 1000)}|${b.dir}|${Math.round(s.cache.glamour)}|${s.renown.perks.wellspring ?? 0}`;
    if (sig === this.panelSig && this.side.classList.contains('open')) return;
    this.panelSig = sig;
    const def = BUILDINGS[b.type];
    const body = h('div', { class: 'panel-body' });
    const actions = h('div', { class: 'actions' });
    body.append(h('p', { class: 'desc', text: def.desc }));
    switch (def.kind) {
      case 'well': {
        const [lo, hi] = A.wellValue(s);
        const max = WELL.stock + perkRank(s, 'wellspring') * 4;
        body.append(h('div', { class: 'sect' }, h('div', { class: 'sect-h' }, 'Coins in the well', h('span', { class: 'r num', text: `${b.stock}/${max}` })), h('div', { class: 'bar' }, h('i', { style: `width:${(b.stock / max) * 100}%` })), h('div', { class: 'muted small', text: `${lo}–${hi} chips a coin · one more every ${WELL.regrow}s. When you are broke, it hands back a purse once a day.` })));
        actions.append(h('button', { class: 'btn primary', onclick: () => this.g.tapWell(b) }, 'Fish a coin'));
        if (s.comps >= 1) actions.append(h('button', { class: 'btn', onclick: () => this.claimComps() }, `Cash comps · ${fmtN(Math.floor(s.comps))}`));
        break;
      }
      case 'cashier': {
        const n = [...s.buildings.values()].filter((t) => gameOfType(t.type) && Math.abs(t.x - b.x) <= 3 && Math.abs(t.y - b.y) <= 3).length;
        body.append(h('div', { class: 'sect' }, h('div', { class: 'sect-h' }, 'Tables in reach', h('span', { class: 'r num', text: String(n) })), h('div', { class: 'muted small', text: 'Tills within three tiles empty themselves into your chips every few seconds.' })));
        actions.append(h('button', { class: 'btn primary' + (s.comps >= 1 ? '' : ' off'), onclick: () => this.claimComps() }, `Cash comps · ${fmtN(Math.floor(s.comps))}`));
        break;
      }
      case 'wonder': {
        const st = WONDER_STAGES[s.wonder.stage];
        body.append(h('div', { class: 'sect' }, ...WONDER_STAGES.map((w, i) => h('div', { class: 'stage-row' + (i < s.wonder.stage ? ' done' : '') }, h('span', { class: 'caps', text: `Stage ${i + 1}` }), h('span', { text: w.bonus }), i < s.wonder.stage ? h('span', { class: 'good', text: '✓' }) : null))));
        if (st) actions.append(h('button', { class: 'btn primary' + (s.chips >= st.chips && s.gems >= st.gems ? '' : ' off'), onclick: () => { this.g.act(() => A.buildWonderStage(this.g.s), 'cash'); } }, `Build stage ${s.wonder.stage + 1}`, this.costEl(st.chips, st.gems)));
        else {
          body.append(h('div', { class: 'sect' }, h('div', { class: 'sect-h' }, 'Legend rank', h('span', { class: 'r num', text: String(s.wonder.legend) })), h('div', { class: 'muted small', text: 'Each rank: patrons’ take and bet limits +10%, forever.' })));
          actions.append(h('button', { class: 'btn primary', onclick: () => { this.g.act(() => A.buyLegend(this.g.s), 'forge'); } }, `Legend ${s.wonder.legend + 1}`, this.costEl(legendCost(s.wonder.legend))));
        }
        break;
      }
      default: {
        const facts: string[] = [];
        if (def.glamour) facts.push(`+${def.glamour} glamour${def.kind === 'stage' ? ' (doubles nearby at night)' : ''}`);
        if (def.radius) facts.push(`Reach: ${def.radius} tiles`);
        if (facts.length) body.append(h('div', { class: 'muted small', text: facts.join(' · ') }));
      }
    }
    if (def.removable !== false) {
      actions.append(h('button', { class: 'btn small', onclick: () => this.g.setMode({ kind: 'move', id: b.id, dir: b.dir }) }, img(glyph('move')), 'Move'));
      if (def.rotatable) actions.append(h('button', { class: 'btn small', onclick: () => this.g.act(() => A.rotate(this.g.s, b.id)) }, img(glyph('rotate')), 'Turn'));
      actions.append(h('button', { class: 'btn small danger', onclick: () => { this.g.tryRemove(b.x, b.y); this.g.select(null); } }, img(glyph('trash')), 'Sell'));
    }
    body.append(actions);
    const head = h('div', { class: 'panel-head' }, h('div', { class: 'thumb' }, img(thumb(b.type))), h('div', { class: 't' }, h('div', { class: 'name', text: def.name }), h('div', { class: 'sub', text: def.category === 'services' ? 'Service' : def.kind === 'wonder' ? 'The great work' : 'Decoration' })), h('button', { class: 'close', onclick: () => this.g.select(null) }, img(glyph('close'))));
    setOnly(this.side, h('div', { class: 'panel' }, head, h('div', { class: 'scroll' }, body)));
    this.side.classList.add('open');
  }

  // ───────────────────────── tables ─────────────────────────

  openTable(b: Building): void {
    this.closeBuild();
    this.g.select(null, false);
    this.table?.close();
    const t = openTable(this.g, b, {
      banner: (text, kind, ms) => this.winBanner(text, kind, ms),
      floatWin: (n) => this.floatChips(n),
      close: () => this.closeModal(),
    });
    this.table = t;
    this.openModal(t.el, true, 'table');
  }

  /** Press the open table's main button (keyboard shortcut). Returns false when no table is open. */
  tablePrimary(): boolean {
    if (!this.table || !this.modalOpen()) return false;
    const btn = this.modal.querySelector<HTMLButtonElement>('.controls .actions .btn.primary:not([style*="display: none"]):not([disabled]), .controls .big-call');
    btn?.click();
    return true;
  }

  /** First visit: what the game is, in three lines. */
  showWelcome(): void {
    const content = h('div', { class: 'away welcome' },
      h('div', { class: 'caps', text: 'Welcome to' }),
      h('div', { class: 'h', text: 'Pokerforge' }),
      h('p', { text: 'A scrap of floating land, a wishing well, a coin-toss stand and 100 chips. Build it into the finest casino in the skies.' }),
      h('ul', {},
        h('li', { text: 'Tap a table to play. Every wager earns renown, comps and mastery — win or lose.' }),
        h('li', { text: 'Patrons fill your tables’ tills. Tap a table to collect, and build to draw bigger crowds.' }),
        h('li', { text: 'Broke? Fish coins from the wishing well. All chips are play money.' })),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: () => this.closeModal() }, 'Open the doors')));
    this.openModal(content);
  }

  private openTables(): void {
    const s = this.g.s;
    const list = h('div', { class: 'table-list scroll' });
    const hot = hotGame(s);
    const tables = [...s.buildings.values()].filter((b) => gameOfType(b.type)).sort((a, b) => GAME[gameOfType(b.type)!].level - GAME[gameOfType(a.type)!].level);
    for (const t of tables) {
      const g = gameOfType(t.type)!;
      const stars = Object.values(s.stats.playsBy).length ? STAR(Math.min(5, [25, 100, 300, 1000, 2500].filter((x) => (s.stats.playsBy[g] ?? 0) >= x).length)) : '';
      list.append(h('button', { class: 'tl-row', onclick: () => { this.closeModal(); this.g.focusOn(t); this.openTable(t); } },
        img(thumb(t.type)), h('div', { class: 't' }, h('div', { class: 'nm', text: `${GAME[g].name} · Lv ${t.level}${g === hot ? ' · 🔥' : ''}` }), h('div', { class: 'muted small', text: `${stars}  ${GAME[g].tagline}` })),
        h('span', { class: 'till-s' + (t.status === 'full' ? ' full' : '') }, img(uiIcon('chips')), short(t.till))));
    }
    const locked = GAMES.filter((g) => !tables.some((t) => t.type === g.building));
    if (locked.length) list.append(h('div', { class: 'caps', style: 'padding:8px 4px 2px', text: 'Still to open' }), ...locked.map((g) => h('div', { class: 'tl-row off' }, img(thumb(g.building)), h('div', { class: 't' }, h('div', { class: 'nm', text: g.name }), h('div', { class: 'muted small', text: s.renown.level >= g.level ? `Build it: ${short(BUILDINGS[g.building].cost)} chips` : `Renown ${g.level}` })))));
    const take = fullTakePerMin(s);
    this.openModal(h('div', { class: 'col-modal' }, this.modalHead('Your tables', `Up to ${short(take)} chips/min from patrons · a guest every ${arrivalInterval(s).toFixed(0)}s`, uiIcon('cards')), list));
  }

  // ───────────────────────── modals ─────────────────────────

  openModal(content: HTMLElement, wide = false, cls = ''): void {
    if (cls !== 'table' && this.table) { this.table.close(); this.table = null; }
    clear(this.modal);
    this.modal.className = 'modal panel' + (wide ? ' wide' : '') + (cls ? ' ' + cls : '');
    this.modal.append(content);
    this.modalWrap.classList.add('open');
    audio.play('open');
  }

  closeModal(): void {
    if (this.table) { this.table.close(); this.table = null; }
    if (!this.modalWrap.classList.contains('open')) return;
    this.modalWrap.classList.remove('open');
    audio.play('close');
    this.g.markDirty();
  }

  modalOpen(): boolean { return this.modalWrap.classList.contains('open'); }

  closeAll(): void {
    this.closeModal();
    this.closeBuild();
  }

  modalHead(title: string, sub: string, icon: string): HTMLElement {
    return h('div', { class: 'panel-head' }, h('div', { class: 'thumb' }, img(icon)), h('div', { class: 't' }, h('div', { class: 'name', text: title }), h('div', { class: 'sub', text: sub })), h('button', { class: 'close', onclick: () => this.closeModal() }, img(glyph('close'))));
  }

  openLounge(tab?: string): void { openLounge(this, tab); }
  openShop(): void { this.g.s.flags.add('seen:shop'); openShop(this); }
  openJournal(tab?: string): void {
    const s = this.g.s;
    s.flags.add('seen:ach:' + s.achieved.size);
    openJournal(this, tab);
  }

  private showLuck(): void {
    const s = this.g.s;
    const w = weatherNow(s);
    const hot = hotGame(s);
    const se = seasonFor(s.time);
    const days = h('div', { class: 'forecast' });
    for (let d = 1; d <= 3; d++) {
      const day = dayIndex(s.time) + d;
      const fw = WEATHER.find((x) => x.id === weatherForDay(day, s.seed))!;
      const hp = hotPick(day, s.seed, ownedGames(s).sort());
      days.append(h('div', { class: 'fc' }, img(uiIcon('w_' + fw.id)), h('span', { class: 'caps', text: d === 1 ? 'Tomorrow' : `In ${d} days` }), h('span', { text: fw.name }), hp ? h('span', { class: 'muted small', text: '🔥 ' + GAME[hp].name }) : null));
    }
    const content = h('div', { class: 'col-modal' },
      this.modalHead(`Lady Luck: ${w.name}`, `${se.name} · day ${dayIndex(s.time) + 1}`, uiIcon('w_' + w.id)),
      h('div', { class: 'panel-body' },
        h('p', { text: w.desc }),
        hot ? h('div', { class: 'sect' }, h('div', { class: 'sect-h' }, '🔥 Hot table', h('span', { class: 'r', text: GAME[hot].name })), h('div', { class: 'muted small', text: `Win profits +${Math.round(w.hot * 100)}% and patrons pay 50% more there today.` })) : null,
        h('div', { class: 'sect' }, h('div', { class: 'sect-h' }, se.name), h('div', { class: 'muted small', text: se.desc })),
        h('div', { class: 'caps', text: 'The almanac' }), days,
        h('div', { class: 'muted small', text: `Seasons turn every four days: ${SEASONS.map((x) => x.name).join(' → ')}.` })));
    this.openModal(content);
  }

  private claimComps(): void {
    const n = claimComps(this.g.s);
    if (n > 0) { audio.play('cash'); this.floatChips(n); this.hint(`Comps cashed: +${fmtN(n)} chips`); this.g.markDirty(); }
    else this.hint('No comps yet: every wager earns a little back.', false, 2000);
    this.refreshAll();
  }

  // ───────────────────────── settings ─────────────────────────

  openSettings(): void {
    const g = this.g, st = g.settings;
    const slider = (label: string, key: 'master' | 'sfx' | 'ambience') => {
      const input = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(st[key]) }) as HTMLInputElement;
      input.addEventListener('input', () => { st[key] = +input.value; g.saveSettings(); });
      input.addEventListener('change', () => audio.play('chip'));
      return h('div', { class: 'row' }, h('label', { text: label }), input);
    };
    const toggle = (label: string, key: 'haptics' | 'reduced' | 'bubbles' | 'fps', after?: () => void) => {
      const t = h('button', { class: 'toggle' + (st[key] ? ' on' : ''), 'aria-label': label, onclick: () => { st[key] = !st[key]; t.classList.toggle('on', st[key]); g.saveSettings(); audio.play('tap'); after?.(); } });
      return h('div', { class: 'row' }, h('label', { text: label }), t);
    };
    const seg = <T extends string | number>(label: string, opts: [T, string][], cur: T, set: (v: T) => void) => {
      const box = h('div', { class: 'seg' });
      for (const [v, name] of opts) box.append(h('button', { class: v === cur ? 'on' : '', onclick: (e: MouseEvent) => { set(v); g.saveSettings(); audio.play('tap'); box.querySelectorAll('button').forEach((b) => b.classList.remove('on')); (e.currentTarget as HTMLElement).classList.add('on'); } }, name));
      return h('div', { class: 'row' }, h('label', { text: label }), box);
    };
    const area = h('textarea', { placeholder: 'Paste an exported casino here…' }) as HTMLTextAreaElement;
    const version = h('div', { class: 'legal', text: 'Pokerforge 1.0 · built on the Aetherforge engine', onclick: () => { if (++this.devTaps >= 7) { st.dev = true; g.saveSettings(); this.renderDev(); this.hint('Developer tools enabled.'); } } });
    const form = h('div', { class: 'form scroll' },
      h('div', { class: 'caps', text: 'Sound' }), slider('Volume', 'master'), slider('Effects', 'sfx'), slider('Ambience & music', 'ambience'),
      h('div', { class: 'caps', text: 'Feel' }), toggle('Vibration', 'haptics'), toggle('Reduce motion (faster rounds)', 'reduced'), toggle('Full-till bubbles', 'bubbles'),
      h('div', { class: 'caps', text: 'Display' }),
      seg('Interface size', [[0.9, 'S'], [1, 'M'], [1.15, 'L']] as [number, string][], st.ui, (v) => { st.ui = v; }),
      seg('Effects quality', [['low', 'Light'], ['high', 'Full']] as ['low' | 'high', string][], st.quality, (v) => { st.quality = v; st.qualityChosen = true; }),
      st.dev ? toggle('Show frame rate', 'fps', () => this.fpsEl.classList.toggle('show', st.fps)) : null,
      h('div', { class: 'caps', text: 'Your casino' }),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: async () => { const ok = await g.save(); this.hint(ok ? 'Saved.' : 'Could not save.', !ok); } }, 'Save now'),
        h('button', { class: 'btn', onclick: () => this.exportWorld(area) }, 'Export'),
        h('button', { class: 'btn', onclick: () => { const r = g.importSave(area.value); this.hint(r.ok ? 'Casino imported.' : r.reason ?? 'Import failed', !r.ok, 3000); if (r.ok) this.closeModal(); } }, 'Import')),
      area,
      h('div', { class: 'actions' }, h('button', { class: 'btn danger', onclick: () => this.confirmReset() }, 'Start a new casino…')),
      h('div', { class: 'caps', text: 'About' }),
      h('div', { class: 'legal', html: 'All chips are play money: nothing here can be bought or cashed out. Block textures: CC0 packs by ARoachIFoundOnMyPillow, JoeEnderman and Kenney (kenney.nl). Fonts: Pixelify Sans, VT323 and Atkinson Hyperlegible (SIL OFL 1.1). Rendering by PixiJS (MIT). Sounds are synthesised in code.' }),
      version);
    this.openModal(h('div', { class: 'col-modal' }, this.modalHead('Settings', 'Your casino saves itself as you play', glyph('menu')), form));
  }

  private exportWorld(area: HTMLTextAreaElement): void {
    const text = this.g.exportSave();
    area.value = text;
    try {
      const blob = new Blob([text], { type: 'text/plain' });
      const a = h('a', { href: URL.createObjectURL(blob), download: `pokerforge-${new Date().toISOString().slice(0, 10)}.txt` });
      document.body.append(a);
      a.click();
      a.remove();
    } catch { /* the text box has it */ }
    try { void navigator.clipboard?.writeText(text); } catch { /* ignore */ }
    this.hint('Casino exported — also copied to the clipboard.', false, 2600);
  }

  private confirmReset(): void {
    const content = h('div', { class: 'away' },
      h('div', { class: 'h', text: 'Start over?' }),
      h('div', { class: 'muted', text: 'This casino will be replaced by a fresh scrap of land and 100 chips. A safety copy is kept on this device.' }),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: () => this.openSettings() }, 'Keep my casino'),
        h('button', { class: 'btn danger', onclick: async () => { await this.g.resetWorld(); this.closeModal(); this.hint('A fresh start.'); } }, 'Start over')));
    this.openModal(content);
  }

  showAway(rep: OfflineReport): void {
    const content = h('div', { class: 'away' },
      h('div', { class: 'caps', text: 'While you were away' }),
      h('div', { class: 'h', text: duration(rep.seconds) }),
      h('div', { class: 'gains' },
        rep.banked ? h('span', { class: 'rchip' }, img(uiIcon('chips')), `+${fmtN(rep.banked)} banked`) : null,
        rep.tills ? h('span', { class: 'rchip' }, img(uiIcon('chips')), `+${fmtN(rep.tills)} in tills`) : null),
      !rep.banked && !rep.tills ? h('div', { class: 'muted', text: 'The tables were quiet. Open a few and patrons will keep them busy while you are gone.' }) : h('div', { class: 'legal', text: `Patrons played on at an easier pace${rep.capped ? ' (up to the vault’s limit)' : ''}. Tap tables to empty their tills.` }),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: () => this.closeModal() }, 'Back to the floor')));
    this.openModal(content);
  }

  // ───────────────────────── events ─────────────────────────

  onEvent(e: SimEvent): void {
    const s = this.g.s;
    switch (e.type) {
      case 'levelup': this.toast(`Renown ${e.level}!`, `+${fmtN(e.gift)} chips · a perk point to spend in the Lounge${GAMES.some((g) => g.level === e.level) ? ' · new table unlocked' : ''}`, uiIcon('lounge'), 'big'); audio.play('forge', 1.3); break;
      case 'achievement': { const a = ACH[e.id]; if (a) this.toast(`Feat: ${a.name}`, a.desc + (a.gems ? ` · +${a.gems} gem${a.gems > 1 ? 's' : ''}` : ''), uiIcon('star'), a.gems >= 3 ? 'big' : ''); audio.play('discover', 1.15); break; }
      case 'goal': { const g = GOAL_BY_ID[e.id]; if (g) this.toast('Goal complete', `${g.text} · ${rewardText(g.reward)}`, uiIcon('book')); audio.play('discover'); break; }
      case 'token': { const t = TOKEN[e.id]; this.toast(e.dup ? `${t.name} (again)` : `Lucky token: ${t.name}!`, e.dup ? 'A spare: it becomes a gem.' : `${TOKEN_SETS.find((x) => x.id === t.set)!.name} · ${TOKEN_SETS.find((x) => x.id === t.set)!.tokens.filter((id) => (s.tokens[id] ?? 0) > 0).length}/4`, art.url('tok:' + e.id), e.dup ? '' : 'big'); audio.play('bell'); break; }
      case 'codex': { const set = TOKEN_SETS.find((x) => x.id === e.set)!; this.toast(`Set complete: ${set.name}`, `${set.bonus}, forever · +3 gems`, uiIcon('clover'), 'big'); audio.play('jackpot'); break; }
      case 'jackpot': this.toast('CROWN JACKPOT!', `${fmtN(e.amount)} chips`, uiIcon('crown'), 'big'); break;
      case 'mastery': this.toast(`${GAME[e.game].name} mastery ${STAR(e.star)}`, 'Win profits there +0.6%', thumb(GAME[e.game].building)); audio.play('discover', 1.2); break;
      case 'vip': { const b = s.buildings.get(e.id); this.toast('A high roller arrives', b ? `They head for your ${BUILDINGS[b.type].name}. Six times the stakes!` : 'Six times the stakes!', art.url('person:8:0')); audio.play('dock'); break; }
      case 'wonder': this.toast(`The Pokerforge: stage ${e.stage}`, WONDER_STAGES[e.stage - 1]?.bonus ?? '', thumb('pokerforge'), 'big'); audio.play('jackpot'); break;
      case 'legend': this.toast(`Legend ${e.rank}`, 'Patrons’ take and bet limits +10%', thumb('pokerforge'), 'big'); break;
      case 'glamour': this.toast(`Glamour ${e.milestone}!`, 'Your casino sparkles. More patrons are on their way.', uiIcon('glamour')); audio.play('discover', 1.3); break;
      default: break;
    }
  }

  private toastQueue: { title: string; sub: string; icon: string; cls: string }[] = [];
  private toastTimer = 0;
  toast(title: string, sub: string, icon: string, cls = ''): void {
    this.toastQueue.push({ title, sub, icon, cls });
    if (!this.toastTimer) this.toastTimer = window.setTimeout(() => this.flushToasts(), 0);
  }

  private flushToasts(): void {
    this.toastTimer = 0;
    const live = this.toasts.querySelectorAll('.toast:not(.out)').length;
    const room = Math.max(0, 3 - live);
    const q = this.toastQueue;
    if (!q.length) return;
    if (q.length > room + 1) {
      const keep = q.splice(0, Math.max(1, room - 1));
      for (const t of keep) this.showToast(t.title, t.sub, t.icon, t.cls);
      const rest = q.splice(0);
      this.showToast(`+${rest.length} more`, rest.slice(0, 3).map((t) => t.title).join(' · ') + (rest.length > 3 ? ' …' : ''), rest[0].icon, '');
      return;
    }
    const now = q.splice(0, Math.max(1, room));
    for (const t of now) this.showToast(t.title, t.sub, t.icon, t.cls);
    if (q.length) this.toastTimer = window.setTimeout(() => this.flushToasts(), 1200);
  }

  private showToast(title: string, sub: string, icon: string, cls: string): void {
    const el = h('div', { class: 'toast panel ' + cls }, img(icon), h('div', { class: 't' }, h('div', { class: 'tt', text: title }), h('div', { class: 'ts', text: sub })));
    this.toasts.append(el);
    window.setTimeout(() => el.classList.add('out'), 3400);
    window.setTimeout(() => el.remove(), 3900);
  }

  // ───────────────────────── feedback ─────────────────────────

  hint(text: string, bad = false, ms = 1800): void {
    this.hintEl.textContent = text;
    this.hintEl.classList.toggle('bad', bad);
    this.hintEl.classList.add('show');
    this.hintTimer = ms;
  }

  private bannerTimer = 0;
  winBanner(text: string, kind: string, ms: number): void {
    const el = this.bannerFx;
    el.textContent = text;
    el.className = 'win-banner ' + kind;
    void el.offsetWidth;
    el.classList.add('show');
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => el.classList.remove('show'), ms);
  }

  /** Chips flying up from the middle of the screen (or a point). */
  floatChips(n: number, sx = window.innerWidth / 2, sy = window.innerHeight * 0.42): void {
    const el = h('div', { class: 'floater chips-float', style: `left:${sx}px;top:${sy}px` }, '+' + short(n), img(uiIcon('chips')));
    this.root.append(el);
    window.setTimeout(() => el.remove(), 1150);
  }

  tag(sx: number, sy: number, text: string, cls: string): void {
    const el = h('div', { class: 'tag ' + cls, style: `left:${sx}px;top:${sy}px`, text });
    this.root.append(el);
    window.setTimeout(() => el.remove(), 1100);
  }

  dirty(): void { /* autosave is handled by the game loop */ }

  saved(): void {
    this.savedEl.classList.add('show');
    window.setTimeout(() => this.savedEl.classList.remove('show'), 1200);
  }

  wakeObserve(): void {
    this.observeExit.classList.add('wake');
    window.setTimeout(() => this.observeExit.classList.remove('wake'), 2500);
  }

  // ───────────────────────── developer tools ─────────────────────────

  renderDev(): void {
    const g = this.g;
    if (!g.settings.dev) { this.devEl.classList.remove('open'); return; }
    this.fpsEl.classList.toggle('show', g.settings.fps);
    clear(this.devEl);
    const btn = (label: string, fn: () => void) => h('button', { class: 'btn', onclick: () => { fn(); g.ui.refreshAll(); } }, label);
    let open = false;
    const body = h('div', { class: 'grid', style: 'display:none' },
      btn('+10k chips', () => { g.s.chips += 10000; }),
      btn('+1m chips', () => { g.s.chips += 1e6; }),
      btn('+20 gems', () => { g.s.gems += 20; }),
      btn('+5 levels', () => { for (let i = 0; i < 5; i++) { g.s.renown.xp = xpForLevel(g.s.renown.level); g.advance(0.5); } }),
      btn('Speed ×1', () => { g.speed = 1; }),
      btn('Speed ×10', () => { g.speed = 10; }),
      btn('Night/day', () => { g.s.time += 300; }),
      btn('Glamour', () => this.hint(`glamour ${glamourOf(g.s)} · arrival ${arrivalInterval(g.s).toFixed(1)}s`, false, 3000)),
      btn('FPS', () => { g.settings.fps = !g.settings.fps; this.fpsEl.classList.toggle('show', g.settings.fps); }),
      btn('Demo casino', () => g.devDemo()),
      btn('Dev off', () => { g.settings.dev = false; g.saveSettings(); this.renderDev(); }));
    this.devEl.append(h('button', { class: 'btn', style: 'width:100%', onclick: () => { open = !open; body.style.display = open ? 'grid' : 'none'; } }, 'DEV'), body);
    this.devEl.classList.add('open');
  }
}

import { weatherFor } from '../core/content/weather';
const weatherForDay = (day: number, seed: number) => weatherFor(day, seed).id;
void LENS_COLORS;
