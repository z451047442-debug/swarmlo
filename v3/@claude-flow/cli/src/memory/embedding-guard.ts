// Dimension-compatibility guards for the production embedding-model hook
// (ADR-382). Never silently mix vector spaces: the memory store and HNSW
// index are dimension-typed, so a model switch must be explicit and old
// vectors rebuilt (`claude-flow memory init --force`).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveEmbeddingModel, DEFAULT_EMBEDDING_MODEL } from './embedding-models.js';

export interface StoredVectorInfo {
  model?: string;
  dimensions?: number;
}

export interface ConfiguredEmbedding {
  model: string;
  dimensions: number;
  /** true when the model was explicitly configured (env or embeddings.json),
   *  as opposed to falling back to the default. ADR-382: any explicit
   *  configuration bypasses the AgentDB bridge, even an explicit MiniLM. */
  explicit: boolean;
}

/** Keep interpolated SQL metadata values safe (input validation at boundary). */
export function sanitizeModelName(name: string): string {
  return name.replace(/[^A-Za-z0-9_./:-]/g, '');
}

export function dimensionMismatchError(
  configuredModel: string,
  expectedDim: number,
  actualDim: number,
): string {
  return (
    `Dimension mismatch: the memory store is indexed with ${actualDim}-dim vectors ` +
    `but the configured model ${configuredModel} produces ${expectedDim}-dim vectors. ` +
    'Never mix vector spaces. Rebuild with: claude-flow memory init --force ' +
    '(re-embeds all entries), or unset CLAUDE_FLOW_EMBEDDING_MODEL.'
  );
}

/**
 * Pure guard. Missing stored info (legacy DBs) means "unknown" → allow,
 * matching today's behavior — no forced migration.
 */
export function assertDimensionCompatible(
  stored: StoredVectorInfo | undefined,
  expectedDim: number,
  configuredModel: string,
): { ok: true } | { ok: false; error: string } {
  if (!stored?.dimensions) return { ok: true };
  if (stored.dimensions !== expectedDim) {
    return { ok: false, error: dimensionMismatchError(configuredModel, expectedDim, stored.dimensions) };
  }
  return { ok: true };
}

/**
 * Read the namespace's vector_indexes row from an OPEN sql.js handle (sync,
 * so it can run inside the store lock). Missing table/row → {} (unknown).
 */
export function readStoredVectorInfoFromHandle(db: any, namespace = 'default'): StoredVectorInfo {
  try {
    const stmt = db.prepare('SELECT dimensions FROM vector_indexes WHERE name = ?');
    stmt.bind([namespace]);
    let dim: number | undefined;
    if (stmt.step()) dim = Number(stmt.get()[0]);
    stmt.free();
    return dim ? { dimensions: dim } : {};
  } catch {
    return {};
  }
}

/**
 * Resolve the configured production embedding model.
 * Precedence: CLAUDE_FLOW_EMBEDDING_MODEL env → .claude-flow/embeddings.json
 * (`model` field only; its dimension is a hint, not authoritative) →
 * DEFAULT_EMBEDDING_MODEL. CLAUDE_FLOW_EMBEDDING_DIMENSION env overrides the
 * registry dim when explicitly set and valid.
 */
export function resolveConfiguredEmbedding(
  env: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd(),
): ConfiguredEmbedding {
  let modelName: string | undefined = env.CLAUDE_FLOW_EMBEDDING_MODEL || undefined;
  let explicit = !!modelName;
  if (!modelName) {
    try {
      const p = join(cwd, '.claude-flow', 'embeddings.json');
      if (existsSync(p)) {
        const raw = JSON.parse(readFileSync(p, 'utf-8')) as { model?: unknown };
        if (typeof raw.model === 'string' && raw.model) {
          modelName = raw.model;
          explicit = true;
        }
      }
    } catch {
      // unreadable/missing — fall through to default
    }
  }
  const spec = modelName ? resolveEmbeddingModel(modelName) : resolveEmbeddingModel(DEFAULT_EMBEDDING_MODEL);
  const envDim = Number(env.CLAUDE_FLOW_EMBEDDING_DIMENSION);
  return {
    model: spec.modelId,
    dimensions: Number.isFinite(envDim) && envDim > 0 ? envDim : spec.dim,
    explicit,
  };
}
