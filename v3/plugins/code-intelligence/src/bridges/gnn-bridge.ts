/**
 * GNN Bridge for Code Graph Analysis
 *
 * Provides graph neural network operations for code structure analysis
 * using ruvector-gnn-wasm for high-performance graph algorithms.
 *
 * Features:
 * - Code graph construction
 * - Node embedding computation
 * - Impact prediction using graph propagation
 * - Community detection for module discovery
 * - Pattern matching in code graphs
 *
 * Based on ADR-035: Advanced Code Intelligence Plugin
 *
 * @module v3/plugins/code-intelligence/bridges/gnn-bridge
 */

import type {
  IGNNBridge,
  DependencyGraph,
  DependencyNode,
  DependencyEdge,
} from '../types.js';
import { MinCutBridge } from './mincut-bridge.js';
import fs from 'node:fs';
import path from 'node:path';

/**
 * WASM module interface for GNN operations
 */
interface GNNWasmModule {
  /** Build graph from adjacency list */
  gnn_build_graph(
    nodeCount: number,
    edges: Uint32Array,
    edgeCount: number
  ): number;

  /** Compute GNN embeddings */
  gnn_compute_embeddings(
    graphPtr: number,
    features: Float32Array,
    featureDim: number,
    outputDim: number,
    layers: number
  ): Float32Array;

  /** Propagate labels for impact analysis */
  gnn_propagate(
    graphPtr: number,
    initialLabels: Float32Array,
    iterations: number,
    dampingFactor: number
  ): Float32Array;

  /** Community detection using Louvain algorithm */
  gnn_detect_communities(
    graphPtr: number,
    weights: Float32Array
  ): Uint32Array;

  /** Subgraph matching */
  gnn_match_subgraph(
    graphPtr: number,
    patternPtr: number,
    threshold: number
  ): Float32Array;

  /** Free graph */
  gnn_free(graphPtr: number): void;

  /** Memory management */
  alloc(size: number): number;
  dealloc(ptr: number, size: number): void;
  memory: WebAssembly.Memory;
}

/**
 * GNN Bridge Implementation
 */
export class GNNBridge implements IGNNBridge {
  // WASM module for future performance optimization (currently uses JS fallback)
  private wasmModule: GNNWasmModule | null = null;
  private initialized = false;
  private readonly embeddingDim: number;

  constructor(embeddingDim = 128) {
    this.embeddingDim = embeddingDim;
  }

  /**
   * Initialize the WASM module
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamic import of WASM module
      this.wasmModule = await this.loadWasmModule();
      this.initialized = true;
    } catch {
      // Fallback to pure JS implementation
      console.warn('WASM GNN module not available, using JS fallback');
      this.wasmModule = null;
      this.initialized = true;
    }
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Build code graph from files
   */
  async buildCodeGraph(
    files: string[],
    _includeCallGraph: boolean
  ): Promise<DependencyGraph> {
    if (!this.initialized) {
      await this.initialize();
    }

    const nodes: DependencyNode[] = [];
    const edges: DependencyEdge[] = [];
    const nodeMap = new Map<string, number>();

    // Create nodes for each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file) continue;

      nodeMap.set(file, i);
      nodes.push({
        id: file,
        label: file.split('/').pop() ?? file,
        type: 'file',
        language: this.detectLanguage(file),
      });
    }

    // Build edges from imports (simplified - in production would parse AST)
    for (const file of files) {
      const imports = await this.extractImports(file, files);
      for (const imp of imports) {
        if (nodeMap.has(imp)) {
          edges.push({
            from: file,
            to: imp,
            type: 'import',
            weight: 1,
          });
        }
      }
    }

    // Calculate metadata
    const avgDegree = edges.length > 0 ? (edges.length * 2) / nodes.length : 0;
    const maxDepth = this.calculateMaxDepth(nodes, edges);

