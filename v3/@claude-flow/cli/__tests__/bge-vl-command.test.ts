import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock factories are hoisted above top-level consts, so the mock fns must
// be created via vi.hoisted (same pattern as memory-search-namespace-default
// and mcp-client-guardrail tests in this suite).
const { spawnSyncMock, existsSyncMock } = vi.hoisted(() => ({
  spawnSyncMock: vi.fn(),
  existsSyncMock: vi.fn(),
}));

vi.mock('child_process', () => ({ spawnSync: spawnSyncMock }));

vi.mock('fs', async (importOriginal) => {
  const mod = await importOriginal<typeof import('fs')>();
  return { ...mod, existsSync: existsSyncMock };
});

import { bgeVlCommand, resolveBgeVlPluginDir } from '../src/commands/bge-vl.js';

beforeEach(() => {
  spawnSyncMock.mockReset();
  existsSyncMock.mockReset();
});

describe('resolveBgeVlPluginDir', () => {
  it('finds the plugin dir when scripts/bge-vl.mjs exists', () => {
    existsSyncMock.mockImplementation((p: string) => p.endsWith('bge-vl.mjs'));
    const dir = resolveBgeVlPluginDir();
    expect(dir).toBeTruthy();
    expect(String(dir).includes('swarmlo-bge-vl')).toBe(true);
  });

  it('returns null when the plugin is missing', () => {
    existsSyncMock.mockReturnValue(false);
    expect(resolveBgeVlPluginDir()).toBeNull();
  });
});

describe('bgeVlCommand', () => {
  it('degrades (success:false + reason) when the plugin is missing', async () => {
    existsSyncMock.mockReturnValue(false);
    const result = await bgeVlCommand.action({
      args: ['embed', '--text', 'x'],
    } as never);
    expect(result.success).toBe(false);
    expect((result.data as { reason?: string }).reason).toBe('bge-vl-plugin-not-found');
  });

  it('spawns node on the plugin relay with passthrough args', async () => {
    existsSyncMock.mockImplementation((p: string) => p.endsWith('bge-vl.mjs'));
    spawnSyncMock.mockReturnValue({ status: 0 });
    const result = await bgeVlCommand.action({
      args: ['search', '--text', 'bear'],
    } as never);
    expect(spawnSyncMock).toHaveBeenCalledOnce();
    const [cmd, args] = spawnSyncMock.mock.calls[0];
    expect(cmd).toBe('node');
    expect(String(args[0]).endsWith('bge-vl.mjs')).toBe(true);
    expect(args).toEqual(expect.arrayContaining(['search', '--text', 'bear']));
    expect(result.success).toBe(true);
  });

  it('passes through a non-zero exit code', async () => {
    existsSyncMock.mockImplementation((p: string) => p.endsWith('bge-vl.mjs'));
    spawnSyncMock.mockReturnValue({ status: 2 });
    const result = await bgeVlCommand.action({ args: ['bogus'] } as never);
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(2);
  });
});
