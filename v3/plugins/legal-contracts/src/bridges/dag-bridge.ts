/**
 * DAG Bridge for Obligation Tracking
 *
 * Provides directed acyclic graph operations for obligation dependency
 * tracking using ruvector-dag-wasm for high-performance graph algorithms.
 *
 * Features:
 * - Obligation dependency graph construction
 * - Critical path analysis
 * - Topological sorting
 * - Cycle detection
 * - Float/slack calculation
 *
 * Based on ADR-034: Legal Contract Analysis Plugin
 *
 * @module v3/plugins/legal-contracts/bridges/dag-bridge
 */

import type {
  IDAGBridge,
  Obligation,
  ObligationTrackingResult,
  ObligationNode,
  ExtractedClause,
  RiskFinding,
  RiskSeverity,
  ClauseAlignment,
  ContractChange,
  PlaybookMatch,
  Playbook,
  PlaybookStrictness,
} from '../types.js';

/**
 * WASM module interface for DAG operations
 */
interface DAGWasmModule {
  /** Build adjacency list from edge list */
  dag_build(edges: Uint32Array, nodeCount: number): number;

  /** Topological sort */
  dag_topological_sort(graphPtr: number): Uint32Array;

  /** Detect cycles */
  dag_detect_cycles(graphPtr: number): Uint32Array;

  /** Find critical path */
  dag_critical_path(
    graphPtr: number,
    weights: Float32Array
  ): Uint32Array;

  /** Calculate longest path */
  dag_longest_path(
    graphPtr: number,
    weights: Float32Array
  ): Float32Array;

  /** Free graph */
  dag_free(graphPtr: number): void;

  /** Memory management */
  alloc(size: number): number;
  dealloc(ptr: number, size: number): void;
  memory: WebAssembly.Memory;
}

/**
 * Edge type for dependency graph
 */
type EdgeType = 'depends_on' | 'blocks' | 'triggers';

/**
 * DAG Bridge Implementation
 */
export class DAGBridge implements IDAGBridge {
  // WASM module for future performance optimization (currently uses JS fallback)
  private wasmModule: DAGWasmModule | null = null;
  private initialized = false;

  /**
   * Initialize the WASM module
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamic import of WASM module
      // In production, this would load from @claude-flow/ruvector-upstream
      this.wasmModule = await this.loadWasmModule();
      this.initialized = true;
    } catch {
      // Fallback to pure JS implementation if WASM not available
      console.warn('WASM DAG module not available, using JS fallback');
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
   * Build obligation dependency graph
   */
  async buildDependencyGraph(
    obligations: Obligation[]
  ): Promise<ObligationTrackingResult['graph']> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Create node lookup
    const nodeMap = new Map<string, number>();
    obligations.forEach((obl, index) => {
      nodeMap.set(obl.id, index);
    });

    // Build edges from dependencies
    const edges: Array<{
      from: string;
      to: string;
      type: EdgeType;
    }> = [];

    for (const obligation of obligations) {
      // depends_on edges (this obligation depends on others)
      for (const depId of obligation.dependsOn) {
        if (nodeMap.has(depId)) {
          edges.push({
            from: depId,
            to: obligation.id,
            type: 'depends_on',
          });
        }
      }

      // blocks edges (this obligation blocks others)
      for (const blockId of obligation.blocks) {
        if (nodeMap.has(blockId)) {
          edges.push({
            from: obligation.id,
            to: blockId,
            type: 'blocks',
          });
        }
      }
    }

    // Find critical path
    const criticalPathIds = await this.findCriticalPathInternal(
      obligations,
      nodeMap,
      edges
    );

    // Calculate dates and float
    const { earliestStart, latestFinish, floatDays } = await this.calculateSchedule(
      obligations,
      nodeMap,
      edges
    );

    // Build nodes
    const nodes: ObligationNode[] = obligations.map(obligation => {
      return {
        obligation,
        dependencies: obligation.dependsOn,
        dependents: obligation.blocks,
        onCriticalPath: criticalPathIds.has(obligation.id),
        earliestStart: earliestStart.get(obligation.id),
        latestFinish: latestFinish.get(obligation.id),
        floatDays: floatDays.get(obligation.id),
      };
    });

