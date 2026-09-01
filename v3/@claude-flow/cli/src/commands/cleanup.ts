/**
 * V3 CLI Cleanup Command
 * Removes project artifacts created by claude-flow/swarmlo
 *
 * Created with ruv.io
 */

import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import { existsSync, statSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Swarmlo-owned subdirectories within .claude/ that are safe to delete.
 * Everything else in .claude/ (agents, skills, commands, settings.local.json,
 * memory.db, worktrees, launch.json) belongs to Claude Code and must be preserved.
 * See: https://github.com/z451047442-debug/swarmlo/issues/1557
 */
const CLAUDE_OWNED_SUBDIRS = [
  { path: join('.claude', 'helpers'), description: 'Swarmlo hook scripts' },
];

/**
 * Known swarmlo-owned marker filenames per artifact directory. `cleanup
 * --force` only deletes a directory after at least one of these markers is
 * found inside it (recursively, capped) — a generic-named directory such as
 * `./data` that merely collides with the artifact list, but holds user
 * files, is refused instead of rm -rf'd (P1: accidental user-data loss).
 */
const SWARMLO_MARKERS: Record<string, string[]> = {
  [join('.claude', 'helpers')]: [
    'hook-handler.cjs', 'intelligence.cjs', 'helpers.manifest.json',
    'auto-memory-hook.mjs', '.helpers-version',
  ],
  '.claude-flow': [
    'CAPABILITIES.md', 'config.json', 'manifest.json', 'commands.json',
    'learning.json', 'AGENTS.md',
  ],
  'data': [
    'memory.db', 'memory.sqlite', 'memory.sqlite3', 'memory.json',
    'agentdb.sqlite', 'agentdb.json', 'hnsm.sqlite', 'claude-flow.db',
  ],
  '.swarm': [
    'state.json', 'swarm-state.json', 'swarm.json', 'agents.json',
    'ledger.json', 'memory.db', 'permission-audit.jsonl',
    'router-parallel.jsonl', 'learning.json',
  ],
  '.hive-mind': [
    'state.json', 'consensus.json', 'ledger.json', 'hive-mind-state.json', 'memory.json',
  ],
  'coordination': ['state.json', 'ledger.json', 'tasks.json', 'coordination.json'],
  'memory': [
    'memory.db', 'memory.sqlite', 'memory.sqlite3', 'memory.json',
    'index.json', 'namespaces.json', 'agentdb.sqlite', 'hnsm.sqlite',
  ],
};

/**
 * Artifact directories and files that claude-flow/swarmlo may create
 */
const ARTIFACT_DIRS = [
  { path: '.claude-flow', description: 'Capabilities and configuration' },
  { path: 'data', description: 'Memory databases' },
  { path: '.swarm', description: 'Swarm state' },
  { path: '.hive-mind', description: 'Consensus state' },
  { path: 'coordination', description: 'Coordination data' },
  { path: 'memory', description: 'Memory storage' },
];

const ARTIFACT_FILES = [
  { path: 'claude-flow.config.json', description: 'Claude Flow configuration' },
];

/**
 * Paths to preserve when --keep-config is set
 */
const KEEP_CONFIG_PATHS = [
  'claude-flow.config.json',
  join('.claude', 'settings.json'),
];

/**
 * True when the directory contains at least one known swarmlo marker file
 * (recursive, depth- and entry-capped so a huge user directory can't make
 * the check expensive). Dirent-typed checks never follow symlinks, so a
 * symlinked tree cannot be validated through the link.
 */
function containsSwarmloMarker(fullPath: string, markers: string[]): boolean {
  if (markers.length === 0) return false;
  let scanned = 0;
  const walk = (dir: string, depth: number): boolean => {
    if (depth <= 0 || scanned > 500) return false;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const entry of entries) {
      if (scanned++ > 500) return false;
      if (entry.isFile() && markers.includes(entry.name)) return true;
      if (entry.isDirectory() && walk(join(dir, entry.name), depth - 1)) return true;
    }
    return false;
  };
  return walk(fullPath, 3);
}

