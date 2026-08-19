# workflow-create

Create reusable workflow templates.

## Usage
```bash
npx swarmlo-cli@latest workflow create [options]
```

## Options
- `--name <name>` - Workflow name
- `--from-history` - Create from history
- `--interactive` - Interactive creation

## Examples
```bash
# Create workflow
npx swarmlo-cli@latest workflow create --name "deploy-api"

# From history
npx swarmlo-cli@latest workflow create --name "test-suite" --from-history

# Interactive mode
npx swarmlo-cli@latest workflow create --interactive
```