    return { nodes, edges };
  }

  /**
   * Find critical path through obligations
   */
  async findCriticalPath(
    graph: ObligationTrackingResult['graph']
  ): Promise<string[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Extract obligations from nodes
    const obligations = graph.nodes.map(n => n.obligation);
    const nodeMap = new Map<string, number>();
    obligations.forEach((obl, index) => {
      nodeMap.set(obl.id, index);
    });

    const criticalIds = await this.findCriticalPathInternal(
      obligations,
      nodeMap,
      graph.edges
    );

    // Return in topological order
    const sorted = await this.topologicalSort(obligations);
    return sorted
      .filter(o => criticalIds.has(o.id))
      .map(o => o.id);
  }

  /**
   * Perform topological sort of obligations
   */
  async topologicalSort(obligations: Obligation[]): Promise<Obligation[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (obligations.length === 0) {
      return [];
    }

    // Create node lookup
    const nodeMap = new Map<string, number>();
    const indexMap = new Map<number, Obligation>();
    obligations.forEach((obl, index) => {
      nodeMap.set(obl.id, index);
      indexMap.set(index, obl);
    });

    // Build adjacency list
    const adj: number[][] = obligations.map(() => []);
    const inDegree = new Array(obligations.length).fill(0);

    for (const obligation of obligations) {
      const fromIndex = nodeMap.get(obligation.id);
      if (fromIndex === undefined) continue;

      for (const depId of obligation.blocks) {
        const toIndex = nodeMap.get(depId);
        if (toIndex !== undefined) {
          adj[fromIndex]?.push(toIndex);
          inDegree[toIndex] = (inDegree[toIndex] ?? 0) + 1;
        }
      }
    }

    // Kahn's algorithm
    const queue: number[] = [];
    for (let i = 0; i < inDegree.length; i++) {
      if (inDegree[i] === 0) {
        queue.push(i);
      }
    }

    const sorted: Obligation[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const obligation = indexMap.get(current);
      if (obligation) {
        sorted.push(obligation);
      }

      for (const neighbor of adj[current] ?? []) {
        inDegree[neighbor] = (inDegree[neighbor] ?? 1) - 1;
        if (inDegree[neighbor] === 0) {
          queue.push(neighbor);
        }
      }
    }

    // If not all nodes are in sorted, there's a cycle
    if (sorted.length !== obligations.length) {
      console.warn('Cycle detected in obligation dependencies');
    }

    return sorted;
  }

  /**
   * Detect cycles in dependency graph
   */
  async detectCycles(
    graph: ObligationTrackingResult['graph']
  ): Promise<string[][]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const obligations = graph.nodes.map(n => n.obligation);

    // Create node lookup
    const nodeMap = new Map<string, number>();
    const indexMap = new Map<number, string>();
    obligations.forEach((obl, index) => {
      nodeMap.set(obl.id, index);
      indexMap.set(index, obl.id);
    });

    // Build adjacency list
    const adj: number[][] = obligations.map(() => []);

    for (const edge of graph.edges) {
      const fromIndex = nodeMap.get(edge.from);
      const toIndex = nodeMap.get(edge.to);
      if (fromIndex !== undefined && toIndex !== undefined) {
        adj[fromIndex]?.push(toIndex);
      }
    }

    // Find cycles using DFS
    const cycles: string[][] = [];
    const visited = new Array(obligations.length).fill(false);
    const recStack = new Array(obligations.length).fill(false);
    const parent = new Array(obligations.length).fill(-1);

    const findCycle = (node: number, path: number[]): void => {
      visited[node] = true;
      recStack[node] = true;
      path.push(node);

      for (const neighbor of adj[node] ?? []) {
        if (!visited[neighbor]) {
          parent[neighbor] = node;
          findCycle(neighbor, [...path]);
        } else if (recStack[neighbor]) {
          // Found cycle
          const cycleStart = path.indexOf(neighbor);
          if (cycleStart >= 0) {
            const cycle = path.slice(cycleStart).map(i => indexMap.get(i) ?? '');
            cycles.push(cycle);
          }
        }
      }

      recStack[node] = false;
    };

    for (let i = 0; i < obligations.length; i++) {
      if (!visited[i]) {
        findCycle(i, []);
      }
    }

    return cycles;
  }

  /**
   * Calculate slack/float for each obligation
   */
  async calculateFloat(
    graph: ObligationTrackingResult['graph'],
    projectEnd: Date
  ): Promise<Map<string, number>> {
    if (!this.initialized) {
      await this.initialize();
    }

    const obligations = graph.nodes.map(n => n.obligation);
    const nodeMap = new Map<string, number>();
    obligations.forEach((obl, index) => {
      nodeMap.set(obl.id, index);
    });

    const { floatDays } = await this.calculateSchedule(
      obligations,
      nodeMap,
      graph.edges,
      projectEnd
    );

    return floatDays;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Load WASM module dynamically
   */
  private async loadWasmModule(): Promise<DAGWasmModule> {
    // In production, this would load from @claude-flow/ruvector-upstream
    // For now, throw to trigger JS fallback
    throw new Error('WASM module loading not implemented');
  }

  /**
   * Find critical path internally
   */
  private async findCriticalPathInternal(
    obligations: Obligation[],
    nodeMap: Map<string, number>,
    edges: Array<{ from: string; to: string; type: EdgeType }>
  ): Promise<Set<string>> {
    const criticalIds = new Set<string>();

    // Build adjacency list and weights
    const adj: Map<number, number[]> = new Map();
    const weights: Map<number, number> = new Map();

    for (let i = 0; i < obligations.length; i++) {
      adj.set(i, []);
      // Use estimated duration as weight (default 1 day)
      const obligation = obligations[i];
      weights.set(i, this.estimateDuration(obligation));
    }

    for (const edge of edges) {
      const fromIndex = nodeMap.get(edge.from);
      const toIndex = nodeMap.get(edge.to);
      if (fromIndex !== undefined && toIndex !== undefined) {
        adj.get(fromIndex)?.push(toIndex);
      }
    }

    // Find longest path using dynamic programming
    const sorted = await this.topologicalSort(obligations);
    const dist: Map<number, number> = new Map();
    const predecessor: Map<number, number> = new Map();

    // Initialize distances
    for (let i = 0; i < obligations.length; i++) {
      dist.set(i, 0);
    }

    // Process in topological order
    for (const obligation of sorted) {
      const u = nodeMap.get(obligation.id);
      if (u === undefined) continue;

      for (const v of adj.get(u) ?? []) {
        const newDist = (dist.get(u) ?? 0) + (weights.get(v) ?? 1);
        if (newDist > (dist.get(v) ?? 0)) {
          dist.set(v, newDist);
          predecessor.set(v, u);
        }
      }
    }

    // Find the end node with maximum distance
    let maxDist = 0;
    let endNode = 0;
    for (const [node, d] of dist) {
      if (d > maxDist) {
        maxDist = d;
        endNode = node;
      }
    }

    // Trace back critical path
    let current: number | undefined = endNode;
    while (current !== undefined) {
      const obligation = obligations[current];
      if (obligation) {
        criticalIds.add(obligation.id);
      }
      current = predecessor.get(current);
    }

    return criticalIds;
  }

  /**
   * Calculate schedule (earliest start, latest finish, float)
   */
  private async calculateSchedule(
    obligations: Obligation[],
    _nodeMap: Map<string, number>,
    edges: Array<{ from: string; to: string; type: EdgeType }>,
    projectEnd?: Date
  ): Promise<{
    earliestStart: Map<string, Date>;
    latestFinish: Map<string, Date>;
    floatDays: Map<string, number>;
  }> {
    const now = new Date();
    const endDate = projectEnd ?? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

    const earliestStart = new Map<string, Date>();
    const latestFinish = new Map<string, Date>();
    const floatDays = new Map<string, number>();

    // Build adjacency lists
    const successors: Map<string, string[]> = new Map();
    const predecessors: Map<string, string[]> = new Map();

    for (const obligation of obligations) {
      successors.set(obligation.id, []);
      predecessors.set(obligation.id, []);
    }

    for (const edge of edges) {
      successors.get(edge.from)?.push(edge.to);
      predecessors.get(edge.to)?.push(edge.from);
    }

    // Forward pass - calculate earliest start
    const sorted = await this.topologicalSort(obligations);
    for (const obligation of sorted) {
      const preds = predecessors.get(obligation.id) ?? [];
      let earliest = obligation.dueDate ?? now;

      for (const predId of preds) {
        const predObl = obligations.find(o => o.id === predId);
        const predEarliest = earliestStart.get(predId);
        if (predEarliest && predObl) {
          const predEnd = new Date(
            predEarliest.getTime() + this.estimateDuration(predObl) * 24 * 60 * 60 * 1000
          );
          if (predEnd > earliest) {
            earliest = predEnd;
          }
        }
      }

      earliestStart.set(obligation.id, earliest);
    }

    // Backward pass - calculate latest finish
    const reverseSorted = [...sorted].reverse();
    for (const obligation of reverseSorted) {
      const succs = successors.get(obligation.id) ?? [];
      let latest = endDate;

      for (const succId of succs) {
        const succLatest = latestFinish.get(succId);
        if (succLatest && succLatest < latest) {
          latest = new Date(
            succLatest.getTime() - this.estimateDuration(obligation) * 24 * 60 * 60 * 1000
          );
        }
      }

      latestFinish.set(obligation.id, latest);
    }

    // Calculate float
    for (const obligation of obligations) {
      const es = earliestStart.get(obligation.id);
      const lf = latestFinish.get(obligation.id);

      if (es && lf) {
        const duration = this.estimateDuration(obligation);
        const latestStart = new Date(lf.getTime() - duration * 24 * 60 * 60 * 1000);
        const floatMs = latestStart.getTime() - es.getTime();
        floatDays.set(obligation.id, Math.max(0, floatMs / (24 * 60 * 60 * 1000)));
      } else {
        floatDays.set(obligation.id, 0);
      }
    }

    return { earliestStart, latestFinish, floatDays };
  }

  /**
   * Estimate duration in days for an obligation
   */
  private estimateDuration(obligation: Obligation | undefined): number {
    if (!obligation) return 1;

    // Default durations by type
    const typeDurations: Record<string, number> = {
      payment: 1,
      delivery: 7,
      notification: 3,
      approval: 5,
      compliance: 30,
      reporting: 5,
      confidentiality: 0,
      performance: 14,
      insurance: 7,
      renewal: 30,
      termination: 30,
    };

    return typeDurations[obligation.type] ?? 7;
  }
}

