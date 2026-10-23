/**
 * Smooth camera. Position is in world-screen pixels (art pixels), zoom is
 * CSS pixels per art pixel. Pans carry inertia; zoom eases toward a target
 * around a focal point so pinches feel anchored under the fingers.
 */
export class Camera {
  x = 0;
  y = 0;
  zoom = 3;
  tx = 0;
  ty = 0;
  tzoom = 3;
  vx = 0;
  vy = 0;
  minZoom = 0.3;
  maxZoom = 7;
  bounds = { x0: -400, y0: -300, x1: 400, y1: 400 };
  private follow: { x: number; y: number; t: number } | null = null;

  setBounds(x0: number, y0: number, x1: number, y1: number): void {
    const pad = 160;
    this.bounds = { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
  }

  jump(x: number, y: number, zoom?: number): void {
    this.x = this.tx = x;
    this.y = this.ty = y;
    if (zoom) this.zoom = this.tzoom = zoom;
    this.vx = this.vy = 0;
  }

  /** Pan by screen-pixel delta (finger movement). */
  panBy(dxScreen: number, dyScreen: number): void {
    this.follow = null;
    this.tx -= dxScreen / this.zoom;
    this.ty -= dyScreen / this.zoom;
    this.x = this.tx;
    this.y = this.ty;
  }

  fling(vxScreen: number, vyScreen: number): void {
    this.vx = -vxScreen / this.zoom;
    this.vy = -vyScreen / this.zoom;
  }

  stop(): void {
    this.vx = this.vy = 0;
  }

  /** Zoom by factor keeping the world point under (sx, sy) fixed. */
  zoomAt(factor: number, sx: number, sy: number, vw: number, vh: number, immediate = true): void {
    const nz = Math.max(this.minZoom, Math.min(this.maxZoom, this.tzoom * factor));
    const wx = this.tx + (sx - vw / 2) / this.tzoom;
    const wy = this.ty + (sy - vh / 2) / this.tzoom;
    this.tzoom = nz;
    this.tx = wx - (sx - vw / 2) / nz;
    this.ty = wy - (sy - vh / 2) / nz;
    if (immediate) { this.zoom = this.tzoom; this.x = this.tx; this.y = this.ty; }
  }

  /** Ease to look at a world point. */
  focus(x: number, y: number, zoom?: number, seconds = 0.6): void {
    this.follow = { x, y, t: seconds };
    if (zoom) this.tzoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
    this.vx = this.vy = 0;
  }

  update(dt: number): void {
    if (this.follow) {
      this.tx = this.follow.x;
      this.ty = this.follow.y;
      this.follow.t -= dt;
      if (this.follow.t <= 0) this.follow = null;
    }
    // inertia
    if (Math.abs(this.vx) + Math.abs(this.vy) > 0.5) {
      this.tx += this.vx * dt;
      this.ty += this.vy * dt;
      const k = Math.pow(0.02, dt);
      this.vx *= k;
      this.vy *= k;
    } else this.vx = this.vy = 0;
    // soft bounds
    const b = this.bounds;
    if (this.tx < b.x0) this.tx += (b.x0 - this.tx) * Math.min(1, dt * 6);
    if (this.tx > b.x1) this.tx += (b.x1 - this.tx) * Math.min(1, dt * 6);
    if (this.ty < b.y0) this.ty += (b.y0 - this.ty) * Math.min(1, dt * 6);
    if (this.ty > b.y1) this.ty += (b.y1 - this.ty) * Math.min(1, dt * 6);
    const e = 1 - Math.pow(0.0005, dt);
    this.x += (this.tx - this.x) * e;
    this.y += (this.ty - this.y) * e;
    this.zoom += (this.tzoom - this.zoom) * (1 - Math.pow(0.0002, dt));
    if (Math.abs(this.zoom - this.tzoom) < 0.0005) this.zoom = this.tzoom;
  }
}
