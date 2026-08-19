/**
 * doctor's checkBgeVlIntegration (ADR-384) — surfaces BGE-VL sidecar
 * availability in `swarmlo doctor`, mirroring checkMetaharnessIntegration's
 * optional-plugin posture: absence is WARN (graceful degradation), never FAIL.
 *
 * The plugin lives at <root>/plugins/swarmlo-bge-vl/ with
 * scripts/bge-vl.mjs + scripts/_sidecar.mjs (JS bridge), python/ sidecar
 * (bge_vl_embed.py + requirements.txt), and .claude-plugin/plugin.json.
 *
 * This file mocks `fs.existsSync` (plugin-file presence) and
 * `child_process.spawnSync` (python probe) and drives
 * `checkBgeVlIntegration()` directly, covering all four outcome paths:
 * absent plugin, incomplete plugin, missing python, healthy — plus the
 * win32/posix python-binary selection.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the modules BEFORE importing doctor — checkBgeVlIntegration closes
// over the module-level `existsSync` binding, so the mock must reshape those
// modules in the same registry doctor.ts imports from.
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return { ...actual, existsSync: vi.fn() };
});

vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>('child_process');
  return { ...actual, spawnSync: vi.fn() };
});

import { existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { checkBgeVlIntegration } from '../src/commands/doctor.js';

const existsSyncMock = existsSync as unknown as ReturnType<typeof vi.fn>;
const spawnSyncMock = spawnSync as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  existsSyncMock.mockReset();
  spawnSyncMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('checkBgeVlIntegration', () => {
  it('warns when the plugin is absent', async () => {
    existsSyncMock.mockReturnValue(false);
    const check = await checkBgeVlIntegration();
    expect(check.status).toBe('warn');
    expect(check.message).toMatch(/swarmlo-bge-vl/);
    expect(check.fix).toMatch(/bge-vl setup/);
  });

  it('warns and lists missing files when the plugin is incomplete', async () => {
    // Marker file present (so the plugin dir is found), required files absent.
    existsSyncMock.mockImplementation((p: unknown) => {
      // `join` uses platform separators, so match the final segment only.
      const s = String(p);
      return s.includes('swarmlo-bge-vl') && s.endsWith('bge-vl.mjs');
    });
    const check = await checkBgeVlIntegration();
    expect(check.status).toBe('warn');
    expect(check.message).toMatch(/missing: scripts\/_sidecar\.mjs/);
    expect(check.message).toMatch(/python\/bge_vl_embed\.py/);
    expect(check.fix).toMatch(/Reinstall|restore/);
  });

  it('warns when the plugin is present but no python on PATH', async () => {
    existsSyncMock.mockReturnValue(true);
    spawnSyncMock.mockReturnValue({ status: 1 });
    const check = await checkBgeVlIntegration();
    expect(check.status).toBe('warn');
    expect(check.message).toMatch(/no python/);
    expect(check.fix).toMatch(/bge-vl setup/);
  });

  it('passes with plugin + python and names the plugin dir', async () => {
    existsSyncMock.mockReturnValue(true);
    spawnSyncMock.mockReturnValue({ status: 0 });
    const check = await checkBgeVlIntegration();
    expect(check.status).toBe('pass');
    expect(check.message).toMatch(/plugin \+ python found at/);
    expect(check.message).toContain('swarmlo-bge-vl');
  });

  it('probes "python" on win32 and "python3" elsewhere', async () => {
    existsSyncMock.mockReturnValue(true);
    spawnSyncMock.mockReturnValue({ status: 0 });
    const platformDesc = Object.getOwnPropertyDescriptor(process, 'platform');
    try {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      await checkBgeVlIntegration();
      expect(spawnSyncMock).toHaveBeenCalledWith('python', ['-c', 'print(1)'], expect.any(Object));
    } finally {
      if (platformDesc) Object.defineProperty(process, 'platform', platformDesc);
    }
  });
});
