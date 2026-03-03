#!/usr/bin/env node
/**
 * Pre-bundle Edge Function entry points so Vercel can deploy them
 * without relying on its TypeScript compiler (which emits extensionless
 * ESM imports that fail in the V8-worker edge runtime).
 *
 * Strategy: bundle each api/<domain>/v1/[rpc].ts into a self-contained
 * file, then OVERWRITE the original .ts with the bundled output.
 * Bundled JS is valid TypeScript, so Vercel's tsc pass will emit it
 * unchanged with no external import resolution needed.
 */
import { build } from 'esbuild';
import { readdir, stat, readFile, writeFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..');

async function findEntryPoints() {
  const entries = [];
  const apiDir = join(ROOT, 'api');
  for (const domain of await readdir(apiDir)) {
    const v1Dir = join(apiDir, domain, 'v1');
    try {
      const s = await stat(v1Dir);
      if (!s.isDirectory()) continue;
    } catch { continue; }
    const rpcTs = join(v1Dir, '[rpc].ts');
    try {
      await stat(rpcTs);
      entries.push(rpcTs);
    } catch { /* no [rpc].ts */ }
  }
  return entries;
}

async function bundleOne(entryPath) {
  const dir = dirname(entryPath);
  const tmpOut = join(dir, '__bundled_tmp.js');

  await build({
    entryPoints: [entryPath],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2020',
    outfile: tmpOut,
    external: [],
    mainFields: ['module', 'main'],
    conditions: ['edge-light', 'worker', 'browser', 'import', 'default'],
    banner: {
      js: '// @bundled — do not edit; regenerate with scripts/bundle-edge-functions.mjs\n// @ts-nocheck',
    },
    minify: false,
    treeShaking: true,
    sourcemap: false,
    alias: {
      stream: join(ROOT, 'scripts', '_shim-stream.mjs'),
    },
  });

  let code = await readFile(tmpOut, 'utf8');

  // Ensure edge runtime config is present
  if (!code.includes("runtime")) {
    code = `export const config = { runtime: 'edge' };\n${code}`;
  }

  // Overwrite the original .ts with the bundled (self-contained) output
  await writeFile(entryPath, code);
  // Clean up temp file
  try { const { unlink } = await import('node:fs/promises'); await unlink(tmpOut); } catch {}
}

// Also handle api/data/city-coords.ts if it uses edge runtime
async function findExtraEntries() {
  const extra = join(ROOT, 'api', 'data', 'city-coords.ts');
  try {
    const content = await readFile(extra, 'utf8');
    if (content.includes("runtime: 'edge'") || content.includes('runtime: "edge"')) {
      return [extra];
    }
  } catch { /* doesn't exist */ }
  return [];
}

async function main() {
  console.log(`ROOT: ${ROOT}`);
  const entries = [...await findEntryPoints(), ...await findExtraEntries()];
  console.log(`Bundling ${entries.length} Edge Functions (in-place)...`);
  for (const entry of entries) {
    const rel = entry.replace(ROOT + '/', '');
    try {
      await bundleOne(entry);
      console.log(`  ✓ ${rel}`);
    } catch (err) {
      console.error(`  ✗ ${rel}: ${err.message}`);
      process.exitCode = 1;
    }
  }
  console.log('Done.');
}

main();
