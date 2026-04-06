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
// TIER 5 — Git Power Tools
// ═══════════════════════════════════════════

export const GIT_SUMMARY_TOOL = {
  type: 'function',
  function: {
    name: 'git_summary',
    description: 'Rich git repository summary: authors, commit count, active days, file stats. Like git-extras "git summary" but works everywhere. Much richer than basic git_log.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the git repo' },
      },
      required: ['path'],
    },
  },
};

export const GIT_EFFORT_TOOL = {
  type: 'function',
  function: {
    name: 'git_effort',
    description: 'Show which files have the most commits and active days — reveals hotspots and complexity. Like git-extras "git effort".',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the git repo' },
        top: { type: 'integer', description: 'Number of top files to show (default 20)' },
      },
      required: ['path'],
    },
  },
};

export const GIT_AUTHORS_TOOL = {
  type: 'function',
  function: {
    name: 'git_authors',
    description: 'Detailed author stats: commits, lines added/removed, first/last commit, active files. Answers "who owns this code?"',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the git repo' },
        file: { type: 'string', description: 'Show authors for a specific file or directory' },
      },
      required: ['path'],
    },
  },
};

export const GIT_TIMELINE_TOOL = {
  type: 'function',
  function: {
    name: 'git_timeline',
    description: 'Track the full lifetime of a file: creation, renames, major changes, authors over time. Like git-follow — answers "what happened to this file?"',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the git repo' },
        file: { type: 'string', description: 'File to track (relative to repo root)' },
      },
      required: ['path', 'file'],
    },
  },
};

export const GIT_SECRETS_CLEAN_TOOL = {
  type: 'function',
  function: {
    name: 'git_secrets_clean',
    description: 'Scan git history for leaked secrets (API keys, passwords, tokens) and show exactly which commits contain them. Like BFG Repo-Cleaner but read-only analysis first. Use after security_scan to check if secrets were ever committed.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the git repo' },
        pattern: { type: 'string', description: 'Custom regex pattern to search for. Default: common secret patterns.' },
      },
      required: ['path'],
    },
  },
};

// ═══════════════════════════════════════════
// TIER 6 — API Intelligence
// ═══════════════════════════════════════════

export const OPENAPI_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'openapi_search',
    description: 'Search OpenAPI/Swagger specs at milli-speed. Finds spec files, extracts endpoints, schemas, parameters. Way more token-efficient than grepping raw YAML — returns only what you need.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to repo or directory containing OpenAPI specs' },
        query: { type: 'string', description: 'Search query: endpoint path, schema name, HTTP method, description keyword, or parameter name' },
        mode: { type: 'string', description: 'Search mode: "endpoints" (list routes), "schemas" (list models), "search" (keyword search across all), "detail" (full detail for a specific endpoint/schema). Default: search' },
        method: { type: 'string', description: 'Filter by HTTP method: get, post, put, delete, patch' },
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
  GIT_SUMMARY_TOOL, GIT_EFFORT_TOOL, GIT_AUTHORS_TOOL, GIT_TIMELINE_TOOL, GIT_SECRETS_CLEAN_TOOL,
  OPENAPI_SEARCH_TOOL,
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
    case 'git_summary': return execGitSummary(args);
    case 'git_effort': return execGitEffort(args);
    case 'git_authors': return execGitAuthors(args);
    case 'git_timeline': return execGitTimeline(args);
    case 'git_secrets_clean': return execGitSecretsClean(args);
    case 'openapi_search': return execOpenAPISearch(args);
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

// ═══════════════════════════════════════════
// Git Power Tools — Implementations
// ═══════════════════════════════════════════

