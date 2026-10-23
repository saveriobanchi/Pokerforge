/**
 * Page-level touch guard. The game owns every gesture except real scrolling
 * inside a panel: a finger drag may move a list only while that list can
 * still move that way. At its end, or on anything that doesn't scroll, the
 * drag is cancelled — so the page never rubber-bands and menus never slide
 * along with your finger (iOS ignores `overscroll-behavior` in places).
 */

type Axis = 'x' | 'y';

function scrollsOn(el: HTMLElement, axis: Axis): boolean {
  const cs = getComputedStyle(el);
  const o = axis === 'x' ? cs.overflowX : cs.overflowY;
  if (o !== 'auto' && o !== 'scroll') return false;
  return axis === 'x' ? el.scrollWidth > el.clientWidth + 1 : el.scrollHeight > el.clientHeight + 1;
}

/** The nearest element (from `start` up) that scrolls along `axis`. */
export function scrollerFor(start: Element | null, axis: Axis): HTMLElement | null {
  for (let el = start as HTMLElement | null; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    if (scrollsOn(el, axis)) return el;
  }
  return null;
}

/** Can `el` move its content for a finger moving by `d` px along `axis`? */
export function canScroll(el: HTMLElement, axis: Axis, d: number): boolean {
  if (axis === 'x') {
    const max = el.scrollWidth - el.clientWidth;
    return d < 0 ? el.scrollLeft < max - 1 : el.scrollLeft > 1;
  }
  const max = el.scrollHeight - el.clientHeight;
  return d < 0 ? el.scrollTop < max - 1 : el.scrollTop > 1;
}

export function installScrollGuard(doc: Document = document): void {
  let last: { x: number; y: number } | null = null;
  let axis: Axis | null = null;
  let owner: HTMLElement | null = null;
  doc.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    last = t ? { x: t.clientX, y: t.clientY } : null;
    axis = null;
    owner = null;
  }, { passive: true });
  doc.addEventListener('touchmove', (e) => {
    const stop = () => { if (e.cancelable) e.preventDefault(); };
    const target = e.target as HTMLElement | null;
    if (target?.closest?.('textarea, input')) return;
    const t = e.touches[0];
    if (e.touches.length > 1 || !t || !last) { stop(); return; }
    const dx = t.clientX - last.x, dy = t.clientY - last.y;
    if (!axis) {
      if (Math.abs(dx) + Math.abs(dy) < 2) return;
      axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      owner = scrollerFor(target, axis);
    }
    last = { x: t.clientX, y: t.clientY };
    const d = axis === 'x' ? dx : dy;
    if (!owner || (d !== 0 && !canScroll(owner, axis, d))) stop();
  }, { passive: false });
}
