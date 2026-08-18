/**
 * Code Intelligence Plugin - MCP Tools
 *
 * Implements 5 MCP tools for advanced code analysis:
 * 1. code/semantic-search - Find semantically similar code patterns
 * 2. code/architecture-analyze - Analyze codebase architecture
 * 3. code/refactor-impact - Predict refactoring impact
 * 4. code/split-suggest - Suggest module splits
 * 5. code/learn-patterns - Learn patterns from code
 *
 * Based on ADR-035: Advanced Code Intelligence Plugin
 *
 * @module v3/plugins/code-intelligence/mcp-tools
 */

import { z } from 'zod';
import { maskSecrets } from './types.js';
import { CodeGNNBridge } from './bridges/gnn-bridge.js';
import { CodeHNSWBridge } from './bridges/hnsw-bridge.js';

// ============================================================================
// MCP Tool Types
// ============================================================================

/**
 * JSON-Schema-style input schema exposed on MCP tool definitions.
 */
export interface MCPToolInputSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

/**
 * MCP Tool result format.
 *
 * `isError` is `undefined` on success (omitted) and `true` on failure;
 * error payloads are serialized as `{ error: true, message, timestamp, ... }`.
 */
export interface MCPToolResult<T = unknown> {
  isError?: boolean;
  content: Array<{ type: 'text'; text: string }>;
  data?: T;
}

/**
 * Tool execution context. All members are optional so tools can run with a
 * bare `{ logger }` context (bridges/config default internally).
 */
export interface ToolContext {
  logger?: {
    debug?: (...args: unknown[]) => void;
    info?: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
    error?: (...args: unknown[]) => void;
  };
  userId?: string;
  get?<T>(key: string): T | undefined;
  set?<T>(key: string, value: T): void;
  bridges?: {
    gnn?: CodeGNNBridge;
    hnsw?: CodeHNSWBridge;
  };
  config?: {
    allowedRoots?: string[];
    blockedPatterns?: RegExp[];
    maskSecrets?: boolean;
  };
}

/**
 * MCP Tool definition
 */
export interface MCPTool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  category: string;
  version: string;
  cacheable: boolean;
  inputSchema: MCPToolInputSchema;
  handler: (input: TInput, context: ToolContext) => Promise<MCPToolResult<TOutput>>;
}

// ============================================================================
// Result Helpers
// ============================================================================

/**
 * Build a success result. `isError` is intentionally omitted (undefined) —
 * the tool contract distinguishes success from failure by absence vs `true`.
 */
function successResult<T>(data: T): MCPToolResult<T> {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    data,
  };
}

/**
 * Build an error result carrying the `{ error: true, message, timestamp }`
 * contract asserted by the tool tests.
 */
function errorResult(error: unknown, startTime: number): MCPToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{
      type: 'text',
      text: JSON.stringify({
        error: true,
        message,
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startTime,
      }, null, 2),
    }],
  };
}

function toolInputSchema(required: string[], properties: Record<string, unknown>): MCPToolInputSchema {
  return { type: 'object', properties, required };
}

// ============================================================================
// Semantic Search Tool
// ============================================================================

const semanticSearchParams = z.object({
  query: z.string().min(1).max(1000),
  topK: z.number().int().min(1).max(1000).optional(),
  language: z.string().optional(),
  searchType: z.string().optional(),
  pathFilter: z.string().optional(),
});

interface BridgeSearchResult {
  id?: string;
  path?: string;
  filePath?: string;
  content?: string;
  snippet?: string;
  score?: number;
  language?: string;
}

/**
 * MCP Tool: code/semantic-search
 */