/**
 * Create and export default bridge instance
 */
export function createDAGBridge(): IDAGBridge {
  return new DAGBridge();
}

export default DAGBridge;

// ============================================================================
// Legal Analysis Bridge
// ============================================================================

/**
 * Options for clause extraction
 */
export interface ClauseExtractOptions {
  clauseTypes?: string[];
  jurisdiction?: string;
  includePositions?: boolean;
  includeEmbeddings?: boolean;
}

/**
 * Options for risk assessment
 */
export interface RiskAssessOptions {
  partyRole?: string;
  riskCategories?: string[];
  industryContext?: string;
  threshold?: string;
}

/**
 * Options for contract comparison
 */
export interface ContractCompareOptions {
  mode?: string;
  focusClauseTypes?: string[];
  highlightChanges?: boolean;
  generateRedline?: boolean;
}

/**
 * Options for obligation extraction
 */
export interface ObligationExtractOptions {
  party?: string;
  timeframe?: string;
  obligationTypes?: string[];
  includeDependencies?: boolean;
  includeTimeline?: boolean;
}

/**
 * Options for playbook matching
 */
export interface PlaybookMatchOptions {
  strictness?: string;
  suggestAlternatives?: boolean;
  prioritizeClauses?: string[];
}

/**
 * Contract comparison analysis result
 */
