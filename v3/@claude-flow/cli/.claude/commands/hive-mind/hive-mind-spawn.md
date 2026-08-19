# hive-mind-spawn

Spawn a Hive Mind swarm with queen-led coordination.

## Usage
```bash
npx swarmlo-cli@latest hive-mind spawn <objective> [options]
```

## Options
- `--queen-type <type>` - Queen type (strategic, tactical, adaptive)
- `--max-workers <n>` - Maximum worker agents
- `--consensus <type>` - Consensus algorithm
- `--claude` - Generate Claude Code spawn commands

## Examples
```bash
npx swarmlo-cli@latest hive-mind spawn "Build API"
npx swarmlo-cli@latest hive-mind spawn "Research patterns" --queen-type adaptive
npx swarmlo-cli@latest hive-mind spawn "Build service" --claude
```
