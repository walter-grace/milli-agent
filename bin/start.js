#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { execSync, spawn } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// Ensure common binary paths are in PATH
const extraPaths = [
  resolve(homedir(), '.cargo/bin'),
  '/opt/homebrew/bin',
  '/usr/local/bin',
];
const currentPath = process.env.PATH || '';
const fullPath = [...extraPaths, currentPath].join(':');

// Check for ripgrep
try { execSync('rg --version', { stdio: 'ignore', env: { ...process.env, PATH: fullPath } }); }
catch {
  console.error('ripgrep (rg) is required.');
  console.error('Install: brew install ripgrep / cargo install ripgrep / apt install ripgrep');
  process.exit(1);
}

const port = process.env.PORT || 3000;
console.log(`
  ███╗   ███╗██╗██╗     ██╗     ██╗
  ████╗ ████║██║██║     ██║     ██║
  ██╔████╔██║██║██║     ██║     ██║
  ██║╚██╔╝██║██║██║     ██║     ██║
  ██║ ╚═╝ ██║██║███████╗███████╗██║
  ╚═╝     ╚═╝╚═╝╚══════╝╚══════╝╚═╝  agent

  Starting on http://localhost:${port}
`);

// Start server
const server = spawn('node', [resolve(root, 'src/server.js')], {
  stdio: 'inherit',
  env: { ...process.env, MILLI_ROOT: root, PATH: fullPath },
});
server.on('close', (code) => process.exit(code));
