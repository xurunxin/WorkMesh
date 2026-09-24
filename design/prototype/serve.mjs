#!/usr/bin/env node
/**
 * Tiny static server for the WorkMesh design prototype.
 *
 * - Serves this directory at http://127.0.0.1:4174
 * - `Cache-Control: no-store` so edits show up on refresh (no stale CSS/JS
 *   masquerading as a bug).
 *
 * Run detached so it outlives the terminal:
 *   node serve.mjs                      (foreground)
 *   Start-Process node serve.mjs -WindowStyle Hidden   (PowerShell, detached)
 *
 * Stop:  Stop-Process -Name node   (careful: kills all node processes)
 *   or find the PID:  Get-NetTCPConnection -LocalPort 4174 | Select OwningProcess
 */

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4174;

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/' || urlPath.endsWith('/')) urlPath += 'index.html';

  const file = path.join(ROOT, urlPath);
  /* Stay inside the served directory. */
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('forbidden');
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('not found');
    }
    const type = MIME[path.extname(file).toLowerCase()] || 'text/plain';
    res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => console.log(`prototype ready → http://127.0.0.1:${PORT}`));