function execGitSummary({ path: repoPath }) {
  if (!existsSync(resolve(repoPath, '.git'))) return `Not a git repo: ${repoPath}`;
  try {
    let out = `Git Summary: ${repoPath}\n${'='.repeat(50)}\n\n`;

    // Basic stats
    const commitCount = exec(`cd "${repoPath}" && git rev-list --count HEAD 2>/dev/null`).trim();
    const firstCommit = exec(`cd "${repoPath}" && git log --reverse --format="%ai" | head -1`).trim();
    const lastCommit = exec(`cd "${repoPath}" && git log -1 --format="%ai"`).trim();
    const branchCount = exec(`cd "${repoPath}" && git branch -a 2>/dev/null | wc -l`).trim();
    const tagCount = exec(`cd "${repoPath}" && git tag 2>/dev/null | wc -l`).trim();

    out += `Commits:     ${commitCount}\n`;
    out += `First:       ${firstCommit}\n`;
    out += `Last:        ${lastCommit}\n`;
    out += `Branches:    ${branchCount}\n`;
    out += `Tags:        ${tagCount}\n\n`;

    // Active days
    const activeDays = exec(`cd "${repoPath}" && git log --format="%ad" --date=short | sort -u | wc -l`).trim();
    out += `Active days: ${activeDays}\n`;

    // Authors ranked by commits
    out += `\nAuthors:\n`;
    const authors = exec(`cd "${repoPath}" && git shortlog -sn --no-merges HEAD 2>/dev/null | head -15`).trim();
    authors.split('\n').forEach(l => {
      const m = l.trim().match(/^(\d+)\s+(.+)/);
      if (m) {
        const pct = ((parseInt(m[1]) / parseInt(commitCount)) * 100).toFixed(1);
        out += `  ${m[1].padStart(6)} ${pct.padStart(5)}%  ${m[2]}\n`;
      }
    });

    // File type breakdown
    out += `\nFiles by type:\n`;
    const fileTypes = exec(`cd "${repoPath}" && git ls-files | sed 's/.*\\.//' | sort | uniq -c | sort -rn | head -10`).trim();
    fileTypes.split('\n').forEach(l => out += `  ${l.trim()}\n`);

    // Repo size
    const repoSize = exec(`du -sh "${repoPath}/.git" | cut -f1`).trim();
    const workingSize = exec(`du -sh "${repoPath}" --exclude=.git 2>/dev/null | cut -f1`).trim();
    out += `\n.git size:   ${repoSize}\n`;
    out += `Working:     ${workingSize}\n`;

    return out;
  } catch (e) { return `Error: ${e.message}`; }
}

function execGitEffort({ path: repoPath, top = 20 }) {
  if (!existsSync(resolve(repoPath, '.git'))) return `Not a git repo: ${repoPath}`;
  try {
    let out = `Git Effort: ${repoPath} (top ${top} hotspots)\n${'='.repeat(50)}\n\n`;
    out += `${'File'.padEnd(50)} Commits  Active Days\n`;
    out += `${'-'.repeat(50)} ${'-'.repeat(7)}  ${'-'.repeat(11)}\n`;

    // Get all tracked files and their commit counts + active days
    const files = exec(`cd "${repoPath}" && git ls-files`).trim().split('\n').filter(Boolean);
    const efforts = [];

    // Batch process — use git log for each file (limited to avoid timeout)
    const filesToCheck = files.slice(0, 200); // cap to avoid timeout
    for (const file of filesToCheck) {
      try {
        const commits = exec(`cd "${repoPath}" && git log --oneline -- "${file}" 2>/dev/null | wc -l`, { timeout: 5000 }).trim();
        const days = exec(`cd "${repoPath}" && git log --format="%ad" --date=short -- "${file}" 2>/dev/null | sort -u | wc -l`, { timeout: 5000 }).trim();
        const c = parseInt(commits) || 0;
        const d = parseInt(days) || 0;
        if (c > 0) efforts.push({ file, commits: c, days: d });
      } catch {}
    }

    // Sort by commits descending
    efforts.sort((a, b) => b.commits - a.commits);
    efforts.slice(0, top).forEach(e => {
      out += `${e.file.padEnd(50).slice(0, 50)} ${String(e.commits).padStart(7)}  ${String(e.days).padStart(11)}\n`;
    });

    if (files.length > 200) out += `\n(analyzed 200/${files.length} files)\n`;
    return out;
  } catch (e) { return `Error: ${e.message}`; }
}