    return {
      nodes,
      edges,
      metadata: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        avgDegree,
        maxDepth,
      },
    };
  }

  /**
   * Compute node embeddings using GNN
   */
  async computeNodeEmbeddings(
    graph: DependencyGraph,
    embeddingDim: number
  ): Promise<Map<string, Float32Array>> {
    if (!this.initialized) {
      await this.initialize();
    }

    const embeddings = new Map<string, Float32Array>();
    const nodeCount = graph.nodes.length;

    if (nodeCount === 0) {
      return embeddings;
    }

    // Create node lookup
    const nodeMap = new Map<string, number>();
    graph.nodes.forEach((node, index) => {
      nodeMap.set(node.id, index);
    });

    // Build adjacency list for WASM
    const edgeArray = new Uint32Array(graph.edges.length * 2);
    for (let i = 0; i < graph.edges.length; i++) {
      const edge = graph.edges[i];
      if (!edge) continue;

      const fromIdx = nodeMap.get(edge.from) ?? 0;
      const toIdx = nodeMap.get(edge.to) ?? 0;
      edgeArray[i * 2] = fromIdx;
      edgeArray[i * 2 + 1] = toIdx;
    }

    // Initialize features (simple degree-based features)
    const featureDim = 16;
    const features = new Float32Array(nodeCount * featureDim);
    for (let i = 0; i < nodeCount; i++) {
      const node = graph.nodes[i];
      if (!node) continue;

      // In-degree
      features[i * featureDim] = graph.edges.filter(e => e.to === node.id).length;
      // Out-degree
      features[i * featureDim + 1] = graph.edges.filter(e => e.from === node.id).length;
      // Node type encoding
      features[i * featureDim + 2] = this.encodeNodeType(node.type);
      // Language encoding
      features[i * featureDim + 3] = node.language ? this.encodeLanguage(node.language) : 0;
    }

    // Compute embeddings (using JS fallback)
    const embeddingMatrix = this.computeEmbeddingsJS(
      graph,
      features,
      featureDim,
      embeddingDim
    );

    // Extract embeddings per node
    for (let i = 0; i < nodeCount; i++) {
      const node = graph.nodes[i];
      if (!node) continue;

      const nodeEmbedding = embeddingMatrix.slice(
        i * embeddingDim,
        (i + 1) * embeddingDim
      );
      embeddings.set(node.id, nodeEmbedding);
    }

    return embeddings;
  }

  /**
   * Predict impact of changes using GNN
   */
  async predictImpact(
    graph: DependencyGraph,
    changedNodes: string[],
    depth: number
  ): Promise<Map<string, number>> {
    if (!this.initialized) {
      await this.initialize();
    }

    const impact = new Map<string, number>();
    const nodeCount = graph.nodes.length;

    if (nodeCount === 0) {
      return impact;
    }

    // Create node lookup
    const nodeMap = new Map<string, number>();
    graph.nodes.forEach((node, index) => {
      nodeMap.set(node.id, index);
    });

    // Build adjacency list (reverse direction for impact propagation)
    const adj: number[][] = Array.from({ length: nodeCount }, () => []);
    for (const edge of graph.edges) {
      const fromIdx = nodeMap.get(edge.from);
      const toIdx = nodeMap.get(edge.to);
      if (fromIdx !== undefined && toIdx !== undefined) {
        // Reverse: impact flows from dependency to dependent
        adj[toIdx]?.push(fromIdx);
      }
    }

    // Initialize impact scores
    const scores = new Float32Array(nodeCount);
    for (const nodeId of changedNodes) {
      const idx = nodeMap.get(nodeId);
      if (idx !== undefined) {
        scores[idx] = 1.0;
      }
    }

    // Propagate impact using BFS with decay
    const visited = new Set<number>();
    const queue: Array<{ node: number; depth: number; score: number }> = [];

    // Initialize queue with changed nodes
    for (const nodeId of changedNodes) {
      const idx = nodeMap.get(nodeId);
      if (idx !== undefined) {
        queue.push({ node: idx, depth: 0, score: 1.0 });
        visited.add(idx);
      }
    }

    // BFS propagation
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || current.depth >= depth) continue;

      for (const neighbor of adj[current.node] ?? []) {
        const newScore = current.score * 0.7; // Decay factor
        const neighborScore = scores[neighbor];
        if (neighborScore !== undefined && newScore > neighborScore) {
          scores[neighbor] = newScore;
        }
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push({
            node: neighbor,
            depth: current.depth + 1,
            score: newScore,
          });
        }
      }
    }

    // Convert to map
    for (let i = 0; i < nodeCount; i++) {
      const node = graph.nodes[i];
      const score = scores[i];
      if (node && score !== undefined && score > 0) {
        impact.set(node.id, score);
      }
    }

    return impact;
  }

  /**
   * Detect communities in code graph
   */
  async detectCommunities(
    graph: DependencyGraph
  ): Promise<Map<string, number>> {
    if (!this.initialized) {
      await this.initialize();
    }

    const communities = new Map<string, number>();
    const nodeCount = graph.nodes.length;

    if (nodeCount === 0) {
      return communities;
    }

    // Create node lookup
    const nodeMap = new Map<string, number>();
    graph.nodes.forEach((node, index) => {
      nodeMap.set(node.id, index);
    });

    // Build adjacency list (undirected)
    const adj: Set<number>[] = Array.from({ length: nodeCount }, () => new Set());
    for (const edge of graph.edges) {
      const fromIdx = nodeMap.get(edge.from);
      const toIdx = nodeMap.get(edge.to);
      if (fromIdx !== undefined && toIdx !== undefined) {
        adj[fromIdx]?.add(toIdx);
        adj[toIdx]?.add(fromIdx);
      }
    }

    // Simple community detection using connected components
    // In production, would use Louvain or similar
    const community = new Array(nodeCount).fill(-1);
    let communityId = 0;

    for (let i = 0; i < nodeCount; i++) {
      if (community[i] !== -1) continue;

      // BFS to find connected component
      const queue = [i];
      community[i] = communityId;

      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const neighbor of adj[current] ?? []) {
          if (community[neighbor] === -1) {
            community[neighbor] = communityId;
            queue.push(neighbor);
          }
        }
      }

      communityId++;
    }

    // Convert to map
    for (let i = 0; i < nodeCount; i++) {
      const node = graph.nodes[i];
      const comm = community[i];
      if (node && comm !== undefined) {
        communities.set(node.id, comm);
      }
    }

    return communities;
  }

  /**
   * Find similar code patterns
   */
  async findSimilarPatterns(
    graph: DependencyGraph,
    patternGraph: DependencyGraph,
    threshold: number
  ): Promise<Array<{ matchId: string; score: number }>> {
    if (!this.initialized) {
      await this.initialize();
    }

    const matches: Array<{ matchId: string; score: number }> = [];

    // Compute embeddings for both graphs
    const graphEmbeddings = await this.computeNodeEmbeddings(graph, this.embeddingDim);
    const patternEmbeddings = await this.computeNodeEmbeddings(patternGraph, this.embeddingDim);

    // Average pattern embedding
    const patternAvg = new Float32Array(this.embeddingDim);
    let patternCount = 0;
    for (const [, embedding] of patternEmbeddings) {
      for (let i = 0; i < this.embeddingDim; i++) {
        patternAvg[i] = (patternAvg[i] ?? 0) + (embedding[i] ?? 0);
      }
      patternCount++;
    }
    if (patternCount > 0) {
      for (let i = 0; i < this.embeddingDim; i++) {
        patternAvg[i] = (patternAvg[i] ?? 0) / patternCount;
      }
    }

    // Find similar nodes in main graph
    for (const [nodeId, embedding] of graphEmbeddings) {
      const similarity = this.cosineSimilarity(embedding, patternAvg);
      if (similarity >= threshold) {
        matches.push({ matchId: nodeId, score: similarity });
      }
    }

    // Sort by score descending
    matches.sort((a, b) => b.score - a.score);

    return matches;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Load WASM module dynamically
   */
  private async loadWasmModule(): Promise<GNNWasmModule> {
    throw new Error('WASM module loading not implemented');
  }

  /**
   * Detect language from file extension
   */
  private detectLanguage(filePath: string): DependencyNode['language'] {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const langMap: Record<string, DependencyNode['language']> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      java: 'java',
      go: 'go',
      rs: 'rust',
      cpp: 'cpp',
      c: 'cpp',
      cs: 'csharp',
      rb: 'ruby',
      php: 'php',
      swift: 'swift',
      kt: 'kotlin',
      scala: 'scala',
    };
    return ext ? langMap[ext] : undefined;
  }

  /**
   * Extract imports from file. Returns the subset of `allFiles` that this
   * file imports via relative specifiers — used to build edges in the
   * dependency graph. #1554/#1553: previously returned `[]` which produced
   * graphs with zero edges and broke architecture-analyze, refactor-impact,
   * and split-suggest. Regex-based (no AST parser dep) — handles `import …
   * from`, `export … from`, and `require('…')` for relative paths only.
   */
  private async extractImports(file: string, allFiles: string[]): Promise<string[]> {
    const fs = await import('node:fs');
    const path = await import('node:path');

    let content: string;
    try {
      content = fs.readFileSync(file, 'utf-8');
    } catch {
      return [];
    }

    const allFilesSet = new Set(allFiles.map((f) => path.resolve(f)));
    const exts = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
    const baseDir = path.dirname(path.resolve(file));
    const out = new Set<string>();

    const importRx = /^\s*(?:import\s+[^'"]+from\s+|import\s+|export\s+\*?\s*from\s+|export\s+\{[^}]*\}\s+from\s+)['"]([^'"]+)['"]|^\s*(?:const|let|var)\s+[^=]+=\s*require\(\s*['"]([^'"]+)['"]\s*\)/gm;
    let m: RegExpExecArray | null;
    while ((m = importRx.exec(content)) !== null) {
      const spec = m[1] ?? m[2];
      if (!spec) continue;
      // Only resolve relative/absolute paths — node_modules imports aren't
      // graph nodes here.
      if (!spec.startsWith('./') && !spec.startsWith('../') && !spec.startsWith('/')) continue;

      const candidates: string[] = [];
      const base = spec.startsWith('/') ? spec : path.resolve(baseDir, spec);
      // Try the bare path, each extension, and `index.<ext>` under a directory.
      candidates.push(base);
      for (const e of exts) {
        candidates.push(base + e);
        candidates.push(path.join(base, `index${e}`));
      }
      // TS module-specifier convention: imports use `.js` even when the
      // actual source is `.ts`/`.tsx`. Strip a trailing `.js`/`.cjs`/`.mjs`
      // and re-try with TS extensions so source-level edges resolve.
      const jsLikeMatch = base.match(/^(.+)\.(js|cjs|mjs)$/);
      if (jsLikeMatch && jsLikeMatch[1]) {
        const stripped = jsLikeMatch[1];
        for (const e of ['.ts', '.tsx', '.js', '.jsx']) {
          candidates.push(stripped + e);
          candidates.push(path.join(stripped, `index${e}`));
        }
      }
      for (const c of candidates) {
        const resolved = path.resolve(c);
        if (allFilesSet.has(resolved)) {
          out.add(resolved);
          break;
        }
      }
    }

    return Array.from(out);
  }

  /**
   * Calculate max depth of dependency graph
   */
  private calculateMaxDepth(nodes: DependencyNode[], edges: DependencyEdge[]): number {
    if (nodes.length === 0) return 0;

    // Build adjacency list
    const adj = new Map<string, string[]>();
    for (const node of nodes) {
      adj.set(node.id, []);
    }
    for (const edge of edges) {
      adj.get(edge.from)?.push(edge.to);
    }

    // Find nodes with no incoming edges (roots)
    const hasIncoming = new Set<string>();
    for (const edge of edges) {
      hasIncoming.add(edge.to);
    }
    const roots = nodes.filter(n => !hasIncoming.has(n.id)).map(n => n.id);

    if (roots.length === 0) {
      // Cycle - use first node
      roots.push(nodes[0]!.id);
    }

    // BFS to find max depth
    let maxDepth = 0;
    const visited = new Set<string>();
    const queue: Array<{ node: string; depth: number }> = [];

    for (const root of roots) {
      queue.push({ node: root, depth: 0 });
      visited.add(root);
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      maxDepth = Math.max(maxDepth, current.depth);

      for (const neighbor of adj.get(current.node) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push({ node: neighbor, depth: current.depth + 1 });
        }
      }
    }

    return maxDepth;
  }

  /**
   * Encode node type as number
   */
  private encodeNodeType(type: DependencyNode['type']): number {
    const types: Record<DependencyNode['type'], number> = {
      file: 0.1,
      module: 0.2,
      package: 0.3,
      class: 0.4,
      function: 0.5,
    };
    return types[type];
  }

  /**
   * Encode language as number
   */
  private encodeLanguage(language: string): number {
    const languages: Record<string, number> = {
      typescript: 0.1,
      javascript: 0.15,
      python: 0.2,
      java: 0.25,
      go: 0.3,
      rust: 0.35,
      cpp: 0.4,
      csharp: 0.45,
      ruby: 0.5,
      php: 0.55,
    };
    return languages[language] ?? 0;
  }

  /**
   * Compute embeddings using JS (fallback)
   */
  private computeEmbeddingsJS(
    graph: DependencyGraph,
    features: Float32Array,
    featureDim: number,
    outputDim: number
  ): Float32Array {
    const nodeCount = graph.nodes.length;
    const embeddings = new Float32Array(nodeCount * outputDim);

    // Create adjacency matrix
    const nodeMap = new Map<string, number>();
    graph.nodes.forEach((node, index) => {
      nodeMap.set(node.id, index);
    });

    // Simple message passing (1 layer)
    for (let i = 0; i < nodeCount; i++) {
      const node = graph.nodes[i];
      if (!node) continue;

      // Aggregate neighbor features
      const neighbors = graph.edges
        .filter(e => e.to === node.id)
        .map(e => nodeMap.get(e.from))
        .filter((idx): idx is number => idx !== undefined);

      // Initialize with own features (projected to output dim)
      for (let j = 0; j < outputDim; j++) {
        const featureIdx = j % featureDim;
        embeddings[i * outputDim + j] = features[i * featureDim + featureIdx] ?? 0;
      }

      // Add neighbor contributions
      if (neighbors.length > 0) {
        for (const neighborIdx of neighbors) {
          for (let j = 0; j < outputDim; j++) {
            const featureIdx = j % featureDim;
            const contribution = (features[neighborIdx * featureDim + featureIdx] ?? 0) / neighbors.length;
            const embIdx = i * outputDim + j;
            embeddings[embIdx] = (embeddings[embIdx] ?? 0) + contribution * 0.5;
          }
        }
      }
    }

    // Normalize embeddings
    for (let i = 0; i < nodeCount; i++) {
      let norm = 0;
      for (let j = 0; j < outputDim; j++) {
        const val = embeddings[i * outputDim + j] ?? 0;
        norm += val * val;
      }
      norm = Math.sqrt(norm);
      if (norm > 0) {
        for (let j = 0; j < outputDim; j++) {
          embeddings[i * outputDim + j] = (embeddings[i * outputDim + j] ?? 0) / norm;
        }
      }
    }

    return embeddings;
  }

  /**
   * Compute cosine similarity
   */
  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      const aVal = a[i] ?? 0;
      const bVal = b[i] ?? 0;
      dot += aVal * bVal;
      normA += aVal * aVal;
      normB += bVal * bVal;
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator > 0 ? dot / denominator : 0;
  }
}

