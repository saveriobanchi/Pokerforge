/**
 * Entirely synthesised audio (no samples, no licences): UI, actions,
 * machines and a living ambience. Machine sounds are rate-limited and
 * attenuated by distance and zoom so a large factory hums rather than roars.
 */

export type Sfx =
  | 'tap' | 'open' | 'close' | 'harvest' | 'place' | 'remove' | 'expand' | 'craft' | 'sift' | 'collect'
  | 'discover' | 'error' | 'dock' | 'forge' | 'select' | 'fiber' | 'load'
  | 'chip' | 'card' | 'tick' | 'reel' | 'win' | 'bigwin' | 'jackpot' | 'lose' | 'coin' | 'dice' | 'pop' | 'cash' | 'flip' | 'whoosh' | 'peg' | 'bell';

export type MachineVoice = 'wood' | 'mech' | 'fire' | 'aether' | 'press' | 'leaf';

export class Audio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private amb!: GainNode;
  private mach!: GainNode;
  private verb!: ConvolverNode;
  private verbSend!: GainNode;
  private noise!: AudioBuffer;
  private wind: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private belt: { gain: GainNode } | null = null;
  private machineBudget = 0;
  private nextMusic = 4;
  private nextCritter = 6;
  private t = 0;
  volumes = { master: 0.8, sfx: 0.8, ambience: 0.6 };
  night = 0;

  /** Must be called from a user gesture (iOS). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.amb = ctx.createGain();
    this.mach = ctx.createGain();
    this.sfx.connect(this.master);
    this.amb.connect(this.master);
    this.mach.connect(this.master);
    // reverb from a synthetic impulse
    this.verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 1.8);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    this.verb.buffer = ir;
    this.verbSend = ctx.createGain();
    this.verbSend.gain.value = 0.28;
    this.verbSend.connect(this.verb).connect(this.master);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    this.startAmbience();
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, now, 0.05);
    this.sfx.gain.setTargetAtTime(this.volumes.sfx, now, 0.05);
    this.mach.gain.setTargetAtTime(this.volumes.sfx * 0.55, now, 0.05);
    this.amb.gain.setTargetAtTime(this.volumes.ambience, now, 0.05);
  }

  suspend(): void { void this.ctx?.suspend(); }
  resume(): void { void this.ctx?.resume(); }

  // ───────────────────────── primitives ─────────────────────────

  private tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; attack?: number; to?: number; bus?: GainNode; verb?: number; delay?: number; detune?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const o = ctx.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);
    if (opts.detune) o.detune.value = opts.detune;
    const g = ctx.createGain();
    const peak = opts.gain ?? 0.2;
    const a = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(opts.bus ?? this.sfx);
    if (opts.verb) { const s = ctx.createGain(); s.gain.value = opts.verb; g.connect(s).connect(this.verbSend); }
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  private hiss(dur: number, opts: { freq?: number; q?: number; type?: BiquadFilterType; gain?: number; attack?: number; bus?: GainNode; delay?: number; sweep?: number; verb?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.freq ?? 1500, t0);
    if (opts.sweep) f.frequency.exponentialRampToValueAtTime(opts.sweep, t0 + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.2, t0 + (opts.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(opts.bus ?? this.sfx);
    if (opts.verb) { const s = ctx.createGain(); s.gain.value = opts.verb; g.connect(s).connect(this.verbSend); }
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.05);
  }

  // ───────────────────────── sounds ─────────────────────────

  play(name: Sfx, pitch = 1): void {
    if (!this.ctx) return;
    const p = pitch * (0.97 + Math.random() * 0.06);
    switch (name) {
      case 'tap': this.tone(1100 * p, 0.05, { type: 'triangle', gain: 0.06, to: 900 * p }); break;
      case 'select': this.tone(660 * p, 0.08, { type: 'triangle', gain: 0.07 }); this.tone(990 * p, 0.1, { type: 'sine', gain: 0.05, delay: 0.03 }); break;
      case 'open': this.tone(520 * p, 0.09, { type: 'triangle', gain: 0.07 }); this.tone(780 * p, 0.12, { type: 'triangle', gain: 0.06, delay: 0.045 }); break;
      case 'close': this.tone(700 * p, 0.08, { type: 'triangle', gain: 0.05 }); this.tone(470 * p, 0.1, { type: 'triangle', gain: 0.05, delay: 0.04 }); break;
      case 'harvest':
        this.hiss(0.16, { freq: 2600, q: 0.8, gain: 0.12 });
        this.hiss(0.1, { freq: 4200, q: 2, gain: 0.05, delay: 0.04 });
        this.tone(320 * p, 0.14, { type: 'triangle', gain: 0.1, to: 260 * p });
        break;
      case 'fiber': this.hiss(0.2, { freq: 3400, q: 1.5, gain: 0.1, sweep: 1800 }); this.tone(500 * p, 0.08, { type: 'triangle', gain: 0.05 }); break;
      case 'place':
        this.tone(160 * p, 0.2, { type: 'sine', gain: 0.32, to: 70 });
        this.hiss(0.06, { freq: 900, q: 0.7, gain: 0.14 });
        this.tone(1200 * p, 0.05, { type: 'square', gain: 0.02, delay: 0.01 });
        break;
      case 'remove': this.hiss(0.25, { freq: 600, q: 0.8, gain: 0.12, sweep: 2400 }); this.tone(300 * p, 0.15, { type: 'triangle', gain: 0.06, to: 200 }); break;
      case 'expand':
        this.hiss(0.35, { freq: 260, q: 0.6, type: 'lowpass', gain: 0.3 });
        this.tone(110 * p, 0.3, { gain: 0.25, to: 60 });
        this.tone(660 * p, 0.6, { gain: 0.06, delay: 0.12, verb: 0.6 });
        this.tone(990 * p, 0.7, { gain: 0.045, delay: 0.18, verb: 0.6 });
        break;
      case 'craft':
        this.tone(1320 * p, 0.25, { gain: 0.07, verb: 0.3 });
        this.tone(1980 * p, 0.18, { gain: 0.04, detune: 8 });
        this.hiss(0.04, { freq: 5000, q: 3, gain: 0.05 });
        break;
      case 'sift': this.hiss(0.1, { freq: 3800, q: 1.2, gain: 0.08, type: 'highpass' }); this.hiss(0.08, { freq: 3000, q: 1.2, gain: 0.05, type: 'highpass', delay: 0.07 }); break;
      case 'collect': this.tone(520 * p, 0.09, { type: 'triangle', gain: 0.08 }); this.tone(780 * p, 0.14, { type: 'triangle', gain: 0.07, delay: 0.06 }); break;
      case 'load': this.hiss(0.12, { freq: 900, q: 0.7, gain: 0.1 }); this.tone(240 * p, 0.12, { type: 'triangle', gain: 0.07, to: 300 }); break;
      case 'error': this.tone(196, 0.14, { type: 'triangle', gain: 0.07 }); this.tone(185, 0.18, { type: 'triangle', gain: 0.06, delay: 0.05 }); break;
      case 'discover': {
        const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
        notes.forEach((f, i) => {
          this.tone(f, 1.6, { type: 'triangle', gain: 0.06, attack: 0.01, delay: i * 0.09, verb: 0.8 });
          this.tone(f * 2, 1.0, { type: 'sine', gain: 0.02, delay: i * 0.09 + 0.01, verb: 0.6 });
        });
        break;
      }
      case 'dock':
        this.tone(55, 1.2, { gain: 0.4, to: 40 });
        this.hiss(1.0, { freq: 200, type: 'lowpass', gain: 0.25 });
        [784, 988, 1175].forEach((f, i) => this.tone(f, 1.8, { gain: 0.04, delay: 0.3 + i * 0.12, verb: 1 }));
        break;
      case 'chip':
        // two ceramic chips clacking
        this.tone(2400 * p, 0.03, { type: 'square', gain: 0.025 }); this.hiss(0.03, { freq: 5200, q: 4, gain: 0.08 });
        this.tone(2900 * p, 0.03, { type: 'square', gain: 0.02, delay: 0.035 }); this.hiss(0.03, { freq: 6000, q: 4, gain: 0.06, delay: 0.035 });
        break;
      case 'card': this.hiss(0.07, { freq: 3200, q: 0.7, gain: 0.12, sweep: 1600 }); this.tone(900 * p, 0.03, { type: 'triangle', gain: 0.02, delay: 0.04 }); break;
      case 'flip': this.hiss(0.05, { freq: 4200, q: 0.9, gain: 0.1, sweep: 2400 }); break;
      case 'tick': this.tone(1800 * p, 0.02, { type: 'square', gain: 0.02 }); this.hiss(0.02, { freq: 4000, q: 3, gain: 0.04 }); break;
      case 'peg': this.tone(1300 * p, 0.05, { type: 'triangle', gain: 0.035 }); break;
      case 'reel': this.tone(180 * p, 0.08, { type: 'square', gain: 0.03, to: 120 }); this.hiss(0.05, { freq: 900, gain: 0.08 }); break;
      case 'dice': for (let i = 0; i < 4; i++) { this.hiss(0.03, { freq: 2600 + i * 300, q: 2, gain: 0.08, delay: i * 0.06 + Math.random() * 0.02 }); this.tone(700 + i * 90, 0.025, { type: 'square', gain: 0.012, delay: i * 0.06 }); } break;
      case 'coin': this.tone(1567 * p, 0.12, { type: 'square', gain: 0.025 }); this.tone(2093 * p, 0.25, { type: 'square', gain: 0.02, delay: 0.07 }); break;
      case 'cash':
        this.hiss(0.08, { freq: 2600, q: 1.5, gain: 0.08 });
        this.tone(2637, 0.4, { type: 'triangle', gain: 0.05, delay: 0.06, verb: 0.4 }); this.tone(3136, 0.5, { type: 'triangle', gain: 0.04, delay: 0.1, verb: 0.4 });
        break;
      case 'bell': this.tone(1318 * p, 0.9, { type: 'triangle', gain: 0.05, verb: 0.8 }); this.tone(2637 * p, 0.5, { type: 'sine', gain: 0.02, verb: 0.6 }); break;
      case 'whoosh': this.hiss(0.6, { freq: 400, q: 0.6, gain: 0.12, sweep: 2400, attack: 0.2 }); break;
      case 'pop': this.hiss(0.35, { freq: 1200, q: 0.4, gain: 0.3, sweep: 200 }); this.tone(120, 0.3, { gain: 0.2, to: 50 }); break;
      case 'lose': this.tone(330 * p, 0.18, { type: 'triangle', gain: 0.05, to: 290 * p }); this.tone(247 * p, 0.3, { type: 'triangle', gain: 0.045, delay: 0.14, to: 220 * p }); break;
      case 'win': [659.3, 784, 1046.5].forEach((f, i) => this.tone(f * p, 0.35, { type: 'triangle', gain: 0.06, delay: i * 0.07, verb: 0.5 })); break;
      case 'bigwin': {
        const run = [523.3, 659.3, 784, 1046.5, 1318.5, 1568, 2093];
        run.forEach((f, i) => { this.tone(f, 0.5, { type: 'square', gain: 0.025, delay: i * 0.06 }); this.tone(f, 1.2, { type: 'triangle', gain: 0.04, delay: i * 0.06, verb: 0.8 }); });
        for (let i = 0; i < 10; i++) this.tone(1568 + Math.random() * 1500, 0.12, { type: 'square', gain: 0.012, delay: 0.5 + i * 0.07 });
        break;
      }
      case 'jackpot': {
        const fan = [392, 523.3, 659.3, 784, 1046.5];
        for (let r = 0; r < 3; r++) fan.forEach((f, i) => this.tone(f * (1 + r * 0.5), 0.6, { type: r === 2 ? 'triangle' : 'square', gain: 0.03, delay: r * 0.45 + i * 0.07, verb: 0.9 }));
        for (let i = 0; i < 24; i++) this.tone(1800 + Math.random() * 2400, 0.08, { type: 'square', gain: 0.01, delay: 1.2 + i * 0.06 });
        break;
      }
      case 'forge':
        [130.8, 196, 261.6, 329.6, 392, 523.25].forEach((f, i) => this.tone(f, 3, { type: i < 2 ? 'sine' : 'triangle', gain: 0.07, attack: 0.08, delay: i * 0.05, verb: 1 }));
        break;
    }
  }

  /**
   * A machine finished a cycle. `near` in [0,1]: 1 = centre of view and close.
   * Budgeted to a few per second regardless of factory size.
   */
  machine(voice: MachineVoice, near: number): void {
    if (!this.ctx || near < 0.05 || this.machineBudget <= 0) return;
    this.machineBudget -= 1;
    const g = 0.09 * near;
    const p = 0.9 + Math.random() * 0.2;
    switch (voice) {
      case 'wood': this.tone(420 * p, 0.06, { type: 'triangle', gain: g, bus: this.mach }); this.hiss(0.04, { freq: 1200, gain: g * 0.6, bus: this.mach }); break;
      case 'mech': this.tone(640 * p, 0.07, { type: 'square', gain: g * 0.25, bus: this.mach }); this.hiss(0.05, { freq: 2400, q: 3, gain: g * 0.6, bus: this.mach }); break;
      case 'fire': this.hiss(0.18, { freq: 700, q: 0.5, gain: g * 0.9, bus: this.mach }); break;
      case 'aether': this.tone(1760 * p, 0.5, { gain: g * 0.45, bus: this.mach, verb: 0.5 }); this.tone(2637 * p, 0.35, { gain: g * 0.2, bus: this.mach, delay: 0.03 }); break;
      case 'press': this.tone(90 * p, 0.14, { gain: g * 1.6, to: 60, bus: this.mach }); this.hiss(0.05, { freq: 600, gain: g * 0.5, bus: this.mach }); break;
      case 'leaf': this.hiss(0.12, { freq: 2800, q: 0.8, gain: g * 0.7, bus: this.mach }); break;
    }
  }

  private startAmbience(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = 0.0;
    src.connect(filter).connect(gain).connect(this.amb);
    src.start();
    this.wind = { src, filter, gain };
    const bsrc = ctx.createBufferSource();
    bsrc.buffer = this.noise;
    bsrc.loop = true;
    bsrc.playbackRate.value = 0.5;
    const bf = ctx.createBiquadFilter();
    bf.type = 'lowpass';
    bf.frequency.value = 220;
    const bg = ctx.createGain();
    bg.gain.value = 0;
    bsrc.connect(bf).connect(bg).connect(this.mach);
    bsrc.start();
    this.belt = { gain: bg };
  }

  /** Per-frame: ambience modulation, generative music and machine budget. */
  update(dt: number, wind: number, beltLevel: number, observe: boolean): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.t += dt;
    this.machineBudget = Math.min(4, this.machineBudget + dt * 5);
    const now = this.ctx.currentTime;
    if (this.wind) {
      const w = 0.035 + 0.03 * wind + 0.015 * Math.sin(this.t * 0.31);
      this.wind.gain.gain.setTargetAtTime(w * (1 - this.night * 0.35), now, 0.5);
      this.wind.filter.frequency.setTargetAtTime(320 + 260 * wind + 120 * Math.sin(this.t * 0.17), now, 0.8);
    }
    if (this.belt) this.belt.gain.gain.setTargetAtTime(Math.min(1, beltLevel) * 0.06, now, 0.3);
    // generative music: sparse pentatonic phrases, softer at night
    this.nextMusic -= dt;
    if (this.nextMusic <= 0) {
      this.nextMusic = (observe ? 5 : 8) + Math.random() * 10;
      const scale = this.night > 0.5 ? [220, 246.9, 293.7, 329.6, 392, 440] : [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3];
      const n = 2 + Math.floor(Math.random() * 3);
      let tt = 0;
      for (let i = 0; i < n; i++) {
        const f = scale[Math.floor(Math.random() * scale.length)];
        this.tone(f, 2.4, { type: 'triangle', gain: 0.022, attack: 0.04, delay: tt, bus: this.amb, verb: 1.2 });
        this.tone(f / 2, 3, { type: 'sine', gain: 0.018, attack: 0.3, delay: tt, bus: this.amb, verb: 0.8 });
        tt += 0.35 + Math.random() * 0.6;
      }
    }
    // critters: birds by day, crickets by night
    this.nextCritter -= dt;
    if (this.nextCritter <= 0) {
      this.nextCritter = 6 + Math.random() * 14;
      if (this.night > 0.5) {
        for (let i = 0; i < 6; i++) this.tone(4200 + Math.random() * 300, 0.04, { gain: 0.006, delay: i * 0.07, bus: this.amb });
      } else {
        const base = 2200 + Math.random() * 1200;
        for (let i = 0; i < 3; i++) this.tone(base * (1 + i * 0.12), 0.09, { gain: 0.012, to: base * (1.25 + i * 0.1), delay: i * 0.11, bus: this.amb, verb: 0.4 });
      }
    }
  }
}

export const audio = new Audio();

export function haptic(ms: number | number[], enabled: boolean): void {
  if (!enabled) return;
  try { navigator.vibrate?.(ms); } catch { /* unsupported */ }
}
