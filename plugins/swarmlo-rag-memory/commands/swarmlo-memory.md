---
name: swarmlo-memory
description: SOTA memory CRUD — store, search (hybrid/graph-rag/dense), retrieve, list, consolidate
---
$ARGUMENTS

Memory operations with HNSW-indexed vector search (measured ~1.9x at N=20k, ~3.2x–4.7x at N=5k vs brute force; ANN wins above the crossover).

Parse $ARGUMENTS to determine the operation:

**store** `--key KEY --value VALUE [--namespace NS]`:
`npx swarmlo-cli@3.39.1 memory store --key "KEY" --value "VALUE" --namespace NAMESPACE`

**search** `--query QUERY [--namespace NS] [--limit N] [--hybrid] [--graph-rag]`:
- Default (dense): `npx swarmlo-cli@3.39.1 memory search --query "QUERY" --namespace NAMESPACE --limit 5`
- Hybrid (sparse+dense): `npx ruvector search "QUERY" --hybrid --limit 5`
- Graph RAG (multi-hop): `npx ruvector search "QUERY" --graph-rag --limit 5`

**retrieve** `--key KEY [--namespace NS]`:
`npx swarmlo-cli@3.39.1 memory retrieve --key "KEY" --namespace NAMESPACE`

**list** `[--namespace NS] [--limit N]`:
`npx swarmlo-cli@3.39.1 memory list --namespace NAMESPACE --limit 10`

**delete** `--key KEY [--namespace NS]`:
`npx swarmlo-cli@3.39.1 memory delete --key "KEY" --namespace NAMESPACE`

**consolidate** `[--namespace NS]`:
Deduplicate entries with cosine > 0.92, prune stale (>30 days untouched, zero retrieval hits), rebuild HNSW index.
`npx swarmlo-cli@3.39.1 hooks worker dispatch --trigger consolidate`

**bridge** `[--all-projects]`:
Import Claude Code auto-memory into AgentDB.
See `/memory-bridge` skill for details.

Default namespace is "default". Common namespaces: `patterns`, `tasks`, `solutions`, `feedback`, `security`, `claude-memories`.

If no arguments, run `memory list`.