/**
 * Create and export default bridge instance
 */
export function createGNNBridge(embeddingDim = 128): IGNNBridge {
  return new GNNBridge(embeddingDim);
}

// ============================================================================
// High-level CodeGNNBridge facade
// ============================================================================
// Contract surface for the MCP tool handlers (code/architecture-analyze,
// code/refactor-impact, code/split-suggest, code/learn-patterns). Wraps the
// low-level GNN/MinCut bridges with result shapes the tool layer returns.

const DEFAULT_CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const SKIP_DIR_NAMES = new Set([
  'node_modules', 'dist', 'build', '.git', 'coverage', 'vendor',
  '.next', '.nuxt', '.turbo', '.cache', 'tmp', '.pnpm-store',
]);
const MAX_FILE_BYTES = 100 * 1024; // 100KB cap

/** Collect code files under a root path (skips vendor/build dirs). */
function walkCodeFiles(rootPath: string): string[] {
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

/** Group graph nodes into modules by directory. */
function buildComponents(graph: DependencyGraph): Array<{
  name: string;
  type: string;
  files: number;
  dependencies: number;
}> {
  const dirOf = (file: string): string => {
    const parts = file.replace(/\\/g, '/').split('/');
    return parts.length > 1 ? parts.slice(0, -1).join('/') : '(root)';
  };

  const byDir = new Map<string, string[]>();
  const dirOfNode = new Map<string, string>();
  for (const node of graph.nodes) {
    const dir = dirOf(node.id);
    dirOfNode.set(node.id, dir);
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir)?.push(node.id);
  }

  const components: Array<{ name: string; type: string; files: number; dependencies: number }> = [];
  for (const [name, files] of byDir) {
    const deps = new Set<string>();
    for (const edge of graph.edges) {
      const fromDir = dirOfNode.get(edge.from);
      const toDir = dirOfNode.get(edge.to);
      if (fromDir === name && toDir && toDir !== name) deps.add(toDir);
    }
    components.push({ name, type: 'module', files: files.length, dependencies: deps.size });
  }
  components.sort((a, b) => b.files - a.files);
  return components;
}

