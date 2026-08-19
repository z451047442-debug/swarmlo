# swarm-spawn

Spawn agents in the swarm.

## Usage
```bash
npx swarmlo-cli@latest swarm spawn [options]
```

## Options
- `--type <type>` - Agent type
- `--count <n>` - Number to spawn
- `--capabilities <list>` - Agent capabilities

## Examples
```bash
npx swarmlo-cli@latest swarm spawn --type coder --count 3
npx swarmlo-cli@latest swarm spawn --type researcher --capabilities "web-search,analysis"
```