export interface ContractComparisonAnalysis {
  similarity: number;
  differences: ContractChange[];
  changes: ContractChange[];
  alignments: ClauseAlignment[];
  summary: {
    totalChanges: number;
    added: number;
    removed: number;
    modified: number;
    favorable: number;
    unfavorable: number;
  };
  redlineMarkup?: string;
}

/**
 * Playbook matching analysis result
 */
export interface PlaybookMatchAnalysis {
  matchScore: number;
  deviations: Array<{
    position: string;
    expected: string;
    actual: string;
    severity: string;
    status: PlaybookMatch['status'];
  }>;
  recommendations: string[];
  matches: PlaybookMatch[];
  negotiationPriorities: Array<{
    clauseId: string;
    priority: number;
    reason: string;
  }>;
  playbook: { id: string; name: string; version: string };
}

/**
 * Legal Analysis Bridge
 *
 * Extends the DAG bridge with the full set of legal document analysis
 * operations: clause extraction, risk assessment, contract comparison,
 * obligation extraction, and playbook matching. All operations run in
 * pure JavaScript (WASM accelerated graph ops are inherited from
 * DAGBridge).
 */
export class LegalDAGBridge extends DAGBridge implements IDAGBridge {
  /**
   * Extract and classify clauses from a legal document
   */
  async extractClauses(
    document: string,
    options?: ClauseExtractOptions
  ): Promise<ExtractedClause[]> {
    await this.ensureReady();

    const clauses: ExtractedClause[] = [];
    const clauseTypes = options?.clauseTypes;

    const clausePatterns: Record<string, RegExp[]> = {
      indemnification: [/indemnif/i, /hold\s+harmless/i, /defend\s+and\s+indemnify/i],
      limitation_of_liability: [/limitation\s+of\s+liability/i, /liability\s+shall\s+not\s+exceed/i],
      termination: [/termination/i, /right\s+to\s+terminate/i, /upon\s+termination/i],
      confidentiality: [/confidential/i, /non-disclosure/i, /proprietary\s+information/i],
      ip_assignment: [/intellectual\s+property/i, /assignment\s+of\s+(ip|rights)/i, /work\s+for\s+hire/i],
      governing_law: [/governing\s+law/i, /governed\s+by\s+the\s+laws/i, /jurisdiction/i],
      arbitration: [/arbitration/i, /arbitral\s+proceedings/i, /binding\s+arbitration/i],
      force_majeure: [/force\s+majeure/i, /act\s+of\s+god/i, /beyond\s+reasonable\s+control/i],
      warranty: [/warrant/i, /represents\s+and\s+warrants/i, /as-is/i],
      payment_terms: [/payment/i, /invoic/i, /net\s+\d+/i],
      non_compete: [/non-?compet/i, /not\s+compete/i],
      non_solicitation: [/non-?solicit/i, /not\s+solicit/i],
      assignment: [/assignment/i, /may\s+not\s+assign/i],
      insurance: [/insurance/i, /maintain\s+coverage/i],
      representations: [/represent/i, /represent\s+and\s+warrant/i],
      covenants: [/covenant/i, /agrees\s+to/i],
      data_protection: [/data\s+protection/i, /personal\s+data/i, /gdpr/i, /privacy/i],
      audit_rights: [/audit/i, /right\s+to\s+inspect/i, /access\s+to\s+records/i],
    };

    // Split document into sections/paragraphs
    const sections = document.split(/\n\n+/);
    let offset = 0;

    for (const section of sections) {
      const sectionStart = document.indexOf(section, offset);
      const sectionEnd = sectionStart + section.length;
      offset = sectionEnd;

      // Try to classify section
      for (const [type, patterns] of Object.entries(clausePatterns)) {
        // Skip if not in requested types
        if (clauseTypes && clauseTypes.length > 0 && !clauseTypes.includes(type)) {
          continue;
        }

        // Check patterns
        let matchCount = 0;
        for (const pattern of patterns) {
          if (pattern.test(section)) {
            matchCount++;
          }
        }

        if (matchCount > 0) {
          const confidence = Math.min(0.5 + matchCount * 0.2, 0.99);

          clauses.push({
            id: `clause-${clauses.length + 1}`,
            type: type as ExtractedClause['type'],
            text: section.trim(),
            startOffset: sectionStart,
            endOffset: sectionEnd,
            confidence,
            keyTerms: this.extractKeyTerms(section),
          });

          break; // Only classify as one type
        }
      }
    }

    return clauses;
  }

