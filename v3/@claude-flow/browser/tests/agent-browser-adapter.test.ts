/**
 * @claude-flow/browser - Agent Browser Adapter Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AgentBrowserAdapter } from '../src/infrastructure/agent-browser-adapter.js';
import { execFile } from 'child_process';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

const mockExecFile = vi.mocked(execFile);

/** Simulate a successful agent-browser run writing `stdout` to the pipe. */
function mockCommand(stdout: string): void {
  mockExecFile.mockImplementation(((
    _file: unknown,
    _args: unknown,
    _options: unknown,
    callback: (err: Error | null, result: { stdout: string; stderr: string }) => void,
  ) => {
    callback(null, { stdout, stderr: '' });
  }) as never);
}

/** Simulate a failed agent-browser invocation. */
function mockCommandError(message: string): void {
  mockExecFile.mockImplementation(((
    _file: unknown,
    _args: unknown,
    _options: unknown,
    callback: (err: Error | null, result: { stdout: string; stderr: string }) => void,
  ) => {
    callback(new Error(message), { stdout: '', stderr: '' });
  }) as never);
}

describe('AgentBrowserAdapter', () => {
  let adapter: AgentBrowserAdapter;

  beforeEach(() => {
    adapter = new AgentBrowserAdapter({
      session: 'test-session',
      timeout: 5000,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create adapter with default options', () => {
      const defaultAdapter = new AgentBrowserAdapter();
      expect(defaultAdapter).toBeInstanceOf(AgentBrowserAdapter);
    });

    it('should create adapter with custom options', () => {
      const customAdapter = new AgentBrowserAdapter({
        session: 'custom',
        timeout: 10000,
        headless: false,
        debug: true,
      });
      expect(customAdapter).toBeInstanceOf(AgentBrowserAdapter);
    });
  });

  describe('navigation', () => {
    it('should open a URL', async () => {
      mockCommand(JSON.stringify({
        success: true,
        data: { url: 'https://example.com' },
      }));

      const result = await adapter.open({ url: 'https://example.com' });

      expect(result.success).toBe(true);
      expect(mockExecFile).toHaveBeenCalled();
      const callArgs = (mockExecFile.mock.calls[0][1] as string[]).join(' ');
      expect(callArgs).toContain('open');
      expect(callArgs).toContain('https://example.com');
    });

    it('should go back', async () => {
      mockCommand(JSON.stringify({ success: true }));

      const result = await adapter.back();

      expect(result.success).toBe(true);
      expect(mockExecFile).toHaveBeenCalled();
    });

    it('should go forward', async () => {
      mockCommand(JSON.stringify({ success: true }));

      const result = await adapter.forward();

      expect(result.success).toBe(true);
    });

    it('should reload', async () => {
      mockCommand(JSON.stringify({ success: true }));

      const result = await adapter.reload();

      expect(result.success).toBe(true);
    });

    it('should close', async () => {
      mockCommand(JSON.stringify({ success: true }));

      const result = await adapter.close();

      expect(result.success).toBe(true);
    });
  });

  describe('interaction', () => {
    it('should click an element', async () => {
      mockCommand(JSON.stringify({
        success: true,
        data: { clicked: true },
      }));

      const result = await adapter.click({ target: '@e1' });

      expect(result.success).toBe(true);
      const callArgs = (mockExecFile.mock.calls[0][1] as string[]).join(' ');
      expect(callArgs).toContain('click');
      expect(callArgs).toContain('@e1');
    });

    it('should fill an input', async () => {
      mockCommand(JSON.stringify({
        success: true,
        data: { filled: true },
      }));

      const result = await adapter.fill({ target: '@e1', value: 'test' });

      expect(result.success).toBe(true);
      const callArgs = (mockExecFile.mock.calls[0][1] as string[]).join(' ');
      expect(callArgs).toContain('fill');
    });

    it('should type text', async () => {
      mockCommand(JSON.stringify({ success: true }));

      const result = await adapter.type({ target: '@e1', text: 'hello' });

      expect(result.success).toBe(true);
      const callArgs = (mockExecFile.mock.calls[0][1] as string[]).join(' ');
      expect(callArgs).toContain('type');
    });

    it('should press a key', async () => {
      mockCommand(JSON.stringify({ success: true }));

      const result = await adapter.press('Enter');

      expect(result.success).toBe(true);
      const callArgs = (mockExecFile.mock.calls[0][1] as string[]).join(' ');
      expect(callArgs).toContain('press');
      expect(callArgs).toContain('Enter');
    });

    it('should hover an element', async () => {
      mockCommand(JSON.stringify({ success: true }));

      const result = await adapter.hover('@e1');

      expect(result.success).toBe(true);
    });

    it('should scroll', async () => {
      mockCommand(JSON.stringify({ success: true }));

      const result = await adapter.scroll('down', 500);

      expect(result.success).toBe(true);
    });
  });

  describe('information retrieval', () => {
    it('should get text', async () => {
      mockCommand(JSON.stringify({
        success: true,
        data: 'Element text',
      }));

      const result = await adapter.getText('@e1');

      expect(result.success).toBe(true);
      expect(result.data).toBe('Element text');
    });

    it('should get title', async () => {
      mockCommand(JSON.stringify({
        success: true,
        data: 'Page Title',
      }));

      const result = await adapter.getTitle();

      expect(result.success).toBe(true);
    });

    it('should get URL', async () => {
      mockCommand(JSON.stringify({
        success: true,
        data: 'https://example.com',
      }));

      const result = await adapter.getUrl();

      expect(result.success).toBe(true);
    });
  });

  describe('state checks', () => {
    it('should check visibility', async () => {
      mockCommand(JSON.stringify({
        success: true,
        data: true,
      }));

      const result = await adapter.isVisible('@e1');

      expect(result.success).toBe(true);
      expect(result.data).toBe(true);
    });

    it('should check if enabled', async () => {
      mockCommand(JSON.stringify({
        success: true,
        data: true,
      }));

      const result = await adapter.isEnabled('@e1');

      expect(result.success).toBe(true);
    });
  });

  describe('snapshot', () => {
    it('should take a snapshot', async () => {
      mockCommand(JSON.stringify({
        success: true,
        data: {
          tree: { role: 'document', children: [] },
          refs: {},
          url: 'https://example.com',
          title: 'Test',
        },
      }));

      const result = await adapter.snapshot();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should take interactive snapshot', async () => {
      mockCommand(JSON.stringify({
        success: true,
        data: { tree: { role: 'document' } },
      }));

      const result = await adapter.snapshot({ interactive: true });

      expect(result.success).toBe(true);
      const callArgs = (mockExecFile.mock.calls[0][1] as string[]).join(' ');
      expect(callArgs).toContain('-i');
    });

    it('should take compact snapshot', async () => {
      mockCommand(JSON.stringify({ success: true }));

      const result = await adapter.snapshot({ compact: true });

      const callArgs = (mockExecFile.mock.calls[0][1] as string[]).join(' ');
      expect(callArgs).toContain('-c');
    });
  });

  describe('screenshot', () => {
    it('should take a screenshot', async () => {
      mockCommand(JSON.stringify({
        success: true,
        data: 'base64encodedimage',
      }));

      const result = await adapter.screenshot();

      expect(result.success).toBe(true);
    });

    it('should take full page screenshot', async () => {
      mockCommand(JSON.stringify({ success: true }));

      const result = await adapter.screenshot({ fullPage: true });

      const callArgs = (mockExecFile.mock.calls[0][1] as string[]).join(' ');
      expect(callArgs).toContain('--full');
    });
  });

  describe('wait', () => {
    it('should wait for selector', async () => {
      mockCommand(JSON.stringify({ success: true }));

      const result = await adapter.wait({ selector: '#element' });

      expect(result.success).toBe(true);
    });

    it('should wait for timeout', async () => {
      mockCommand(JSON.stringify({ success: true }));

      const result = await adapter.wait({ timeout: 1000 });

      expect(result.success).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle command failure', async () => {
      mockCommandError('Command failed');

      const result = await adapter.open({ url: 'https://example.com' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Command failed');
    });

    it('should handle invalid JSON response', async () => {
      mockCommand('invalid json');

      const result = await adapter.open({ url: 'https://example.com' });

      // Should fall back to raw string
      expect(result.success).toBe(true);
    });
  });
});
