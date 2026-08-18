/**
 * Legal Contracts Plugin - MCP Tools
 *
 * Implements 5 MCP tools for legal contract analysis:
 * 1. legal/clause-extract - Extract and classify clauses
 * 2. legal/risk-assess - Identify and score contractual risks
 * 3. legal/contract-compare - Compare contracts and detect changes
 * 4. legal/obligation-track - Extract obligations with DAG analysis
 * 5. legal/playbook-match - Match clauses against negotiation playbook
 *
 * Based on ADR-034: Legal Contract Analysis Plugin
 *
 * @module v3/plugins/legal-contracts/mcp-tools
 */

import { z } from 'zod';
import type { IAttentionBridge, IDAGBridge, LegalErrorCode } from './types.js';
import {
  ClauseExtractInputSchema,
  RiskAssessInputSchema,
  ContractCompareInputSchema,
  ObligationTrackInputSchema,
  PlaybookMatchInputSchema,
  LegalErrorCodes,
  LegalContractsError,
  RolePermissions,
} from './types.js';
import {
  LegalDAGBridge,
  createDAGBridge,
} from './bridges/dag-bridge.js';
import type {
  ClauseExtractOptions,
  RiskAssessOptions,
  ContractCompareOptions,
  ObligationExtractOptions,
  PlaybookMatchOptions,
  ContractComparisonAnalysis,
  PlaybookMatchAnalysis,
} from './bridges/dag-bridge.js';
import { createAttentionBridge } from './bridges/attention-bridge.js';
import type { ExtractedClause, RiskFinding, Obligation } from './types.js';

// ============================================================================
// MCP Tool Types
// ============================================================================

/**
 * MCP Tool definition
 */
export interface MCPTool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  category: string;
  version: string;
  cacheable?: boolean;
  /** JSON-schema style input schema (properties + required fields) */
  inputSchema: InputSchema;
  handler: (input: TInput, context: ToolContext) => Promise<MCPToolResult<TOutput>>;
}

/**
 * JSON-schema style input schema
 */
export interface InputSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required: string[];
}

/**
 * MCP Tool result format
 */
export interface MCPToolResult<T = unknown> {
  content: Array<{ type: 'text'; text: string }>;
  data?: T;
  isError?: boolean;
}

/**
 * Tool execution context
 */
export interface ToolContext {
  logger?: {
    debug: (msg: string, meta?: Record<string, unknown>) => void;
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
  };
  userId?: string;
  userRoles?: string[];
  auditLogger?: { log: (entry: Record<string, unknown>) => unknown };
  matterContext?: { matterId?: string; clientId?: string };
  get?: <T>(key: string) => T | undefined;
  set?: <T>(key: string, value: T) => void;
  bridges?: { attention: IAttentionBridge; dag: IDAGBridge };
}

// ============================================================================
// Result Helpers
// ============================================================================

/**
 * Create a success result (no isError field on success path)
 */
function successResult<T>(data: T): MCPToolResult<T> {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    data,
  };
}

/**
 * Create an error result carrying an error flag and machine-readable code
 */
function errorResult(error: unknown, code: LegalErrorCode): MCPToolResult<never> {
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ error: true, message, code }, null, 2) }],
  };
}

/**
 * Map an unknown error to an error result with the right code
 */
function toErrorResult(error: unknown, fallback: LegalErrorCode): MCPToolResult<never> {
  if (error instanceof LegalContractsError) {
    return errorResult(error.message, error.code);
  }
  if (error instanceof z.ZodError) {
    const message = error.issues[0]?.message ?? 'Invalid input';
    return errorResult(message, LegalErrorCodes.INVALID_DOCUMENT_FORMAT);
  }
  return errorResult(error, fallback);
}

// ============================================================================
// Authorization & Audit Helpers
// ============================================================================

/**
 * Check the caller's roles against the tool permission table.
 * When no roles are configured, access is allowed (no RBAC).
 */
function hasAccess(context: ToolContext | undefined, toolName: string): boolean {
  const roles = context?.userRoles;
  if (!roles || roles.length === 0) return true;

  const permissions = RolePermissions as Record<string, string[]>;
  return roles.some(role => (permissions[role] ?? []).includes(toolName));
}

/**
 * Write a successful operation to the audit log when one is configured
 */
async function logAudit(
  context: ToolContext | undefined,
  toolName: string,
  document: string
): Promise<void> {
  const auditLogger = context?.auditLogger;
  if (!auditLogger) return;

  await auditLogger.log({
    timestamp: new Date().toISOString(),
    userId: context?.userId,
    toolName,
    operationType: 'analyze',
    success: true,
    documentHash: simpleHash(document),
    matterId: context?.matterContext?.matterId,
    clientId: context?.matterContext?.clientId,
  });
}