  /**
   * Assess contractual risks in a document
   */
  async analyzeRisks(
    document: string,
    options?: RiskAssessOptions
  ): Promise<RiskFinding[]> {
    await this.ensureReady();

    const clauses = await this.extractClauses(document);
    const risks: RiskFinding[] = [];
    const categories = options?.riskCategories;

    // Risk patterns by clause type
    const riskPatterns: Record<string, Array<{
      pattern: RegExp;
      severity: RiskSeverity;
      category: RiskFinding['category'];
      title: string;
      description: string;
      mitigation: string;
    }>> = {
      indemnification: [
        {
          pattern: /unlimited\s+indemnification/i,
          severity: 'critical',
          category: 'financial',
          title: 'Unlimited Indemnification',
          description: 'Contract requires unlimited indemnification which could expose party to significant financial risk',
          mitigation: 'Negotiate cap on indemnification liability',
        },
      ],
      limitation_of_liability: [
        {
          pattern: /no\s+limitation/i,
          severity: 'high',
          category: 'financial',
          title: 'No Liability Cap',
          description: 'Contract contains no limitation on liability',
          mitigation: 'Add liability cap based on contract value or insurance coverage',
        },
      ],
      termination: [
        {
          pattern: /immediate\s+termination/i,
          severity: 'medium',
          category: 'operational',
          title: 'Immediate Termination Right',
          description: 'Counterparty can terminate immediately without notice',
          mitigation: 'Negotiate notice period for termination',
        },
      ],
      warranty: [
        {
          pattern: /as-?is/i,
          severity: 'medium',
          category: 'legal',
          title: 'As-Is Warranty Disclaimer',
          description: 'Product/service provided without warranty',
          mitigation: 'Negotiate minimum performance warranties',
        },
      ],
    };

    for (const clause of clauses) {
      const patterns = riskPatterns[clause.type] ?? [];

      for (const riskPattern of patterns) {
        if (riskPattern.pattern.test(clause.text)) {
          // Filter by category if specified
          if (categories && !categories.includes(riskPattern.category)) {
            continue;
          }

          risks.push({
            id: `risk-${risks.length + 1}`,
            category: riskPattern.category,
            severity: riskPattern.severity,
            title: riskPattern.title,
            description: riskPattern.description,
            clauseIds: [clause.id],
            mitigations: [riskPattern.mitigation],
            deviatesFromStandard: true,
            confidence: clause.confidence,
          });
        }
      }
    }

    return risks;
  }

