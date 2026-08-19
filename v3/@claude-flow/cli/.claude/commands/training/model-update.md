# model-update

Update neural models with new data.

## Usage
```bash
npx swarmlo-cli@latest training model-update [options]
```

## Options
- `--model <name>` - Model to update
- `--incremental` - Incremental update
- `--validate` - Validate after update

## Examples
```bash
# Update all models
npx swarmlo-cli@latest training model-update

# Specific model
npx swarmlo-cli@latest training model-update --model agent-selector

# Incremental with validation
npx swarmlo-cli@latest training model-update --incremental --validate
```