/**
 * Simple hash function for document fingerprints
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
}

// ============================================================================
// Bridge Helpers
// ============================================================================

/**
 * Analysis bridge surface used by the tool handlers
 */
interface AnalysisBridge {
  initialize: () => Promise<void>;
  isInitialized?: () => boolean;
  extractClauses: (document: string, options?: ClauseExtractOptions) => Promise<ExtractedClause[]>;
  analyzeRisks: (document: string, options?: RiskAssessOptions) => Promise<RiskFinding[]>;
  compareContracts: (
    baseDocument: string,
    compareDocument: string,
    options?: ContractCompareOptions
  ) => Promise<ContractComparisonAnalysis>;
  extractObligations: (
    document: string,
    options?: ObligationExtractOptions
  ) => Promise<Obligation[]>;
  matchPlaybook: (
    document: string,
    playbook: string,
    options?: PlaybookMatchOptions
  ) => Promise<PlaybookMatchAnalysis>;
}

/**
 * Instantiate the analysis bridge.
 *
 * Real builds use `new LegalDAGBridge()`; test mocks built with arrow-function
 * implementations are not constructable and must be invoked as functions.
 */
function createAnalysisBridge(): AnalysisBridge {
  try {
    return new (LegalDAGBridge as unknown as new () => AnalysisBridge)();
  } catch {
    return (LegalDAGBridge as unknown as () => AnalysisBridge)();
  }
}

/**
 * Initialize a bridge, tolerating mocks without isInitialized()
 */
async function ensureBridgeReady(bridge: AnalysisBridge): Promise<void> {
  if (typeof bridge.isInitialized !== 'function' || !bridge.isInitialized()) {
    await bridge.initialize();
  }
}

// ============================================================================
// Payload Helpers
// ============================================================================

function severityWeight(severity: string): number {
  const weights: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
  return weights[severity] ?? 0;
}

function collectRecommendations(risks: RiskFinding[]): string[] {
  return risks.flatMap(risk => {
    const mitigations = (risk as Partial<RiskFinding>).mitigations;
    if (mitigations && mitigations.length > 0) return mitigations;
    const recommendation = (risk as RiskFinding & { recommendation?: string }).recommendation;
    return recommendation ? [recommendation] : [];
  });
}

function buildTimeline(
  obligations: Obligation[]
): Array<{ date: string; obligations: string[]; isMilestone: boolean }> {
  return obligations
    .filter(o => o.dueDate)
    .map(o => ({
      date: (o.dueDate as Date).toISOString(),
      obligations: [o.id],
      isMilestone: o.priority === 'critical',
    }));
}

function collectMatchRecommendations(result: PlaybookMatchAnalysis): string[] {
  if (result.recommendations && result.recommendations.length > 0) return result.recommendations;
  return result.deviations.map(d =>
    `${d.severity} deviation at ${d.position}`
  );
}

// ============================================================================
// Input Schema Builder
// ============================================================================

/**
 * Derive a JSON-schema style input schema from a zod object schema
 */
function buildInputSchema(schema: z.ZodObject<z.ZodRawShape>): InputSchema {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, field] of Object.entries(schema.shape)) {
    properties[key] = describeField(field);
    if (!isOptionalField(field)) required.push(key);
  }

  return { type: 'object', properties, required };
}

function isOptionalField(field: z.ZodTypeAny): boolean {
  return (
    field instanceof z.ZodDefault ||
    field instanceof z.ZodOptional ||
    field instanceof z.ZodNullable
  );
}

function unwrapField(field: z.ZodTypeAny): z.ZodTypeAny {
  if (field instanceof z.ZodDefault) return unwrapField(field._def.innerType);
  if (field instanceof z.ZodOptional || field instanceof z.ZodNullable) {
    return unwrapField(field.unwrap());
  }
  return field;
}

function describeField(field: z.ZodTypeAny): Record<string, unknown> {
  const core = unwrapField(field);
  if (core instanceof z.ZodString) return { type: 'string' };
  if (core instanceof z.ZodNumber) return { type: 'number' };
  if (core instanceof z.ZodBoolean) return { type: 'boolean' };
  if (core instanceof z.ZodEnum) return { type: 'string', enum: core.options };
  if (core instanceof z.ZodArray) return { type: 'array', items: describeField(core.element) };
  if (core instanceof z.ZodObject) return buildInputSchema(core) as unknown as Record<string, unknown>;
  return { type: 'string' };
}

// ============================================================================
// Clause Extract Tool
// ============================================================================

/**
 * MCP Tool: legal/clause-extract
 *
 * Extract and classify clauses from legal documents
 */
export const clauseExtractTool: MCPTool<
  z.infer<typeof ClauseExtractInputSchema>,
  Record<string, unknown>
