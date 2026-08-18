# swarmlo-ruvllm

RuVLLM local inference with chat formatting, model configuration, MicroLoRA fine-tuning, and SONA real-time adaptation.

## Install

```
/plugin marketplace add github.com/z451047442-debug/swarmlo
/plugin install swarmlo-ruvllm@swarmlo
```

## Features

- **Model configuration**: Generate optimal configs for local inference
- **MicroLoRA**: Task-specific fine-tuning with lightweight adapters
- **SONA adaptation**: Real-time neural adaptation (<0.05ms)
- **Chat formatting**: Multi-provider prompt formatting (Claude, GPT, Gemini, Ollama, Cohere)
- **HNSW routing**: Context retrieval for RAG pipelines (≤11 hot patterns; for large-corpus search see `swarmlo-agentdb` `embeddings_search`)

## Commands

- `/ruvllm` -- Model status, adapters, and provider availability

## Skills

- `llm-config` -- Configure models, MicroLoRA, and SONA
- `chat-format` -- Format prompts for different LLM providers

## Compatibility

- **CLI:** pinned to `@claude-flow/cli` v3.6 major+minor.
- **Verification:** `bash plugins/swarmlo-ruvllm/scripts/smoke.sh` is the contract.

## Cross-plugin tool ownership

This plugin shares the `ruvllm_*` MCP family with two sibling plugins. Each tool group has a canonical owner; this plugin is the entry point for LLM-config + chat formatting:

| Tool group | Canonical owner | This plugin's role |
|-----------|-----------------|-------------------|
| `ruvllm_sona_create`, `ruvllm_sona_adapt` | [swarmlo-intelligence ADR-0001](../swarmlo-intelligence/docs/adrs/0001-intelligence-surface-completeness.md) (4-step pipeline DISTILL phase) | Surfaces SONA in `llm-config` skill |
| `ruvllm_microlora_create`, `ruvllm_microlora_adapt` | [swarmlo-intelligence ADR-0001](../swarmlo-intelligence/docs/adrs/0001-intelligence-surface-completeness.md) (DISTILL + CONSOLIDATE phases via `--consolidate` flag) | Surfaces MicroLoRA in `llm-config` skill |
| `ruvllm_hnsw_create`, `ruvllm_hnsw_add`, `ruvllm_hnsw_route` | [swarmlo-agentdb ADR-0001](../swarmlo-agentdb/docs/adrs/0001-agentdb-optimization.md) (WASM router, ≤11 patterns — distinct from large-corpus `embeddings_search`) | References from `chat-format` for context routing |

Source: `v3/@claude-flow/cli/src/mcp-tools/ruvllm-tools.ts:142, 169, 192, 222` (SONA + MicroLoRA) and `:57-58` (HNSW WASM router with `~11 patterns` cap).

## Namespace coordination

This plugin owns the `ruvllm-config` AgentDB namespace (kebab-case, follows the convention from [swarmlo-agentdb ADR-0001 §"Namespace convention"](../swarmlo-agentdb/docs/adrs/0001-agentdb-optimization.md)). Reserved namespaces (`pattern`, `claude-memories`, `default`) MUST NOT be shadowed.

`ruvllm-config` stores model configurations, adapter manifests, and chat-format templates. Accessed via `memory_*` (namespace-routed).

## Verification

```bash
bash plugins/swarmlo-ruvllm/scripts/smoke.sh
# Expected: "10 passed, 0 failed"
```

## Architecture Decisions

- [`ADR-0001` — swarmlo-ruvllm plugin contract (cross-plugin tool ownership table, namespace coordination, smoke as contract)](./docs/adrs/0001-ruvllm-contract.md)

## Related Plugins

- `swarmlo-intelligence` — owns SONA + MicroLoRA in the 4-step pipeline
- `swarmlo-agentdb` — owns HNSW WASM router; namespace convention owner
- `swarmlo-ruvector` — sibling substrate plugin (pinned `ruvector@0.2.25`)
- `swarmlo-rag-memory` — consumes RAG context routing
