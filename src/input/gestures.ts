/**
 * Touch-first gestures on the game canvas (mouse emulates one finger):
 *  - tap → select / act      - one-finger drag → pan (or paint in paint mode)
 *  - pinch → zoom + pan      - long press → secondary action
 *  - wheel → zoom (desktop)
 */
export interface GestureHandlers {
  tap(x: number, y: number): void;
  longPress(x: number, y: number): void;
  pan(dx: number, dy: number): void;
  panEnd(vx: number, vy: number): void;
  pinch(scale: number, cx: number, cy: number, dx: number, dy: number): void;
  wheel(factor: number, x: number, y: number): void;
  hover(x: number, y: number): void;
  /** Paint mode: return true to take over one-finger drags (e.g. laying conveyors). */
  paintActive(): boolean;
  paintStart(x: number, y: number): void;
  paintMove(x: number, y: number): void;
  paintEnd(x: number, y: number, cancelled: boolean): void;
  press(x: number, y: number): void;
  /** The last finger lifted (after any tap or long press it made). */
  release?(): void;
}

interface Ptr { id: number; x: number; y: number; sx: number; sy: number; t: number }

const TAP_DIST = 10;
const TAP_TIME = 380;
const LONG_TIME = 480;

export function attachGestures(el: HTMLElement, h: GestureHandlers): () => void {
  const ptrs = new Map<number, Ptr>();
  let mode: 'none' | 'maybe' | 'pan' | 'pinch' | 'paint' = 'none';
  let longTimer = 0;
  let lastPinchDist = 0;
  let lastMid = { x: 0, y: 0 };
  const vel = { x: 0, y: 0, t: 0 };
  let longFired = false;

  const rect = () => el.getBoundingClientRect();
  const local = (e: PointerEvent) => { const r = rect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  const clearLong = () => { if (longTimer) { clearTimeout(longTimer); longTimer = 0; } };

  const down = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    el.setPointerCapture?.(e.pointerId);
    const p = local(e);
    ptrs.set(e.pointerId, { id: e.pointerId, x: p.x, y: p.y, sx: p.x, sy: p.y, t: performance.now() });
    if (ptrs.size === 1) {
      mode = 'maybe';
      longFired = false;
      vel.x = vel.y = 0;
      vel.t = performance.now();
      h.press(p.x, p.y);
      clearLong();
      longTimer = window.setTimeout(() => {
        const q = ptrs.get(e.pointerId);
        if (q && mode === 'maybe' && Math.hypot(q.x - q.sx, q.y - q.sy) < TAP_DIST) {
          longFired = true;
          h.longPress(q.x, q.y);
        }
      }, LONG_TIME);
    } else if (ptrs.size === 2) {
      clearLong();
      if (mode === 'paint') {
        const q = [...ptrs.values()][0];
        h.paintEnd(q.x, q.y, true);
      }
      mode = 'pinch';
      const [a, b] = [...ptrs.values()];
      lastPinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      lastMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
    e.preventDefault();
  };

  const move = (e: PointerEvent) => {
    const p = local(e);
    const q = ptrs.get(e.pointerId);
    if (!q) {
      if (e.pointerType === 'mouse') h.hover(p.x, p.y);
      return;
    }
    const dx = p.x - q.x, dy = p.y - q.y;
    q.x = p.x;
    q.y = p.y;
    if (mode === 'maybe' && Math.hypot(q.x - q.sx, q.y - q.sy) > TAP_DIST) {
      clearLong();
      if (h.paintActive()) { mode = 'paint'; h.paintStart(q.sx, q.sy); }
      else mode = 'pan';
    }
    if (mode === 'pan') {
      h.pan(dx, dy);
      const now = performance.now();
      const dt = Math.max(1, now - vel.t);
      vel.x = vel.x * 0.6 + (dx / dt) * 1000 * 0.4;
      vel.y = vel.y * 0.6 + (dy / dt) * 1000 * 0.4;
      vel.t = now;
    } else if (mode === 'paint') {
      h.paintMove(p.x, p.y);
    } else if (mode === 'pinch' && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (lastPinchDist > 0) h.pinch(d / lastPinchDist, mid.x, mid.y, mid.x - lastMid.x, mid.y - lastMid.y);
      lastPinchDist = d;
      lastMid = mid;
    }
    if (e.pointerType === 'mouse') h.hover(p.x, p.y);
    e.preventDefault();
  };

  const up = (e: PointerEvent) => {
    const q = ptrs.get(e.pointerId);
    if (!q) return;
    ptrs.delete(e.pointerId);
    clearLong();
    const p = local(e);
    if (mode === 'maybe' && !longFired && performance.now() - q.t < TAP_TIME + 400 && e.type !== 'pointercancel') h.tap(p.x, p.y);
    else if (mode === 'pan') {
      const idle = performance.now() - vel.t > 80;
      h.panEnd(idle ? 0 : vel.x, idle ? 0 : vel.y);
    } else if (mode === 'paint') h.paintEnd(p.x, p.y, e.type === 'pointercancel');
    if (ptrs.size === 0) h.release?.();
    if (ptrs.size === 1 && mode === 'pinch') {
      // continue as a pan with the remaining finger, without a jump
      mode = 'pan';
      vel.x = vel.y = 0;
      vel.t = performance.now();
    } else if (ptrs.size === 0) mode = 'none';
  };

  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = { x: e.clientX - rect().left, y: e.clientY - rect().top };
    const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
    h.wheel(factor, p.x, p.y);
  };

  const leave = (e: PointerEvent) => { if (e.pointerType === 'mouse' && !ptrs.size) h.hover(-1, -1); };
  const ctx = (e: Event) => e.preventDefault();

  el.addEventListener('pointerdown', down, { passive: false });
  el.addEventListener('pointermove', move, { passive: false });
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', leave);
  el.addEventListener('wheel', wheel, { passive: false });
  el.addEventListener('contextmenu', ctx);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    el.removeEventListener('pointerleave', leave);
    el.removeEventListener('wheel', wheel);
    el.removeEventListener('contextmenu', ctx);
  };
}