  /**
   * Compare two contracts with clause-level diff and similarity scoring
   */
  async compareContracts(
    baseDocument: string,
    compareDocument: string,
    options?: ContractCompareOptions
  ): Promise<ContractComparisonAnalysis> {
    await this.ensureReady();

    const baseClauses = await this.extractClauses(baseDocument, {
      clauseTypes: options?.focusClauseTypes,
    });
    const compareClauses = await this.extractClauses(compareDocument, {
      clauseTypes: options?.focusClauseTypes,
    });

    // Align clauses by type and text similarity
    const alignments = this.alignClauses(baseClauses, compareClauses);
    const changes = this.detectChanges(baseClauses, compareClauses, alignments);

    const similarity = alignments.length > 0
      ? alignments.reduce((sum, a) => sum + a.similarity, 0) / alignments.length
      : 0;

    const summary = {
      totalChanges: changes.length,
      added: changes.filter(c => c.type === 'added').length,
      removed: changes.filter(c => c.type === 'removed').length,
      modified: changes.filter(c => c.type === 'modified').length,
      favorable: changes.filter(c => c.impact === 'favorable').length,
      unfavorable: changes.filter(c => c.impact === 'unfavorable').length,
    };

    const redlineMarkup = options?.generateRedline
      ? this.generateRedlineMarkup(baseDocument, changes)
      : undefined;

    return {
      similarity,
      differences: changes,
      changes,
      alignments,
      summary,
      redlineMarkup,
    };
  }

  /**
   * Extract obligations from a document
   */
  async extractObligations(
    document: string,
    options?: ObligationExtractOptions
  ): Promise<Obligation[]> {
    await this.ensureReady();

    const obligations: Obligation[] = [];
    const types = options?.obligationTypes;

    // Obligation patterns
    const obligationPatterns: Record<string, { pattern: RegExp; type: Obligation['type'] }[]> = {
      payment: [
        { pattern: /shall\s+pay/i, type: 'payment' },
        { pattern: /payment\s+due/i, type: 'payment' },
      ],
      delivery: [
        { pattern: /shall\s+deliver/i, type: 'delivery' },
        { pattern: /delivery\s+date/i, type: 'delivery' },
      ],
      notification: [
        { pattern: /shall\s+notify/i, type: 'notification' },
        { pattern: /provide\s+notice/i, type: 'notification' },
      ],
      approval: [
        { pattern: /shall\s+approve/i, type: 'approval' },
        { pattern: /written\s+approval/i, type: 'approval' },
      ],
      compliance: [
        { pattern: /shall\s+comply/i, type: 'compliance' },
        { pattern: /in\s+compliance\s+with/i, type: 'compliance' },
      ],
    };

    const sentences = document.split(/[.!?]+/);

    for (const sentenceRaw of sentences) {
      const sentence = sentenceRaw?.trim() ?? '';
      if (!sentence) continue;

      for (const [, patterns] of Object.entries(obligationPatterns)) {
        for (const { pattern, type } of patterns) {
          if (types && !types.includes(type)) continue;

          if (pattern.test(sentence)) {
            obligations.push({
              id: `obl-${obligations.length + 1}`,
              type,
              party: this.extractParty(sentence),
              description: sentence,
              dependsOn: [],
              blocks: [],
              clauseIds: [],
              status: 'pending',
              priority: 'medium',
            });
            break;
          }
        }
      }
    }

    // Filter by party if specified
    if (options?.party) {
      const party = options.party.toLowerCase();
      return obligations.filter(o => o.party.toLowerCase().includes(party));
    }

    return obligations;
  }

