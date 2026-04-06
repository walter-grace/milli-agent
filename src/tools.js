// Milli-Agent Tool Definitions + Execution
import { execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { resolve, relative, extname, basename } from 'path';

const FULL_PATH = process.env.PATH || '/usr/local/bin:/usr/bin';

function exec(cmd, opts = {}) {
  return execSync(cmd, { timeout: 30000, encoding: 'utf8', env: { ...process.env, PATH: FULL_PATH }, ...opts });
}

// ═══════════════════════════════════════════
// TIER 1 — File Operations & Git
// ═══════════════════════════════════════════

export const READ_FILE_TOOL = {
  type: 'function',
  function: {
    name: 'read_file',
    description: 'Read the contents of a file. Supports line range selection. Use this after grep_search to examine files in detail.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file' },
        start_line: { type: 'integer', description: 'Start line (1-indexed, default 1)' },
        end_line: { type: 'integer', description: 'End line (default: start_line + 100)' },
      },
      required: ['path'],
    },
  },
};

export const LIST_FILES_TOOL = {
  type: 'function',
  function: {
    name: 'list_files',
    description: 'List files and directories in a path. Shows file sizes and types. Use to explore repo structure.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path to list' },
        recursive: { type: 'boolean', description: 'List recursively (default false, max 500 entries)' },
        glob: { type: 'string', description: 'Filter by glob pattern e.g. "*.py"' },
      },
      required: ['path'],
    },
  },
};

export const GIT_LOG_TOOL = {
  type: 'function',
  function: {
    name: 'git_log',
    description: 'Show git commit history for a repo. Includes commit hash, author, date, message.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the git repo' },
        max_commits: { type: 'integer', description: 'Max commits to show (default 20)' },
        file: { type: 'string', description: 'Show history for a specific file' },
      },
      required: ['path'],
    },
  },
};

export const GIT_DIFF_TOOL = {
  type: 'function',
  function: {
    name: 'git_diff',
    description: 'Show git diff. Can compare branches, commits, or show uncommitted changes.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the git repo' },
        ref1: { type: 'string', description: 'First ref (commit/branch). Default: HEAD~1' },
        ref2: { type: 'string', description: 'Second ref. Default: HEAD' },
        file: { type: 'string', description: 'Diff for a specific file' },
      },
      required: ['path'],
    },
  },
};

// ═══════════════════════════════════════════
// TIER 2 — Code Understanding
// ═══════════════════════════════════════════

export const CODE_STATS_TOOL = {
  type: 'function',
  function: {
    name: 'code_stats',
    description: 'Get code statistics: lines of code per language, file count, repo size. Quick overview of a codebase.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to analyze' },
      },
      required: ['path'],
    },
  },
};

export const DEPENDENCY_GRAPH_TOOL = {
  type: 'function',
  function: {
    name: 'dependency_graph',
    description: 'Parse dependency files (package.json, go.mod, Cargo.toml, requirements.txt, etc.) and list all dependencies with versions.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the repo root' },
      },
      required: ['path'],
    },
  },
};

export const FIND_REFERENCES_TOOL = {
  type: 'function',
  function: {
    name: 'find_references',
    description: 'Find all references to a symbol (function, class, variable) across the codebase. More targeted than grep — searches for usage patterns.',
    parameters: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Symbol name to find references for' },
        path: { type: 'string', description: 'Directory to search in' },
        language: { type: 'string', description: 'Language hint: js, py, go, rust, etc.' },
      },
      required: ['symbol', 'path'],
    },
  },
};

// ═══════════════════════════════════════════
// TIER 3 — Agent Power Moves
// ═══════════════════════════════════════════

export const SECURITY_SCAN_TOOL = {
  type: 'function',
  function: {
    name: 'security_scan',
    description: 'Scan codebase for common security issues: hardcoded secrets, SQL injection, eval/exec, insecure patterns.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to scan' },
      },
      required: ['path'],
    },
  },
};