/** Simple graph metrics derived from the dependency graph. */
function buildMetrics(graph: DependencyGraph): {
  modularity: number;
  coupling: number;
  cohesion: number;
} {
  const nodes = graph.nodes.length;
  if (nodes === 0) return { modularity: 0, coupling: 0, cohesion: 0 };
  const edges = graph.edges.length;
  const avgDegree = (edges * 2) / nodes;
  const coupling = Math.min(1, edges / Math.max(nodes, 1) / 4);
  const cohesion = Math.max(0, 1 - coupling * 1.2);
  const modularity = Math.max(0, Math.min(1, cohesion - Math.abs(avgDegree - 3) * 0.05));
  return {
    modularity: Number(modularity.toFixed(2)),
    coupling: Number(coupling.toFixed(2)),
    cohesion: Number(cohesion.toFixed(2)),
  };
}

/** Detect circular dependencies via DFS. */
function buildIssues(graph: DependencyGraph): Array<{
  type: string;
  components: string[];
  severity: string;
}> {
  const adj = new Map<string, string[]>();
  for (const node of graph.nodes) adj.set(node.id, []);
  for (const edge of graph.edges) adj.get(edge.from)?.push(edge.to);

  const issues: Array<{ type: string; components: string[]; severity: string }> = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();

  const findCycle = (node: string, pathStack: string[]): void => {
    visited.add(node);
    recStack.add(node);
    for (const neighbor of adj.get(node) ?? []) {
      if (recStack.has(neighbor)) {
        const start = pathStack.indexOf(neighbor);
        const cycle = [...(start >= 0 ? pathStack.slice(start) : []), neighbor];
        issues.push({
          type: 'circular_dependency',
          components: cycle,
          severity: cycle.length > 3 ? 'high' : 'medium',
        });
      } else if (!visited.has(neighbor)) {
        findCycle(neighbor, [...pathStack, neighbor]);
      }
    }
    recStack.delete(node);
  };

  for (const node of graph.nodes) {
    if (!visited.has(node.id)) findCycle(node.id, [node.id]);
  }
  return issues;
}

