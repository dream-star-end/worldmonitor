#!/usr/bin/env node
/**
 * Pre-bundle the consolidated Edge Function catch-all so Vercel can deploy it
 * without extensionless ESM import failures in the V8-worker edge runtime.
 *
 * Strategy: bundle api/[...path].ts into a self-contained file, then overwrite
 * the original .ts. Bundled JS is valid TypeScript (with @ts-nocheck).
 */
import { build } from 'esbuild';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..');

async function bundleInPlace(entryPath) {
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
  if (!code.includes("runtime")) {
    code = `export const config = { runtime: 'edge' };\n${code}`;
  }

  await writeFile(entryPath, code);
  const { unlink } = await import('node:fs/promises');
  try { await unlink(tmpOut); } catch {}
}

async function main() {
  console.log(`ROOT: ${ROOT}`);
  const catchAll = join(ROOT, 'api', '[...path].ts');
  try {
    await stat(catchAll);
  } catch {
    console.error(`Entry point not found: ${catchAll}`);
    process.exitCode = 1;
    return;
  }

  console.log('Bundling consolidated Edge Function (api/[...path].ts)...');
  try {
    await bundleInPlace(catchAll);
    const code = await readFile(catchAll, 'utf8');
    const lines = code.split('\n').length;
    console.log(`  ✓ api/[...path].ts (${lines} lines)`);
  } catch (err) {
    console.error(`  ✗ api/[...path].ts: ${err.message}`);
    process.exitCode = 1;
  }
  console.log('Done.');
}

main();