export const COMPARE_REPOS_TOOL = {
  type: 'function',
  function: {
    name: 'compare_repos',
    description: 'Compare two repos or directories structurally. Shows differences in file structure, languages, size.',
    parameters: {
      type: 'object',
      properties: {
        path1: { type: 'string', description: 'First repo/directory path' },
        path2: { type: 'string', description: 'Second repo/directory path' },
      },
      required: ['path1', 'path2'],
    },
  },
};

// ═══════════════════════════════════════════
// TIER 4 — Knowledge Base
// ═══════════════════════════════════════════

export const REPO_SUMMARY_TOOL = {
  type: 'function',
  function: {
    name: 'repo_summary',
    description: 'Generate a comprehensive summary of a repo by analyzing key files (README, entry points, config, main modules). Returns structured overview.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the repo' },
      },
      required: ['path'],
    },
  },
};

export const KNOWLEDGE_GRAPH_TOOL = {
  type: 'function',
  function: {
    name: 'knowledge_graph',
    description: 'Build a knowledge graph of a codebase: modules, their relationships, exports, imports, dependencies. Returns a structured map of the code architecture.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the repo' },
        depth: { type: 'integer', description: 'Analysis depth: 1=surface, 2=modules, 3=deep (default 2)' },
      },
      required: ['path'],
    },
  },
};

// ═══════════════════════════════════════════
// Tool Execution
// ═══════════════════════════════════════════

export const ALL_TOOLS = [
  READ_FILE_TOOL, LIST_FILES_TOOL, GIT_LOG_TOOL, GIT_DIFF_TOOL,
  CODE_STATS_TOOL, DEPENDENCY_GRAPH_TOOL, FIND_REFERENCES_TOOL,
  SECURITY_SCAN_TOOL, COMPARE_REPOS_TOOL,
  REPO_SUMMARY_TOOL, KNOWLEDGE_GRAPH_TOOL,
];

export function executeTool(name, args) {
  switch (name) {
    case 'read_file': return execReadFile(args);
    case 'list_files': return execListFiles(args);
    case 'git_log': return execGitLog(args);
    case 'git_diff': return execGitDiff(args);
    case 'code_stats': return execCodeStats(args);
    case 'dependency_graph': return execDependencyGraph(args);
    case 'find_references': return execFindReferences(args);
    case 'security_scan': return execSecurityScan(args);
    case 'compare_repos': return execCompareRepos(args);
    case 'repo_summary': return execRepoSummary(args);
    case 'knowledge_graph': return execKnowledgeGraph(args);
    default: return null; // not handled here
  }
}

// ═══════════════════════════════════════════
// Implementations
// ═══════════════════════════════════════════

function execReadFile({ path: filePath, start_line = 1, end_line }) {
  if (!filePath || !existsSync(filePath)) return `File not found: ${filePath}`;
  const stat = statSync(filePath);
  if (stat.isDirectory()) return `${filePath} is a directory, not a file. Use list_files instead.`;
  if (stat.size > 1024 * 1024) return `File too large (${(stat.size/1024/1024).toFixed(1)}MB). Max 1MB.`;

  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const end = end_line || Math.min(start_line + 100, lines.length);
  const slice = lines.slice(start_line - 1, end);

  const header = `File: ${filePath} (${lines.length} lines, ${(stat.size/1024).toFixed(1)}KB)\nShowing lines ${start_line}-${end}:\n\n`;
  return header + slice.map((l, i) => `${start_line + i}|${l}`).join('\n');
}