  /**
   * Match document clauses against a negotiation playbook
   */
  async matchPlaybook(
    document: string,
    playbookInput: string,
    options?: PlaybookMatchOptions
  ): Promise<PlaybookMatchAnalysis> {
    await this.ensureReady();

    const playbook = this.parsePlaybook(playbookInput);
    const clauses = await this.extractClauses(document);
    const strictness = (options?.strictness ?? 'moderate') as PlaybookStrictness;
    const suggestAlternatives = options?.suggestAlternatives ?? true;

    const matches: PlaybookMatch[] = [];

    for (const clause of clauses) {
      const position = playbook.positions.find(p => p.clauseType === clause.type);

      if (!position) {
        matches.push({
          clauseId: clause.id,
          position: {
            clauseType: clause.type,
            preferredLanguage: '',
            acceptableVariations: [],
            redLines: [],
            fallbackPositions: [],
            negotiationNotes: '',
            businessJustification: '',
          },
          status: 'no_match',
          preferredSimilarity: 0,
          recommendation: 'No playbook position defined for this clause type',
        });
        continue;
      }

      // Check against preferred language
      const preferredSimilarity = this.textSimilarity(clause.text, position.preferredLanguage);

      // Determine status based on similarity and strictness
      const thresholds = {
        strict: { preferred: 0.95, acceptable: 0.9, fallback: 0.8 },
        moderate: { preferred: 0.85, acceptable: 0.75, fallback: 0.6 },
        flexible: { preferred: 0.7, acceptable: 0.6, fallback: 0.4 },
      };
      const threshold = thresholds[strictness];

      // Check red lines first
      const violatesRedLine = position.redLines.some(rl =>
        clause.text.toLowerCase().includes(rl.toLowerCase())
      );

      let status: PlaybookMatch['status'];
      if (violatesRedLine) {
        status = 'violates_redline';
      } else if (preferredSimilarity >= threshold.preferred) {
        status = 'matches_preferred';
      } else if (position.acceptableVariations.some(v =>
        this.textSimilarity(clause.text, v) >= threshold.acceptable
      )) {
        status = 'matches_acceptable';
      } else if (position.fallbackPositions.length > 0) {
        status = 'requires_fallback';
      } else {
        status = 'no_match';
      }

      matches.push({
        clauseId: clause.id,
        position,
        status,
        preferredSimilarity,
        suggestedAlternative: suggestAlternatives ? position.preferredLanguage : undefined,
        recommendation: this.recommendationFor(status),
      });
    }

    // Match score: weighted share of preferred matches
    const matchScore = matches.length > 0
      ? matches.reduce((sum, m) => sum + m.preferredSimilarity, 0) / matches.length
      : 0;

    // Deviations from preferred positions
    const deviations = matches
      .filter(m => m.status !== 'matches_preferred')
      .map(m => ({
        position: m.position.clauseType,
        expected: m.position.preferredLanguage,
        actual: m.suggestedAlternative ?? '',
        severity: m.status === 'violates_redline' ? 'high' : m.status === 'no_match' ? 'medium' : 'low',
        status: m.status,
      }));

    return {
      matchScore,
      deviations,
      recommendations: matches.map(m => m.recommendation),
      matches,
      negotiationPriorities: this.buildNegotiationPriorities(matches, options?.prioritizeClauses),
      playbook: {
        id: playbook.id,
        name: playbook.name,
        version: playbook.version,
      },
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async ensureReady(): Promise<void> {
    if (!this.isInitialized()) {
      await this.initialize();
    }
  }

  private extractKeyTerms(text: string): string[] {
    const terms: string[] = [];
    const termPatterns = [
      /\$[\d,]+/g,
      /\d+\s*(days?|months?|years?)/gi,
      /\d+%/g,
      /"[^"]+"/g,
    ];

    for (const pattern of termPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        terms.push(...matches);
      }
    }

    return [...new Set(terms)].slice(0, 10);
  }

  private extractParty(sentence: string): string {
    const partyPatterns = [
      /the\s+(buyer|seller|licensor|licensee|employer|employee)/i,
      /(party\s+a|party\s+b)/i,
      /the\s+company/i,
    ];

    for (const pattern of partyPatterns) {
      const match = sentence.match(pattern);
      if (match?.[1]) {
        return match[1];
      }
    }

    return 'Unknown Party';
  }

  private alignClauses(
    baseClauses: ExtractedClause[],
    compareClauses: ExtractedClause[]
  ): ClauseAlignment[] {
    const alignments: ClauseAlignment[] = [];
    const usedCompare = new Set<number>();

    for (const base of baseClauses) {
      const index = compareClauses.findIndex((c, i) => c.type === base.type && !usedCompare.has(i));

      if (index >= 0) {
        usedCompare.add(index);
        const compare = compareClauses[index]!;
        const similarity = this.textSimilarity(base.text, compare.text);

        alignments.push({
          baseClauseId: base.id,
          compareClauseId: compare.id,
          similarity,
          alignmentType: similarity >= 0.95 ? 'exact' : similarity >= 0.5 ? 'similar' : 'related',
          differences: [],
        });
      } else {
        alignments.push({
          baseClauseId: base.id,
          compareClauseId: '',
          similarity: 0,
          alignmentType: 'no_match',
          differences: [],
        });
      }
    }

    // Unpaired compare clauses
    for (let i = 0; i < compareClauses.length; i++) {
      if (!usedCompare.has(i)) {
        alignments.push({
          baseClauseId: '',
          compareClauseId: compareClauses[i]!.id,
          similarity: 0,
          alignmentType: 'no_match',
          differences: [],
        });
      }
    }

    return alignments;
  }