function execGitAuthors({ path: repoPath, file }) {
  if (!existsSync(resolve(repoPath, '.git'))) return `Not a git repo: ${repoPath}`;
  try {
    const scope = file ? `-- "${file}"` : '';
    const scopeLabel = file || 'entire repo';
    let out = `Git Authors: ${scopeLabel}\n${'='.repeat(50)}\n\n`;

    // Author stats with lines added/removed
    const logData = exec(`cd "${repoPath}" && git log --format="%aN|%ae|%ai" --numstat ${scope} 2>/dev/null | head -5000`).trim();
    const authors = {};
    let currentAuthor = null;

    logData.split('\n').forEach(line => {
      const authorMatch = line.match(/^(.+)\|(.+)\|(.+)$/);
      if (authorMatch) {
        const [, name, email, date] = authorMatch;
        currentAuthor = name;
        if (!authors[name]) {
          authors[name] = { email, commits: 0, added: 0, removed: 0, firstDate: date, lastDate: date, files: new Set() };
        }
        authors[name].commits++;
        authors[name].lastDate = date;
      } else if (currentAuthor && line.trim()) {
        const statMatch = line.match(/^(\d+)\t(\d+)\t(.+)/);
        if (statMatch) {
          authors[currentAuthor].added += parseInt(statMatch[1]) || 0;
          authors[currentAuthor].removed += parseInt(statMatch[2]) || 0;
          authors[currentAuthor].files.add(statMatch[3]);
        }
      }
    });

    // Sort by commits
    const sorted = Object.entries(authors).sort((a, b) => b[1].commits - a[1].commits);
    sorted.slice(0, 15).forEach(([name, stats]) => {
      out += `${name} <${stats.email}>\n`;
      out += `  Commits:  ${stats.commits}\n`;
      out += `  Added:    +${stats.added.toLocaleString()} lines\n`;
      out += `  Removed:  -${stats.removed.toLocaleString()} lines\n`;
      out += `  Files:    ${stats.files.size} unique\n`;
      out += `  Period:   ${stats.firstDate.slice(0, 10)} → ${stats.lastDate.slice(0, 10)}\n\n`;
    });

    return out;
  } catch (e) { return `Error: ${e.message}`; }
}

function execGitTimeline({ path: repoPath, file }) {
  if (!existsSync(resolve(repoPath, '.git'))) return `Not a git repo: ${repoPath}`;
  try {
    let out = `Git Timeline: ${file}\n${'='.repeat(50)}\n\n`;

    // Follow file through renames
    const log = exec(`cd "${repoPath}" && git log --follow --format="%H|%an|%ai|%s" --numstat --diff-filter=AMRD -- "${file}" 2>/dev/null | head -2000`).trim();

    const events = [];
    let current = null;

    log.split('\n').forEach(line => {
      const commitMatch = line.match(/^([a-f0-9]{40})\|(.+)\|(.+)\|(.+)$/);
      if (commitMatch) {
        if (current) events.push(current);
        current = {
          hash: commitMatch[1].slice(0, 8),
          author: commitMatch[2],
          date: commitMatch[3].slice(0, 10),
          message: commitMatch[4],
          added: 0, removed: 0, rename: null,
        };
      } else if (current && line.trim()) {
        const statMatch = line.match(/^(\d+)\t(\d+)\t(.+)/);
        if (statMatch) {
          current.added += parseInt(statMatch[1]) || 0;
          current.removed += parseInt(statMatch[2]) || 0;
          // Detect renames
          const renameMatch = statMatch[3].match(/\{(.+) => (.+)\}|(.+) => (.+)/);
          if (renameMatch) current.rename = statMatch[3];
        }
      }
    });
    if (current) events.push(current);

    if (events.length === 0) {
      return `No history found for ${file}. File may not exist or may not be tracked.`;
    }

    // Creation event
    const created = events[events.length - 1];
    out += `Created: ${created.date} by ${created.author}\n`;
    out += `Latest:  ${events[0].date} by ${events[0].author}\n`;
    out += `Changes: ${events.length} commits\n\n`;

    // Timeline
    out += `Timeline:\n`;
    events.forEach((e, i) => {
      const label = i === events.length - 1 ? 'CREATED' : e.rename ? 'RENAMED' : e.added + e.removed > 100 ? 'MAJOR' : 'changed';
      out += `  ${e.date} ${e.hash} ${label.padEnd(8)} +${e.added}/-${e.removed} ${e.author}\n`;
      out += `    ${e.message}\n`;
      if (e.rename) out += `    ${e.rename}\n`;
    });

    return out;
  } catch (e) { return `Error: ${e.message}`; }
}