function execListFiles({ path: dirPath, recursive = false, glob: globPattern }) {
  if (!dirPath || !existsSync(dirPath)) return `Directory not found: ${dirPath}`;

  if (recursive) {
    try {
      let cmd = `find "${dirPath}" -type f`;
      if (globPattern) cmd += ` -name "${globPattern}"`;
      cmd += ' | head -500';
      const result = exec(cmd);
      const files = result.trim().split('\n').filter(Boolean);
      // Group by directory
      const dirs = {};
      files.forEach(f => {
        const rel = relative(dirPath, f);
        const dir = rel.includes('/') ? rel.split('/').slice(0, -1).join('/') : '.';
        if (!dirs[dir]) dirs[dir] = [];
        dirs[dir].push(basename(f));
      });
      let out = `${dirPath} (${files.length} files)\n\n`;
      Object.keys(dirs).sort().forEach(d => {
        out += `${d}/\n`;
        dirs[d].forEach(f => out += `  ${f}\n`);
      });
      return out;
    } catch { return 'Error listing files'; }
  }

  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    let out = `${dirPath}/\n\n`;
    const sorted = entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });
    sorted.forEach(e => {
      if (e.isDirectory()) {
        out += `  DIR  ${e.name}/\n`;
      } else {
        const size = statSync(resolve(dirPath, e.name)).size;
        const sizeStr = size > 1024*1024 ? `${(size/1024/1024).toFixed(1)}MB` : size > 1024 ? `${(size/1024).toFixed(1)}KB` : `${size}B`;
        out += `  FILE ${e.name} (${sizeStr})\n`;
      }
    });
    return out;
  } catch (e) { return `Error: ${e.message}`; }
}

function execGitLog({ path: repoPath, max_commits = 20, file }) {
  if (!existsSync(resolve(repoPath, '.git'))) return `Not a git repo: ${repoPath}`;
  try {
    let cmd = `cd "${repoPath}" && git log --oneline --format="%h %an %ar %s" -n ${max_commits}`;
    if (file) cmd += ` -- "${file}"`;
    return exec(cmd);
  } catch (e) { return `Error: ${e.message}`; }
}

function execGitDiff({ path: repoPath, ref1 = 'HEAD~1', ref2 = 'HEAD', file }) {
  if (!existsSync(resolve(repoPath, '.git'))) return `Not a git repo: ${repoPath}`;
  try {
    let cmd = `cd "${repoPath}" && git diff ${ref1} ${ref2} --stat`;
    if (file) cmd = `cd "${repoPath}" && git diff ${ref1} ${ref2} -- "${file}"`;
    const result = exec(cmd);
    return result || 'No differences found.';
  } catch (e) { return `Error: ${e.message}`; }
}

function execCodeStats({ path: dirPath }) {
  if (!existsSync(dirPath)) return `Not found: ${dirPath}`;
  try {
    // Count files by extension
    const result = exec(`find "${dirPath}" -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/target/*" -not -path "*/.zig-cache/*" | head -5000`);
    const files = result.trim().split('\n').filter(Boolean);

    const extCounts = {};
    const extLines = {};
    let totalLines = 0;
    let totalSize = 0;

    files.forEach(f => {
      const ext = extname(f) || basename(f);
      extCounts[ext] = (extCounts[ext] || 0) + 1;
      try {
        const stat = statSync(f);
        totalSize += stat.size;
        if (stat.size < 512 * 1024) { // only count lines for files < 512KB
          const lines = readFileSync(f, 'utf8').split('\n').length;
          extLines[ext] = (extLines[ext] || 0) + lines;
          totalLines += lines;
        }
      } catch {}
    });

    const langMap = { '.js':'JavaScript','.ts':'TypeScript','.py':'Python','.go':'Go','.rs':'Rust','.zig':'Zig',
      '.swift':'Swift','.c':'C','.cpp':'C++','.h':'C/C++ Header','.java':'Java','.rb':'Ruby',
      '.md':'Markdown','.json':'JSON','.yaml':'YAML','.yml':'YAML','.toml':'TOML','.html':'HTML','.css':'CSS','.sh':'Shell' };

    let out = `Code Stats: ${dirPath}\n${'='.repeat(50)}\n\n`;
    out += `Total: ${files.length} files, ${totalLines.toLocaleString()} lines, ${(totalSize/1024/1024).toFixed(1)}MB\n\n`;
    out += `Language Breakdown:\n`;

    const sorted = Object.entries(extLines).sort((a, b) => b[1] - a[1]);
    sorted.forEach(([ext, lines]) => {
      const lang = langMap[ext] || ext;
      const count = extCounts[ext] || 0;
      const pct = ((lines / totalLines) * 100).toFixed(1);
      out += `  ${lang.padEnd(20)} ${String(lines).padStart(8)} lines  ${String(count).padStart(4)} files  ${pct}%\n`;
    });

    return out;
  } catch (e) { return `Error: ${e.message}`; }
}