export const semanticSearchTool: MCPTool = {
  name: 'code/semantic-search',
  description: 'Search for semantically similar code patterns',
  category: 'code-intelligence',
  version: '0.1.0',
  cacheable: true,
  inputSchema: toolInputSchema(['query'], {
    query: { type: 'string', minLength: 1, maxLength: 1000 },
    topK: { type: 'number', minimum: 1, maximum: 1000 },
    language: { type: 'string' },
    searchType: { type: 'string' },
    pathFilter: { type: 'string' },
  }),
  handler: async (input, context) => {
    const startTime = Date.now();
    try {
      const validated = semanticSearchParams.parse(input);

      const bridge = context?.bridges?.hnsw ?? CodeHNSWBridge();
      if (typeof bridge.initialize === 'function') await bridge.initialize();

      const raw = (await bridge.searchSemantic?.(validated.query, {
        topK: validated.topK ?? 10,
        languages: validated.language ? [validated.language] : undefined,
        pathFilter: validated.pathFilter,
      })) ?? [];

      const mask = context?.config?.maskSecrets !== false;
      const results = (raw as unknown as BridgeSearchResult[]).map((r) => ({
        id: r.id ?? r.filePath ?? '',
        filePath: r.path ?? r.filePath ?? '',
        content: mask ? maskSecrets(r.content ?? r.snippet ?? '') : (r.content ?? r.snippet ?? ''),
        score: r.score ?? 0,
        language: r.language,
      }));

      const data = {
        success: true,
        query: validated.query,
        results,
        totalMatches: results.length,
        searchTime: Date.now() - startTime,
      };

      context?.logger?.info?.(`code/semantic-search completed`, {
        durationMs: String(Date.now() - startTime),
      });
      return successResult(data);
    } catch (error) {
      return errorResult(error, startTime);
    }
  },
};

// ============================================================================
// Architecture Analyze Tool
// ============================================================================

const architectureAnalyzeParams = z.object({
  targetPath: z.string().min(1).max(500),
  analysisTypes: z.array(z.string()).optional(),
  depth: z.number().int().min(1).max(10).optional(),
  excludePatterns: z.array(z.string()).optional(),
  outputFormat: z.string().optional(),
});

interface ArchitectureRaw {
  components?: Array<{ name: string; type: string; files: number; dependencies: number }>;
  metrics?: Record<string, unknown>;
  issues?: Array<{ type: string; components: string[]; severity: string }>;
}

/**
 * MCP Tool: code/architecture-analyze
 */
export const architectureAnalyzeTool: MCPTool = {
  name: 'code/architecture-analyze',
  description: 'Analyze codebase architecture and detect drift',
  category: 'code-intelligence',
  version: '0.1.0',
  cacheable: true,
  inputSchema: toolInputSchema(['targetPath'], {
    targetPath: { type: 'string', minLength: 1, maxLength: 500 },
    analysisTypes: { type: 'array', items: { type: 'string' } },
    depth: { type: 'number', minimum: 1, maximum: 10 },
    excludePatterns: { type: 'array', items: { type: 'string' } },
    outputFormat: { type: 'string' },
  }),
  handler: async (input, context) => {
    const startTime = Date.now();
    try {
      const validated = architectureAnalyzeParams.parse(input);

      const gnn = context?.bridges?.gnn ?? CodeGNNBridge();
      if (typeof gnn.initialize === 'function') await gnn.initialize();

      const raw = (await gnn.analyzeArchitecture?.(validated.targetPath, {
        analysisTypes: validated.analysisTypes,
        depth: validated.depth,
        excludePatterns: validated.excludePatterns,
        outputFormat: validated.outputFormat,
      })) as unknown as ArchitectureRaw | undefined;

      const data = {
        success: true,
        targetPath: validated.targetPath,
        components: raw?.components ?? [],
        metrics: raw?.metrics ?? {},
        issues: raw?.issues ?? [],
        analysisTime: Date.now() - startTime,
      };

      context?.logger?.info?.(`code/architecture-analyze completed`, {
        durationMs: String(Date.now() - startTime),
      });
      return successResult(data);
    } catch (error) {
      return errorResult(error, startTime);
    }
  },
};

// ============================================================================
// Refactor Impact Tool
// ============================================================================

const refactorImpactParams = z.object({
  targetPath: z.string().min(1).max(500),
  changeType: z.enum(['rename', 'move', 'delete', 'signature_change', 'type_change', 'dependency_change']),
  description: z.string().optional(),
  includeTests: z.boolean().optional(),
  depth: z.number().int().min(1).max(10).optional(),
});