function execGitSecretsClean({ path: repoPath, pattern }) {
  if (!existsSync(resolve(repoPath, '.git'))) return `Not a git repo: ${repoPath}`;
  try {
    let out = `Git Secrets Scan: ${repoPath}\n${'='.repeat(50)}\n\n`;

    const patterns = pattern ? [pattern] : [
      'AKIA[0-9A-Z]{16}',                           // AWS Access Key
      'sk-[a-zA-Z0-9]{20,}',                         // OpenAI/Stripe keys
      'ghp_[a-zA-Z0-9]{36}',                         // GitHub PAT
      'glpat-[a-zA-Z0-9-]{20,}',                     // GitLab PAT
      'AIza[0-9A-Za-z-_]{35}',                       // Google API key
      'xox[bpors]-[0-9a-zA-Z-]{10,}',                // Slack token
      'sk-or-v1-[a-f0-9]{64}',                       // OpenRouter key
      'password\\s*[:=]\\s*[^\\s]{8,}',                 // Hardcoded passwords
      'secret\\s*[:=]\\s*[^\\s]{8,}',                  // Hardcoded secrets
      'BEGIN.*(RSA|EC|DSA|OPENSSH).*PRIVATE KEY',       // Private keys
    ];

    let totalFindings = 0;

    for (const pat of patterns) {
      try {
        // Search git history — only show commit hash, filename, and matched line
        const result = exec(`cd "${repoPath}" && git log --all -p --format="COMMIT:%H %an %ai" -S "${pat}" 2>/dev/null | rg -m 30 "COMMIT:|${pat}" 2>/dev/null || true`, { timeout: 15000 });
        const lines = result.trim().split('\n').filter(l => l.trim());
        if (lines.length > 0 && lines[0] !== '') {
          const commitCount = lines.filter(l => l.startsWith('COMMIT:')).length;
          const matchLines = lines.filter(l => !l.startsWith('COMMIT:'));
          if (matchLines.length > 0) {
            totalFindings += matchLines.length;
            const label = pattern ? 'Custom pattern' : pat.slice(0, 30);
            out += `!! ${label} — ${matchLines.length} match(es) in ${commitCount} commit(s):\n`;
            // Show commits
            lines.filter(l => l.startsWith('COMMIT:')).slice(0, 5).forEach(l => {
              out += `  ${l.replace('COMMIT:', '').trim()}\n`;
            });
            // Show redacted matches
            matchLines.slice(0, 5).forEach(l => {
              // Redact the actual secret value for safety
              const redacted = l.trim().replace(/([A-Za-z0-9+/=_-]{8})[A-Za-z0-9+/=_-]{8,}/g, '$1********');
              out += `    ${redacted.slice(0, 120)}\n`;
            });
            out += '\n';
          }
        }
      } catch {}
    }

    if (totalFindings === 0) {
      out += 'No secrets found in git history.\n';
    } else {
      out += `${'='.repeat(50)}\n`;
      out += `TOTAL: ${totalFindings} potential secrets found in history\n\n`;
      out += `To clean: Use BFG Repo-Cleaner or git-filter-repo:\n`;
      out += `  bfg --replace-text passwords.txt ${repoPath}\n`;
      out += `  git filter-repo --invert-paths --path <file>\n`;
    }

    return out;
  } catch (e) { return `Error: ${e.message}`; }
}

// ═══════════════════════════════════════════
// OpenAPI Search — Milli-Speed API Intelligence
// ═══════════════════════════════════════════

function findSpecFiles(dirPath) {
  const specFiles = new Set();

  // Fast: check common names first
  const commonNames = [
    'openapi.json', 'openapi.yaml', 'openapi.yml',
    'swagger.json', 'swagger.yaml', 'swagger.yml',
    'api-spec.json', 'api-spec.yaml', 'api.json', 'api.yaml',
  ];
  for (const name of commonNames) {
    try {
      const found = exec(`find "${dirPath}" -name "${name}" -not -path "*/.git/*" -not -path "*/node_modules/*" 2>/dev/null | head -10`).trim();
      if (found) found.split('\n').forEach(f => specFiles.add(f));
    } catch {}
  }

  // Broader: ripgrep for openapi/swagger version markers in JSON/YAML files
  if (specFiles.size === 0) {
    try {
      const result = exec(`rg -l --glob '*.{json,yaml,yml}' --glob '!node_modules' --glob '!.git' --glob '!*.lock' -m 1 '"openapi"|"swagger"|openapi:' "${dirPath}" 2>/dev/null | head -20`);
      if (result.trim()) result.trim().split('\n').forEach(f => specFiles.add(f));
    } catch {}
  }

  return [...specFiles];
}

