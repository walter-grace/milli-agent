// Milli-Agent sandbox — macOS sandbox-exec wrapper.
// Runs untrusted code with:
//   - filesystem reads allowed, writes restricted to the work dir
//   - network denied
//   - configurable timeout (default 10s)
//   - memory cap not enforced (macOS sandbox-exec doesn't expose it)
//
// Supported languages: js, ts, py, sh, bash
//
// Usage:
//   const sbx = await runSandbox({ code: 'console.log(1)', language: 'js' });
//   sbx.stdout / sbx.stderr / sbx.exitCode / sbx.elapsedMs
//
// Or streaming:
//   const ctrl = runSandboxStream({ code, language, timeout }, {
//     onStdout(chunk), onStderr(chunk), onExit(code, elapsed), onError(err)
//   });
//   ctrl.kill() to abort.
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';

const SANDBOX_ROOT = join(tmpdir(), 'milli-sandbox');
if (!existsSync(SANDBOX_ROOT)) mkdirSync(SANDBOX_ROOT, { recursive: true });

// SBPL profile — macOS Seatbelt
// Allow:
//   - process spawn/exec (so interpreters can fork helpers)
//   - file reads anywhere (needed to find interpreters + libs)
//   - file writes ONLY under the work dir
//   - mach lookup / sysctl / signals (needed by any real runtime)
// Deny:
//   - network (all families)
function buildProfile(workDir) {
  return `(version 1)
(deny default)
(allow process-fork)
(allow process-exec)
(allow file-read*)
(allow file-write* (subpath "${workDir}"))
(allow file-write-data (literal "/dev/null"))
(allow file-write-data (literal "/dev/stdout"))
(allow file-write-data (literal "/dev/stderr"))
(allow sysctl-read)
(allow mach-lookup)
(allow signal)
(allow ipc-posix-shm)
(deny network*)`;
}

// Language → { filename, interpreter argv }
const LANGS = {
  js:     { file: 'main.js',  argv: (p) => ['node', p] },
  mjs:    { file: 'main.mjs', argv: (p) => ['node', p] },
  ts:     { file: 'main.ts',  argv: (p) => ['npx', '--yes', 'tsx', p] }, // needs tsx, network-denied so cached only
  py:     { file: 'main.py',  argv: (p) => ['python3', p] },
  python: { file: 'main.py',  argv: (p) => ['python3', p] },
  sh:     { file: 'main.sh',  argv: (p) => ['bash', p] },
  bash:   { file: 'main.sh',  argv: (p) => ['bash', p] },
};

function resolveLang(language) {
  if (!language) return null;
  const key = String(language).toLowerCase().trim();
  return LANGS[key] || null;
}

function prepareWorkdir(code, language) {
  const lang = resolveLang(language);
  if (!lang) throw new Error(`unsupported language: ${language}`);
  const id = randomUUID().slice(0, 8);
  const workDir = join(SANDBOX_ROOT, id);
  mkdirSync(workDir, { recursive: true });
  const codePath = join(workDir, lang.file);
  writeFileSync(codePath, code, 'utf8');
  return { workDir, codePath, lang, id };
}

// One-shot buffered run. Resolves with { stdout, stderr, exitCode, elapsedMs, timedOut }.
export async function runSandbox({ code, language, timeout = 10000 }) {
  const { workDir, codePath, lang, id } = prepareWorkdir(code, language);
  const profile = buildProfile(workDir);
  const profilePath = join(workDir, '_profile.sb');
  writeFileSync(profilePath, profile, 'utf8');

  const argv = lang.argv(codePath);
  const t0 = Date.now();
  return new Promise((resolve) => {
    const child = spawn('sandbox-exec', ['-f', profilePath, ...argv], {
      cwd: workDir,
      env: { PATH: '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    let timedOut = false;
    const killer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch {}
    }, timeout);
    child.stdout.on('data', d => stdout += d.toString());
    child.stderr.on('data', d => stderr += d.toString());
    child.on('close', (exitCode, signal) => {
      clearTimeout(killer);
      const elapsedMs = Date.now() - t0;
      // Clean up the workdir
      try { rmSync(workDir, { recursive: true, force: true }); } catch {}
      resolve({ id, stdout, stderr, exitCode, signal, elapsedMs, timedOut, workDir });
    });
    child.on('error', err => {
      clearTimeout(killer);
      try { rmSync(workDir, { recursive: true, force: true }); } catch {}
      resolve({ id, stdout, stderr: (stderr + '\nspawn error: ' + err.message), exitCode: -1, elapsedMs: Date.now() - t0, timedOut: false, workDir });
    });
  });
}

// Streaming variant — invokes callbacks as chunks arrive. Returns { kill }.
export function runSandboxStream({ code, language, timeout = 10000 }, cbs = {}) {
  const { workDir, codePath, lang, id } = prepareWorkdir(code, language);
  const profile = buildProfile(workDir);
  const profilePath = join(workDir, '_profile.sb');
  writeFileSync(profilePath, profile, 'utf8');

  const argv = lang.argv(codePath);
  const t0 = Date.now();
  const child = spawn('sandbox-exec', ['-f', profilePath, ...argv], {
    cwd: workDir,
    env: { PATH: '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let timedOut = false;
  const killer = setTimeout(() => {
    timedOut = true;
    try { child.kill('SIGKILL'); } catch {}
  }, timeout);

  child.stdout.on('data', d => cbs.onStdout && cbs.onStdout(d.toString()));
  child.stderr.on('data', d => cbs.onStderr && cbs.onStderr(d.toString()));
  child.on('close', (exitCode, signal) => {
    clearTimeout(killer);
    const elapsedMs = Date.now() - t0;
    try { rmSync(workDir, { recursive: true, force: true }); } catch {}
    cbs.onExit && cbs.onExit({ id, exitCode, signal, elapsedMs, timedOut });
  });
  child.on('error', err => {
    clearTimeout(killer);
    try { rmSync(workDir, { recursive: true, force: true }); } catch {}
    cbs.onError && cbs.onError(err);
  });

  return {
    id,
    kill: () => { try { child.kill('SIGKILL'); } catch {} },
  };
}

export function listSupportedLanguages() {
  return Object.keys(LANGS);
}
