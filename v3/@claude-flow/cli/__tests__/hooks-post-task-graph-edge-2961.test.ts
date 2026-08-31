/**
 * #2961: `swarmlo hooks post-task` (CLI) reliably dropped the ADR-130 Phase 3
 * "reinforced-by" graph edge that the identical `hooks_post-task` MCP tool
 * handler writes when invoked from a long-running MCP server.
 *
 * Root cause: the edge write was a fire-and-forget async IIFE, never
 * `await`ed by the handler. The long-running MCP server stays alive long
 * enough for the detached write to finish in the background — invisible
 * there. But `hooks post-task` (CLI) is the exact same handler, invoked
 * from a one-shot process that calls `process.exit(0)` immediately after
 * the command action resolves (bin/cli.js, #1552) — the still-pending
 * dynamic `import(...)` + `insertGraphEdge()` call was killed before its
 * first tick, every time, not intermittently.
 *
 * Fixed by awaiting the write in `mcp-tools/hooks-tools.ts`'s post-task
 * handler.
 *
 * Verification pitfall this test deliberately avoids: an sql.js read of the
 * main `.swarm/memory.db` image file misses rows that landed in the
 * `-wal` sidecar and haven't been checkpointed back yet — a native
 * better-sqlite3 read (what `countGraphEdges` uses) sees them correctly.
 * Reading via sql.js here would produce a false "still 0 edges" negative
 * even against the fixed code, masking the fix as broken.
 *
 * Black-box against the real built CLI (matches this session's other
 * end-to-end regression tests) because the bug is specifically about the
 * one-shot-process exit race, which only a real spawned process exhibits.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { join } from 'path';
import { tmpdir } from 'os';

const CLI_BIN = fileURLToPath(new URL('../bin/cli.js', import.meta.url));
const CLI_BUILT = existsSync(CLI_BIN);

// Windows: the native better-sqlite3 handle (graph-edge-writer) can hold the
// temp dir open past the assertions — retry the cleanup, and swallow the
// residual EPERM (observed on Win11) rather than failing the suite on a file
// lock that has nothing to do with what this test asserts.
function removeDirWithRetry(dir: string, attempts = 5): void {
  for (let i = 0; i < attempts; i++) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch {
      // still locked — give the handle a moment and retry
      const sleepMs = 200 * (i + 1);
      const end = Date.now() + sleepMs;
      while (Date.now() < end) { /* busy-wait */ }
    }
  }
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // native handle still holds the dir (Windows) — assertions already ran
  }
}

describe.skipIf(!CLI_BUILT)('#2961 hooks post-task (CLI) writes the reinforced-by edge', () => {
  it('a successful CLI post-task call leaves a graph_edges row behind, not just a trajectory', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'swarmlo-2961-'));
    try {
      execFileSync(process.execPath, [CLI_BIN, 'memory', 'init'], { cwd, timeout: 30_000, stdio: 'pipe' });
      execFileSync(
        process.execPath,
        [CLI_BIN, 'hooks', 'post-task', '--task-id', 'quenzibar2961', '--success', 'true', '-q', '0.9'],
        { cwd, timeout: 30_000, stdio: 'pipe' },
      );

      const { _resetBridgeDb, countGraphEdges } = await import('../src/memory/graph-edge-writer.js');
      _resetBridgeDb();
      const dbPath = join(cwd, '.swarm', 'memory.db');
      const count = await countGraphEdges(dbPath);

      // Pre-fix: the CLI process exits before the detached write's first
      // await resolves — this is exactly 0 every time, not flaky.
      expect(count).toBeGreaterThan(0);
    } finally {
      removeDirWithRetry(cwd);
    }
  }, 60_000);
});