> = {
  name: 'legal/clause-extract',
  description: 'Extract and classify clauses from legal documents',
  category: 'legal',
  version: '1.0.0',
  cacheable: true,
  inputSchema: buildInputSchema(ClauseExtractInputSchema),
  handler: async (input, context) => {
    const startTime = Date.now();

    try {
      if (!hasAccess(context, 'clause-extract')) {
        throw new LegalContractsError(
          LegalErrorCodes.MATTER_ACCESS_DENIED,
          'Access denied: clause-extract requires an elevated role'
        );
      }

      const validated = ClauseExtractInputSchema.parse(input);
      const bridge = createAnalysisBridge();
      await ensureBridgeReady(bridge);

      const clauses = await bridge.extractClauses(validated.document, {
        clauseTypes: validated.clauseTypes,
        jurisdiction: validated.jurisdiction,
        includePositions: validated.includePositions,
        includeEmbeddings: validated.includeEmbeddings,
      });

      const data = {
        clauses,
        extractionTime: Date.now() - startTime,
        jurisdiction: validated.jurisdiction,
      };

      await logAudit(context, 'clause-extract', validated.document);
      return successResult(data);
    } catch (error) {
      return toErrorResult(error, LegalErrorCodes.CLAUSE_EXTRACTION_FAILED);
    }
  },
};

// ============================================================================
// Risk Assess Tool
// ============================================================================

/**
 * MCP Tool: legal/risk-assess
 *
 * Assess contractual risks with severity scoring
 */
export const riskAssessTool: MCPTool<
  z.infer<typeof RiskAssessInputSchema>,
  Record<string, unknown>
> = {
  name: 'legal/risk-assess',
  description: 'Assess contractual risks with severity scoring',
  category: 'legal',
  version: '1.0.0',
  inputSchema: buildInputSchema(RiskAssessInputSchema),
  handler: async (input, context) => {
    const startTime = Date.now();

    try {
      if (!hasAccess(context, 'risk-assess')) {
        throw new LegalContractsError(
          LegalErrorCodes.MATTER_ACCESS_DENIED,
          'Access denied: risk-assess requires an elevated role'
        );
      }

      const validated = RiskAssessInputSchema.parse(input);
      const bridge = createAnalysisBridge();
      await ensureBridgeReady(bridge);

      const risks = await bridge.analyzeRisks(validated.document, {
        partyRole: validated.partyRole,
        riskCategories: validated.riskCategories,
        industryContext: validated.industryContext,
        threshold: validated.threshold,
      });

      const data = {
        risks,
        overallRiskScore: risks.reduce((sum, r) => sum + severityWeight(r.severity), 0),
        recommendations: collectRecommendations(risks),
        partyRole: validated.partyRole,
        threshold: validated.threshold,
      };

      await logAudit(context, 'risk-assess', validated.document);
      return successResult(data);
    } catch (error) {
      return toErrorResult(error, LegalErrorCodes.RISK_ASSESSMENT_FAILED);
    }
  },
};

// ============================================================================
// Contract Compare Tool
// ============================================================================

/**
 * MCP Tool: legal/contract-compare
 *
 * Compare two contracts with detailed diff and similarity scoring
 */
export const contractCompareTool: MCPTool<
  z.infer<typeof ContractCompareInputSchema>,
  Record<string, unknown>
> = {
  name: 'legal/contract-compare',
  description: 'Compare two contracts with detailed diff and similarity scoring',
  category: 'legal',
  version: '1.0.0',
  inputSchema: buildInputSchema(ContractCompareInputSchema),
  handler: async (input, context) => {
    const startTime = Date.now();

    try {
      if (!hasAccess(context, 'contract-compare')) {
        throw new LegalContractsError(
          LegalErrorCodes.MATTER_ACCESS_DENIED,
          'Access denied: contract-compare requires an elevated role'
        );
      }

      const validated = ContractCompareInputSchema.parse(input);
      const bridge = createAnalysisBridge();
      await ensureBridgeReady(bridge);

      const comparison = await bridge.compareContracts(
        validated.baseDocument,
        validated.compareDocument,
        {
          mode: validated.comparisonMode,
          focusClauseTypes: validated.focusClauseTypes,
          highlightChanges: validated.highlightChanges,
          generateRedline: validated.generateRedline,
        }
      );

      const data = {
        similarity: comparison.similarity,
        differences: comparison.differences,
        comparisonTime: Date.now() - startTime,
        mode: validated.comparisonMode,
        summary: comparison.summary,
      };

      await logAudit(context, 'contract-compare', validated.baseDocument);
      return successResult(data);
    } catch (error) {
      return toErrorResult(error, LegalErrorCodes.COMPARISON_FAILED);
    }
  },
};

// ============================================================================
// Obligation Track Tool
// ============================================================================

/**
 * MCP Tool: legal/obligation-track
 *
 * Extract obligations, deadlines, and dependencies using DAG analysis
 */