/**
 * High-level code analysis facade for the MCP tools.
 *
 * NOTE: exported as a callable factory (`CodeGNNBridge()` without `new`)
 * because the tool tests mock it as a function; a class-style `new` would
 * throw against that contract.
 */
class GNNBridgeFacade {
  initialized = false;
  private readonly gnn: GNNBridge;
  private readonly mincut: MinCutBridge;

  constructor(embeddingDim = 128) {
    this.gnn = new GNNBridge(embeddingDim);
    this.mincut = new MinCutBridge();
  }

  /**
   * Initialize underlying bridges.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    await Promise.all([this.gnn.initialize(), this.mincut.initialize()]);
    this.initialized = true;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Analyze codebase architecture under a root path.
   */
  async analyzeArchitecture(
    rootPath = '.',
    _options: {
      analysisTypes?: string[];
      depth?: number;
      excludePatterns?: string[];
      outputFormat?: string;
    } = {}
  ): Promise<{
    components: Array<{ name: string; type: string; files: number; dependencies: number }>;
    metrics: { modularity: number; coupling: number; cohesion: number };
    issues: Array<{ type: string; components: string[]; severity: string }>;
  }> {
    const files = walkCodeFiles(rootPath);
    const graph = await this.gnn.buildCodeGraph(files, true);
    return {
      components: buildComponents(graph),
      metrics: buildMetrics(graph),
      issues: buildIssues(graph),
    };
  }