/** True when the directory contains no entries at all. */
function isDirEmpty(fullPath: string): boolean {
  try {
    return readdirSync(fullPath).length === 0;
  } catch {
    return false;
  }
}

/**
 * Calculate the total size of a path (file or directory) in bytes
 */
function getSize(fullPath: string): number {
  try {
    const stat = statSync(fullPath);
    if (stat.isFile()) {
      return stat.size;
    }
    if (stat.isDirectory()) {
      let total = 0;
      const entries = readdirSync(fullPath, { withFileTypes: true });
      for (const entry of entries) {
        total += getSize(join(fullPath, entry.name));
      }
      return total;
    }
  } catch {
    // Permission errors, broken symlinks, etc.
  }
  return 0;
}

/**
 * Format bytes into a human-readable string
 */
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Cleanup command definition
 */
export const cleanupCommand: Command = {
  name: 'cleanup',
  description: 'Remove project artifacts created by claude-flow/swarmlo',
  aliases: ['clean'],
  options: [
    {
      name: 'dry-run',
      short: 'n',
      description: 'Show what would be removed without deleting (default behavior)',
      type: 'boolean',
      default: true,
    },
    {
      name: 'force',
      short: 'f',
      description: 'Actually delete the artifacts',
      type: 'boolean',
      default: false,
    },
    {
      name: 'keep-config',
      short: 'k',
      description: 'Preserve claude-flow.config.json and .claude/settings.json',
      type: 'boolean',
      default: false,
    },
  ],
  examples: [
    {
      command: 'cleanup',
      description: 'Show what would be removed (dry run)',
    },
    {
      command: 'cleanup --force',
      description: 'Remove all claude-flow artifacts',
    },
    {
      command: 'cleanup --force --keep-config',
      description: 'Remove artifacts but keep configuration files',
    },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const force = ctx.flags.force === true;
    const keepConfig = ctx.flags['keep-config'] === true;
    const cwd = ctx.cwd;

    const dryRun = !force;

    output.writeln();
    output.writeln(output.bold(dryRun
      ? 'Claude Flow Cleanup (dry run)'
      : 'Claude Flow Cleanup'));
    output.writeln();

    const found: { path: string; description: string; size: number; type: 'dir' | 'file'; skipped?: boolean }[] = [];
    let totalSize = 0;

    // Scan swarmlo-owned subdirs within .claude/ (surgical — preserves Claude Code files)
    for (const artifact of CLAUDE_OWNED_SUBDIRS) {
      const fullPath = join(cwd, artifact.path);
      if (existsSync(fullPath)) {
        const size = getSize(fullPath);
        found.push({ path: artifact.path, description: artifact.description, size, type: 'dir' });
        totalSize += size;
      }
    }

    // Check if .claude/settings.json has swarmlo hooks/claudeFlow blocks to clean
    const settingsPath = join(cwd, '.claude', 'settings.json');
    if (existsSync(settingsPath)) {
      found.push({ path: join('.claude', 'settings.json'), description: 'Remove swarmlo hooks/claudeFlow blocks (preserves rest)', size: 0, type: 'file' });
    }

    // Scan standalone artifact directories
    for (const artifact of ARTIFACT_DIRS) {
      const fullPath = join(cwd, artifact.path);
      if (existsSync(fullPath)) {
        const size = getSize(fullPath);
        found.push({ path: artifact.path, description: artifact.description, size, type: 'dir' });
        totalSize += size;
      }
    }

    // Scan files
    for (const artifact of ARTIFACT_FILES) {
      const fullPath = join(cwd, artifact.path);
      if (existsSync(fullPath)) {
        const size = getSize(fullPath);
        found.push({ path: artifact.path, description: artifact.description, size, type: 'file' });
        totalSize += size;
      }
    }

    if (found.length === 0) {
      output.writeln(output.info('No claude-flow artifacts found in the current directory.'));
      return { success: true, message: 'Nothing to clean' };
    }

    // Mark items that would be skipped due to --keep-config
    if (keepConfig) {
      for (const item of found) {
        if (KEEP_CONFIG_PATHS.includes(item.path)) {
          item.skipped = true;
        }
      }
    }

    // Display what was found
    output.writeln(output.bold('Artifacts found:'));
    output.writeln();

    let removedCount = 0;
    let removedSize = 0;
    let skippedCount = 0;
    let refusedCount = 0;

    for (const item of found) {
      const sizeStr = formatSize(item.size);
      const typeLabel = item.type === 'dir' ? 'dir ' : 'file';

      if (item.skipped) {
        output.writeln(output.dim(`  [skip] ${typeLabel}  ${item.path}  (${sizeStr}) - ${item.description}`));
        skippedCount++;
        continue;
      }

      if (dryRun) {
        output.writeln(output.warning(`  [would remove] ${typeLabel}  ${item.path}  (${sizeStr}) - ${item.description}`));
      } else {
        // Actually delete
        try {
          const fullPath = join(cwd, item.path);
          // Special handling: surgically clean settings.json instead of deleting
          if (item.path === join('.claude', 'settings.json')) {
            try {
              const raw = JSON.parse(readFileSync(fullPath, 'utf-8'));
              delete raw.hooks;
              delete raw.claudeFlow;
              writeFileSync(fullPath, JSON.stringify(raw, null, 2) + '\n', 'utf-8');
            } catch { /* settings.json parse failed, skip */ }
          } else if (item.type === 'dir') {
            // P1 ownership guard: only delete a directory when it actually
            // contains swarmlo artifacts. Empty dirs are inert (nothing is
            // lost), anything else must show a marker or be refused.
            const markers = SWARMLO_MARKERS[item.path] ?? [];
            if (!isDirEmpty(fullPath) && !containsSwarmloMarker(fullPath, markers)) {
              output.writeln(output.error(`  [refused] dir  ${item.path}  - no swarmlo marker files found (${markers.join(', ') || 'none'}); refusing to delete`));
              refusedCount++;
              continue;
            }
            rmSync(fullPath, { recursive: true, force: true });
          } else {
            rmSync(fullPath, { force: true });
          }
          output.writeln(output.success(`  [removed] ${typeLabel}  ${item.path}  (${sizeStr}) - ${item.description}`));
          removedCount++;
          removedSize += item.size;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          output.writeln(output.error(`  [failed] ${typeLabel}  ${item.path}  - ${msg}`));
        }
      }
    }

    // Summary
    output.writeln();
    output.writeln(output.bold('Summary:'));

    if (dryRun) {
      const actionable = found.filter(f => !f.skipped);
      output.writeln(`  Found ${actionable.length} artifact(s) totaling ${formatSize(totalSize)}`);
      if (skippedCount > 0) {
        output.writeln(`  ${skippedCount} item(s) would be preserved (--keep-config)`);
      }
      output.writeln();
      output.writeln(output.dim('  This was a dry run. Use --force to actually remove artifacts.'));
    } else {
      output.writeln(`  Removed ${removedCount} artifact(s) totaling ${formatSize(removedSize)}`);
      if (refusedCount > 0) {
        output.writeln(`  Refused ${refusedCount} item(s) — no swarmlo markers found, preserved`);
      }
      if (skippedCount > 0) {
        output.writeln(`  Preserved ${skippedCount} item(s) (--keep-config)`);
      }
    }

    output.writeln();

    return {
      success: refusedCount === 0,
      message: dryRun
        ? `Dry run: ${found.length} artifact(s) found`
        : `Removed ${removedCount} artifact(s)`,
      data: { found, removedCount, removedSize, refusedCount, dryRun },
    };
  },
};

export default cleanupCommand;