function execDependencyGraph({ path: repoPath }) {
  let out = `Dependencies: ${repoPath}\n${'='.repeat(50)}\n\n`;
  let found = false;

  const depFiles = [
    { file: 'package.json', parse: (c) => { const d = JSON.parse(c); return { deps: d.dependencies || {}, dev: d.devDependencies || {} }; }, label: 'Node.js' },
    { file: 'go.mod', parse: (c) => { const deps = {}; c.split('\n').forEach(l => { const m = l.match(/^\t(\S+)\s+(\S+)/); if (m) deps[m[1]] = m[2]; }); return { deps }; }, label: 'Go' },
    { file: 'Cargo.toml', parse: (c) => { const deps = {}; let inDeps = false; c.split('\n').forEach(l => { if (l.match(/^\[dependencies\]/)) inDeps = true; else if (l.match(/^\[/)) inDeps = false; else if (inDeps) { const m = l.match(/^(\S+)\s*=/); if (m) deps[m[1]] = l.split('=').slice(1).join('=').trim(); } }); return { deps }; }, label: 'Rust' },
    { file: 'requirements.txt', parse: (c) => { const deps = {}; c.split('\n').forEach(l => { const m = l.trim().match(/^([^#\s]+)/); if (m) deps[m[1]] = ''; }); return { deps }; }, label: 'Python' },
    { file: 'pyproject.toml', parse: (c) => { return { raw: 'pyproject.toml found — see file for details' }; }, label: 'Python' },
  ];

  depFiles.forEach(({ file, parse, label }) => {
    const fp = resolve(repoPath, file);
    if (existsSync(fp)) {
      found = true;
      try {
        const content = readFileSync(fp, 'utf8');
        const parsed = parse(content);
        out += `${label} (${file}):\n`;
        if (parsed.deps) {
          Object.entries(parsed.deps).forEach(([name, ver]) => {
            out += `  ${name} ${typeof ver === 'string' ? ver : JSON.stringify(ver)}\n`;
          });
        }
        if (parsed.dev && Object.keys(parsed.dev).length) {
          out += `  [dev]\n`;
          Object.entries(parsed.dev).forEach(([name, ver]) => {
            out += `  ${name} ${ver}\n`;
          });
        }
        if (parsed.raw) out += `  ${parsed.raw}\n`;
        out += '\n';
      } catch (e) { out += `  Error parsing: ${e.message}\n\n`; }
    }
  });

  if (!found) out += 'No dependency files found.\n';
  return out;
}

function execFindReferences({ symbol, path: dirPath, language }) {
  const patterns = [];
  // Build language-aware patterns
  if (language === 'go' || language === 'golang') {
    patterns.push(`${symbol}\\(`, `\\.${symbol}`, `${symbol}\\s*:=`, `${symbol}\\s*=`);
  } else if (language === 'py' || language === 'python') {
    patterns.push(`${symbol}\\(`, `\\.${symbol}`, `import.*${symbol}`, `from.*${symbol}`);
  } else if (language === 'js' || language === 'ts' || language === 'javascript' || language === 'typescript') {
    patterns.push(`${symbol}\\(`, `\\.${symbol}`, `import.*${symbol}`, `require.*${symbol}`, `export.*${symbol}`);
  } else if (language === 'rust' || language === 'rs') {
    patterns.push(`${symbol}\\(`, `${symbol}::`, `use.*${symbol}`, `impl.*${symbol}`);
  } else {
    patterns.push(`${symbol}\\(`, `\\.${symbol}`, `${symbol}\\s*[=:(]`);
  }

  let out = `References to "${symbol}" in ${dirPath}:\n\n`;
  patterns.forEach(pat => {
    try {
      const result = exec(`rg --no-heading -n -m 20 -- "${pat}" "${dirPath}" 2>/dev/null || true`);
      if (result.trim()) {
        out += `Pattern: ${pat}\n`;
        result.trim().split('\n').slice(0, 10).forEach(l => out += `  ${l}\n`);
        out += '\n';
      }
    } catch {}
  });
  return out || `No references found for "${symbol}"`;
}

function execSecurityScan({ path: dirPath }) {
  const checks = [
    { name: 'Hardcoded Secrets', patterns: ['password\\s*=\\s*["\'][^"\']+["\']', 'api_key\\s*=\\s*["\']', 'secret\\s*=\\s*["\'][^"\']+["\']', 'token\\s*=\\s*["\'][A-Za-z0-9]'] },
    { name: 'SQL Injection', patterns: ['\\$\\{.*\\}.*(?:SELECT|INSERT|UPDATE|DELETE|DROP)', 'f".*(?:SELECT|INSERT|UPDATE|DELETE).*\\{', '".*\\+.*".*(?:SELECT|INSERT|UPDATE|DELETE)'] },
    { name: 'Command Injection', patterns: ['eval\\(', 'exec\\((?!Sync)', 'os\\.system\\(', 'subprocess\\.call\\(.*shell=True', '\\$\\(.*\\)'] },
    { name: 'Insecure Config', patterns: ['debug\\s*=\\s*[Tt]rue', 'verify\\s*=\\s*[Ff]alse', 'insecure', 'disable.*ssl', 'http://(?!localhost)'] },
    { name: 'Sensitive Files', patterns: ['\\.env$', 'credentials', 'private_key', '\\.pem$'] },
  ];

  let out = `Security Scan: ${dirPath}\n${'='.repeat(50)}\n\n`;
  let totalFindings = 0;

  checks.forEach(({ name, patterns }) => {
    let findings = '';
    patterns.forEach(pat => {
      try {
        const result = exec(`rg --no-heading -n -m 5 -i -- "${pat}" "${dirPath}" --glob '!node_modules' --glob '!.git' --glob '!*.lock' --glob '!*.min.js' 2>/dev/null || true`);
        if (result.trim()) {
          result.trim().split('\n').slice(0, 3).forEach(l => findings += `    ${l}\n`);
        }
      } catch {}
    });
    if (findings) {
      const count = findings.trim().split('\n').length;
      totalFindings += count;
      out += `⚠ ${name} (${count} findings):\n${findings}\n`;
    } else {
      out += `✓ ${name}: clean\n`;
    }
  });

  out += `\n${'='.repeat(50)}\nTotal: ${totalFindings} potential issues found\n`;
  return out;
}

function execCompareRepos({ path1, path2 }) {
  if (!existsSync(path1)) return `Not found: ${path1}`;
  if (!existsSync(path2)) return `Not found: ${path2}`;

  let out = `Comparing:\n  A: ${path1}\n  B: ${path2}\n${'='.repeat(50)}\n\n`;

  // File counts
  const countFiles = (p) => {
    try { return exec(`find "${p}" -type f -not -path "*/.git/*" -not -path "*/node_modules/*" | wc -l`).trim(); }
    catch { return '?'; }
  };
  const sizeOf = (p) => {
    try { return exec(`du -sh "${p}" | cut -f1`).trim(); }
    catch { return '?'; }
  };

  out += `Files:  A=${countFiles(path1)}  B=${countFiles(path2)}\n`;
  out += `Size:   A=${sizeOf(path1)}  B=${sizeOf(path2)}\n\n`;

  // Language comparison
  const getExts = (p) => {
    try {
      const result = exec(`find "${p}" -type f -not -path "*/.git/*" -not -path "*/node_modules/*" | sed 's/.*\\.//' | sort | uniq -c | sort -rn | head -10`);
      return result.trim();
    } catch { return ''; }
  };
  out += `Languages (A):\n${getExts(path1)}\n\nLanguages (B):\n${getExts(path2)}\n\n`;

  // Unique files in each
  try {
    const filesA = new Set(exec(`find "${path1}" -type f -not -path "*/.git/*" -not -path "*/node_modules/*" | sed "s|${path1}/||" | sort`).trim().split('\n'));
    const filesB = new Set(exec(`find "${path2}" -type f -not -path "*/.git/*" -not -path "*/node_modules/*" | sed "s|${path2}/||" | sort`).trim().split('\n'));
    const onlyA = [...filesA].filter(f => !filesB.has(f)).slice(0, 10);
    const onlyB = [...filesB].filter(f => !filesA.has(f)).slice(0, 10);
    const common = [...filesA].filter(f => filesB.has(f));

    out += `Common files: ${common.length}\n`;
    out += `Only in A: ${[...filesA].filter(f => !filesB.has(f)).length} (showing first 10):\n`;
    onlyA.forEach(f => out += `  + ${f}\n`);
    out += `Only in B: ${[...filesB].filter(f => !filesA.has(f)).length} (showing first 10):\n`;
    onlyB.forEach(f => out += `  + ${f}\n`);
  } catch {}

  return out;
}

function execRepoSummary({ path: repoPath }) {
  let out = `Repository Summary: ${repoPath}\n${'='.repeat(50)}\n\n`;

  // README
  const readmePaths = ['README.md', 'README.rst', 'README.txt', 'README'];
  for (const r of readmePaths) {
    const fp = resolve(repoPath, r);
    if (existsSync(fp)) {
      const content = readFileSync(fp, 'utf8');
      out += `📄 README (${r}):\n${content.slice(0, 2000)}\n\n`;
      break;
    }
  }

  // Structure
  try {
    const dirs = exec(`find "${repoPath}" -type d -maxdepth 2 -not -path "*/.git*" -not -path "*/node_modules*" | head -30`);
    out += `📁 Structure:\n${dirs}\n`;
  } catch {}

  // Entry points
  const entryFiles = ['main.go', 'main.rs', 'main.py', 'index.js', 'index.ts', 'app.py', 'server.js', 'src/main.rs', 'src/index.ts', 'src/index.js', 'cmd/main.go'];
  out += `\n🚀 Entry Points:\n`;
  entryFiles.forEach(f => {
    const fp = resolve(repoPath, f);
    if (existsSync(fp)) {
      const content = readFileSync(fp, 'utf8');
      out += `  ${f} (${content.split('\n').length} lines)\n`;
      // Show first 5 lines
      content.split('\n').slice(0, 5).forEach(l => out += `    ${l}\n`);
      out += `    ...\n\n`;
    }
  });

  // Dependencies
  out += `\n📦 Dependencies:\n`;
  out += execDependencyGraph({ path: repoPath }).split('\n').map(l => '  ' + l).join('\n');

  // Code stats
  out += `\n\n📊 Stats:\n`;
  out += execCodeStats({ path: repoPath }).split('\n').map(l => '  ' + l).join('\n');

  return out;
}

function execKnowledgeGraph({ path: repoPath, depth = 2 }) {
  let out = `Knowledge Graph: ${repoPath}\n${'='.repeat(50)}\n\n`;

  // Level 1: Module/package discovery
  out += `## Modules\n`;
  try {
    const dirs = exec(`find "${repoPath}" -type d -maxdepth 2 -not -path "*/.git*" -not -path "*/node_modules*" -not -path "*/target*" -not -path "*/.zig-cache*" | sort`);
    dirs.trim().split('\n').forEach(d => {
      const rel = relative(repoPath, d) || '.';
      const fileCount = readdirSync(d).filter(f => !f.startsWith('.')).length;
      out += `  ${rel}/ (${fileCount} entries)\n`;
    });
  } catch {}

  if (depth < 2) return out;

  // Level 2: Import/export graph
  out += `\n## Import Graph\n`;
  const importPatterns = {
    'import': 'import\\s',
    'require': 'require\\(',
    'from': 'from\\s+["\']',
    'use': '^use\\s',
    'include': '#include',
  };

  Object.entries(importPatterns).forEach(([name, pattern]) => {
    try {
      const result = exec(`rg --no-heading -n -m 50 -- "${pattern}" "${repoPath}" --glob '!node_modules' --glob '!.git' --glob '!*.lock' 2>/dev/null || true`);
      if (result.trim()) {
        const lines = result.trim().split('\n');
        // Extract imported modules
        const modules = new Set();
        lines.forEach(l => {
          const m = l.match(/(?:import|require|from|use)\s+["']([^"']+)["']/);
          if (m) modules.add(m[1]);
          const m2 = l.match(/(?:import|from)\s+(\S+)/);
          if (m2 && !m2[1].includes('"') && !m2[1].includes("'")) modules.add(m2[1]);
        });
        if (modules.size > 0) {
          out += `  ${name} (${modules.size} unique modules):\n`;
          [...modules].sort().slice(0, 20).forEach(m => out += `    → ${m}\n`);
          out += '\n';
        }
      }
    } catch {}
  });

  if (depth < 3) return out;

  // Level 3: Function/class/type definitions
  out += `\n## Definitions\n`;
  const defPatterns = [
    { label: 'Functions', pattern: 'def\\s+\\w+|func\\s+\\w+|function\\s+\\w+|fn\\s+\\w+' },
    { label: 'Classes/Structs', pattern: 'class\\s+\\w+|struct\\s+\\w+|type\\s+\\w+\\s+struct|interface\\s+\\w+' },
    { label: 'Exports', pattern: 'export\\s+(default\\s+)?(function|class|const|let|var)\\s+\\w+|module\\.exports' },
  ];

  defPatterns.forEach(({ label, pattern }) => {
    try {
      const result = exec(`rg --no-heading -on -m 100 -- "${pattern}" "${repoPath}" --glob '!node_modules' --glob '!.git' --glob '!*test*' --glob '!*.lock' 2>/dev/null || true`);
      if (result.trim()) {
        const items = result.trim().split('\n');
        out += `  ${label} (${items.length}):\n`;
        items.slice(0, 15).forEach(l => {
          const rel = relative(repoPath, l.split(':')[0]);
          const match = l.split(':').slice(2).join(':').trim();
          out += `    ${rel}: ${match}\n`;
        });
        if (items.length > 15) out += `    ... and ${items.length - 15} more\n`;
        out += '\n';
      }
    } catch {}
  });

  // Relationship summary
  out += `\n## Architecture Summary\n`;
  try {
    const fileCount = exec(`find "${repoPath}" -type f -not -path "*/.git/*" -not -path "*/node_modules/*" | wc -l`).trim();
    const dirCount = exec(`find "${repoPath}" -type d -not -path "*/.git/*" -not -path "*/node_modules/*" | wc -l`).trim();
    out += `  ${fileCount} files across ${dirCount} directories\n`;

    // Detect project type
    const markers = [];
    if (existsSync(resolve(repoPath, 'package.json'))) markers.push('Node.js');
    if (existsSync(resolve(repoPath, 'go.mod'))) markers.push('Go');
    if (existsSync(resolve(repoPath, 'Cargo.toml'))) markers.push('Rust');
    if (existsSync(resolve(repoPath, 'requirements.txt')) || existsSync(resolve(repoPath, 'pyproject.toml'))) markers.push('Python');
    if (existsSync(resolve(repoPath, 'Dockerfile'))) markers.push('Docker');
    if (existsSync(resolve(repoPath, '.github'))) markers.push('GitHub Actions');
    if (existsSync(resolve(repoPath, 'Makefile'))) markers.push('Make');
    out += `  Stack: ${markers.join(', ') || 'Unknown'}\n`;
  } catch {}

  return out;
}
