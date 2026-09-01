/**
 * Unit tests for the midstream-aware federation transport loader
 * (ADR-120, Step 2).
 *
 * The loader's job is narrow: when MIDSTREAMER_QUIC_NATIVE=1 AND a
 * real (non-stub) midstreamer module is importable, return it.
 * Otherwise, fall through to the agentic-flow loader and then the
 * plugin-owned WebSocket fallback if that loader is unavailable. These
 * tests verify the branch selection by stubbing dynamic imports where
 * needed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  loadFederationTransport,
} from '../../src/transport/midstream-aware-loader.js';

// We don't want the real agentic-flow loader to fire UDP / WebSocket
// listeners in tests. Mock the underlying transport so every test
// gets a deterministic transport stub.
vi.mock('agentic-flow/transport/loader', async () => {
  return {
    loadQuicTransport: vi.fn(async () => ({
      send: vi.fn(),
      onMessage: vi.fn(),
      listen: vi.fn(),
      receive: vi.fn(),
      request: vi.fn(),
      sendBatch: vi.fn(),
      getStats: vi.fn(),
      close: vi.fn(),
      // Marker so we can assert which branch resolved
      __mockSource: 'agentic-flow-mock',
    })),
  };
});

vi.mock('ws', async () => {
  class MockWebSocket {
    on() {}
    send(_data: string, cb?: (err?: Error) => void) { cb?.(); }
    close() {}
  }
  class MockWebSocketServer {
    on(event: string, handler: () => void) {
      if (event === 'listening') queueMicrotask(handler);
    }
    close(cb?: () => void) { cb?.(); }
  }
  return {
    default: MockWebSocket,
    WebSocketServer: MockWebSocketServer,
  };
});

describe('loadFederationTransport — ADR-120 Step 2', () => {
  const originalEnv = process.env.MIDSTREAMER_QUIC_NATIVE;

  beforeEach(() => {
    delete process.env.MIDSTREAMER_QUIC_NATIVE;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.MIDSTREAMER_QUIC_NATIVE;
    } else {
      process.env.MIDSTREAMER_QUIC_NATIVE = originalEnv;
    }
    // Only the `midstreamer/quic` subpath can be (un)mocked — the bare
    // `midstreamer` root package has no "." export and fails vite resolution
    // the moment a mock id is registered for it.
    vi.doUnmock('midstreamer/quic');
  });

  it('defers to agentic-flow when MIDSTREAMER_QUIC_NATIVE is unset', async () => {
    const loaded = await loadFederationTransport();
    expect(loaded.source).toBe('agentic-flow-loader');
    expect(loaded.transport).toBeDefined();
    expect((loaded.transport as unknown as { __mockSource: string }).__mockSource).toBe(
      'agentic-flow-mock',
    );
  });

  it('defers to agentic-flow when MIDSTREAMER_QUIC_NATIVE is "0"', async () => {
    process.env.MIDSTREAMER_QUIC_NATIVE = '0';
    const loaded = await loadFederationTransport();
    expect(loaded.source).toBe('agentic-flow-loader');
  });

  it('defers to agentic-flow with no error noise when midstreamer is unavailable', async () => {
    process.env.MIDSTREAMER_QUIC_NATIVE = '1';
    // Simulate a missing optional peer dependency: a module that exists but
    // exposes none of the expected surface (the loader's probe treats it as
    // a clean miss). Note: midstreamer@0.3.1 IS installed in this workspace,
    // so the loader must be explicitly mocked here — the historical "no need
    // to mock" assumption is stale.
    vi.doMock('midstreamer/quic', () => ({
      // Full export surface so vitest's mock validation passes; the loader
      // only needs `loadQuicTransport` (and thus the surface) to be absent
      // for a clean miss.
      default: undefined,
      loadQuicTransport: undefined,
      isNative: () => false,
      isStub: () => false,
    }));
    const loaded = await loadFederationTransport();
    expect(loaded.source).toBe('agentic-flow-loader');
    // `fallbackReason` is only set when a probe ran to completion and
    // produced a diagnostic; a clean miss leaves it unset.
    expect(loaded.fallbackReason).toBeUndefined();
  });

  it('uses the midstreamer QUIC transport when available and opted in', async () => {
    process.env.MIDSTREAMER_QUIC_NATIVE = '1';
    vi.doMock('midstreamer/quic', () => ({
      loadQuicTransport: vi.fn(async () => ({
        send: vi.fn(),
        onMessage: vi.fn(),
        close: vi.fn(),
        __mockSource: 'midstreamer-mock',
      })),
      isNative: () => true,
      isStub: () => false,
    }));
    const loaded = await loadFederationTransport();
    expect(loaded.source).toBe('midstreamer-native');
    expect(
      (loaded.transport as unknown as { __mockSource: string }).__mockSource,
    ).toBe('midstreamer-mock');
  });

  it('passes config through to the underlying loader', async () => {
    const mod = await import('agentic-flow/transport/loader');
    const loaderFn = (mod as unknown as { loadQuicTransport: ReturnType<typeof vi.fn> })
      .loadQuicTransport;
    loaderFn.mockClear();

    await loadFederationTransport({
      serverName: 'test-node',
      maxIdleTimeoutMs: 12_345,
      maxConcurrentStreams: 42,
      enable0Rtt: false,
    });

    expect(loaderFn).toHaveBeenCalledWith(
      expect.objectContaining({
        serverName: 'test-node',
        maxIdleTimeoutMs: 12_345,
        maxConcurrentStreams: 42,
        enable0Rtt: false,
      }),
    );
  });

  it('rejects an upstream transport that does not implement inbound delivery', async () => {
    const mod = await import('agentic-flow/transport/loader');
    const loaderFn = (mod as unknown as { loadQuicTransport: ReturnType<typeof vi.fn> })
      .loadQuicTransport;
    loaderFn.mockResolvedValueOnce({ send: vi.fn() });

    const loaded = await loadFederationTransport();

    expect(loaded.source).toBe('websocket-fallback');
    expect(typeof loaded.transport.send).toBe('function');
    expect(typeof loaded.transport.onMessage).toBe('function');
  });

  it('requires listen support when an inbound port is configured', async () => {
    const mod = await import('agentic-flow/transport/loader');
    const loaderFn = (mod as unknown as { loadQuicTransport: ReturnType<typeof vi.fn> })
      .loadQuicTransport;
    loaderFn.mockResolvedValueOnce({
      send: vi.fn(),
      onMessage: vi.fn(),
    });

    const loaded = await loadFederationTransport({ port: 0 });

    expect(loaded.source).toBe('websocket-fallback');
    expect(typeof loaded.transport.listen).toBe('function');
  });

  it('returned envelope has the documented LoadedFederationTransport shape', async () => {
    const loaded = await loadFederationTransport();
    expect(Object.keys(loaded).sort()).toEqual(
      expect.arrayContaining(['transport', 'source']),
    );
    // `source` must be one of the two documented values.
    expect(['midstreamer-native', 'agentic-flow-loader', 'websocket-fallback']).toContain(loaded.source);
  });
});
