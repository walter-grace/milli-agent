// Milli-Agent Tool Definitions + Execution
import { execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, copyFileSync, mkdirSync } from 'fs';
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
// TIER 6 — White-Hat Security Analysis
// ═══════════════════════════════════════════

export const DEEP_SECURITY_SCAN_TOOL = {
  type: 'function',
  function: {
    name: 'deep_security_scan',
    description: 'Deep AST-based security scan using semgrep OWASP rules. Finds SQL injection, XSS, command injection, auth bypass, insecure crypto, path traversal — way more accurate than regex. Use after security_scan for thorough analysis.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the repo to scan' },
        ruleset: { type: 'string', description: 'Ruleset: "owasp" (default), "security", "secrets", "all"' },
        language: { type: 'string', description: 'Filter by language: python, javascript, java, go, ruby, etc.' },
      },
      required: ['path'],
    },
  },
};

export const DEPENDENCY_AUDIT_TOOL = {
  type: 'function',
  function: {
    name: 'dependency_audit',
    description: 'Scan dependencies for known CVEs and vulnerabilities. Runs npm audit, pip-audit, cargo audit, or go vuln check depending on the project type. Returns severity, affected versions, and fix recommendations.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the repo to audit' },
      },
      required: ['path'],
    },
  },
};

export const SECRETS_SCAN_TOOL = {
  type: 'function',
  function: {
    name: 'secrets_scan',
    description: 'Scan codebase and git history for leaked secrets using entropy analysis and pattern matching. Finds API keys, tokens, passwords, private keys with high accuracy and low false positives. More thorough than git_secrets_clean.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the repo to scan' },
        scan_history: { type: 'boolean', description: 'Also scan git history, not just current files (default true)' },
      },
      required: ['path'],
    },
  },
};

export const TRIVY_SCAN_TOOL = {
  type: 'function',
  function: {
    name: 'trivy_scan',
    description: 'Container and infrastructure security scanner. Scans Dockerfiles for misconfigurations, dependencies for CVEs, IaC files (Terraform, K8s YAML) for security issues. More comprehensive than dependency_audit for container-based projects.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the repo or Dockerfile to scan' },
        scan_type: { type: 'string', description: 'Type: "fs" (filesystem/deps), "config" (Dockerfile/IaC misconfigs), "all" (both). Default: all' },
      },
      required: ['path'],
    },
  },
};

export const SANDBOX_EXEC_TOOL = {
  type: 'function',
  function: {
    name: 'sandbox_exec',
    description: 'Execute a command in a sandboxed environment on a cloned repo. Use for: running tests, linting, building, or any analysis command. Timeout 30s, no network access, read-only outside repo dir.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Working directory (must be inside a cloned repo)' },
        command: { type: 'string', description: 'Shell command to execute (e.g., "npm test", "python -m pytest", "make lint")' },
        timeout: { type: 'integer', description: 'Timeout in seconds (default 30, max 120)' },
      },
      required: ['path', 'command'],
    },
  },
};

export const PORT_SCAN_TOOL = {
  type: 'function',
  function: {
    name: 'port_scan',
    description: 'Scan repo configs for exposed ports and network security issues. Checks Dockerfiles (EXPOSE), docker-compose, nginx configs, server configs, .env files for port bindings and network exposure.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the repo to scan' },
      },
      required: ['path'],
    },
  },
};

// ═══════════════════════════════════════════
// TIER 7 — Self-Heal (Code Edit + Test)
// ═══════════════════════════════════════════

export const CODE_EDIT_TOOL = {
  type: 'function',
  function: {
    name: 'code_edit',
    description: 'Edit a file by replacing a specific string with new content. Use for applying fixes — find the exact buggy code, replace with the fix. Returns a diff preview. Path must be inside a cloned repo.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file to edit' },
        old_string: { type: 'string', description: 'Exact string to find and replace (must be unique in the file)' },
        new_string: { type: 'string', description: 'Replacement string' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
};

export const CODE_WRITE_TOOL = {
  type: 'function',
  function: {
    name: 'code_write',
    description: 'Write or create a file. Use for creating new files (tests, configs, patches). Path must be inside a cloned repo.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to write to' },
        content: { type: 'string', description: 'File content to write' },
      },
      required: ['path', 'content'],
    },
  },
};

export const SELF_HEAL_TOOL = {
  type: 'function',
  function: {
    name: 'self_heal',
    description: 'Auto-detect and fix issues in a repo. Runs lint/test, identifies failures, applies fixes, re-tests. Use sandbox_exec to verify fixes before committing. Returns a report of what was found and fixed.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the repo to heal' },
        test_command: { type: 'string', description: 'Command to verify fixes (e.g., "npm test", "python -m pytest"). If empty, auto-detects.' },
        fix_type: { type: 'string', description: 'What to fix: "lint" (style/formatting), "security" (vulnerabilities), "errors" (bugs/crashes), "all" (everything). Default: all' },
      },
      required: ['path'],
    },
  },
};

// ═══════════════════════════════════════════
// TIER 8 — Fast File Find + LSP Intelligence
// ═══════════════════════════════════════════

export const FAST_FIND_TOOL = {
  type: 'function',
  function: {
    name: 'fast_find',
    description: 'Ultra-fast file finder using fd (10-100x faster than find). Search by name, extension, pattern, size, modification time. Great for finding files in large repos instantly.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory to search in' },
        pattern: { type: 'string', description: 'Search pattern (regex by default, or use --glob for glob patterns)' },
        extension: { type: 'string', description: 'Filter by extension: py, js, rs, go, etc.' },
        type: { type: 'string', description: 'Type filter: f (file), d (directory), l (symlink)' },
        max_depth: { type: 'integer', description: 'Max directory depth (default: unlimited)' },
        hidden: { type: 'boolean', description: 'Include hidden files (default: false)' },
        size: { type: 'string', description: 'Size filter: +1M (over 1MB), -10k (under 10KB)' },
        changed_within: { type: 'string', description: 'Modified within timeframe: 1h, 2d, 1w' },
      },
      required: ['path'],
    },
  },
};

export const LSP_SYMBOLS_TOOL = {
  type: 'function',
  function: {
    name: 'lsp_symbols',
    description: 'Extract all symbols (functions, classes, methods, variables, types) from a file or directory using language-aware parsing. More accurate than regex — understands syntax. Supports JS/TS, Python, Go, Rust, C/C++, Java, Ruby.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File or directory to analyze' },
        language: { type: 'string', description: 'Language: js, ts, py, go, rs, c, cpp, java, rb. Auto-detected if omitted.' },
        kind: { type: 'string', description: 'Filter by symbol kind: function, class, method, variable, type, interface, export. Default: all' },
      },
      required: ['path'],
    },
  },
};

export const LSP_DEFINITIONS_TOOL = {
  type: 'function',
  function: {
    name: 'lsp_definitions',
    description: 'Find the definition of a symbol — where a function, class, or variable is declared. Follows imports across files. More accurate than grep for finding source definitions.',
    parameters: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Symbol name to find definition for' },
        path: { type: 'string', description: 'Directory or file to search in' },
        language: { type: 'string', description: 'Language hint: js, py, go, rs, etc.' },
      },
      required: ['symbol', 'path'],
    },
  },
};

export const LSP_DIAGNOSTICS_TOOL = {
  type: 'function',
  function: {
    name: 'lsp_diagnostics',
    description: 'Run language-specific diagnostics on code: syntax errors, type errors, unused variables, missing imports. Like running the compiler/linter but structured. Uses language tools (tsc, pylint, go vet, etc.)',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File or directory to check' },
        language: { type: 'string', description: 'Language: js, ts, py, go, rs. Auto-detected if omitted.' },
      },
      required: ['path'],
    },
  },
};

// ═══════════════════════════════════════════
// TIER 9 — API Intelligence
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
// TIER 9 — AST + Structural Analysis
// ═══════════════════════════════════════════

export const AST_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'ast_search',
    description: 'Structural code search using ast-grep. Match AST patterns, not text. Supports JS/TS/Python/Go/Rust/C/C++/Java. Use $$$ for any args, $VAR for capture. Example: pattern="console.log($$$ARGS)" finds all console.log calls.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File or directory to search' },
        pattern: { type: 'string', description: 'AST pattern (e.g. "function $NAME($$$) { $$$BODY }")' },
        language: { type: 'string', description: 'Language: js, ts, py, go, rust, c, cpp, java' },
      },
      required: ['path', 'pattern'],
    },
  },
};

export const SYMBOL_MAP_TOOL = {
  type: 'function',
  function: {
    name: 'symbol_map',
    description: 'Build a complete symbol map of a repo using universal-ctags. Returns JSON of all functions, classes, methods, variables across all files. Use this FIRST when exploring an unknown repo to get instant orientation.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Repo path' },
        kind: { type: 'string', description: 'Filter by kind: function, class, method, variable, type. Default: all' },
      },
      required: ['path'],
    },
  },
};

export const STRUCT_DIFF_TOOL = {
  type: 'function',
  function: {
    name: 'struct_diff',
    description: 'AST-based structural diff using difftastic. Shows logic changes only — ignores whitespace, formatting. Way clearer than git diff for code review.',
    parameters: {
      type: 'object',
      properties: {
        path1: { type: 'string', description: 'First file or commit ref' },
        path2: { type: 'string', description: 'Second file or commit ref' },
        language: { type: 'string', description: 'Optional language hint' },
      },
      required: ['path1', 'path2'],
    },
  },
};

export const SHELL_LINT_TOOL = {
  type: 'function',
  function: {
    name: 'shell_lint',
    description: 'Validate a bash command with shellcheck before execution. Catches unquoted variables, dangerous patterns, POSIX issues. Use BEFORE sandbox_exec.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Bash command to validate' },
      },
      required: ['command'],
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
  DEEP_SECURITY_SCAN_TOOL, DEPENDENCY_AUDIT_TOOL, SECRETS_SCAN_TOOL,
  TRIVY_SCAN_TOOL, SANDBOX_EXEC_TOOL, PORT_SCAN_TOOL,
  CODE_EDIT_TOOL, CODE_WRITE_TOOL, SELF_HEAL_TOOL,
  FAST_FIND_TOOL, LSP_SYMBOLS_TOOL, LSP_DEFINITIONS_TOOL, LSP_DIAGNOSTICS_TOOL,
  AST_SEARCH_TOOL, SYMBOL_MAP_TOOL, STRUCT_DIFF_TOOL, SHELL_LINT_TOOL,
  OPENAPI_SEARCH_TOOL,
];

