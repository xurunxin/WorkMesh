#!/usr/bin/env node
/**
 * Bundle the Figma plugin into a single dist/code.js.
 *
 * Figma's plugin loader consumes exactly one `main` file, and the plugin
 * sandbox has no module system — no `require`, no `import`, no filesystem.
 * So the sources are concatenated in numeric filename order (which IS the
 * dependency order: tokens → engine → variables → …) and emitted as one file.
 *
 * Concatenation is safe here because every module is an IIFE assigning one
 * global, and later modules reference earlier ones only at call time.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`missing source directory: ${SRC}`);
    process.exit(1);
  }

  /* Numeric prefix guarantees the load order the modules depend on. */
  const files = fs.readdirSync(SRC)
    .filter((f) => f.endsWith('.js'))
    .sort();

  if (!files.length) {
    console.error('no source files found');
    process.exit(1);
  }

  const parts = [];
  const seen = new Map();

  parts.push(`/**
 * WorkMesh Design System Builder — GENERATED FILE, DO NOT EDIT.
 * Built from design/figma-plugin/src/*.js by build.mjs.
 * Built at: ${new Date().toISOString()}
 * Sources:  ${files.join(', ')}
 */
`);

  for (const file of files) {
    const full = path.join(SRC, file);
    const body = fs.readFileSync(full, 'utf8');

    /* Guard against duplicate global definitions, which would silently
       shadow a module rather than erroring. */
    const m = body.match(/^const\s+([A-Z_][A-Z0-9_]*)\s*=/m);
    if (m) {
      const name = m[1];
      if (seen.has(name)) {
        console.error(
          `duplicate top-level global "${name}" in ${file} (already defined in ${seen.get(name)})`,
        );
        process.exit(1);
      }
      seen.set(name, file);
    }

    parts.push(`\n/* ===== ${file} ===== */\n${body}`);
  }

  fs.mkdirSync(DIST, { recursive: true });

  const out = parts.join('\n');
  const target = path.join(DIST, 'code.js');
  fs.writeFileSync(target, out, 'utf8');

  const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1);
  console.log(`built ${path.relative(ROOT, target)}  ${kb} kB  from ${files.length} sources`);
  console.log(`globals: ${[...seen.keys()].join(', ')}`);
}

main();