export const obligationTrackTool: MCPTool<
  z.infer<typeof ObligationTrackInputSchema>,
  Record<string, unknown>
> = {
  name: 'legal/obligation-track',
  description: 'Extract obligations, deadlines, and dependencies using DAG analysis',
  category: 'legal',
  version: '1.0.0',
  inputSchema: buildInputSchema(ObligationTrackInputSchema),
  handler: async (input, context) => {
    const startTime = Date.now();

    try {
      if (!hasAccess(context, 'obligation-track')) {
        throw new LegalContractsError(
          LegalErrorCodes.MATTER_ACCESS_DENIED,
          'Access denied: obligation-track requires an elevated role'
        );
      }

      const validated = ObligationTrackInputSchema.parse(input);
      const bridge = createAnalysisBridge();
      await ensureBridgeReady(bridge);

      const obligations = await bridge.extractObligations(validated.document, {
        party: validated.party,
        timeframe: validated.timeframe,
        obligationTypes: validated.obligationTypes,
        includeDependencies: validated.includeDependencies,
        includeTimeline: validated.includeTimeline,
      });

      const data = {
        obligations,
        timeline: buildTimeline(obligations),
        includeDependencies: validated.includeDependencies,
        includeTimeline: validated.includeTimeline,
      };

      await logAudit(context, 'obligation-track', validated.document);
      return successResult(data);
    } catch (error) {
      return toErrorResult(error, LegalErrorCodes.OBLIGATION_PARSING_FAILED);
    }
  },
};

// ============================================================================
// Playbook Match Tool
// ============================================================================

/**
 * MCP Tool: legal/playbook-match
 *
 * Compare contract clauses against a negotiation playbook
 */
export const playbookMatchTool: MCPTool<
  z.infer<typeof PlaybookMatchInputSchema>,
  Record<string, unknown>
> = {
  name: 'legal/playbook-match',
  description: 'Compare contract clauses against a negotiation playbook',
  category: 'legal',
  version: '1.0.0',
  inputSchema: buildInputSchema(PlaybookMatchInputSchema),
  handler: async (input, context) => {
    const startTime = Date.now();

    try {
      if (!hasAccess(context, 'playbook-match')) {
        throw new LegalContractsError(
          LegalErrorCodes.MATTER_ACCESS_DENIED,
          'Access denied: playbook-match requires an elevated role'
        );
      }

      const validated = PlaybookMatchInputSchema.parse(input);
      const bridge = createAnalysisBridge();
      await ensureBridgeReady(bridge);

      const result = await bridge.matchPlaybook(validated.document, validated.playbook, {
        strictness: validated.strictness,
        suggestAlternatives: validated.suggestAlternatives,
        prioritizeClauses: validated.prioritizeClauses,
      });

      const data = {
        matchScore: result.matchScore,
        deviations: result.deviations,
        recommendations: collectMatchRecommendations(result),
        strictness: validated.strictness,
      };

      await logAudit(context, 'playbook-match', validated.document);
      return successResult(data);
    } catch (error) {
      return toErrorResult(error, LegalErrorCodes.PLAYBOOK_INVALID);
    }
  },
};

// ============================================================================
// Tool Registry
// ============================================================================

/**
 * All Legal Contracts MCP Tools
 */
export const legalContractsTools: MCPTool[] = [
  clauseExtractTool as unknown as MCPTool,
  riskAssessTool as unknown as MCPTool,
  contractCompareTool as unknown as MCPTool,
  obligationTrackTool as unknown as MCPTool,
  playbookMatchTool as unknown as MCPTool,
];

/**
 * Get a tool by name
 */
export function getTool(name: string): MCPTool | undefined {
  return legalContractsTools.find(tool => tool.name === name);
}

/**
 * Get all registered tool names
 */
export function getToolNames(): string[] {
  return legalContractsTools.map(tool => tool.name);
}

/**
 * Tool name to handler map
 */
export const toolHandlers = new Map<string, MCPTool['handler']>([
  ['legal/clause-extract', clauseExtractTool.handler as MCPTool['handler']],
  ['legal/risk-assess', riskAssessTool.handler as MCPTool['handler']],
  ['legal/contract-compare', contractCompareTool.handler as MCPTool['handler']],
  ['legal/obligation-track', obligationTrackTool.handler as MCPTool['handler']],
  ['legal/playbook-match', playbookMatchTool.handler as MCPTool['handler']],
]);

/**
 * Create a tool context with default bridges
 */
export function createToolContext(): ToolContext {
  const store = new Map<string, unknown>();

  return {
    get: <T>(key: string) => store.get(key) as T | undefined,
    set: <T>(key: string, value: T) => { store.set(key, value); },
    bridges: {
      attention: createAttentionBridge(),
      dag: createDAGBridge(),
    },
  };
}

export default legalContractsTools;