function parseSpec(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const isJson = filePath.endsWith('.json') || content.trimStart().startsWith('{');

  if (isJson) return JSON.parse(content);

  // Try JSON parse first (some .yaml files are JSON)
  try { return JSON.parse(content); } catch {}

  // Basic YAML parse for OpenAPI structure
  return parseYamlSimple(content);
}

function parseYamlSimple(content) {
  const spec = { paths: {}, components: { schemas: {} }, info: {} };
  const lines = content.split('\n');

  let currentPath = null, currentMethod = null, currentSchema = null;
  let inPaths = false, inSchemas = false, inInfo = false;

  for (const line of lines) {
    const stripped = line.trimEnd();
    if (!stripped || stripped.startsWith('#')) continue;

    const leadingSpaces = line.match(/^(\s*)/)[1].length;

    if (leadingSpaces === 0) {
      inPaths = stripped.startsWith('paths:');
      inSchemas = false;
      inInfo = stripped.startsWith('info:');
      currentPath = null;
      currentMethod = null;
      currentSchema = null;
      continue;
    }

    if (stripped.match(/^\s{2}schemas:/) && !inPaths) {
      inSchemas = true;
      continue;
    }

    if (inInfo && leadingSpaces === 2) {
      const m = stripped.match(/^\s+(\w+):\s*(.+)/);
      if (m) spec.info[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }

    if (inPaths && leadingSpaces === 2) {
      const m = stripped.match(/^\s{2}(\S+):/);
      if (m) {
        currentPath = m[1].replace(/^['"]|['"]$/g, '');
        spec.paths[currentPath] = {};
        currentMethod = null;
      }
    }

    if (inPaths && currentPath && leadingSpaces === 4) {
      const m = stripped.match(/^\s{4}(get|post|put|delete|patch|options|head):/);
      if (m) {
        currentMethod = m[1];
        spec.paths[currentPath][currentMethod] = {};
      }
    }

    if (inPaths && currentPath && currentMethod && leadingSpaces === 6) {
      const m = stripped.match(/^\s{6}(\w+):\s*(.+)/);
      if (m) {
        spec.paths[currentPath][currentMethod][m[1]] = m[2].replace(/^['"]|['"]$/g, '');
      }
    }

    if (inSchemas && leadingSpaces === 4) {
      const m = stripped.match(/^\s{4}(\w+):/);
      if (m) {
        currentSchema = m[1];
        spec.components.schemas[currentSchema] = { _lines: [] };
      }
    }

    if (inSchemas && currentSchema && leadingSpaces >= 6) {
      spec.components.schemas[currentSchema]._lines.push(stripped.trim());
    }
  }

  return spec;
}

function resolveRef(spec, ref) {
  if (!ref || !ref.startsWith('#/')) return null;
  const parts = ref.slice(2).split('/');
  let obj = spec;
  for (const p of parts) {
    obj = obj?.[p];
    if (!obj) return null;
  }
  return obj;
}

function execOpenAPISearch({ path: dirPath, query = '', mode = 'search', method: methodFilter }) {
  if (!existsSync(dirPath)) return `Not found: ${dirPath}`;

  const t0 = performance.now();
  const specFiles = findSpecFiles(dirPath);
  const findMs = Math.round(performance.now() - t0);

  if (specFiles.length === 0) {
    return `No OpenAPI/Swagger specs found in ${dirPath} (scanned in ${findMs}ms)\nTip: Try grep_search with pattern "openapi|swagger" to locate specs manually.`;
  }

  let out = `OpenAPI Search: ${dirPath}\n${'='.repeat(50)}\nFound ${specFiles.length} spec(s) in ${findMs}ms\n\n`;

  for (const specFile of specFiles.slice(0, 5)) {
    const relPath = relative(dirPath, specFile);
    const parseStart = performance.now();
    let spec;

    try {
      spec = parseSpec(specFile);
    } catch (e) {
      out += `${relPath}: parse error — ${e.message}\n\n`;
      continue;
    }

    const parseMs = Math.round(performance.now() - parseStart);
    const version = spec.openapi || spec.swagger || '?';
    const title = spec.info?.title || basename(specFile);
    const paths = spec.paths || {};
    const schemas = spec.components?.schemas || spec.definitions || {};

    let endpointCount = 0;
    for (const p of Object.values(paths)) {
      endpointCount += Object.keys(p).filter(m => ['get','post','put','delete','patch','options','head'].includes(m)).length;
    }

    out += `## ${title} (${version})\nFile: ${relPath} | ${endpointCount} endpoints, ${Object.keys(schemas).length} schemas | parsed ${parseMs}ms\n`;
    if (spec.info?.description) out += `${spec.info.description.slice(0, 200)}\n`;
    out += '\n';

    const q = query.toLowerCase();

    if (mode === 'endpoints' || (mode === 'search' && !query)) {
      out += `Endpoints:\n`;
      for (const [path, methods] of Object.entries(paths)) {
        for (const [method, detail] of Object.entries(methods)) {
          if (!['get','post','put','delete','patch','options','head'].includes(method)) continue;
          if (methodFilter && method !== methodFilter.toLowerCase()) continue;
          const summary = detail.summary || detail.operationId || '';
          out += `  ${method.toUpperCase().padEnd(7)} ${path}`;
          if (summary) out += ` — ${summary}`;
          out += '\n';
        }
      }
      out += '\n';
    }

    if (mode === 'schemas' || (mode === 'search' && !query)) {
      out += `Schemas:\n`;
      for (const [name, schema] of Object.entries(schemas)) {
        const type = schema.type || (schema.properties ? 'object' : schema.enum ? 'enum' : '?');
        const props = schema.properties ? Object.keys(schema.properties).slice(0, 8).join(', ') : '';
        out += `  ${name} (${type})`;
        if (props) out += ` — ${props}`;
        if (schema.properties && Object.keys(schema.properties).length > 8) out += `, +${Object.keys(schema.properties).length - 8} more`;
        out += '\n';
      }
      out += '\n';
    }

    if (mode === 'search' && query) {
      let matches = 0;
      out += `Search: "${query}"\n\n`;

      for (const [path, methods] of Object.entries(paths)) {
        for (const [method, detail] of Object.entries(methods)) {
          if (!['get','post','put','delete','patch','options','head'].includes(method)) continue;
          if (methodFilter && method !== methodFilter.toLowerCase()) continue;

          const haystack = [path, method, detail.summary || '', detail.description || '', detail.operationId || ''].join(' ').toLowerCase();
          if (haystack.includes(q)) {
            matches++;
            out += `  ${method.toUpperCase().padEnd(7)} ${path}\n`;
            if (detail.summary) out += `          summary: ${detail.summary}\n`;
            if (detail.operationId) out += `          operationId: ${detail.operationId}\n`;
            if (detail.parameters) {
              const params = detail.parameters.map(p => `${p.name || (p.$ref ? p.$ref.split('/').pop() : '?')}(${p.in || '?'})`);
              out += `          params: ${params.join(', ')}\n`;
            }
            if (detail.responses) {
              out += `          responses: ${Object.keys(detail.responses).join(', ')}\n`;
            }
            out += '\n';
          }
        }
      }

      for (const [name, schema] of Object.entries(schemas)) {
        const haystack = [name, schema.description || '', JSON.stringify(schema.properties || {})].join(' ').toLowerCase();
        if (haystack.includes(q)) {
          matches++;
          out += `  Schema: ${name} (${schema.type || 'object'})\n`;
          if (schema.description) out += `    ${schema.description.slice(0, 150)}\n`;
          if (schema.properties) {
            for (const [prop, pDef] of Object.entries(schema.properties).slice(0, 12)) {
              const pType = pDef.type || (pDef.$ref ? '→' + pDef.$ref.split('/').pop() : '?');
              out += `    .${prop}: ${pType}`;
              if (pDef.description) out += ` — ${pDef.description.slice(0, 80)}`;
              out += '\n';
            }
          }
          if (schema.enum) out += `    enum: ${schema.enum.slice(0, 10).join(', ')}\n`;
          out += '\n';
        }
      }

      out += `${matches} match(es)\n\n`;
    }

    if (mode === 'detail' && query) {
      for (const [path, methods] of Object.entries(paths)) {
        if (!path.toLowerCase().includes(q)) continue;
        out += `Endpoint: ${path}\n`;
        for (const [method, detail] of Object.entries(methods)) {
          if (!['get','post','put','delete','patch','options','head'].includes(method)) continue;
          out += `\n  ${method.toUpperCase()}:\n`;
          if (detail.summary) out += `    summary: ${detail.summary}\n`;
          if (detail.description) out += `    description: ${detail.description.slice(0, 500)}\n`;
          if (detail.operationId) out += `    operationId: ${detail.operationId}\n`;

          if (detail.parameters) {
            out += '    parameters:\n';
            for (const p of detail.parameters) {
              if (p.$ref) {
                const resolved = resolveRef(spec, p.$ref);
                if (resolved) {
                  out += `      ${resolved.name || '?'} (${resolved.in || '?'}, ${resolved.schema?.type || '?'})${resolved.required ? ' REQUIRED' : ''}\n`;
                  if (resolved.description) out += `        ${resolved.description.slice(0, 120)}\n`;
                } else {
                  out += `      $ref: ${p.$ref}\n`;
                }
              } else {
                out += `      ${p.name} (${p.in}, ${p.schema?.type || p.type || '?'})${p.required ? ' REQUIRED' : ''}\n`;
                if (p.description) out += `        ${p.description.slice(0, 120)}\n`;
              }
            }
          }

          if (detail.requestBody) {
            out += '    requestBody:\n';
            const rbContent = detail.requestBody.content || {};
            for (const [ct, body] of Object.entries(rbContent)) {
              out += `      ${ct}:\n`;
              if (body.schema?.$ref) {
                const schemaName = body.schema.$ref.split('/').pop();
                const resolved = resolveRef(spec, body.schema.$ref);
                out += `        → ${schemaName}`;
                if (resolved?.properties) out += ` { ${Object.keys(resolved.properties).slice(0, 8).join(', ')} }`;
                out += '\n';
              } else if (body.schema) {
                out += `        type: ${body.schema.type || '?'}\n`;
              }
            }
          }

          if (detail.responses) {
            out += '    responses:\n';
            for (const [code, resp] of Object.entries(detail.responses)) {
              out += `      ${code}: ${resp.description || ''}\n`;
              const respContent = resp.content || {};
              for (const [ct, body] of Object.entries(respContent)) {
                if (body.schema?.$ref) out += `        → ${body.schema.$ref.split('/').pop()}\n`;
              }
            }
          }
        }
        out += '\n';
      }

      for (const [name, schema] of Object.entries(schemas)) {
        if (!name.toLowerCase().includes(q)) continue;
        out += `Schema: ${name}\n`;
        if (schema.type) out += `  type: ${schema.type}\n`;
        if (schema.description) out += `  description: ${schema.description.slice(0, 300)}\n`;
        if (schema.required) out += `  required: ${schema.required.join(', ')}\n`;
        if (schema.properties) {
          out += '  properties:\n';
          for (const [prop, pDef] of Object.entries(schema.properties)) {
            const pType = pDef.type || (pDef.$ref ? '→' + pDef.$ref.split('/').pop() : pDef.oneOf ? 'oneOf' : '?');
            out += `    .${prop}: ${pType}`;
            if (pDef.format) out += ` (${pDef.format})`;
            if (pDef.description) out += ` — ${pDef.description.slice(0, 100)}`;
            out += '\n';
          }
        }
        if (schema.enum) out += `  enum: ${schema.enum.join(', ')}\n`;
        if (schema.allOf) out += `  allOf: ${schema.allOf.map(a => a.$ref ? a.$ref.split('/').pop() : 'inline').join(', ')}\n`;
        if (schema.oneOf) out += `  oneOf: ${schema.oneOf.map(a => a.$ref ? a.$ref.split('/').pop() : 'inline').join(', ')}\n`;
        out += '\n';
      }
    }
  }

  const totalMs = Math.round(performance.now() - t0);
  out += `Total: ${totalMs}ms\n`;
  return out;
}