// ═══════════════════════════════════════════
// Code Mode — 2 generic tools instead of 30
// Inspired by Cloudflare's Code Mode MCP
// Reduces tool def tokens from ~5,600 to ~600
// ═══════════════════════════════════════════

export const TOOL_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'tool_search',
    description: 'Search the catalog of available tools by keyword. Returns tool names and brief descriptions. Use this FIRST to discover what tools exist before calling tool_run.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keywords to search for (e.g. "git", "security", "search files")' },
      },
      required: ['query'],
    },
  },
};

export const TOOL_RUN_TOOL = {
  type: 'function',
  function: {
    name: 'tool_run',
    description: 'Execute any tool by name with arguments. Get tool names from tool_search. Available tool categories: file ops (read_file, list_files, fast_find), search (grep_search, find_references, lsp_symbols, lsp_definitions), git (git_log, git_diff, git_summary, git_authors, git_timeline), analysis (code_stats, dependency_graph, repo_summary, knowledge_graph), security (security_scan, deep_security_scan, dependency_audit, secrets_scan, trivy_scan, port_scan), edit (code_edit, code_write, sandbox_exec, self_heal), api (openapi_search). Use clone_repo to clone GitHub repos.',
    parameters: {
      type: 'object',
      properties: {
        tool: { type: 'string', description: 'Tool name (e.g. read_file, grep_search, deep_security_scan)' },
        args: { type: 'object', description: 'Arguments object for the tool. Common args: path, pattern, query, file, max_results' },
      },
      required: ['tool', 'args'],
    },
  },
};

// Code Mode catalog — used by tool_search
export function buildToolCatalog() {
  return ALL_TOOLS.map(t => ({
    name: t.function.name,
    description: t.function.description,
    required: t.function.parameters.required || [],
    optional: Object.keys(t.function.parameters.properties || {}).filter(k => !(t.function.parameters.required || []).includes(k)),
  }));
}

