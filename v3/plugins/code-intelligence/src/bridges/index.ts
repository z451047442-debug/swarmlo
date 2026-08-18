/**
 * Code Intelligence Plugin - Bridges Barrel Export
 *
 * @module @claude-flow/plugin-code-intelligence/bridges
 */

export {
  GNNBridge,
  CodeGNNBridge,
  createGNNBridge,
} from './gnn-bridge.js';

export {
  CodeHNSWBridge,
} from './hnsw-bridge.js';

export {
  MinCutBridge,
  createMinCutBridge,
} from './mincut-bridge.js';
