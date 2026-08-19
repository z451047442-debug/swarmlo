# topology-optimize

Optimize swarm topology for current workload.

## Usage
```bash
npx swarmlo-cli@latest optimization topology-optimize [options]
```

## Options
- `--analyze-first` - Analyze before optimizing
- `--target <metric>` - Optimization target
- `--apply` - Apply optimizations

## Examples
```bash
# Analyze and suggest
npx swarmlo-cli@latest optimization topology-optimize --analyze-first

# Optimize for speed
npx swarmlo-cli@latest optimization topology-optimize --target speed

# Apply changes
npx swarmlo-cli@latest optimization topology-optimize --target efficiency --apply
```
