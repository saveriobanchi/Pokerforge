type Child = Node | string | number | null | undefined | false;

export interface Props {
  class?: string;
  text?: string;
  html?: string;
  style?: string;
  title?: string;
  src?: string;
  alt?: string;
  onclick?: (e: MouseEvent) => void;
  [attr: string]: unknown;
}

/** Tiny hyperscript helper. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const k in props) {
    const v = props[k];
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else if (k.startsWith('on') && typeof v === 'function') on(el, k.slice(2), v as (e: Event) => void);
    else el.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'number' ? String(c) : c);
  }
  return el;
}

type Handlers = Record<string, (e: Event) => void>;
const HANDLERS = '__af_on';

/** Attach a handler through an indirection so morph() can swap it later. */
function on(el: HTMLElement, type: string, fn: (e: Event) => void): void {
  const host = el as unknown as Record<string, Handlers>;
  if (!host[HANDLERS]) host[HANDLERS] = {};
  if (!host[HANDLERS][type]) el.addEventListener(type, (e) => host[HANDLERS][type]?.(e));
  host[HANDLERS][type] = fn;
}

/**
 * Patch `old` in place to match `next` (same tags keep their DOM nodes), so
 * live panels can refresh without losing taps, focus or scroll position.
 */
export function morph(old: Node, next: Node): Node {
  if (old.nodeType !== next.nodeType || (old instanceof Element && next instanceof Element && old.tagName !== next.tagName)) {
    old.parentNode?.replaceChild(next, old);
    return next;
  }
  if (old.nodeType === Node.TEXT_NODE) {
    if (old.nodeValue !== next.nodeValue) old.nodeValue = next.nodeValue;
    return old;
  }
  if (!(old instanceof HTMLElement) || !(next instanceof HTMLElement)) return old;
  for (const a of [...old.attributes]) if (!next.hasAttribute(a.name)) old.removeAttribute(a.name);
  for (const a of [...next.attributes]) if (old.getAttribute(a.name) !== a.value) old.setAttribute(a.name, a.value);
  if (old instanceof HTMLInputElement && next instanceof HTMLInputElement && old.value !== next.value && document.activeElement !== old) old.value = next.value;
  const nh = (next as unknown as Record<string, Handlers>)[HANDLERS] ?? {};
  const oh = (old as unknown as Record<string, Handlers>)[HANDLERS];
  if (oh) for (const t in oh) if (!nh[t]) delete oh[t];
  for (const t in nh) on(old, t, nh[t]);
  const oc = [...old.childNodes], nc = [...next.childNodes];
  for (let i = 0; i < nc.length; i++) {
    if (i < oc.length) morph(oc[i], nc[i]);
    else old.appendChild(nc[i]);
  }
  for (let i = nc.length; i < oc.length; i++) old.removeChild(oc[i]);
  return old;
}

/** Replace a container's single child with `next`, morphing when possible. */
export function setOnly(container: HTMLElement, next: HTMLElement): void {
  const cur = container.firstElementChild;
  if (cur && container.childElementCount === 1) morph(cur, next);
  else { clear(container); container.append(next); }
}

export function img(src: string, cls = 'px', alt = ''): HTMLImageElement {
  return h('img', { class: cls, src, alt, draggable: 'false' });
}

export function fmt(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'm';
  if (n >= 1e4) return Math.floor(n / 1000) + 'k';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(Math.floor(n));
}

export function duration(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${Math.floor(sec)}s`;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}