interface RefactorRaw {
  directImpact?: string[];
  indirectImpact?: string[];
  riskLevel?: 'low' | 'medium' | 'high';
  breakingChanges?: string[];
}

/**
 * MCP Tool: code/refactor-impact
 */
export const refactorImpactTool: MCPTool = {
  name: 'code/refactor-impact',
  description: 'Analyze impact of proposed code changes using GNN',
  category: 'code-intelligence',
  version: '0.1.0',
  cacheable: false,
  inputSchema: toolInputSchema(['targetPath', 'changeType'], {
    targetPath: { type: 'string', minLength: 1, maxLength: 500 },
    changeType: { type: 'string', enum: ['rename', 'move', 'delete', 'signature_change', 'type_change', 'dependency_change'] },
    description: { type: 'string' },
    includeTests: { type: 'boolean' },
    depth: { type: 'number', minimum: 1, maximum: 10 },
  }),
  handler: async (input, context) => {
    const startTime = Date.now();
    try {
      const validated = refactorImpactParams.parse(input);

      const gnn = context?.bridges?.gnn ?? CodeGNNBridge();
      if (typeof gnn.initialize === 'function') await gnn.initialize();

      const raw = (await gnn.analyzeRefactorImpact?.(validated.targetPath, {
        changeType: validated.changeType,
        description: validated.description,
        includeTests: validated.includeTests,
        depth: validated.depth,
      })) as unknown as RefactorRaw | undefined;

      const data = {
        success: true,
        targetPath: validated.targetPath,
        changeType: validated.changeType,
        directImpact: raw?.directImpact ?? [],
        indirectImpact: raw?.indirectImpact ?? [],
        riskLevel: raw?.riskLevel ?? 'low',
        breakingChanges: raw?.breakingChanges ?? [],
      };

      context?.logger?.info?.(`code/refactor-impact completed`, {
        durationMs: String(Date.now() - startTime),
      });
      return successResult(data);
    } catch (error) {
      return errorResult(error, startTime);
    }
  },
};

// ============================================================================
// Split Suggest Tool
// ============================================================================

const splitSuggestParams = z.object({
  targetPath: z.string().min(1).max(500),
  threshold: z.number().int().min(50).max(5000).optional(),
  strategy: z.string().optional(),
  includePatterns: z.array(z.string()).optional(),
});

interface SplitRaw {
  file?: string;
  reason?: string;
  suggestedSplits?: Array<{ name: string; functions: string[] }>;
}

/**
 * MCP Tool: code/split-suggest
 */
export const splitSuggestTool: MCPTool = {
  name: 'code/split-suggest',
  description: 'Suggest optimal code splitting using MinCut algorithm',
  category: 'code-intelligence',
  version: '0.1.0',
  cacheable: true,
  inputSchema: toolInputSchema(['targetPath'], {
    targetPath: { type: 'string', minLength: 1, maxLength: 500 },
    threshold: { type: 'number', minimum: 50, maximum: 5000 },
    strategy: { type: 'string' },
    includePatterns: { type: 'array', items: { type: 'string' } },
  }),
  handler: async (input, context) => {
    const startTime = Date.now();
    try {
      const validated = splitSuggestParams.parse(input);

      const gnn = context?.bridges?.gnn ?? CodeGNNBridge();
      if (typeof gnn.initialize === 'function') await gnn.initialize();

      const raw = (await gnn.suggestSplit?.(validated.targetPath, {
        threshold: validated.threshold,
        strategy: validated.strategy,
        includePatterns: validated.includePatterns,
      })) as unknown as SplitRaw[] | undefined;

      const data = {
        success: true,
        targetPath: validated.targetPath,
        threshold: validated.threshold ?? 500,
        suggestions: Array.isArray(raw) ? raw : [],
        analysisTime: Date.now() - startTime,
      };

      context?.logger?.info?.(`code/split-suggest completed`, {
        durationMs: String(Date.now() - startTime),
      });
      return successResult(data);
    } catch (error) {
      return errorResult(error, startTime);
    }
  },
};