  private detectChanges(
    baseClauses: ExtractedClause[],
    compareClauses: ExtractedClause[],
    alignments: ClauseAlignment[]
  ): ContractChange[] {
    const changes: ContractChange[] = [];
    const alignedCompare = new Set(alignments.map(a => a.compareClauseId));

    for (const alignment of alignments) {
      const baseClause = baseClauses.find(c => c.id === alignment.baseClauseId);
      const compareClause = compareClauses.find(c => c.id === alignment.compareClauseId);

      if (alignment.alignmentType === 'no_match' && baseClause) {
        changes.push({
          type: 'removed',
          clauseType: baseClause.type,
          baseSection: baseClause.section,
          baseText: baseClause.text,
          significance: 0.8,
          impact: 'requires_review',
          explanation: 'Clause exists in base but not in comparison document',
        });
      } else if (alignment.alignmentType !== 'exact' && baseClause && compareClause) {
        changes.push({
          type: 'modified',
          clauseType: baseClause.type,
          baseSection: baseClause.section,
          compareSection: compareClause.section,
          baseText: baseClause.text,
          compareText: compareClause.text,
          significance: 1 - alignment.similarity,
          impact: 'requires_review',
          explanation: `Clause modified (${(alignment.similarity * 100).toFixed(1)}% similarity)`,
        });
      }
    }

    // Find added clauses
    for (const clause of compareClauses) {
      if (!alignedCompare.has(clause.id)) {
        changes.push({
          type: 'added',
          clauseType: clause.type,
          compareSection: clause.section,
          compareText: clause.text,
          significance: 0.7,
          impact: 'requires_review',
          explanation: 'New clause in comparison document',
        });
      }
    }

    return changes;
  }

  private generateRedlineMarkup(baseDocument: string, changes: ContractChange[]): string {
    let markup = baseDocument;

    for (const change of changes) {
      if (change.type === 'removed' && change.baseText) {
        markup = markup.replace(
          change.baseText,
          `<del style="color:red">${change.baseText}</del>`
        );
      } else if (change.type === 'added' && change.compareText) {
        markup += `\n<ins style="color:green">${change.compareText}</ins>`;
      }
    }

    return markup;
  }

  private parsePlaybook(playbookInput: string): Playbook {
    try {
      const parsed = JSON.parse(playbookInput);
      return parsed as Playbook;
    } catch {
      // Return a default playbook
      return {
        id: playbookInput,
        name: 'Default Playbook',
        contractType: 'General',
        jurisdiction: 'US',
        partyRole: 'buyer',
        updatedAt: new Date(),
        version: '1.0.0',
        positions: [],
      };
    }
  }

  private textSimilarity(text1: string, text2: string): number {
    if (!text1 || !text2) return 0;

    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  private recommendationFor(status: PlaybookMatch['status']): string {
    const recommendations: Record<PlaybookMatch['status'], string> = {
      matches_preferred: 'Clause matches preferred playbook position. No action required.',
      matches_acceptable: 'Clause is within acceptable variation. Consider negotiating closer to preferred position.',
      requires_fallback: 'Clause requires fallback position. Review fallback options and negotiate accordingly.',
      violates_redline: 'CRITICAL: Clause violates red line. This must be negotiated before signing.',
      no_match: 'No playbook position available. Conduct independent review of this clause.',
    };

    return recommendations[status];
  }

  private buildNegotiationPriorities(
    matches: PlaybookMatch[],
    prioritizedTypes: string[] | undefined
  ): Array<{ clauseId: string; priority: number; reason: string }> {
    const priorities: Array<{ clauseId: string; priority: number; reason: string }> = [];

    const statusPriority: Record<PlaybookMatch['status'], number> = {
      violates_redline: 100,
      requires_fallback: 70,
      no_match: 50,
      matches_acceptable: 30,
      matches_preferred: 10,
    };

    for (const match of matches) {
      let priority = statusPriority[match.status];

      // Boost priority for prioritized clause types
      if (prioritizedTypes?.includes(match.position.clauseType)) {
        priority += 20;
      }

      priorities.push({
        clauseId: match.clauseId,
        priority,
        reason: match.recommendation,
      });
    }

    return priorities.sort((a, b) => b.priority - a.priority);
  }
}