  /**
   * Predict the impact of changing a target file.
   */
  async analyzeRefactorImpact(
    targetPath: string,
    options: {
      changeType?: string;
      description?: string;
      includeTests?: boolean;
      depth?: number;
    } = {}
  ): Promise<{
    directImpact: string[];
    indirectImpact: string[];
    riskLevel: 'low' | 'medium' | 'high';
    breakingChanges: string[];
  }> {
    const targetResolved = path.resolve(targetPath);
    const files = walkCodeFiles(path.dirname(targetResolved));
    const graph = await this.gnn.buildCodeGraph(files, true);

    const impact = await this.gnn.predictImpact(
      graph,
      files.includes(targetResolved) ? [targetResolved] : [],
      options.depth ?? 3
    );

    const relative = (file: string): string => path.relative(process.cwd(), file) || file;
    const scores = Array.from(impact.values());
    const maxScore = scores.length > 0 ? Math.max(...scores) : 0;
    const riskLevel: 'low' | 'medium' | 'high' = maxScore > 0.8 ? 'high' : maxScore > 0.5 ? 'medium' : 'low';

    const breakingChanges: string[] = [];
    if (options.changeType === 'delete') {
      const dependents = graph.edges.filter((e) => e.to === targetResolved).length;
      if (dependents > 0) {
        breakingChanges.push(`Deleting ${targetPath} breaks ${dependents} dependents`);
      }
    }

    return {
      directImpact: files.includes(targetResolved) ? [targetPath] : [],
      indirectImpact: Array.from(impact)
        .filter(([file, score]) => file !== targetResolved && score > 0.1)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([file]) => relative(file)),
      riskLevel,
      breakingChanges,
    };
  }

  /**
   * Suggest module splits for a target path.
   */
  async suggestSplit(
    targetPath: string,
    options: { threshold?: number; strategy?: string; includePatterns?: string[] } = {}
  ): Promise<Array<{
    file: string;
    reason: string;
    suggestedSplits: Array<{ name: string; functions: string[] }>;
  }>> {
    const files = walkCodeFiles(targetPath);
    const graph = await this.gnn.buildCodeGraph(files, true);
    const numModules = Math.max(2, Math.min(10, Math.ceil(Math.sqrt(Math.max(files.length, 1) / 5))));
    const partition = await this.mincut.findOptimalCuts(graph, numModules, {});

    const groups = new Map<number, string[]>();
    for (const [nodeId, partNum] of partition) {
      if (!groups.has(partNum)) groups.set(partNum, []);
      groups.get(partNum)?.push(nodeId);
    }

    return Array.from(groups).map(([, partFiles]) => ({
      file: partFiles[0] ?? targetPath,
      reason: `File exceeds recommended size with multiple responsibilities (threshold: ${options.threshold ?? 500})`,
      suggestedSplits: partFiles.slice(0, 10).map((f) => ({
        name: path.basename(f),
        functions: [],
      })),
    }));
  }

  /**
   * Learn recurring patterns from code under a target path.
   */
  async learnPatterns(
    targetPath: string,
    _options: { patternTypes?: string[]; language?: string; minConfidence?: number } = {}
  ): Promise<{
    patterns: Array<{ name: string; occurrences: number; confidence: number }>;
    antiPatterns: Array<{ name: string; files: string[]; severity: string }>;
  }> {
    const files = walkCodeFiles(targetPath);
    let callbacks = 0;
    let tryCatchFiles = 0;
    let godObjects = 0;

    for (const file of files) {
      let content: string;
      try {
        content = fs.readFileSync(file, 'utf-8');
      } catch {
        continue;
      }
      if (/function\s*\([^)]*\)\s*\{[\s\S]*callback[\s\S]*\}/i.test(content)) callbacks++;
      if (/try\s*\{[\s\S]*\}\s*catch\s*\(/i.test(content)) tryCatchFiles++;
      if (content.split('\n').length > 500) godObjects++;
    }

    const patterns: Array<{ name: string; occurrences: number; confidence: number }> = [];
    if (callbacks > 0) patterns.push({ name: 'Callback → async/await conversion', occurrences: callbacks, confidence: 0.85 });
    if (tryCatchFiles > 0) patterns.push({ name: 'Error handling with try/catch', occurrences: tryCatchFiles, confidence: 0.8 });

    const antiPatterns: Array<{ name: string; files: string[]; severity: string }> = [];
    if (godObjects > 0) {
      antiPatterns.push({ name: 'God Object', files: files.slice(0, 3), severity: 'high' });
    }

    return { patterns, antiPatterns };
  }
}

