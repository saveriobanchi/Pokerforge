import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Generates dist/sw.js after the bundle is written. The worker precaches every
 * emitted file (the whole game is ~1–2 MB) so the PWA starts fully offline.
 * The cache name is derived from a hash of all file contents, so each deploy
 * atomically replaces the previous cache.
 */
export function swManifestPlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'pokerforge-sw-manifest',
    apply: 'build',
    configResolved(cfg) {
      outDir = cfg.build.outDir;
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const p = join(dir, name);
          if (statSync(p).isDirectory()) walk(p);
          else files.push(p);
        }
      };
      walk(outDir);
      const hash = createHash('sha256');
      const urls: string[] = [];
      for (const f of files.sort()) {
        const rel = relative(outDir, f).split('\\').join('/');
        if (rel === 'sw.js' || rel.endsWith('.map')) continue;
        hash.update(rel);
        hash.update(readFileSync(f));
        urls.push(rel === 'index.html' ? './' : './' + rel);
      }
      const version = hash.digest('hex').slice(0, 12);
      const template = readFileSync(join(process.cwd(), 'build', 'sw-template.js'), 'utf8');
      const out = template
        .replace('__CACHE_VERSION__', version)
        .replace('__PRECACHE_URLS__', JSON.stringify(urls));
      writeFileSync(join(outDir, 'sw.js'), out);
    },
  };
}
