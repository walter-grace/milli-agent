#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { execSync, spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// Check for ripgrep
try { execSync('rg --version', { stdio: 'ignore' }); }
catch { console.error('ripgrep (rg) is required. Install: brew install ripgrep / cargo install ripgrep'); process.exit(1); }

// Start server
const server = spawn('node', [resolve(root, 'src/server.js')], {
  stdio: 'inherit',
  env: { ...process.env, MILLI_ROOT: root },
});
server.on('close', (code) => process.exit(code));