// ============================================================================
// Learn Patterns Tool
// ============================================================================

const learnPatternsParams = z.object({
  targetPath: z.string().min(1).max(500),
  patternTypes: z.array(z.string()).optional(),
  language: z.string().optional(),
  minConfidence: z.number().min(0).max(1).optional(),
});

interface LearnRaw {
  patterns?: Array<{ name: string; occurrences: number; confidence: number }>;
  antiPatterns?: Array<{ name: string; files: string[]; severity: string }>;
}

/**
 * MCP Tool: code/learn-patterns
 */
export const learnPatternsTool: MCPTool = {
  name: 'code/learn-patterns',
  description: 'Learn recurring patterns from code changes',
  category: 'code-intelligence',
  version: '0.1.0',
  cacheable: true,
  inputSchema: toolInputSchema(['targetPath'], {
    targetPath: { type: 'string', minLength: 1, maxLength: 500 },
    patternTypes: { type: 'array', items: { type: 'string' } },
    language: { type: 'string' },
    minConfidence: { type: 'number', minimum: 0, maximum: 1 },
  }),
  handler: async (input, context) => {
    const startTime = Date.now();
    try {
      const validated = learnPatternsParams.parse(input);

      const gnn = context?.bridges?.gnn ?? CodeGNNBridge();
      if (typeof gnn.initialize === 'function') await gnn.initialize();

      const raw = (await gnn.learnPatterns?.(validated.targetPath, {
        patternTypes: validated.patternTypes,
        language: validated.language,
        minConfidence: validated.minConfidence,
      })) as unknown as LearnRaw | undefined;

      const data = {
        success: true,
        targetPath: validated.targetPath,
        patterns: raw?.patterns ?? [],
        antiPatterns: raw?.antiPatterns ?? [],
        analysisTime: Date.now() - startTime,
      };

      context?.logger?.info?.(`code/learn-patterns completed`, {
        durationMs: String(Date.now() - startTime),
      });
      return successResult(data);
    } catch (error) {
      return errorResult(error, startTime);
    }
  },
};

// ============================================================================
// Tool Registry
// ============================================================================

/**
 * All Code Intelligence MCP Tools
 */
export const codeIntelligenceTools: MCPTool[] = [
  semanticSearchTool,
  architectureAnalyzeTool,
  refactorImpactTool,
  splitSuggestTool,
  learnPatternsTool,
];

/**
 * Get a tool by name (undefined for unknown names)
 */
export function getTool(name: string): MCPTool | undefined {
  return codeIntelligenceTools.find((t) => t.name === name);
}

/**
 * Get all tool names
 */
export function getToolNames(): string[] {
  return codeIntelligenceTools.map((t) => t.name);
}

/**
 * Tool name to handler map
 */
export const toolHandlers = new Map<string, MCPTool['handler']>(
  codeIntelligenceTools.map((t) => [t.name, t.handler as MCPTool['handler']])
);

/**
 * Create tool context with bridges
 */
export function createToolContext(config?: Partial<ToolContext['config']>): ToolContext {
  const store = new Map<string, unknown>();

  const defaultBlockedPatterns = [
    /\.env$/,
    /\.git\/config$/,
    /credentials/i,
    /secrets?\./i,
    /\.pem$/,
    /\.key$/,
    /id_rsa/i,
  ];

  return {
    get: <T>(key: string) => store.get(key) as T | undefined,
    set: <T>(key: string, value: T) => { store.set(key, value); },
    bridges: {
      gnn: CodeGNNBridge(),
      hnsw: CodeHNSWBridge(),
    },
    config: {
      allowedRoots: config?.allowedRoots ?? ['.'],
      blockedPatterns: config?.blockedPatterns ?? defaultBlockedPatterns,
      maskSecrets: config?.maskSecrets ?? true,
    },
  };
}

export default codeIntelligenceTools;
