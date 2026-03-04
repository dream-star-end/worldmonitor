#!/usr/bin/env node
/**
 * Trim api/ directory to ≤12 serverless functions for Vercel Hobby plan.
 * Runs AFTER build so source imports are already resolved in bundles.
 * Non-essential endpoints are renamed with _ prefix (become shared modules).
 */
import { renameSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API = resolve(ROOT, 'api');

const DEMOTE = [
  'bootstrap.js',
  'cache-purge.js',
  'download.js',
  'fwdstart.js',
  'register-interest.js',
  'story.js',
];

const REMOVE_DIRS = ['youtube', 'data'];

for (const file of DEMOTE) {
  try {
    renameSync(resolve(API, file), resolve(API, `_${file}`));
    console.log(`  ↓ api/${file} → api/_${file}`);
  } catch {}
}

for (const dir of REMOVE_DIRS) {
  try {
    rmSync(resolve(API, dir), { recursive: true, force: true });
    console.log(`  ✗ api/${dir}/ removed`);
  } catch {}
}

console.log('Serverless function trim complete.');
