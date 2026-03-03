#!/usr/bin/env node
/**
 * Pre-bundle the consolidated gateway so Vercel can deploy it without
 * extensionless ESM import failures. Bundles api/gateway.ts in-place.
 */
import { build } from 'esbuild';
import { readFile, writeFile, stat, unlink } from 'node:fs/promises';
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
    platform: 'node',
    target: 'node22',
    outfile: tmpOut,
    external: ['http'],
    mainFields: ['module', 'main'],
    conditions: ['node', 'import', 'default'],
    banner: {
      js: '// @ts-nocheck\n// @bundled — do not edit; regenerate with scripts/bundle-edge-functions.mjs',
    },
    minify: true,
    treeShaking: true,
    sourcemap: false,
  });

  const code = await readFile(tmpOut, 'utf8');
  await writeFile(entryPath, code);
  try { await unlink(tmpOut); } catch {}
}

async function main() {
  console.log(`ROOT: ${ROOT}`);
  const gateway = join(ROOT, 'api', 'gateway.ts');
  try {
    await stat(gateway);
  } catch {
    console.error(`Entry point not found: ${gateway}`);
    process.exitCode = 1;
    return;
  }

  console.log('Bundling gateway (api/gateway.ts)...');
  try {
    await bundleInPlace(gateway);
    const code = await readFile(gateway, 'utf8');
    const lines = code.split('\n').length;
    console.log(`  ✓ api/gateway.ts (${lines} lines)`);
  } catch (err) {
    console.error(`  ✗ api/gateway.ts: ${err.message}`);
    process.exitCode = 1;
  }
  console.log('Done.');
}

main();
