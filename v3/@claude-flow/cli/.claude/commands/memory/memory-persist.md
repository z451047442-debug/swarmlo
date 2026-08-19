# memory-persist

Persist memory across sessions.

## Usage
```bash
npx swarmlo-cli@latest memory persist [options]
```

## Options
- `--export <file>` - Export to file
- `--import <file>` - Import from file
- `--compress` - Compress memory data

## Examples
```bash
# Export memory
npx swarmlo-cli@latest memory persist --export memory-backup.json

# Import memory
npx swarmlo-cli@latest memory persist --import memory-backup.json

# Compressed export
npx swarmlo-cli@latest memory persist --export memory.gz --compress
```