export function searchToolCatalog(query) {
  const q = query.toLowerCase();
  const catalog = buildToolCatalog();
  const matches = catalog.filter(t =>
    t.name.toLowerCase().includes(q) ||
    t.description.toLowerCase().includes(q)
  );
  if (matches.length === 0) {
    // No match — return all tool names so the LLM can see options
    return {
      query, count: 0,
      message: 'No matches. All available tools:',
      all_tools: catalog.map(t => t.name),
    };
  }
  return {
    query, count: matches.length,
    matches: matches.map(t => ({
      name: t.name,
      desc: t.description.slice(0, 150),
      args: { required: t.required, optional: t.optional },
    })),
  };
}

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
    case 'deep_security_scan': return execDeepSecurityScan(args);
    case 'dependency_audit': return execDependencyAudit(args);
    case 'secrets_scan': return execSecretsScan(args);
    case 'trivy_scan': return execTrivyScan(args);
    case 'sandbox_exec': return execSandboxExec(args);
    case 'port_scan': return execPortScan(args);
    case 'code_edit': return execCodeEdit(args);
    case 'code_write': return execCodeWrite(args);
    case 'self_heal': return execSelfHeal(args);
    case 'fast_find': return execFastFind(args);
    case 'lsp_symbols': return execLspSymbols(args);
    case 'lsp_definitions': return execLspDefinitions(args);
    case 'lsp_diagnostics': return execLspDiagnostics(args);
    case 'ast_search': return execAstSearch(args);
    case 'symbol_map': return execSymbolMap(args);
    case 'struct_diff': return execStructDiff(args);
    case 'shell_lint': return execShellLint(args);
    case 'openapi_search': return execOpenAPISearch(args);
    case 'tool_search': return JSON.stringify(searchToolCatalog(args.query || ''), null, 2);
    case 'tool_run': {
      // Recursive call to executeTool with the inner tool name
      if (!args.tool) return 'Error: tool name required';
      const inner = executeTool(args.tool, args.args || {});
      if (inner !== null) return inner;
      return `Error: unknown tool "${args.tool}". Use tool_search to find available tools.`;
    }
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
    { name: 'SQL Injection', patterns: ['SELECT.*FROM.*WHERE.*\\+', 'INSERT INTO.*\\+.*req', 'query\\(.*\\+.*req'] },
    { name: 'Command Injection', patterns: ['eval\\(.*req', 'os\\.system\\(.*input', 'subprocess\\.call.*shell=True'] },
    { name: 'Insecure Config', patterns: ['debug\\s*=\\s*[Tt]rue', 'verify\\s*=\\s*[Ff]alse', 'disable.*ssl'] },
    { name: 'Sensitive Files', patterns: ['\\.env$', 'private_key', '\\.pem$'] },
  ];

  let out = `Security Scan: ${dirPath}\n${'='.repeat(50)}\n\n`;
  let totalFindings = 0;

  checks.forEach(({ name, patterns }) => {
    let findings = '';
    patterns.forEach(pat => {
      try {
        const result = exec(`rg --no-heading -n -m 5 -i -- "${pat}" "${dirPath}" --glob '!node_modules' --glob '!.git' --glob '!*.lock' --glob '!*.min.js' --glob '!*tools.js' --glob '!*server.js' --glob '!*README*' --glob '!*.zig' 2>/dev/null || true`);
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
// White-Hat Security Tools — Implementations
// ═══════════════════════════════════════════

function execDeepSecurityScan({ path: repoPath, ruleset = 'owasp', language }) {
  if (!existsSync(repoPath)) return `Not found: ${repoPath}`;
  const t0 = performance.now();

  let out = `Deep Security Scan: ${repoPath}\n${'='.repeat(50)}\n`;

  // Check if semgrep is available
  let hasSemgrep = false;
  try { exec('semgrep --version', { timeout: 5000 }); hasSemgrep = true; } catch {}

  if (hasSemgrep) {
    // Run semgrep with specified ruleset
    const ruleMap = {
      'owasp': 'p/owasp-top-ten',
      'security': 'p/security-audit',
      'secrets': 'p/secrets',
      'all': 'p/owasp-top-ten p/security-audit p/secrets',
    };
    const rules = ruleMap[ruleset] || ruleMap.owasp;
    let cmd = `cd "${repoPath}" && semgrep --config ${rules} --json --timeout 60 --max-target-bytes 1000000`;
    if (language) cmd += ` --lang ${language}`;
    cmd += ' 2>/dev/null || true';

    try {
      const result = exec(cmd, { timeout: 120000 });
      const data = JSON.parse(result);
      const findings = data.results || [];

      out += `Ruleset: ${ruleset} | Findings: ${findings.length}\n`;
      if (data.errors?.length) out += `Scan errors: ${data.errors.length}\n`;
      out += '\n';

      // Group by severity
      const bySeverity = { ERROR: [], WARNING: [], INFO: [] };
      findings.forEach(f => {
        const sev = f.extra?.severity || 'WARNING';
        if (!bySeverity[sev]) bySeverity[sev] = [];
        bySeverity[sev].push(f);
      });

      for (const [sev, items] of Object.entries(bySeverity)) {
        if (items.length === 0) continue;
        const icon = sev === 'ERROR' ? '!!' : sev === 'WARNING' ? '!' : 'i';
        out += `[${icon}] ${sev} (${items.length}):\n`;
        items.slice(0, 15).forEach(f => {
          const file = relative(repoPath, f.path || '');
          const line = f.start?.line || '?';
          const rule = f.check_id?.split('.').pop() || 'unknown';
          const msg = f.extra?.message || '';
          out += `  ${file}:${line} [${rule}]\n`;
          out += `    ${msg.slice(0, 200)}\n`;
          if (f.extra?.metadata?.cwe) out += `    CWE: ${f.extra.metadata.cwe}\n`;
          if (f.extra?.fix) out += `    Fix: ${f.extra.fix.slice(0, 150)}\n`;
          out += '\n';
        });
        if (items.length > 15) out += `  ... and ${items.length - 15} more ${sev} findings\n\n`;
      }
    } catch (e) {
      out += `Semgrep error: ${e.message}\n\n`;
    }
  } else {
    // Fallback: enhanced regex-based scan with OWASP categories
    out += `[semgrep not installed — using enhanced regex scan]\n`;
    out += `Install semgrep for AST-based analysis: pip install semgrep\n\n`;

    const owaspChecks = [
      { name: 'A01:2021 Broken Access Control', patterns: [
        'role.*=.*admin', 'isAdmin.*=.*true', 'bypass.*auth', 'permitAll',
        'AllowAnonymous', '@NoAuth', 'skip.*auth', 'disable.*csrf'
      ]},
      { name: 'A02:2021 Cryptographic Failures', patterns: [
        'MD5|md5', 'SHA1|sha1[^_]', 'DES\\b', 'ECB', 'Math\\.random',
        'random\\(\\)', 'http://(?!localhost|127\\.0)', 'verify.*=.*false', 'ssl.*=.*false'
      ]},
      { name: 'A03:2021 Injection', patterns: [
        'eval\\(', 'os\\.system\\(',
        'subprocess\\.call.*shell.*True', 'Runtime\\.exec',
        'innerHTML.*=', 'document\\.write\\('
      ]},
      { name: 'A04:2021 Insecure Design', patterns: [
        'TODO.*secur|FIXME.*secur|HACK.*auth', 'password.*=.*password',
        'rate.*limit.*disable', 'throttle.*=.*0'
      ]},
      { name: 'A05:2021 Security Misconfiguration', patterns: [
        'debug.*=.*[Tt]rue', 'DEBUG.*=.*1', 'CORS.*\\*',
        'Access-Control-Allow-Origin.*\\*', 'AllowAll', 'chmod.*777',
        'expose.*port|EXPOSE'
      ]},
      { name: 'A07:2021 Auth Failures', patterns: [
        'password.*=.*[a-zA-Z0-9]{8,}', 'api[_-]?key.*=.*[a-zA-Z0-9]',
        'hardcoded.*password|password.*hardcoded'
      ]},
      { name: 'A08:2021 Software Integrity', patterns: [
        'http://.*\\.js["\'>]', 'integrity.*=.*false', 'verify.*signature.*false',
        'npm.*--no-verify', 'pip.*--trusted-host'
      ]},
      { name: 'A09:2021 Logging Failures', patterns: [
        'console\\.log.*password|console\\.log.*token',
        'print.*password|logging.*password',
        'log\\..*password'
      ]},
      { name: 'A10:2021 SSRF', patterns: [
        'fetch\\(.*req\\.|axios.*req\\.(?:body|query|params)',
        'requests\\.get\\(.*input|urllib.*input',
        'http\\.get\\(.*user|url.*=.*req\\.'
      ]},
    ];

    let totalFindings = 0;
    const langFilter = language ? `--type ${language}` : '';
    const excludes = "--glob '!node_modules' --glob '!.git' --glob '!*.lock' --glob '!*.min.js' --glob '!vendor' --glob '!dist' --glob '!*tools.js' --glob '!*server.js' --glob '!*server.py' --glob '!*README*' --glob '!*.zig'";

    for (const check of owaspChecks) {
      let findings = '';
      for (const pat of check.patterns) {
        try {
          const result = exec(`rg --no-heading -n -m 5 -i ${langFilter} ${excludes} -- "${pat}" "${repoPath}" 2>/dev/null || true`, { timeout: 10000 });
          if (result.trim()) {
            result.trim().split('\n').slice(0, 3).forEach(l => {
              findings += `    ${relative(repoPath, l.split(':')[0])}:${l.split(':')[1]} ${l.split(':').slice(2).join(':').trim().slice(0, 120)}\n`;
            });
          }
        } catch {}
      }
      if (findings) {
        const count = findings.trim().split('\n').length;
        totalFindings += count;
        out += `[!] ${check.name} (${count} findings):\n${findings}\n`;
      } else {
        out += `[ok] ${check.name}: clean\n`;
      }
    }

    out += `\n${'='.repeat(50)}\n`;
    out += `Total: ${totalFindings} potential issues (OWASP Top 10 categories)\n`;
    out += `Note: Regex-based scan — install semgrep for AST-level accuracy\n`;
  }

  const totalMs = Math.round(performance.now() - t0);
  out += `\nScan time: ${totalMs}ms\n`;
  return out;
}

function execDependencyAudit({ path: repoPath }) {
  if (!existsSync(repoPath)) return `Not found: ${repoPath}`;
  const t0 = performance.now();

  let out = `Dependency Audit: ${repoPath}\n${'='.repeat(50)}\n\n`;
  let found = false;

  // Node.js — npm audit
  if (existsSync(resolve(repoPath, 'package-lock.json')) || existsSync(resolve(repoPath, 'package.json'))) {
    found = true;
    out += `## Node.js (npm audit)\n`;
    try {
      // npm audit returns non-zero on vulnerabilities, so we capture both
      const result = exec(`cd "${repoPath}" && npm audit --json 2>/dev/null || true`, { timeout: 30000 });
      try {
        const audit = JSON.parse(result);
        const vulns = audit.vulnerabilities || {};
        const meta = audit.metadata || {};
        const total = meta.vulnerabilities || {};

        out += `Packages scanned: ${meta.dependencies?.total || '?'}\n`;
        out += `Vulnerabilities: critical=${total.critical||0} high=${total.high||0} moderate=${total.moderate||0} low=${total.low||0}\n\n`;

        // Show top vulnerabilities
        const sorted = Object.entries(vulns).sort((a, b) => {
          const sevOrder = { critical: 0, high: 1, moderate: 2, low: 3 };
          return (sevOrder[a[1].severity] || 4) - (sevOrder[b[1].severity] || 4);
        });

        sorted.slice(0, 20).forEach(([name, v]) => {
          out += `  [${(v.severity || '?').toUpperCase()}] ${name}@${v.range || '?'}\n`;
          if (v.via && Array.isArray(v.via)) {
            v.via.filter(x => typeof x === 'object').slice(0, 2).forEach(via => {
              out += `    ${via.title || via.name || ''}\n`;
              if (via.url) out += `    ${via.url}\n`;
            });
          }
          if (v.fixAvailable) {
            const fix = typeof v.fixAvailable === 'object' ? `update ${v.fixAvailable.name} to ${v.fixAvailable.version}` : 'fix available';
            out += `    Fix: ${fix}\n`;
          }
          out += '\n';
        });
        if (sorted.length > 20) out += `  ... and ${sorted.length - 20} more\n`;
      } catch {
        // npm audit plain text output
        out += result.slice(0, 2000) + '\n';
      }
    } catch (e) {
      out += `npm audit failed: ${e.message}\n`;
    }
    out += '\n';
  }

  // Python — pip-audit or safety check
  if (existsSync(resolve(repoPath, 'requirements.txt')) || existsSync(resolve(repoPath, 'pyproject.toml'))) {
    found = true;
    out += `## Python\n`;

    // Try pip-audit first
    let audited = false;
    try {
      const reqFile = existsSync(resolve(repoPath, 'requirements.txt')) ? 'requirements.txt' : '';
      if (reqFile) {
        const result = exec(`cd "${repoPath}" && pip-audit -r ${reqFile} --format json 2>/dev/null || true`, { timeout: 30000 });
        const data = JSON.parse(result);
        if (Array.isArray(data)) {
          const vulns = data.filter(d => d.vulns && d.vulns.length > 0);
          out += `Packages scanned: ${data.length}\n`;
          out += `Vulnerable: ${vulns.length}\n\n`;
          vulns.slice(0, 15).forEach(pkg => {
            pkg.vulns.forEach(v => {
              out += `  [${v.fix_versions?.length ? 'FIXABLE' : 'NO FIX'}] ${pkg.name}@${pkg.version}\n`;
              out += `    ${v.id}: ${v.description?.slice(0, 150) || ''}\n`;
              if (v.fix_versions?.length) out += `    Fix: upgrade to ${v.fix_versions.join(' or ')}\n`;
              out += '\n';
            });
          });
          audited = true;
        }
      }
    } catch {}

    if (!audited) {
      // Fallback: check requirements.txt against known patterns
      try {
        const reqFile = resolve(repoPath, 'requirements.txt');
        if (existsSync(reqFile)) {
          const deps = readFileSync(reqFile, 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#'));
          out += `Packages found: ${deps.length}\n`;
          out += `[pip-audit not installed — showing deps only]\n`;
          out += `Install for CVE scanning: pip install pip-audit\n\n`;
          // Check for known risky packages
          const risky = ['pyyaml<6', 'requests<2.25', 'django<3', 'flask<2', 'pillow<9', 'urllib3<1.26', 'cryptography<3'];
          deps.forEach(d => {
            const lower = d.toLowerCase();
            const isRisky = risky.some(r => lower.startsWith(r.split('<')[0]) && lower.includes('=='));
            if (isRisky) out += `  [!] ${d.trim()} — may have known vulnerabilities\n`;
          });
        }
      } catch {}
    }
    out += '\n';
  }

  // Go — govulncheck
  if (existsSync(resolve(repoPath, 'go.mod'))) {
    found = true;
    out += `## Go\n`;
    try {
      const result = exec(`cd "${repoPath}" && govulncheck ./... 2>/dev/null || true`, { timeout: 30000 });
      if (result.includes('No vulnerabilities')) {
        out += `No known vulnerabilities found.\n`;
      } else {
        out += result.slice(0, 2000) + '\n';
      }
    } catch {
      // Fallback: check go.sum for known vulnerable modules
      out += `[govulncheck not installed]\n`;
      out += `Install: go install golang.org/x/vuln/cmd/govulncheck@latest\n`;
    }
    out += '\n';
  }

  // Rust — cargo audit
  if (existsSync(resolve(repoPath, 'Cargo.lock'))) {
    found = true;
    out += `## Rust\n`;
    try {
      const result = exec(`cd "${repoPath}" && cargo audit --json 2>/dev/null || true`, { timeout: 30000 });
      try {
        const data = JSON.parse(result);
        const vulns = data.vulnerabilities?.list || [];
        out += `Vulnerabilities: ${vulns.length}\n\n`;
        vulns.slice(0, 15).forEach(v => {
          out += `  [${v.advisory?.id}] ${v.advisory?.package || '?'}\n`;
          out += `    ${v.advisory?.title || ''}\n`;
          if (v.advisory?.url) out += `    ${v.advisory.url}\n`;
          if (v.versions?.patched?.length) out += `    Fix: ${v.versions.patched.join(', ')}\n`;
          out += '\n';
        });
      } catch {
        out += result.slice(0, 1000) + '\n';
      }
    } catch {
      out += `[cargo-audit not installed]\n`;
      out += `Install: cargo install cargo-audit\n`;
    }
    out += '\n';
  }

  if (!found) {
    out += `No supported package managers found.\n`;
    out += `Supported: package.json (npm), requirements.txt (pip), go.mod (Go), Cargo.lock (Rust)\n`;
  }

  const totalMs = Math.round(performance.now() - t0);
  out += `Audit time: ${totalMs}ms\n`;
  return out;
}

function execSecretsScan({ path: repoPath, scan_history = true }) {
  if (!existsSync(repoPath)) return `Not found: ${repoPath}`;
  const t0 = performance.now();

  let out = `Secrets Scan: ${repoPath}\n${'='.repeat(50)}\n\n`;

  // Check if gitleaks is available
  let hasGitleaks = false;
  try { exec('gitleaks version', { timeout: 5000 }); hasGitleaks = true; } catch {}

  if (hasGitleaks) {
    try {
      const mode = scan_history && existsSync(resolve(repoPath, '.git')) ? 'detect' : 'detect --no-git';
      const result = exec(`cd "${repoPath}" && gitleaks ${mode} --report-format json --report-path /dev/stdout 2>/dev/null || true`, { timeout: 60000 });
      const findings = JSON.parse(result || '[]');

      out += `Scanner: gitleaks\n`;
      out += `Mode: ${scan_history ? 'files + git history' : 'files only'}\n`;
      out += `Findings: ${findings.length}\n\n`;

      // Group by rule
      const byRule = {};
      findings.forEach(f => {
        const rule = f.RuleID || 'unknown';
        if (!byRule[rule]) byRule[rule] = [];
        byRule[rule].push(f);
      });

      for (const [rule, items] of Object.entries(byRule)) {
        out += `[!!] ${rule} (${items.length}):\n`;
        items.slice(0, 5).forEach(f => {
          const file = f.File || '?';
          const line = f.StartLine || '?';
          const commit = f.Commit?.slice(0, 8) || '';
          // Redact the actual secret
          const match = (f.Match || '').replace(/([A-Za-z0-9+/=_-]{6})[A-Za-z0-9+/=_-]{6,}/g, '$1********');
          out += `  ${file}:${line}`;
          if (commit) out += ` (commit ${commit})`;
          out += `\n    ${match.slice(0, 120)}\n`;
          if (f.Author) out += `    Author: ${f.Author}\n`;
          if (f.Date) out += `    Date: ${f.Date}\n`;
          out += '\n';
        });
        if (items.length > 5) out += `  ... and ${items.length - 5} more\n\n`;
      }
    } catch (e) {
      out += `Gitleaks error: ${e.message}\n\n`;
    }
  } else {
    // Enhanced fallback: entropy-based + pattern matching
    out += `[gitleaks not installed — using enhanced pattern + entropy scan]\n`;
    out += `Install gitleaks for comprehensive detection: brew install gitleaks\n\n`;

    const secretPatterns = [
      { name: 'AWS Access Key', pattern: 'AKIA[0-9A-Z]{16}' },
      { name: 'AWS Secret Key', pattern: 'aws_secret_access_key.*[A-Za-z0-9/+=]{40}' },
      { name: 'GitHub Token', pattern: 'gh[ps]_[A-Za-z0-9_]{36,}' },
      { name: 'GitLab Token', pattern: 'glpat-[A-Za-z0-9-]{20,}' },
      { name: 'Slack Token', pattern: 'xox[bpors]-[0-9a-zA-Z-]{10,}' },
      { name: 'OpenAI Key', pattern: 'sk-[a-zA-Z0-9]{20,}' },
      { name: 'OpenRouter Key', pattern: 'sk-or-v1-[a-f0-9]{64}' },
      { name: 'Google API Key', pattern: 'AIza[0-9A-Za-z-_]{35}' },
      { name: 'Stripe Key', pattern: 'sk_live_[0-9a-zA-Z]{24,}' },
      { name: 'Twilio Key', pattern: 'SK[0-9a-fA-F]{32}' },
      { name: 'SendGrid Key', pattern: 'SG\\.[A-Za-z0-9-_]{22,}' },
      { name: 'Private Key', pattern: 'BEGIN.*(RSA|EC|DSA|OPENSSH|PGP).*PRIVATE KEY' },
      { name: 'JWT Token', pattern: 'eyJ[A-Za-z0-9_-]{10,}\\.eyJ[A-Za-z0-9_-]{10,}' },
      { name: 'Generic High-Entropy', pattern: '[A-Za-z0-9+/=_-]{40,}' },
    ];

    let totalFindings = 0;
    const excludes = "--glob '!node_modules' --glob '!.git' --glob '!*.lock' --glob '!*.min.js' --glob '!vendor' --glob '!dist' --glob '!*.map' --glob '!*tools.js' --glob '!*server.js' --glob '!*server.py' --glob '!*.test.*' --glob '!*fixture*' --glob '!*.zig' --glob '!*README*'";

    // Scan current files
    out += `## Current Files\n`;
    for (const { name, pattern } of secretPatterns) {
      try {
        const result = exec(`rg --no-heading -n -m 10 ${excludes} -- "${pattern}" "${repoPath}" 2>/dev/null || true`, { timeout: 10000 });
        if (result.trim()) {
          const lines = result.trim().split('\n');
          totalFindings += lines.length;
          out += `  [!!] ${name} (${lines.length} match${lines.length > 1 ? 'es' : ''}):\n`;
          lines.slice(0, 3).forEach(l => {
            const redacted = l.replace(/([A-Za-z0-9+/=_-]{6})[A-Za-z0-9+/=_-]{8,}/g, '$1********');
            out += `    ${relative(repoPath, redacted.split(':')[0])}:${redacted.split(':').slice(1).join(':').trim().slice(0, 120)}\n`;
          });
          if (lines.length > 3) out += `    ... and ${lines.length - 3} more\n`;
          out += '\n';
        }
      } catch {}
    }

    // Scan git history if requested
    if (scan_history && existsSync(resolve(repoPath, '.git'))) {
      out += `## Git History\n`;
      let historyFindings = 0;
      for (const { name, pattern } of secretPatterns.slice(0, 8)) { // limit to top patterns for speed
        try {
          const result = exec(`cd "${repoPath}" && git log --all -p --format="COMMIT:%H %an %ai" -S "${pattern}" 2>/dev/null | rg -m 5 "COMMIT:|${pattern}" 2>/dev/null || true`, { timeout: 15000 });
          const matches = result.trim().split('\n').filter(l => l.trim() && !l.startsWith('COMMIT:'));
          if (matches.length > 0 && matches[0] !== '') {
            historyFindings += matches.length;
            out += `  [!!] ${name} in git history (${matches.length} match${matches.length > 1 ? 'es' : ''}):\n`;
            result.trim().split('\n').filter(l => l.startsWith('COMMIT:')).slice(0, 3).forEach(l => {
              out += `    ${l.replace('COMMIT:', '').trim()}\n`;
            });
            out += '\n';
          }
        } catch {}
      }
      if (historyFindings === 0) out += `  No secrets found in git history.\n\n`;
      totalFindings += historyFindings;
    }

    out += `${'='.repeat(50)}\n`;
    out += `Total: ${totalFindings} potential secrets found\n`;
    if (totalFindings > 0) {
      out += `\nRecommended actions:\n`;
      out += `  1. Rotate any exposed keys immediately\n`;
      out += `  2. Add patterns to .gitignore\n`;
      out += `  3. Use environment variables instead of hardcoded secrets\n`;
      out += `  4. Run 'gitleaks detect' for comprehensive scanning\n`;
      out += `  5. Use BFG Repo-Cleaner to remove secrets from git history\n`;
    }
  }

  const totalMs = Math.round(performance.now() - t0);
  out += `\nScan time: ${totalMs}ms\n`;
  return out;
}

// ═══════════════════════════════════════════
// Self-Heal — Code Edit, Write, Auto-Fix
// ═══════════════════════════════════════════

function isInsideRepo(filePath) {
  const repoBase = resolve(process.env.HOME || '/root', 'milli-repos');
  const resolved = resolve(filePath);
  return resolved.startsWith(repoBase) || resolved.startsWith('/tmp/repos') || resolved.startsWith('/tmp/milli-');
}

function execCodeEdit({ path: filePath, old_string, new_string }) {
  if (!filePath || !existsSync(filePath)) return `File not found: ${filePath}`;
  if (!isInsideRepo(filePath)) return `Security: can only edit files inside cloned repos. Got: ${filePath}`;
  if (!old_string) return 'old_string is required';
  if (old_string === new_string) return 'old_string and new_string are identical';

  const content = readFileSync(filePath, 'utf8');
  const count = content.split(old_string).length - 1;

  if (count === 0) return `String not found in ${filePath}. Make sure old_string matches exactly (including whitespace).`;
  if (count > 1) return `Found ${count} occurrences of old_string in ${filePath}. Must be unique — add more context to disambiguate.`;

  // Create backup
  const backupPath = filePath + '.milli-backup';
  copyFileSync(filePath, backupPath);

  // Apply edit
  const newContent = content.replace(old_string, new_string);
  writeFileSync(filePath, newContent, 'utf8');

  // Generate diff preview
  const oldLines = old_string.split('\n');
  const newLines = new_string.split('\n');
  let diff = `Edit applied: ${filePath}\n${'='.repeat(50)}\n\n`;
  diff += `Backup: ${backupPath}\n\n`;
  diff += `--- before\n+++ after\n\n`;
  oldLines.forEach(l => diff += `- ${l}\n`);
  newLines.forEach(l => diff += `+ ${l}\n`);
  diff += `\n${oldLines.length} line(s) removed, ${newLines.length} line(s) added\n`;

  return diff;
}

function execCodeWrite({ path: filePath, content }) {
  if (!filePath) return 'path is required';
  if (!isInsideRepo(filePath)) return `Security: can only write files inside cloned repos. Got: ${filePath}`;

  // Create directory if needed
  const dir = resolve(filePath, '..');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const existed = existsSync(filePath);
  if (existed) {
    copyFileSync(filePath, filePath + '.milli-backup');
  }

  writeFileSync(filePath, content, 'utf8');
  const lines = content.split('\n').length;
  const bytes = Buffer.byteLength(content);

  return `${existed ? 'Updated' : 'Created'}: ${filePath}\n${lines} lines, ${bytes} bytes${existed ? '\nBackup: ' + filePath + '.milli-backup' : ''}`;
}

function execSelfHeal({ path: repoPath, test_command, fix_type = 'all' }) {
  if (!existsSync(repoPath)) return `Not found: ${repoPath}`;
  if (!isInsideRepo(repoPath)) return `Security: can only heal repos inside cloned repos directory.`;
  const t0 = performance.now();

  let out = `Self-Heal Report: ${repoPath}\n${'='.repeat(50)}\n\n`;

  // Step 1: Auto-detect project type and test command
  let testCmd = test_command;
  let lintCmd = null;
  let projectType = 'unknown';

  if (existsSync(resolve(repoPath, 'package.json'))) {
    projectType = 'node';
    if (!testCmd) {
      try {
        const pkg = JSON.parse(readFileSync(resolve(repoPath, 'package.json'), 'utf8'));
        if (pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') testCmd = 'npm test';
        if (pkg.scripts?.lint) lintCmd = 'npm run lint';
      } catch {}
    }
  } else if (existsSync(resolve(repoPath, 'pyproject.toml')) || existsSync(resolve(repoPath, 'setup.py'))) {
    projectType = 'python';
    if (!testCmd) testCmd = 'python -m pytest --tb=short 2>&1 || python -m unittest discover 2>&1';
    lintCmd = 'python -m flake8 --max-line-length=120 --count 2>&1 || true';
  } else if (existsSync(resolve(repoPath, 'go.mod'))) {
    projectType = 'go';
    if (!testCmd) testCmd = 'go test ./... 2>&1';
    lintCmd = 'go vet ./... 2>&1';
  } else if (existsSync(resolve(repoPath, 'Cargo.toml'))) {
    projectType = 'rust';
    if (!testCmd) testCmd = 'cargo test 2>&1';
    lintCmd = 'cargo clippy 2>&1 || true';
  }

  out += `Project: ${projectType}\n`;
  out += `Test: ${testCmd || 'none detected'}\n`;
  out += `Lint: ${lintCmd || 'none detected'}\n\n`;

  // Step 2: Run initial diagnostics
  const issues = [];

  // Lint check
  if ((fix_type === 'lint' || fix_type === 'all') && lintCmd) {
    out += `## Lint Check\n`;
    try {
      const lintResult = exec(`cd "${repoPath}" && ${lintCmd}`, { timeout: 30000 });
      const lintLines = lintResult.trim().split('\n').filter(l => l.trim());
      if (lintLines.length > 0 && !lintResult.includes('0 errors')) {
        out += `Found ${lintLines.length} lint issues:\n`;
        lintLines.slice(0, 10).forEach(l => {
          out += `  ${l}\n`;
          issues.push({ type: 'lint', detail: l });
        });
      } else {
        out += `Clean — no lint issues\n`;
      }
    } catch (e) {
      if (e.stdout) {
        const lines = e.stdout.trim().split('\n').filter(l => l.trim());
        out += `Found ${lines.length} lint issues:\n`;
        lines.slice(0, 10).forEach(l => {
          out += `  ${l}\n`;
          issues.push({ type: 'lint', detail: l });
        });
      }
    }
    out += '\n';
  }

  // Test check
  if ((fix_type === 'errors' || fix_type === 'all') && testCmd) {
    out += `## Test Check\n`;
    try {
      const testResult = exec(`cd "${repoPath}" && ${testCmd}`, { timeout: 60000 });
      out += `Tests passed\n`;
      out += testResult.split('\n').slice(-5).join('\n') + '\n';
    } catch (e) {
      out += `Tests FAILED:\n`;
      const output = (e.stdout || '') + (e.stderr || '');
      const failLines = output.split('\n').filter(l =>
        l.match(/FAIL|ERROR|error|failed|assert|expect/i)
      ).slice(0, 15);
      failLines.forEach(l => {
        out += `  ${l}\n`;
        issues.push({ type: 'test_failure', detail: l });
      });
      // Show full output tail
      out += '\n  ...\n' + output.split('\n').slice(-10).join('\n') + '\n';
    }
    out += '\n';
  }

  // Security quick check
  if (fix_type === 'security' || fix_type === 'all') {
    out += `## Security Quick Check\n`;
    const secPatterns = [
      { name: 'eval/exec', pattern: 'eval\\(|exec\\(' },
      { name: 'SQL concat', pattern: 'query.*\\+' },
      { name: 'HTTP non-TLS', pattern: 'http://(?!localhost|127\\.0)' },
      { name: 'Hardcoded secret', pattern: 'password.*=.*[a-zA-Z0-9]{8,}' },
    ];
    const excludes = "--glob '!node_modules' --glob '!.git' --glob '!*.lock' --glob '!vendor' --glob '!dist'";
    for (const { name, pattern } of secPatterns) {
      try {
        const result = exec(`rg --no-heading -n -c ${excludes} -- "${pattern}" "${repoPath}" 2>/dev/null || true`, { timeout: 5000 });
        const matches = result.trim().split('\n').filter(l => l.trim());
        if (matches.length > 0) {
          const count = matches.reduce((sum, l) => sum + parseInt(l.split(':').pop() || 0), 0);
          out += `  [!] ${name}: ${count} occurrences in ${matches.length} files\n`;
          issues.push({ type: 'security', detail: `${name}: ${count} occurrences` });
        }
      } catch {}
    }
    if (issues.filter(i => i.type === 'security').length === 0) out += `  Clean — no common issues\n`;
    out += '\n';
  }

  // Step 3: Summary + healing suggestions
  out += `## Summary\n`;
  out += `Total issues: ${issues.length}\n`;

  const byType = {};
  issues.forEach(i => { byType[i.type] = (byType[i.type] || 0) + 1; });
  Object.entries(byType).forEach(([type, count]) => {
    out += `  ${type}: ${count}\n`;
  });

  if (issues.length > 0) {
    out += `\n## How to Self-Heal\n`;
    out += `Use these tools in sequence:\n`;
    out += `  1. grep_search — find the exact code causing each issue\n`;
    out += `  2. read_file — understand the context\n`;
    out += `  3. code_edit — apply the fix (old_string → new_string)\n`;
    out += `  4. sandbox_exec — run "${testCmd || 'tests'}" to verify\n`;
    out += `  5. Repeat until all issues are resolved\n`;
    out += `\nThe LLM can chain these tools automatically.\n`;
    out += `Ask: "Fix all ${issues.length} issues in this repo"\n`;
  } else {
    out += `\nNo issues found — code is healthy!\n`;
  }

  const totalMs = Math.round(performance.now() - t0);
  out += `\nHeal time: ${totalMs}ms\n`;
  return out;
}

// ═══════════════════════════════════════════
// Trivy, Sandbox Exec, Port Scan — Implementations
// ═══════════════════════════════════════════

function execTrivyScan({ path: repoPath, scan_type = 'all' }) {
  if (!existsSync(repoPath)) return `Not found: ${repoPath}`;
  const t0 = performance.now();

  let out = `Trivy Security Scan: ${repoPath}\n${'='.repeat(50)}\n\n`;

  // Check if trivy is available
  let hasTrivy = false;
  try { exec('trivy --version', { timeout: 5000 }); hasTrivy = true; } catch {}

  if (hasTrivy) {
    // Filesystem scan (dependencies + vulnerabilities)
    if (scan_type === 'fs' || scan_type === 'all') {
      out += `## Filesystem Scan (CVEs in dependencies)\n`;
      try {
        const result = exec(`trivy fs --format json --timeout 120s "${repoPath}" 2>/dev/null || true`, { timeout: 130000 });
        const data = JSON.parse(result);
        const results = data.Results || [];
        let totalVulns = 0;

        results.forEach(r => {
          const vulns = r.Vulnerabilities || [];
          if (vulns.length === 0) return;
          totalVulns += vulns.length;
          out += `\n  ${r.Target} (${r.Type || '?'}):\n`;

          // Group by severity
          const bySev = { CRITICAL: [], HIGH: [], MEDIUM: [], LOW: [] };
          vulns.forEach(v => { const s = v.Severity || 'UNKNOWN'; if (!bySev[s]) bySev[s] = []; bySev[s].push(v); });

          for (const [sev, items] of Object.entries(bySev)) {
            if (items.length === 0) continue;
            out += `    [${sev}] ${items.length} vulnerabilities:\n`;
            items.slice(0, 5).forEach(v => {
              out += `      ${v.VulnerabilityID}: ${v.PkgName}@${v.InstalledVersion}`;
              if (v.FixedVersion) out += ` → fix: ${v.FixedVersion}`;
              out += `\n`;
              if (v.Title) out += `        ${v.Title.slice(0, 120)}\n`;
            });
            if (items.length > 5) out += `      ... and ${items.length - 5} more\n`;
          }
        });
        out += `\n  Total: ${totalVulns} vulnerabilities found\n\n`;
      } catch (e) {
        out += `  Error: ${e.message}\n\n`;
      }
    }

    // Config scan (Dockerfile, K8s, Terraform misconfigs)
    if (scan_type === 'config' || scan_type === 'all') {
      out += `## Config Scan (Dockerfile/IaC misconfigurations)\n`;
      try {
        const result = exec(`trivy config --format json --timeout 60s "${repoPath}" 2>/dev/null || true`, { timeout: 70000 });
        const data = JSON.parse(result);
        const results = data.Results || [];
        let totalMisconfigs = 0;

        results.forEach(r => {
          const misconfigs = r.Misconfigurations || [];
          if (misconfigs.length === 0) return;
          totalMisconfigs += misconfigs.length;
          out += `\n  ${r.Target}:\n`;
          misconfigs.slice(0, 10).forEach(m => {
            out += `    [${m.Severity}] ${m.ID}: ${m.Title}\n`;
            if (m.Message) out += `      ${m.Message.slice(0, 150)}\n`;
            if (m.Resolution) out += `      Fix: ${m.Resolution.slice(0, 120)}\n`;
          });
          if (misconfigs.length > 10) out += `    ... and ${misconfigs.length - 10} more\n`;
        });
        out += `\n  Total: ${totalMisconfigs} misconfigurations found\n\n`;
      } catch (e) {
        out += `  Error: ${e.message}\n\n`;
      }
    }
  } else {
    // Fallback: manual Dockerfile + config analysis
    out += `[trivy not installed — using manual config analysis]\n`;
    out += `Install: brew install trivy (or apt-get install trivy)\n\n`;

    // Scan Dockerfiles
    const dockerfiles = [];
    try {
      const found = exec(`find "${repoPath}" -name "Dockerfile*" -not -path "*/.git/*" -not -path "*/node_modules/*" 2>/dev/null | head -10`).trim();
      if (found) found.split('\n').forEach(f => dockerfiles.push(f));
    } catch {}

    if (dockerfiles.length > 0) {
      out += `## Dockerfile Analysis\n`;
      dockerfiles.forEach(df => {
        const rel = relative(repoPath, df);
        const content = readFileSync(df, 'utf8');
        const issues = [];

        // Common Dockerfile misconfigurations
        if (content.match(/FROM\s+\S+\s*$/m) && !content.includes(':')) issues.push('Using latest tag (pin versions)');
        if (content.includes('USER root') || (!content.includes('USER ') && content.includes('RUN '))) issues.push('Running as root (add USER directive)');
        if (content.match(/EXPOSE\s+22\b/)) issues.push('SSH port 22 exposed');
        if (content.includes('--no-check-certificate') || content.includes('--insecure')) issues.push('Insecure download (no cert verification)');
        if (content.match(/ENV\s+\w*(PASSWORD|SECRET|TOKEN|KEY)\w*\s*=/i)) issues.push('Secret in ENV variable (use build args or secrets)');
        if (content.includes('ADD ') && !content.includes('ADD --chown')) issues.push('Using ADD instead of COPY (ADD can auto-extract archives)');
        if (content.match(/chmod\s+777/)) issues.push('chmod 777 (overly permissive)');
        if (content.match(/apt-get\s+install/) && !content.includes('--no-install-recommends')) issues.push('Missing --no-install-recommends (bloated image)');
        if (!content.includes('HEALTHCHECK')) issues.push('No HEALTHCHECK defined');
        const exposes = content.match(/EXPOSE\s+(\d+)/g) || [];

        out += `  ${rel}:\n`;
        out += `    Ports: ${exposes.map(e => e.split(/\s+/)[1]).join(', ') || 'none'}\n`;
        if (issues.length > 0) {
          issues.forEach(i => out += `    [!] ${i}\n`);
        } else {
          out += `    [ok] No common misconfigurations found\n`;
        }
        out += '\n';
      });
    }

    // Scan docker-compose
    try {
      const composeFiles = exec(`find "${repoPath}" -name "docker-compose*" -not -path "*/.git/*" 2>/dev/null | head -5`).trim();
      if (composeFiles) {
        out += `## Docker Compose\n`;
        composeFiles.split('\n').forEach(f => {
          const content = readFileSync(f, 'utf8');
          const rel = relative(repoPath, f);
          const issues = [];
          if (content.includes('privileged: true')) issues.push('Privileged container');
          if (content.includes('network_mode: host')) issues.push('Host network mode');
          if (content.match(/\d+:\d+/g)?.some(p => p.startsWith('0.0.0.0'))) issues.push('Binding to 0.0.0.0');
          if (content.match(/environment:[\s\S]*?(PASSWORD|SECRET|TOKEN)/i)) issues.push('Secrets in environment');
          out += `  ${rel}: ${issues.length > 0 ? issues.join(', ') : 'ok'}\n`;
        });
        out += '\n';
      }
    } catch {}

    // Scan K8s YAML
    try {
      const k8sFiles = exec(`rg -l "apiVersion.*v1|kind.*Deployment|kind.*Pod" --glob "*.yaml" --glob "*.yml" "${repoPath}" 2>/dev/null | head -10`).trim();
      if (k8sFiles) {
        out += `## Kubernetes Manifests\n`;
        k8sFiles.split('\n').forEach(f => {
          const content = readFileSync(f, 'utf8');
          const rel = relative(repoPath, f);
          const issues = [];
          if (content.includes('privileged: true')) issues.push('Privileged container');
          if (content.includes('runAsRoot: true') || content.includes('runAsUser: 0')) issues.push('Running as root');
          if (content.includes('hostNetwork: true')) issues.push('Host network');
          if (content.includes('hostPath:')) issues.push('Host path mount');
          if (!content.includes('resources:')) issues.push('No resource limits');
          if (!content.includes('readOnlyRootFilesystem')) issues.push('Writable root filesystem');
          out += `  ${rel}: ${issues.length > 0 ? issues.join(', ') : 'ok'}\n`;
        });
        out += '\n';
      }
    } catch {}
  }

  const totalMs = Math.round(performance.now() - t0);
  out += `Scan time: ${totalMs}ms\n`;
  return out;
}

function execSandboxExec({ path: workDir, command, timeout: timeoutSec = 30 }) {
  if (!existsSync(workDir)) return `Not found: ${workDir}`;

  // Security: validate the path is inside a cloned repo directory
  const repoBase = resolve(process.env.HOME || '/root', 'milli-repos');
  const tmpBase = '/tmp/repos';
  const resolvedPath = resolve(workDir);

  if (!resolvedPath.startsWith(repoBase) && !resolvedPath.startsWith(tmpBase) && !resolvedPath.startsWith('/tmp/')) {
    return `Sandbox error: path must be inside a cloned repo (${repoBase} or /tmp/). Got: ${resolvedPath}`;
  }

  // Sanitize command — block dangerous patterns
  const blocked = ['rm -rf /', 'mkfs', 'dd if=', ':(){', 'fork bomb', '> /dev/sd', 'chmod -R 777 /', 'curl.*|.*sh', 'wget.*|.*sh'];
  const cmdLower = command.toLowerCase();
  for (const b of blocked) {
    if (cmdLower.includes(b.toLowerCase())) {
      return `Sandbox error: blocked dangerous command pattern "${b}"`;
    }
  }

  const maxTimeout = Math.min(timeoutSec, 120) * 1000;
  const t0 = performance.now();

  let out = `Sandbox Exec: ${workDir}\n${'='.repeat(50)}\n`;
  out += `Command: ${command}\n`;
  out += `Timeout: ${timeoutSec}s\n\n`;

  try {
    const result = exec(`cd "${resolvedPath}" && ${command}`, {
      timeout: maxTimeout,
      maxBuffer: 1024 * 1024, // 1MB output limit
      env: {
        ...process.env,
        PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
        HOME: resolvedPath, // jail HOME to repo
        NODE_ENV: 'test',
      },
    });

    const elapsed = Math.round(performance.now() - t0);
    const lines = result.split('\n');
    out += `Exit: 0 (success)\n`;
    out += `Output: ${lines.length} lines, ${Buffer.byteLength(result)} bytes\n`;
    out += `Time: ${elapsed}ms\n\n`;

    // Trim output if too large
    if (result.length > 8000) {
      out += result.slice(0, 4000) + '\n\n... (truncated) ...\n\n' + result.slice(-2000);
    } else {
      out += result;
    }
  } catch (e) {
    const elapsed = Math.round(performance.now() - t0);
    if (e.killed || e.signal === 'SIGTERM') {
      out += `Exit: TIMEOUT (killed after ${timeoutSec}s)\n`;
    } else {
      out += `Exit: ${e.status || 1} (error)\n`;
    }
    out += `Time: ${elapsed}ms\n\n`;
    if (e.stdout) out += `stdout:\n${e.stdout.slice(0, 4000)}\n`;
    if (e.stderr) out += `stderr:\n${e.stderr.slice(0, 2000)}\n`;
    if (!e.stdout && !e.stderr) out += `Error: ${e.message}\n`;
  }

  return out;
}

function execPortScan({ path: repoPath }) {
  if (!existsSync(repoPath)) return `Not found: ${repoPath}`;
  const t0 = performance.now();

  let out = `Port & Network Scan: ${repoPath}\n${'='.repeat(50)}\n\n`;
  const excludes = "--glob '!node_modules' --glob '!.git' --glob '!*.lock' --glob '!vendor' --glob '!dist'";

  // 1. Dockerfile EXPOSE directives
  out += `## Exposed Ports (Dockerfiles)\n`;
  try {
    const result = exec(`rg --no-heading -n "EXPOSE" ${excludes} "${repoPath}" 2>/dev/null || true`);
    if (result.trim()) {
      result.trim().split('\n').forEach(l => {
        const rel = relative(repoPath, l.split(':')[0]);
        out += `  ${rel}:${l.split(':').slice(1).join(':').trim()}\n`;
      });
    } else {
      out += `  No EXPOSE directives found\n`;
    }
  } catch {}
  out += '\n';

  // 2. Port bindings in code
  out += `## Port Bindings in Code\n`;
  const portPatterns = [
    { label: 'listen/bind', pattern: 'listen\\(\\s*\\d+|bind\\(.*\\d+|PORT.*=.*\\d{4,5}' },
    { label: 'server port', pattern: 'port.*[:=].*\\d{4,5}|server.*port' },
    { label: '0.0.0.0 binding', pattern: '0\\.0\\.0\\.0' },
  ];
  for (const { label, pattern } of portPatterns) {
    try {
      const result = exec(`rg --no-heading -n -m 10 -i ${excludes} -- "${pattern}" "${repoPath}" 2>/dev/null || true`);
      if (result.trim()) {
        out += `  ${label}:\n`;
        result.trim().split('\n').slice(0, 5).forEach(l => {
          out += `    ${relative(repoPath, l.split(':')[0])}:${l.split(':').slice(1).join(':').trim().slice(0, 100)}\n`;
        });
        out += '\n';
      }
    } catch {}
  }

  // 3. docker-compose port mappings
  out += `## Docker Compose Ports\n`;
  try {
    const result = exec(`rg --no-heading -n "ports:" -A 5 ${excludes} --glob "docker-compose*" "${repoPath}" 2>/dev/null || true`);
    if (result.trim()) {
      result.trim().split('\n').forEach(l => {
        out += `  ${l.trim()}\n`;
      });
    } else {
      out += `  No docker-compose port mappings found\n`;
    }
  } catch {}
  out += '\n';

  // 4. Network security issues
  out += `## Network Security Issues\n`;
  const netIssues = [
    { label: 'CORS wildcard', pattern: 'Access-Control-Allow-Origin.*\\*|cors.*origin.*\\*' },
    { label: 'HTTP (non-TLS)', pattern: 'http://(?!localhost|127\\.0|0\\.0\\.0)\\w+' },
    { label: 'Disabled TLS verification', pattern: 'rejectUnauthorized.*false|verify.*=.*[Ff]alse|VERIFY_SSL.*false|InsecureSkipVerify' },
    { label: 'Host network mode', pattern: 'network_mode.*host|hostNetwork.*true' },
    { label: 'Privileged mode', pattern: 'privileged.*true' },
  ];
  let netFindings = 0;
  for (const { label, pattern } of netIssues) {
    try {
      const result = exec(`rg --no-heading -n -m 5 -i ${excludes} -- "${pattern}" "${repoPath}" 2>/dev/null || true`);
      if (result.trim()) {
        netFindings++;
        out += `  [!] ${label}:\n`;
        result.trim().split('\n').slice(0, 3).forEach(l => {
          out += `    ${relative(repoPath, l.split(':')[0])}:${l.split(':').slice(1).join(':').trim().slice(0, 100)}\n`;
        });
        out += '\n';
      }
    } catch {}
  }
  if (netFindings === 0) out += `  No network security issues found\n`;

  // 5. Environment/config files with sensitive bindings
  out += `\n## Sensitive Configs\n`;
  try {
    const envFiles = exec(`find "${repoPath}" -name ".env*" -o -name "*.env" -not -path "*/.git/*" -not -path "*/node_modules/*" 2>/dev/null | head -10`).trim();
    if (envFiles) {
      envFiles.split('\n').forEach(f => {
        if (!f) return;
        const rel = relative(repoPath, f);
        try {
          const content = readFileSync(f, 'utf8');
          const ports = content.match(/PORT\s*=\s*\d+/gi) || [];
          const hosts = content.match(/HOST\s*=\s*\S+/gi) || [];
          const secrets = content.match(/(SECRET|KEY|TOKEN|PASSWORD)\s*=\s*\S+/gi) || [];
          out += `  ${rel}: ${ports.length} ports, ${hosts.length} hosts, ${secrets.length} secrets\n`;
          ports.forEach(p => out += `    ${p}\n`);
          hosts.forEach(h => out += `    ${h}\n`);
          if (secrets.length > 0) out += `    [!] ${secrets.length} secrets in env file\n`;
        } catch {}
      });
    } else {
      out += `  No .env files found\n`;
    }
  } catch {}

  const totalMs = Math.round(performance.now() - t0);
  out += `\nScan time: ${totalMs}ms\n`;
  return out;
}

// ═══════════════════════════════════════════
// Fast Find + LSP Intelligence — Implementations
// ═══════════════════════════════════════════

function execFastFind({ path: dirPath, pattern, extension, type: typeFilter, max_depth, hidden, size, changed_within }) {
  if (!existsSync(dirPath)) return `Not found: ${dirPath}`;
  const t0 = performance.now();

  // Try fd first (10-100x faster than find)
  let hasFd = false;
  try { exec('fd --version', { timeout: 3000 }); hasFd = true; } catch {}

  let cmd;
  if (hasFd) {
    cmd = `fd`;
    if (pattern) cmd += ` "${pattern}"`;
    else cmd += ` .`; // match everything
    cmd += ` "${dirPath}"`;
    if (extension) cmd += ` -e ${extension}`;
    if (typeFilter) cmd += ` -t ${typeFilter}`;
    if (max_depth) cmd += ` -d ${max_depth}`;
    if (hidden) cmd += ` -H`;
    if (size) cmd += ` -S "${size}"`;
    if (changed_within) cmd += ` --changed-within "${changed_within}"`;
    cmd += ` --color never 2>/dev/null | head -200`;
  } else {
    // Fallback to find
    cmd = `find "${dirPath}" -not -path "*/.git/*" -not -path "*/node_modules/*"`;
    if (typeFilter === 'f') cmd += ` -type f`;
    else if (typeFilter === 'd') cmd += ` -type d`;
    if (max_depth) cmd += ` -maxdepth ${max_depth}`;
    if (extension) cmd += ` -name "*.${extension}"`;
    if (pattern) cmd += ` -name "*${pattern}*"`;
    cmd += ` 2>/dev/null | head -200`;
  }

  try {
    const result = exec(cmd, { timeout: 15000 });
    const files = result.trim().split('\n').filter(Boolean);
    const elapsed = Math.round(performance.now() - t0);

    let out = `Fast Find: ${dirPath}\n`;
    out += `Engine: ${hasFd ? 'fd' : 'find'} | ${files.length} results | ${elapsed}ms\n`;
    if (pattern) out += `Pattern: ${pattern}\n`;
    if (extension) out += `Extension: .${extension}\n`;
    out += '\n';

    files.forEach(f => {
      const rel = relative(dirPath, f);
      try {
        const stat = statSync(f);
        const sizeStr = stat.size > 1024*1024 ? `${(stat.size/1024/1024).toFixed(1)}MB` :
                        stat.size > 1024 ? `${(stat.size/1024).toFixed(1)}KB` : `${stat.size}B`;
        const isDir = stat.isDirectory();
        out += `  ${isDir ? 'DIR ' : '    '} ${rel} ${isDir ? '' : '('+sizeStr+')'}\n`;
      } catch {
        out += `  ${rel}\n`;
      }
    });

    return out;
  } catch (e) { return `Error: ${e.message}`; }
}

function detectLanguage(filePath) {
  const ext = extname(filePath).slice(1).toLowerCase();
  const map = { js:'js', jsx:'js', mjs:'js', ts:'ts', tsx:'ts', py:'py', go:'go', rs:'rs',
    c:'c', cpp:'cpp', cc:'cpp', h:'c', hpp:'cpp', java:'java', rb:'rb', swift:'swift', zig:'zig' };
  return map[ext] || ext;
}

function execLspSymbols({ path: targetPath, language, kind }) {
  if (!existsSync(targetPath)) return `Not found: ${targetPath}`;
  const t0 = performance.now();
  const isDir = statSync(targetPath).isDirectory();

  // Detect language from file or scan directory
  const lang = language || (isDir ? null : detectLanguage(targetPath));

  // Language-specific symbol extraction patterns (more precise than generic regex)
  const symbolPatterns = {
    js: {
      function: 'function\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*\\(|const\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*=\\s*(?:async\\s+)?(?:function|\\()',
      class: 'class\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)',
      export: 'export\\s+(?:default\\s+)?(?:function|class|const|let|var)\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)',
      method: '([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*\\([^)]*\\)\\s*\\{',
      variable: '(?:const|let|var)\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*=',
    },
    ts: null, // same as js
    py: {
      function: 'def\\s+([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\(',
      class: 'class\\s+([a-zA-Z_][a-zA-Z0-9_]*)\\s*[:(]',
      method: 'def\\s+([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\(self',
      variable: '([A-Z_][A-Z0-9_]*)\\s*=',
      type: '([A-Z][a-zA-Z0-9]*)\\s*=\\s*(?:TypeVar|NewType|namedtuple)',
    },
    go: {
      function: 'func\\s+([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\(',
      method: 'func\\s+\\([^)]+\\)\\s+([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\(',
      type: 'type\\s+([a-zA-Z_][a-zA-Z0-9_]*)\\s+(?:struct|interface)',
      variable: 'var\\s+([a-zA-Z_][a-zA-Z0-9_]*)',
    },
    rs: {
      function: 'fn\\s+([a-zA-Z_][a-zA-Z0-9_]*)\\s*[(<]',
      type: '(?:struct|enum|trait|type)\\s+([a-zA-Z_][a-zA-Z0-9_]*)',
      variable: 'static\\s+(?:mut\\s+)?([A-Z_][A-Z0-9_]*)\\s*:',
      export: 'pub\\s+(?:fn|struct|enum|trait|type|mod)\\s+([a-zA-Z_][a-zA-Z0-9_]*)',
    },
    c: {
      function: '(?:void|int|char|float|double|long|unsigned|static|extern|inline)\\s+\\*?([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\(',
      type: '(?:struct|enum|union|typedef)\\s+([a-zA-Z_][a-zA-Z0-9_]*)',
    },
    cpp: null, // same as c
    java: {
      function: '(?:public|private|protected|static|\\s)+[a-zA-Z<>\\[\\]]+\\s+([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\(',
      class: '(?:public|private|protected)?\\s*class\\s+([a-zA-Z_][a-zA-Z0-9_]*)',
      interface: 'interface\\s+([a-zA-Z_][a-zA-Z0-9_]*)',
    },
    rb: {
      function: 'def\\s+(?:self\\.)?([a-zA-Z_][a-zA-Z0-9_!?]*)',
      class: 'class\\s+([A-Z][a-zA-Z0-9_]*)',
      variable: '([A-Z_][A-Z0-9_]*)\\s*=',
    },
  };

  // Get patterns for language
  const patterns = symbolPatterns[lang] || symbolPatterns[lang === 'ts' ? 'js' : lang === 'cpp' ? 'c' : 'js'] || symbolPatterns.js;
  const excludes = "--glob '!node_modules' --glob '!.git' --glob '!*.lock' --glob '!vendor' --glob '!dist' --glob '!*.min.js'";
  const typeFilter = lang ? `--glob '*.${lang === 'js' ? '{js,jsx,mjs}' : lang === 'ts' ? '{ts,tsx}' : lang}'` : '';

  let out = `Symbols: ${targetPath}\n${'='.repeat(50)}\n`;
  out += `Language: ${lang || 'auto'}\n\n`;

  const kindsToSearch = kind ? { [kind]: patterns[kind] } : patterns;
  let totalSymbols = 0;

  for (const [symbolKind, pattern] of Object.entries(kindsToSearch)) {
    if (!pattern) continue;
    try {
      const cmd = isDir
        ? `rg --no-heading -on ${excludes} ${typeFilter} -- "${pattern}" "${targetPath}" 2>/dev/null | head -100`
        : `rg --no-heading -on -- "${pattern}" "${targetPath}" 2>/dev/null | head -100`;
      const result = exec(cmd, { timeout: 10000 });
      const lines = result.trim().split('\n').filter(l => l.trim());
      if (lines.length > 0) {
        totalSymbols += lines.length;
        out += `## ${symbolKind} (${lines.length})\n`;
        lines.slice(0, 25).forEach(l => {
          if (isDir) {
            const file = relative(targetPath, l.split(':')[0]);
            const lineNum = l.split(':')[1];
            const match = l.split(':').slice(2).join(':').trim();
            out += `  ${file}:${lineNum}  ${match.slice(0, 100)}\n`;
          } else {
            const lineNum = l.split(':')[0];
            const match = l.split(':').slice(1).join(':').trim();
            out += `  L${lineNum}  ${match.slice(0, 100)}\n`;
          }
        });
        if (lines.length > 25) out += `  ... and ${lines.length - 25} more\n`;
        out += '\n';
      }
    } catch {}
  }

  const elapsed = Math.round(performance.now() - t0);
  out += `Total: ${totalSymbols} symbols | ${elapsed}ms\n`;
  return out;
}

function execLspDefinitions({ symbol, path: dirPath, language }) {
  if (!existsSync(dirPath)) return `Not found: ${dirPath}`;
  const t0 = performance.now();
  const lang = language || 'js';

  // Build definition-specific patterns per language
  const defPatterns = {
    js: [
      `function\\s+${symbol}\\s*\\(`,
      `(?:const|let|var)\\s+${symbol}\\s*=`,
      `class\\s+${symbol}\\s`,
      `export\\s+(?:default\\s+)?(?:function|class|const)\\s+${symbol}`,
    ],
    py: [
      `def\\s+${symbol}\\s*\\(`,
      `class\\s+${symbol}\\s*[:(]`,
      `${symbol}\\s*=\\s*`,
    ],
    go: [
      `func\\s+${symbol}\\s*\\(`,
      `func\\s+\\([^)]+\\)\\s+${symbol}\\s*\\(`,
      `type\\s+${symbol}\\s+`,
      `var\\s+${symbol}\\s`,
    ],
    rs: [
      `fn\\s+${symbol}\\s*[(<]`,
      `(?:struct|enum|trait|type)\\s+${symbol}\\s`,
      `(?:let|const|static)\\s+(?:mut\\s+)?${symbol}\\s*[=:]`,
    ],
    c: [
      `\\w+\\s+\\*?${symbol}\\s*\\(`,
      `(?:struct|enum|typedef)\\s+${symbol}\\s`,
      `#define\\s+${symbol}\\s`,
    ],
  };

  const patterns = defPatterns[lang] || defPatterns[lang === 'ts' ? 'js' : lang === 'cpp' ? 'c' : 'js'] || defPatterns.js;
  const excludes = "--glob '!node_modules' --glob '!.git' --glob '!*.lock' --glob '!vendor' --glob '!dist'";

  let out = `Definition: ${symbol}\n${'='.repeat(50)}\n`;
  out += `Language: ${lang} | Searching: ${dirPath}\n\n`;

  let found = 0;
  for (const pattern of patterns) {
    try {
      const result = exec(`rg --no-heading -n -m 10 ${excludes} -- "${pattern}" "${dirPath}" 2>/dev/null || true`, { timeout: 10000 });
      if (result.trim()) {
        result.trim().split('\n').forEach(l => {
          found++;
          const file = relative(dirPath, l.split(':')[0]);
          const lineNum = l.split(':')[1];
          const match = l.split(':').slice(2).join(':').trim();
          out += `  ${file}:${lineNum}\n    ${match.slice(0, 150)}\n\n`;
        });
      }
    } catch {}
  }

  if (found === 0) out += `  No definition found for "${symbol}"\n`;

  const elapsed = Math.round(performance.now() - t0);
  out += `Found: ${found} definition(s) | ${elapsed}ms\n`;
  return out;
}

function execLspDiagnostics({ path: targetPath, language }) {
  if (!existsSync(targetPath)) return `Not found: ${targetPath}`;
  const t0 = performance.now();
  const isDir = statSync(targetPath).isDirectory();

  // Detect language
  const lang = language || (isDir ? detectProjectLang(targetPath) : detectLanguage(targetPath));

  let out = `Diagnostics: ${targetPath}\n${'='.repeat(50)}\n`;
  out += `Language: ${lang}\n\n`;

  const checks = [];

  if (lang === 'js' || lang === 'ts') {
    // Check for TypeScript compiler
    checks.push({
      name: 'TypeScript/ESLint',
      cmd: `cd "${isDir ? targetPath : resolve(targetPath, '..')}" && npx tsc --noEmit --pretty 2>&1 | head -50 || true`,
      fallback: `node --check "${targetPath}" 2>&1 || true`
    });
  }

  if (lang === 'py') {
    checks.push({
      name: 'Python Syntax + Pylint',
      cmd: `python3 -m py_compile "${targetPath}" 2>&1; python3 -m pylint --errors-only "${targetPath}" 2>&1 | head -30 || true`,
      fallback: `python3 -m py_compile "${targetPath}" 2>&1`
    });
  }

  if (lang === 'go') {
    checks.push({
      name: 'Go Vet',
      cmd: `cd "${isDir ? targetPath : resolve(targetPath, '..')}" && go vet ./... 2>&1 | head -30 || true`,
    });
  }

  if (lang === 'rs') {
    checks.push({
      name: 'Cargo Check',
      cmd: `cd "${isDir ? targetPath : resolve(targetPath, '..')}" && cargo check 2>&1 | head -50 || true`,
    });
  }

  if (lang === 'c' || lang === 'cpp') {
    const compiler = lang === 'cpp' ? 'g++ -std=c++17' : 'gcc';
    checks.push({
      name: `${lang.toUpperCase()} Compiler Check`,
      cmd: `${compiler} -fsyntax-only -Wall "${targetPath}" 2>&1 | head -30 || true`,
    });
  }

  // Run common checks: syntax patterns that indicate problems
  checks.push({
    name: 'Common Issues',
    cmd: `rg --no-heading -n "console\\.log|debugger|TODO|FIXME|HACK|XXX|BUG" "${targetPath}" --glob '!*.min.js' --glob '!node_modules' 2>/dev/null | head -20 || true`,
  });

  for (const check of checks) {
    out += `## ${check.name}\n`;
    try {
      const result = exec(check.cmd, { timeout: 30000 });
      if (result.trim()) {
        const lines = result.trim().split('\n');
        const errors = lines.filter(l => l.match(/error|Error|ERR/i));
        const warnings = lines.filter(l => l.match(/warning|Warning|WARN/i) && !l.match(/error/i));

        if (errors.length > 0) {
          out += `  Errors: ${errors.length}\n`;
          errors.slice(0, 10).forEach(l => out += `    ${l.slice(0, 150)}\n`);
        }
        if (warnings.length > 0) {
          out += `  Warnings: ${warnings.length}\n`;
          warnings.slice(0, 5).forEach(l => out += `    ${l.slice(0, 150)}\n`);
        }
        if (errors.length === 0 && warnings.length === 0) {
          // Show raw output for things like TODO/FIXME
          lines.slice(0, 10).forEach(l => out += `  ${l.slice(0, 150)}\n`);
        }
      } else {
        out += `  Clean\n`;
      }
    } catch (e) {
      // Try fallback
      if (check.fallback) {
        try {
          const result = exec(check.fallback, { timeout: 15000 });
          out += result.trim() ? `  ${result.trim().split('\n').slice(0, 5).join('\n  ')}\n` : '  Clean\n';
        } catch { out += `  Skipped (tool not available)\n`; }
      } else {
        out += `  Skipped (tool not available)\n`;
      }
    }
    out += '\n';
  }

  const elapsed = Math.round(performance.now() - t0);
  out += `Diagnostics time: ${elapsed}ms\n`;
  return out;
}

function detectProjectLang(dirPath) {
  if (existsSync(resolve(dirPath, 'package.json'))) return 'js';
  if (existsSync(resolve(dirPath, 'go.mod'))) return 'go';
  if (existsSync(resolve(dirPath, 'Cargo.toml'))) return 'rs';
  if (existsSync(resolve(dirPath, 'requirements.txt')) || existsSync(resolve(dirPath, 'pyproject.toml'))) return 'py';
  return 'js';
}

// ═══════════════════════════════════════════
// AST Tools — ast-grep, ctags, difftastic, shellcheck
// ═══════════════════════════════════════════

function execAstSearch({ path: targetPath, pattern, language }) {
  if (!existsSync(targetPath)) return `Not found: ${targetPath}`;
  const t0 = performance.now();
  let hasSg = false;
  try { exec('sg --version', { timeout: 3000 }); hasSg = true; } catch {}
  if (!hasSg) return `ast-grep not installed. Install: brew install ast-grep`;

  let cmd = `sg run -p '${pattern.replace(/'/g, "'\\''")}'`;
  if (language) cmd += ` -l ${language}`;
  cmd += ` "${targetPath}" 2>/dev/null | head -200`;

  try {
    const result = exec(cmd, { timeout: 30000 });
    const elapsed = Math.round(performance.now() - t0);
    let out = `AST Search: ${pattern}\n${'='.repeat(50)}\n`;
    out += `Path: ${targetPath} | Lang: ${language || 'auto'} | ${elapsed}ms\n\n`;
    out += result.trim() || 'No matches.';
    return out;
  } catch (e) { return `Error: ${e.message}`; }
}

function execSymbolMap({ path: repoPath, kind }) {
  if (!existsSync(repoPath)) return `Not found: ${repoPath}`;
  const t0 = performance.now();
  let hasCtags = false;
  try { exec('ctags --version', { timeout: 3000 }); hasCtags = true; } catch {}
  if (!hasCtags) return `universal-ctags not installed. Install: brew install universal-ctags`;

  try {
    const excludes = "--exclude=node_modules --exclude=.git --exclude=dist --exclude=build --exclude=vendor";
    const cmd = `cd "${repoPath}" && ctags -R --output-format=json ${excludes} -f - . 2>/dev/null | head -2000`;
    const result = exec(cmd, { timeout: 30000, maxBuffer: 4 * 1024 * 1024 });

    const symbols = result.trim().split('\n').filter(l => l.trim()).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);

    const filtered = kind ? symbols.filter(s => s.kind === kind) : symbols;
    const byKind = {};
    filtered.forEach(s => {
      if (!byKind[s.kind]) byKind[s.kind] = [];
      byKind[s.kind].push(s);
    });

    const elapsed = Math.round(performance.now() - t0);
    let out = `Symbol Map: ${repoPath}\n${'='.repeat(50)}\n`;
    out += `Total: ${filtered.length} symbols | ${elapsed}ms\n\n`;

    Object.entries(byKind).sort((a, b) => b[1].length - a[1].length).forEach(([k, items]) => {
      out += `## ${k} (${items.length})\n`;
      items.slice(0, 30).forEach(s => {
        out += `  ${s.path}:${s.line}  ${s.name}${s.scope ? ' ['+s.scope+']' : ''}\n`;
      });
      if (items.length > 30) out += `  ... +${items.length - 30} more\n`;
      out += '\n';
    });
    return out;
  } catch (e) { return `Error: ${e.message}`; }
}

function execStructDiff({ path1, path2, language }) {
  const t0 = performance.now();
  let hasDifft = false;
  try { exec('difft --version', { timeout: 3000 }); hasDifft = true; } catch {}
  if (!hasDifft) return `difftastic not installed. Install: brew install difftastic`;

  try {
    let cmd = `difft --color=never "${path1}" "${path2}" 2>&1 | head -200`;
    const result = exec(cmd, { timeout: 15000 });
    const elapsed = Math.round(performance.now() - t0);
    return `Structural Diff (difftastic) | ${elapsed}ms\n${'='.repeat(50)}\n\n${result || 'No differences'}`;
  } catch (e) { return `Error: ${e.message}`; }
}

function execShellLint({ command }) {
  if (!command) return 'command is required';
  const t0 = performance.now();
  let hasShellcheck = false;
  try { exec('shellcheck --version', { timeout: 3000 }); hasShellcheck = true; } catch {}
  if (!hasShellcheck) return `shellcheck not installed. Install: brew install shellcheck`;

  try {
    const tmpFile = `/tmp/milli-shellcheck-${Date.now()}.sh`;
    writeFileSync(tmpFile, '#!/bin/bash\n' + command);
    let result = '';
    try { result = exec(`shellcheck -f json "${tmpFile}" 2>&1`, { timeout: 5000 }); }
    catch (e) { result = e.stdout || e.message; }
    try { execSync(`rm -f "${tmpFile}"`); } catch {}

    const elapsed = Math.round(performance.now() - t0);
    let issues = [];
    try { issues = JSON.parse(result); } catch {}

    let out = `Shell Lint: ${command.slice(0, 80)}\n${'='.repeat(50)}\n`;
    out += `Issues: ${issues.length} | ${elapsed}ms\n\n`;

    if (issues.length === 0) {
      out += '✓ Clean — safe to execute\n';
    } else {
      const bySeverity = { error: [], warning: [], info: [], style: [] };
      issues.forEach(i => { (bySeverity[i.level] || bySeverity.info).push(i); });
      ['error', 'warning', 'info', 'style'].forEach(sev => {
        if (bySeverity[sev].length === 0) return;
        out += `[${sev.toUpperCase()}] ${bySeverity[sev].length}:\n`;
        bySeverity[sev].slice(0, 10).forEach(i => {
          out += `  L${i.line}:${i.column} SC${i.code}: ${i.message}\n`;
        });
        out += '\n';
      });
      const errors = bySeverity.error.length;
      out += errors > 0 ? `⚠ ${errors} errors — DO NOT execute\n` : '✓ Warnings only — safe\n';
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
