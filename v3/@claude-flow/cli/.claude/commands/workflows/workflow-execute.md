# workflow-execute

Execute saved workflows.

## Usage
```bash
npx swarmlo-cli@latest workflow execute [options]
```

## Options
- `--name <name>` - Workflow name
- `--params <json>` - Workflow parameters
- `--dry-run` - Preview execution

## Examples
```bash
# Execute workflow
npx swarmlo-cli@latest workflow execute --name "deploy-api"

# With parameters
npx swarmlo-cli@latest workflow execute --name "test-suite" --params '{"env": "staging"}'

# Dry run
npx swarmlo-cli@latest workflow execute --name "deploy-api" --dry-run
```
