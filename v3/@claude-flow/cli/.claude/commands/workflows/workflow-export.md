# workflow-export

Export workflows for sharing.

## Usage
```bash
npx swarmlo-cli@latest workflow export [options]
```

## Options
- `--name <name>` - Workflow to export
- `--format <type>` - Export format
- `--include-history` - Include execution history

## Examples
```bash
# Export workflow
npx swarmlo-cli@latest workflow export --name "deploy-api"

# As YAML
npx swarmlo-cli@latest workflow export --name "test-suite" --format yaml

# With history
npx swarmlo-cli@latest workflow export --name "deploy-api" --include-history
```
