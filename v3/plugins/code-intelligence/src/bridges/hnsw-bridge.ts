/**
 * Code Intelligence Plugin - HNSW Bridge
 *
 * High-level semantic code search facade. Provides a stable surface for
 * `code/semantic-search` with a dep-free token-overlap scorer (TODO:
 * upgrade to ONNX embeddings when the embeddings package is loadable).
 *
 * @module v3/plugins/code-intelligence/bridges/hnsw-bridge
 */

import fs from 'node:fs';
import path from 'node:path';
import type { CodeSearchResult } from '../types.js';

const DEFAULT_CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const SKIP_DIR_NAMES = new Set([
  'node_modules', 'dist', 'build', '.git', 'coverage', 'vendor',
  '.next', '.nuxt', '.turbo', '.cache', 'tmp', '.pnpm-store',
]);
const MAX_FILE_BYTES = 100 * 1024; // 100KB cap

/**
 * Collect code files under a root path (skips vendor/build dirs and
 * minified/large files).
 */
export function walkCodeFiles(rootPath: string): string[] {
  const out: string[] = [];
  const visited = new Set<string>();

  const walk = (dir: string) => {
    let realDir: string;
    try {
      realDir = fs.realpathSync(dir);
    } catch {
      return;
    }
    if (visited.has(realDir)) return; // protect against symlink loops
    visited.add(realDir);

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!DEFAULT_CODE_EXTS.has(ext)) continue;
        if (entry.name.endsWith('.min.js') || entry.name.endsWith('.min.mjs')) continue;
        try {
          const stat = fs.statSync(full);
          if (stat.size > MAX_FILE_BYTES) continue;
        } catch {
          continue;
        }
        out.push(full);
      }
    }
  };

  walk(rootPath);
  return out;
}

function tokenize(text: string): Map<string, number> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && t.length <= 32);
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  return counts;
}

function cosineFromCounts(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  for (const [tok, ca] of a) {
    const cb = b.get(tok);
    if (cb !== undefined) dot += ca * cb;
  }
  if (dot === 0) return 0;
  let na = 0;
  for (const v of a.values()) na += v * v;
  let nb = 0;
  for (const v of b.values()) nb += v * v;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const LANGUAGE_EXT: Record<string, string[]> = {
  typescript: ['.ts', '.tsx'],
  javascript: ['.js', '.jsx', '.mjs', '.cjs'],
  python: ['.py'],
  java: ['.java'],
  go: ['.go'],
  rust: ['.rs'],
  cpp: ['.cpp', '.cc', '.h', '.hpp'],
  csharp: ['.cs'],
  ruby: ['.rb'],
  php: ['.php'],
  swift: ['.swift'],
  kotlin: ['.kt', '.kts'],
  scala: ['.scala'],
};

/**
 * Semantic search bridge.
 *
 * NOTE: exported as a callable factory (`CodeHNSWBridge()` without `new`)
 * because the tool tests mock it as a function; a class-style `new` would
 * throw against that contract.
 */
class HNSWBridgeImpl {
  initialized = false;
  private readonly embeddingDim: number;

  constructor(embeddingDim = 384) {
    this.embeddingDim = embeddingDim;
  }

  /**
   * Initialize the index (no-op for the token-overlap scorer).
   */
  async initialize(): Promise<void> {
    this.initialized = true;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Search for code semantically similar to the query.
   */
  async searchSemantic(
    query: string,
    options: {
      paths?: string[];
      languages?: string[];
      excludeTests?: boolean;
      topK?: number;
      pathFilter?: string;
    } = {}
  ): Promise<CodeSearchResult[]> {
    const roots = options.paths && options.paths.length > 0 ? options.paths : ['.'];
    const topK = options.topK ?? 10;

    const candidates: string[] = [];
    for (const root of roots) {
      for (const f of walkCodeFiles(root)) candidates.push(f);
    }

    // Filter by language extension if requested.
    const langExt = (() => {
      if (!options.languages || options.languages.length === 0) return null;
      const exts = new Set<string>();
      for (const l of options.languages) {
        const extsFor = LANGUAGE_EXT[l.toLowerCase()];
        if (extsFor) for (const e of extsFor) exts.add(e);
      }
      return exts;
    })();

    const queryTokens = tokenize(query);
    const scored: Array<{ file: string; score: number; preview: string }> = [];

    for (const file of candidates) {
      if (langExt && !langExt.has(path.extname(file).toLowerCase())) continue;
      if (options.excludeTests && /(\.|^)(test|spec)\.[mc]?[jt]sx?$/i.test(path.basename(file))) continue;
      if (options.pathFilter && !file.includes(options.pathFilter)) continue;

      let content: string;
      try {
        content = fs.readFileSync(file, 'utf-8');
      } catch {
        continue;
      }
      const head = content.split('\n').slice(0, 200).join('\n');
      const score = cosineFromCounts(queryTokens, tokenize(head));
      if (score < 0.05) continue;
      scored.push({ file, score, preview: head.slice(0, 240) });
    }

    scored.sort((a, b) => b.score - a.score);
    const langFromExt = (file: string): CodeSearchResult['language'] => {
      const ext = path.extname(file).toLowerCase();
      for (const [lang, exts] of Object.entries(LANGUAGE_EXT)) {
        if (exts.includes(ext)) return lang as CodeSearchResult['language'];
      }
      return 'typescript';
    };

    return scored.slice(0, topK).map((r) => ({
      filePath: r.file,
      lineNumber: 1,
      snippet: r.preview,
      matchType: 'semantic',
      score: r.score,
      context: r.preview,
      language: langFromExt(r.file),
      explanation: `Token-overlap cosine similarity ${(r.score * 100).toFixed(1)}% over first 200 lines.`,
    } satisfies CodeSearchResult));
  }

  /**
   * Number of indexed code files.
   */
  async count(): Promise<number> {
    return walkCodeFiles('.').length;
  }
}

/**
 * Semantic search bridge instance.
 */
export interface CodeHNSWBridge {
  initialized: boolean;
  initialize(): Promise<void>;
  isInitialized(): boolean;
  searchSemantic(
    query: string,
    options?: {
      paths?: string[];
      languages?: string[];
      excludeTests?: boolean;
      topK?: number;
      pathFilter?: string;
    }
  ): Promise<CodeSearchResult[]>;
  count(): Promise<number>;
}

/**
 * Create a semantic search bridge.
 */
export function CodeHNSWBridge(embeddingDim = 384): CodeHNSWBridge {
  return new HNSWBridgeImpl(embeddingDim);
}

export default CodeHNSWBridge;