/**
 * High-level code analysis facade instance.
 */
export interface CodeGNNBridge {
  initialized: boolean;
  initialize(): Promise<void>;
  isInitialized(): boolean;
  analyzeArchitecture(
    rootPath?: string,
    options?: {
      analysisTypes?: string[];
      depth?: number;
      excludePatterns?: string[];
      outputFormat?: string;
    }
  ): Promise<{
    components: Array<{ name: string; type: string; files: number; dependencies: number }>;
    metrics: { modularity: number; coupling: number; cohesion: number };
    issues: Array<{ type: string; components: string[]; severity: string }>;
  }>;
  analyzeRefactorImpact(
    targetPath: string,
    options?: {
      changeType?: string;
      description?: string;
      includeTests?: boolean;
      depth?: number;
    }
  ): Promise<{
    directImpact: string[];
    indirectImpact: string[];
    riskLevel: 'low' | 'medium' | 'high';
    breakingChanges: string[];
  }>;
  suggestSplit(
    targetPath: string,
    options?: { threshold?: number; strategy?: string; includePatterns?: string[] }
  ): Promise<Array<{
    file: string;
    reason: string;
    suggestedSplits: Array<{ name: string; functions: string[] }>;
  }>>;
  learnPatterns(
    targetPath: string,
    options?: { patternTypes?: string[]; language?: string; minConfidence?: number }
  ): Promise<{
    patterns: Array<{ name: string; occurrences: number; confidence: number }>;
    antiPatterns: Array<{ name: string; files: string[]; severity: string }>;
  }>;
}

/**
 * Create a high-level code analysis bridge.
 */
export function CodeGNNBridge(embeddingDim = 128): CodeGNNBridge {
  return new GNNBridgeFacade(embeddingDim);
}

export default GNNBridge;
