#!/usr/bin/env node
/**
 * Pre-bundle Edge Function entry points so Vercel can deploy them
 * without relying on its TypeScript compiler (which emits extensionless
 * ESM imports that fail in the V8-worker edge runtime).
 *
 * For each api/<domain>/v1/[rpc].ts:
 *   1. Bundle with esbuild into a single self-contained .js file
 *   2. Rename the original .ts to .ts.src (Vercel ignores it)
 *   3. Write the bundled .js as [rpc].js (Vercel picks it up)
 */
import { build } from 'esbuild';
import { readdir, rename, stat, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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
  const outFile = join(dir, '[rpc].js');

  await build({
    entryPoints: [entryPath],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2020',
    outfile: outFile,
    external: [],
    mainFields: ['module', 'main'],
    conditions: ['edge-light', 'worker', 'browser', 'import', 'default'],
    banner: {
      js: '// @bundled — do not edit; regenerate with scripts/bundle-edge-functions.mjs',
    },
    minify: false,
    treeShaking: true,
    sourcemap: false,
    alias: {
      stream: join(ROOT, 'scripts', '_shim-stream.mjs'),
    },
  });

  // Ensure the bundled file keeps `export const config = { runtime: 'edge' };`
  let code = await readFile(outFile, 'utf8');
  if (!code.includes("runtime")) {
    code = `export const config = { runtime: 'edge' };\n${code}`;
    await writeFile(outFile, code);
  }

  // Rename original .ts so Vercel won't also try to compile it
  const srcBackup = entryPath + '.src';
  try { await stat(srcBackup); } catch {
    await rename(entryPath, srcBackup);
  }

  return outFile;
}

// Also handle api/data/city-coords.ts if it exists and uses edge
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
  const entries = [...await findEntryPoints(), ...await findExtraEntries()];
  console.log(`Bundling ${entries.length} Edge Functions...`);
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
