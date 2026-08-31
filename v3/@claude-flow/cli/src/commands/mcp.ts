/**
 * V3 CLI MCP Command
 * MCP server control and management with real server integration
 *
 * @module @claude-flow/cli/commands/mcp
 * @version 3.0.0
 */

import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import { select, confirm } from '../prompt.js';
import { installParentDeathWatchdog } from '../runtime/parent-death-watchdog.js';
import {
  MCPServerManager,
  createMCPServerManager,
  getServerManager,
  startMCPServer,
  stopMCPServer,
  getMCPServerStatus,
  filterAdvertisedMcpTools,
  parseMcpToolSelection,
  type MCPServerOptions,
  type MCPServerStatus,
} from '../mcp-server.js';
import { listMCPTools, callMCPTool, hasTool, getToolMetadata } from '../mcp-client.js';
import { configManager } from '../services/config-file-manager.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fork } from 'child_process';
import { fileURLToPath } from 'url';

/**
 * Persisted MCP tool selection (`mcp.tools` in .claude-flow/config.json or
 * claude-flow.config.json, via the shared config manager). This is the real
 * store behind `mcp toggle` — the server filters advertised tools through
 * filterAdvertisedMcpTools() and `mcp start` now defaults its --tools value
 * from here, so toggles genuinely take effect on the next start.
 */
const MCP_TOOLS_KEY = 'mcp.tools';

/** Read the persisted tool selectors (empty array = no config = advertise all). */
function getPersistedMcpToolSelection(cwd: string): string[] {
  const stored = configManager.get(cwd, MCP_TOOLS_KEY);
  if (Array.isArray(stored) && stored.every((s) => typeof s === 'string')) {
    return stored as string[];
  }
  return [];
}

/** Resolve the effective --tools value for `mcp start`: flag > persisted config > env > 'all'. */
function resolveMcpToolsFlag(ctx: CommandContext): string {
  const flagValue = ctx.flags.tools as string | undefined;
  if (flagValue) return flagValue;
  const persisted = getPersistedMcpToolSelection(ctx.cwd);
  if (persisted.length > 0) return persisted.join(',');
  return 'all';
}

/**
 * #P2 — real backgrounding for `mcp start --daemon`. Forks a detached child
 * that runs the normal (foreground, blocking) `mcp start` — which keeps the
 * server alive — and returns immediately. Same fork/detach/unref/disconnect
 * pattern as the daemon command's startBackgroundDaemon (daemon.ts).
 */
async function forkMcpDaemon(
  ctx: CommandContext,
  forwarded: { port: number; host: string; transport: string; tools: string; force: boolean },
): Promise<CommandResult> {
  // dist/src/commands/mcp.js -> dist/src/commands -> dist/src -> dist -> bin/cli.js
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const cliPath = path.resolve(__dirname, '..', '..', '..', 'bin', 'cli.js');
  if (!fs.existsSync(cliPath)) {
    output.printError(`CLI not found at: ${cliPath}`);
    return { success: false, exitCode: 1 };
  }

  const forkArgs = ['mcp', 'start'];
  forkArgs.push('--port', String(forwarded.port));
  forkArgs.push('--host', forwarded.host);
  forkArgs.push('--transport', forwarded.transport);
  if (forwarded.tools && forwarded.tools !== 'all') {
    forkArgs.push('--tools', forwarded.tools);
  }
  if (forwarded.force) {
    forkArgs.push('--force');
  }

  const child = fork(cliPath, forkArgs, {
    cwd: ctx.cwd,
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    env: { ...process.env },
  });

  const pid = child.pid;
  if (!pid || pid <= 0) {
    output.printError('Failed to get MCP server PID');
    return { success: false, exitCode: 1 };
  }

  child.unref();
  try { child.disconnect(); } catch { /* IPC channel already closed */ }

  // The server writes its own PID file (os.tmpdir()/claude-flow-mcp.pid);
  // give it a moment, then report.
  await new Promise((resolve) => setTimeout(resolve, 500));
  const pidFile = path.join(os.tmpdir(), 'claude-flow-mcp.pid');
  output.writeln();
  output.printSuccess(`MCP server started in background (PID: ${pid})`);
  output.printInfo(`PID file: ${pidFile}`);
  output.printInfo('Status:  claude-flow mcp status');
  output.printInfo('Stop:    claude-flow mcp stop');
  if (!fs.existsSync(pidFile)) {
    output.printWarning('No server PID file found yet — the child may still be starting, or failed. Check with: claude-flow mcp status');
  }
  return { success: true, data: { daemonPid: pid, pidFile } };
}

// MCP tools categories
const TOOL_CATEGORIES = [
  { value: 'coordination', label: 'Coordination', hint: 'Swarm and agent coordination tools' },
  { value: 'monitoring', label: 'Monitoring', hint: 'Status and metrics monitoring' },
  { value: 'memory', label: 'Memory', hint: 'Memory and neural features' },
  { value: 'github', label: 'GitHub', hint: 'GitHub integration tools' },
  { value: 'system', label: 'System', hint: 'System and benchmark tools' }
];

/**
 * Format uptime for display
 */
function formatUptime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

// Start MCP server
const startCommand: Command = {
  name: 'start',
  description: 'Start MCP server',
  options: [
    {
      name: 'port',
      short: 'p',
      description: 'Server port',
      type: 'number',
      default: 3000
    },
    {
      name: 'host',
      short: 'h',
      description: 'Server host',
      type: 'string',
      default: 'localhost'
    },
    {
      name: 'transport',
      short: 't',
      description: 'Transport type (stdio, http, websocket)',
      type: 'string',
      default: 'stdio',
      choices: ['stdio', 'http', 'websocket']
    },
    {
      name: 'tools',
      description: 'Tools to advertise (comma-separated categories, prefixes, exact names, or "all")',
      type: 'string',
      default: 'all'
    },
    {
      name: 'daemon',
      short: 'd',
      description: 'Run as background daemon',
      type: 'boolean',
      default: false
    },
    {
      name: 'force',
      short: 'f',
      description: 'Force restart (kill existing server first)',
      type: 'boolean',
      default: false
    }
  ],
  examples: [
    { command: 'claude-flow mcp start', description: 'Start with defaults (stdio)' },
    { command: 'claude-flow mcp start -p 8080 -t http', description: 'Start HTTP server' },
    { command: 'claude-flow mcp start -d', description: 'Start as daemon' },
    { command: 'claude-flow mcp start -f', description: 'Force restart (kill existing)' }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const port = (ctx.flags.port as number) ?? 3000;
    const host = (ctx.flags.host as string) ?? 'localhost';
    const transport = (ctx.flags.transport as 'stdio' | 'http' | 'websocket') ?? 'stdio';
    // #P2 — default the tool selection from the persisted config (mcp.tools,
    // written by `mcp toggle`), falling back to env/flag/'all'.
    const tools = resolveMcpToolsFlag(ctx);
    const daemon = (ctx.flags.daemon as boolean) ?? false;
    const force = (ctx.flags.force as boolean) ?? false;

    output.writeln();
    output.printInfo('Starting MCP Server...');
    output.writeln();

    // Check if already running (skip self-detection for stdio — getStatus()
    // reports the current process as "running" when transport=stdio and no
    // PID file exists, which would cause us to SIGKILL ourselves)
    const existingStatus = await getMCPServerStatus();

    // #P2 — real backgrounding: fork a detached child running the blocking
    // foreground server, then return immediately. Runs after the already-
    // running check so a live server is reported without spawning a child.
    if (daemon) {
      return forkMcpDaemon(ctx, { port, host, transport, tools, force });
    }
    const isSelfDetected = existingStatus.pid === process.pid;
    if (existingStatus.running && !isSelfDetected) {
      // For stdio transport, always force restart since we can't health check it
      // For other transports, check health unless --force is specified
      const shouldForceRestart = force || transport === 'stdio';

      if (!shouldForceRestart) {
        // Verify the server is actually healthy/responsive
        const manager = getServerManager();
        const health = await manager.checkHealth();

        if (health.healthy) {
          output.printWarning(`MCP Server already running (PID: ${existingStatus.pid})`);
          output.writeln(output.dim('Use "claude-flow mcp stop" to stop the server first, or use --force'));
          return { success: false, exitCode: 1 };
        }
      }

      // Force restart or unresponsive - auto-recover
      output.printWarning(`MCP Server (PID: ${existingStatus.pid}) - restarting...`);
      try {
        // Force kill the existing process
        if (existingStatus.pid) {
          try {
            process.kill(existingStatus.pid, 'SIGKILL');
          } catch {
            // Process may already be dead
          }
        }
        const manager = getServerManager();
        await manager.stop();
        output.writeln(output.dim('  Cleaned up existing server'));
      } catch {
        // Continue anyway - the stop/cleanup may partially fail
      }
    }

    const options: MCPServerOptions = {
      transport,
      host,
      port,
      tools: !tools || tools === 'all' ? 'all' : tools.split(','),
    };

    try {
      output.writeln(output.dim('  Initializing server...'));

      const manager = getServerManager(options);

      // Setup event handlers for progress display
      manager.on('starting', () => {
        output.writeln(output.dim('  Loading tool registry...'));
      });

      manager.on('started', (data: { startupTime?: number }) => {
        output.writeln(output.dim(`  Server started in ${data.startupTime?.toFixed(2) || 0}ms`));
      });

      manager.on('log', (log: { level: string; msg: string; data?: unknown }) => {
        if (ctx.flags.verbose) {
          output.writeln(output.dim(`  [${log.level}] ${log.msg}`));
        }
      });

      // Start the server
      const status = await manager.start();

      // #2234 — exit cleanly if Claude Code (our parent) exits and we get
      // reparented to launchd/init (ppid === 1). Otherwise the node stdio
      // server lingers as an orphan, accumulating ~50 MB per restart, and an
      // arbitrary stale orphan can later win the stdio handshake and serve
      // pre-fix code from the user's npx cache.
      installParentDeathWatchdog({
        onOrphaned: async () => {
          try { await manager.stop(); } catch { /* best-effort */ }
        },
      });

      output.writeln();
      output.printTable({
        columns: [
          { key: 'property', header: 'Property', width: 15 },
          { key: 'value', header: 'Value', width: 30 }
        ],
        data: [
          { property: 'Server PID', value: status.pid || process.pid },
          { property: 'Transport', value: transport },
          { property: 'Host', value: host },
          { property: 'Port', value: port },
          // #P2 — real count from the tool registry, filtered by the same
          // selection contract the server advertises (was hardcoded "27").
          {
            property: 'Tools',
            value: `${filterAdvertisedMcpTools(
              listMCPTools(),
              !tools || tools === 'all' ? 'all' : tools.split(',')
            ).length} enabled`
          },
          { property: 'Status', value: output.success('Running') }
        ]
      });

      output.writeln();
      output.printSuccess('MCP Server started');

      if (transport === 'http') {
        output.writeln(output.dim(`  Health: http://${host}:${port}/health`));
        output.writeln(output.dim(`  RPC: http://${host}:${port}/rpc`));
      } else if (transport === 'websocket') {
        output.writeln(output.dim(`  WebSocket: ws://${host}:${port}/ws`));
      }

      // #2984: this command is only reached via the "normal CLI mode" branch
      // of bin/cli.js — i.e. every invocation NOT auto-detected as Claude
      // Code's implicit piped-stdin MCP handshake (that path bypasses this
      // action entirely and blocks on stdin forever, which is why it was
      // unaffected). bin/cli.js unconditionally exits the process once this
      // action's promise resolves (`cli.run().then(() => process.exit(0))`,
      // #1552) — a design that assumed "mcp start never resolves" but this
      // action DID resolve immediately after printing the table above, so
      // the freshly-bound http/websocket listener (or the interactive-TTY
      // stdio server) was torn down within milliseconds of the printed
      // "Status: Running" claim. `daemonize` is not currently wired to
      // actually fork/detach a background process (no branch reads it in
      // MCPServerManager), so there is no real backgrounding path yet —
      // every successful start here is a foreground server and must block
      // until told to stop, matching `daemon start --foreground`'s
      // established pattern in daemon.ts.
      output.writeln();
      output.writeln(output.dim('Press Ctrl+C to stop the server'));

      let stopping = false;
      const shutdown = async () => {
        if (stopping) return;
        stopping = true;
        try { await manager.stop(); } catch { /* best-effort */ }
        process.exit(0);
      };
      process.on('SIGINT', () => { void shutdown(); });
      process.on('SIGTERM', () => { void shutdown(); });

      // Ref'd handle so Node's event loop can't drain to empty even if some
      // transport internals unref their own timers — same belt-and-suspenders
      // as daemon.ts's foreground path (#1478).
      setInterval(() => {}, 60_000);
      await new Promise(() => {}); // Never resolves — server runs until killed.

      return { success: true, data: status }; // unreachable, keeps the return type honest
    } catch (error) {
      output.printError(`Failed to start MCP server: ${(error as Error).message}`);
      return { success: false, exitCode: 1 };
    }
  }
};

// Stop MCP server
const stopCommand: Command = {
  name: 'stop',
  description: 'Stop MCP server',
  options: [
    {
      name: 'force',
      short: 'f',
      description: 'Force stop without graceful shutdown',
      type: 'boolean',
      default: false
    }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const force = ctx.flags.force as boolean;

    // Check if server is running
    const status = await getMCPServerStatus();
    if (!status.running) {
      output.printInfo('MCP Server is not running');
      return { success: true };
    }

    if (!force && ctx.interactive) {
      const confirmed = await confirm({
        message: `Stop MCP server (PID: ${status.pid})?`,
        default: false
      });

      if (!confirmed) {
        output.printInfo('Operation cancelled');
        return { success: true };
      }
    }

    output.printInfo('Stopping MCP Server...');

    try {
      const manager = getServerManager();

      if (!force) {
        output.writeln(output.dim('  Completing pending requests...'));
        output.writeln(output.dim('  Closing connections...'));
      }

      await manager.stop(force);

      output.writeln(output.dim('  Releasing resources...'));
      output.printSuccess('MCP Server stopped');

      return { success: true, data: { stopped: true, force } };
    } catch (error) {
      output.printError(`Failed to stop MCP server: ${(error as Error).message}`);
      return { success: false, exitCode: 1 };
    }
  }
};

// MCP status
const statusCommand: Command = {
  name: 'status',
  description: 'Show MCP server status',
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    try {
      let status = await getMCPServerStatus();

      // If PID-based check says not running, detect stdio mode
      if (!status.running) {
        const isStdio = !process.stdin.isTTY;
        const envTransport = process.env.CLAUDE_FLOW_MCP_TRANSPORT;
        if (isStdio || envTransport === 'stdio') {
          status = {
            running: true,
            pid: process.pid,
            transport: 'stdio',
          };
        }
      }

      if (ctx.flags.format === 'json') {
        output.printJson(status);
        return { success: true, data: status };
      }

      output.writeln();
      output.writeln(output.bold('MCP Server Status'));
      output.writeln();

      if (!status.running) {
        output.printTable({
          columns: [
            { key: 'metric', header: 'Metric', width: 20 },
            { key: 'value', header: 'Value', width: 20, align: 'right' }
          ],
          data: [
            { metric: 'Status', value: output.error('Stopped') }
          ]
        });

        output.writeln();
        output.writeln(output.dim('Run "claude-flow mcp start" to start the server'));
        return { success: true, data: status };
      }

      const displayData: Array<{ metric: string; value: unknown }> = [
        { metric: 'Status', value: output.success('Running') },
        { metric: 'PID', value: status.pid },
        { metric: 'Transport', value: status.transport },
      ];

      // Only show host/port for non-stdio transports
      if (status.transport !== 'stdio') {
        displayData.push({ metric: 'Host', value: status.host });
        displayData.push({ metric: 'Port', value: status.port });
      }

      if (status.uptime !== undefined) {
        displayData.push({ metric: 'Uptime', value: formatUptime(status.uptime) });
      }

      if (status.startedAt) {
        displayData.push({ metric: 'Started At', value: status.startedAt });
      }

      if (status.health) {
        displayData.push({
          metric: 'Health',
          value: status.health.healthy
            ? output.success('Healthy')
            : output.error(status.health.error || 'Unhealthy')
        });

        if (status.health.metrics) {
          for (const [key, value] of Object.entries(status.health.metrics)) {
            displayData.push({
              metric: `  ${key}`,
              value: String(value)
            });
          }
        }
      }

      output.printTable({
        columns: [
          { key: 'metric', header: 'Metric', width: 20 },
          { key: 'value', header: 'Value', width: 25, align: 'right' }
        ],
        data: displayData
      });

      return { success: true, data: status };
    } catch (error) {
      output.printError(`Failed to get status: ${(error as Error).message}`);
      return { success: false, exitCode: 1 };
    }
  }
};

// List tools
const toolsCommand: Command = {
  name: 'tools',
  description: 'List available MCP tools',
  options: [
    {
      name: 'category',
      short: 'c',
      description: 'Filter by category',
      type: 'string',
      choices: TOOL_CATEGORIES.map(c => c.value)
    },
    {
      name: 'enabled',
      description: 'Show only enabled tools',
      type: 'boolean',
      default: false
    }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const category = ctx.flags.category as string;

    // #P2 — enabled state comes from the persisted tool selection
    // (mcp.tools in config, written by `mcp toggle`), not hardcoded true.
    const selectors = getPersistedMcpToolSelection(ctx.cwd);

    // Use local tool registry
    let tools: Array<{ name: string; category: string; description: string; enabled: boolean }>;

    // Get tools from local registry
    const registeredTools = listMCPTools(category);

    if (registeredTools.length > 0) {
      tools = registeredTools.map(tool => ({
        name: tool.name,
        category: tool.category || 'uncategorized',
        description: tool.description,
        enabled: selectors.length === 0 || filterAdvertisedMcpTools([tool], selectors).length > 0
      }));
    } else {
      // Fallback to static tool list
      tools = [
        // Agent tools
        { name: 'agent_spawn', category: 'agent', description: 'Spawn a new agent', enabled: true },
        { name: 'agent_list', category: 'agent', description: 'List all agents', enabled: true },
        { name: 'agent_terminate', category: 'agent', description: 'Terminate an agent', enabled: true },
        { name: 'agent_status', category: 'agent', description: 'Get agent status', enabled: true },

        // Swarm tools
        { name: 'swarm_init', category: 'swarm', description: 'Initialize swarm topology', enabled: true },
        { name: 'swarm_status', category: 'swarm', description: 'Get swarm status', enabled: true },
        { name: 'swarm_scale', category: 'swarm', description: 'Scale swarm size', enabled: true },

        // Memory tools
        { name: 'memory_store', category: 'memory', description: 'Store in memory', enabled: true },
        { name: 'memory_search', category: 'memory', description: 'Search memory', enabled: true },
        { name: 'memory_list', category: 'memory', description: 'List memory entries', enabled: true },

        // Config tools
        { name: 'config_load', category: 'config', description: 'Load configuration', enabled: true },
        { name: 'config_save', category: 'config', description: 'Save configuration', enabled: true },
        { name: 'config_validate', category: 'config', description: 'Validate configuration', enabled: true },

        // Hooks tools
        { name: 'hooks_pre-edit', category: 'hooks', description: 'Pre-edit hook', enabled: true },
        { name: 'hooks_post-edit', category: 'hooks', description: 'Post-edit hook', enabled: true },
        { name: 'hooks_pre-command', category: 'hooks', description: 'Pre-command hook', enabled: true },
        { name: 'hooks_post-command', category: 'hooks', description: 'Post-command hook', enabled: true },
        { name: 'hooks_route', category: 'hooks', description: 'Route task to agent', enabled: true },
        { name: 'hooks_explain', category: 'hooks', description: 'Explain routing', enabled: true },
        { name: 'hooks_pretrain', category: 'hooks', description: 'Pretrain from repo', enabled: true },
        { name: 'hooks_metrics', category: 'hooks', description: 'Learning metrics', enabled: true },
        { name: 'hooks_list', category: 'hooks', description: 'List hooks', enabled: true },

        // System tools
        { name: 'system_info', category: 'system', description: 'System information', enabled: true },
        { name: 'system_health', category: 'system', description: 'Health status', enabled: true },
        { name: 'system_metrics', category: 'system', description: 'Server metrics', enabled: true },
      ].filter(t => !category || t.category === category);

      // Apply the persisted selection to the fallback list too, so the two
      // branches report consistent enabled states.
      if (selectors.length > 0) {
        tools = tools.map(t => ({ ...t, enabled: filterAdvertisedMcpTools([t], selectors).length > 0 }));
      }
    }

    if (ctx.flags.format === 'json') {
      output.printJson(tools);
      return { success: true, data: tools };
    }

    output.writeln();
    output.writeln(output.bold('Available MCP Tools'));
    output.writeln();

    // Group by category
    const grouped = tools.reduce((acc, tool) => {
      if (!acc[tool.category]) acc[tool.category] = [];
      acc[tool.category].push(tool);
      return acc;
    }, {} as Record<string, typeof tools>);

    for (const [cat, catTools] of Object.entries(grouped)) {
      output.writeln(output.highlight(cat.charAt(0).toUpperCase() + cat.slice(1)));

      output.printTable({
        columns: [
          { key: 'name', header: 'Tool', width: 25 },
          { key: 'description', header: 'Description', width: 35 },
          { key: 'enabled', header: 'Status', width: 10, format: (v: unknown) => (v as boolean) ? output.success('Enabled') : output.dim('Disabled') }
        ],
        data: catTools,
        border: false
      });

      output.writeln();
    }

    output.printInfo(`Total: ${tools.length} tools`);

    return { success: true, data: tools };
  }
};

// Enable/disable tools
const toggleCommand: Command = {
  name: 'toggle',
  description: 'Enable or disable MCP tools',
  options: [
    {
      name: 'enable',
      short: 'e',
      description: 'Enable tools',
      type: 'string'
    },
    {
      name: 'disable',
      short: 'd',
      description: 'Disable tools',
      type: 'string'
    }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const toEnable = ctx.flags.enable as string;
    const toDisable = ctx.flags.disable as string;

    if (!toEnable && !toDisable) {
      output.printError('Use --enable or --disable with comma-separated tool names');
      return { success: false, exitCode: 1 };
    }

    // #P2 — real persistence: mutate the mcp.tools selection in the shared
    // config file (claude-flow.config.json / .claude-flow/config.json).
    // `mcp start` defaults its --tools from here, so toggles take effect on
    // the next server start.
    const registry = listMCPTools();
    let selectors = getPersistedMcpToolSelection(ctx.cwd);

    // The persisted selection is an ADVERTISING whitelist (the same contract
    // filterAdvertisedMcpTools applies to `mcp start --tools`): an empty
    // selection advertises ALL tools. Disabling a tool therefore materializes
    // the whitelist as the full registry and removes the tool; enabling in
    // whitelist mode adds it back; enabling in all-tools mode is a no-op.
    const applyToggle = (raw: string, enabling: boolean): void => {
      const tools = raw.split(',').map((t) => t.trim()).filter(Boolean);
      if (tools.length === 0) {
        output.printError(`No tool names given for --${enabling ? 'enable' : 'disable'}`);
        return;
      }
      const missing = tools.filter((t) => !registry.some((r) => r.name === t));
      if (missing.length > 0) {
        output.printWarning(`Unknown tool(s): ${missing.join(', ')} (not in the tool registry)`);
      }
      if (enabling) {
        if (selectors.length === 0) {
          // All-tools mode: everything is already advertised — no-op.
          output.printSuccess(`Enabled ${tools.length} tool(s) (already enabled — currently advertising all tools)`);
          return;
        }
        selectors = Array.from(new Set([...selectors, ...tools]));
        output.printSuccess(`Enabled ${tools.length} tool(s)`);
      } else {
        if (selectors.length === 0) {
          // All-tools mode → materialize the whitelist, then remove.
          selectors = registry.map((r) => r.name);
        }
        const before = selectors.length;
        selectors = selectors.filter((s) => !tools.includes(s));
        const removed = before - selectors.length;
        if (removed === 0) {
          output.printWarning(`Tool(s) ${tools.join(', ')} were not in the advertised selection — nothing to disable.`);
        } else {
          output.printSuccess(`Disabled ${removed} tool(s)`);
        }
        if (selectors.length === 0) {
          output.printWarning('The selection is now empty, which advertises ALL tools (the --tools selector contract). Disabling every tool is not expressible in this model.');
        }
      }
    };

    if (toEnable) {
      output.printInfo(`Enabling tools: ${toEnable.split(',').map((t) => t.trim()).filter(Boolean).join(', ')}`);
      applyToggle(toEnable, true);
    }

    if (toDisable) {
      output.printInfo(`Disabling tools: ${toDisable.split(',').map((t) => t.trim()).filter(Boolean).join(', ')}`);
      applyToggle(toDisable, false);
    }

    configManager.set(ctx.cwd, MCP_TOOLS_KEY, selectors);
    const configPath = configManager.findConfig(ctx.cwd) ?? configManager.getConfigPath()
      ?? path.join(ctx.cwd, 'claude-flow.config.json');
    output.writeln(output.dim(`  Persisted to ${configPath} (mcp.tools). Takes effect on the next "claude-flow mcp start".`));

    return { success: true, data: { selectors } };
  }
};

// Execute tool
const execCommand: Command = {
  name: 'exec',
  description: 'Execute an MCP tool',
  options: [
    {
      name: 'tool',
      short: 't',
      description: 'Tool name',
      type: 'string',
      required: true
    },
    {
      name: 'params',
      short: 'p',
      description: 'Tool parameters (JSON)',
      type: 'string'
    }
  ],
  examples: [
    { command: 'claude-flow mcp exec -t swarm_init -p \'{"topology":"mesh"}\'', description: 'Execute tool' }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const tool = ctx.flags.tool as string || ctx.args[0];
    const paramsStr = ctx.flags.params as string;

    if (!tool) {
      output.printError('Tool name is required. Use --tool or -t');
      return { success: false, exitCode: 1 };
    }

    let params = {};
    if (paramsStr) {
      try {
        params = JSON.parse(paramsStr);
      } catch (e) {
        output.printError('Invalid JSON parameters');
        return { success: false, exitCode: 1 };
      }
    }

    output.printInfo(`Executing tool: ${tool}`);

    if (Object.keys(params).length > 0) {
      output.writeln(output.dim(`  Parameters: ${JSON.stringify(params)}`));
    }

    try {
      // Execute through local MCP tool registry
      if (!hasTool(tool)) {
        output.printError(`Tool not found: ${tool}`);
        return { success: false, exitCode: 1 };
      }

      const startTime = performance.now();
      const result = await callMCPTool(tool, params, {
        sessionId: `cli-${Date.now().toString(36)}`,
        requestId: `exec-${Date.now()}`,
      });
      const duration = performance.now() - startTime;

      output.writeln();
      output.printSuccess(`Tool executed in ${duration.toFixed(2)}ms`);

      if (ctx.flags.format === 'json') {
        output.printJson({ tool, params, result, duration });
      } else {
        output.writeln();
        output.writeln(output.bold('Result:'));
        output.printJson(result);
      }

      return { success: true, data: { tool, params, result, duration } };
    } catch (error) {
      output.printError(`Tool execution failed: ${(error as Error).message}`);
      return { success: false, exitCode: 1 };
    }
  }
};

// Health check command
const healthCommand: Command = {
  name: 'health',
  description: 'Check MCP server health',
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    try {
      const status = await getMCPServerStatus();

      if (!status.running) {
        output.printError('MCP Server is not running');
        return { success: false, exitCode: 1 };
      }

      const manager = getServerManager();
      const health = await manager.checkHealth();

      if (ctx.flags.format === 'json') {
        output.printJson(health);
        return { success: true, data: health };
      }

      output.writeln();
      output.writeln(output.bold('MCP Server Health'));
      output.writeln();

      if (health.healthy) {
        output.printSuccess('Server is healthy');
      } else {
        output.printError(`Server is unhealthy: ${health.error || 'Unknown error'}`);
      }

      if (health.metrics) {
        output.writeln();
        output.writeln(output.bold('Metrics:'));
        for (const [key, value] of Object.entries(health.metrics)) {
          output.writeln(`  ${key}: ${value}`);
        }
      }

      return { success: health.healthy, data: health };
    } catch (error) {
      output.printError(`Health check failed: ${(error as Error).message}`);
      return { success: false, exitCode: 1 };
    }
  }
};

// Logs command
const logsCommand: Command = {
  name: 'logs',
  description: 'Show MCP server logs',
  options: [
    {
      name: 'lines',
      short: 'n',
      description: 'Number of lines',
      type: 'number',
      default: 20
    },
    {
      name: 'follow',
      short: 'f',
      description: 'Follow log output',
      type: 'boolean',
      default: false
    },
    {
      name: 'level',
      description: 'Filter by log level',
      type: 'string',
      choices: ['debug', 'info', 'warn', 'error']
    }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const lines = (ctx.flags.lines as number) ?? 20;
    const level = (ctx.flags.level as string) || 'info';
    const follow = (ctx.flags.follow as boolean) ?? false;

    // #P2 — read real log files instead of fabricated entries. The MCP
    // server itself does not write a log file; the daemon and its workers
    // write .claude-flow/logs/daemon.log (+ crash.log). Read those.
    const logDir = path.join(ctx.cwd, '.claude-flow', 'logs');

    const LEVELS = ['debug', 'info', 'warn', 'error'];
    const minLevelIdx = LEVELS.indexOf(level) >= 0 ? LEVELS.indexOf(level) : 1;

    const readEntries = (): Array<{ time: string; level: string; message: string }> => {
      if (!fs.existsSync(logDir)) return [];
      const entries: Array<{ time: string; level: string; message: string }> = [];
      try {
        const files = fs.readdirSync(logDir).filter((f) => f.endsWith('.log'));
        for (const file of files) {
          try {
            const content = fs.readFileSync(path.join(logDir, file), 'utf-8');
            for (const rawLine of content.split('\n')) {
              const line = rawLine.trim();
              if (!line) continue;
              // [<ISO timestamp>] [LEVEL] message
              const m = line.match(/^\[([^\]]+)\]\s*\[([A-Z]+)\]\s*(.*)$/);
              if (!m) continue;
              const time = m[1];
              const lvl = m[2].toLowerCase();
              if (LEVELS.indexOf(lvl) < minLevelIdx) continue;
              entries.push({ time, level: lvl, message: m[3] });
            }
          } catch { /* skip unreadable files */ }
        }
      } catch { /* skip if dir unreadable */ }
      // Newest last; the log lines are already chronological per file.
      return entries;
    };

    if (!fs.existsSync(logDir) || readEntries().length === 0) {
      output.printError('No MCP log source found: no .log files under .claude-flow/logs/ (the MCP server does not write its own log file).');
      output.writeln(output.dim('  Start the daemon to produce logs: claude-flow daemon start'));
      return { success: false, exitCode: 1 };
    }

    output.writeln();
    output.writeln(output.bold('MCP/daemon logs'));
    output.writeln(output.dim(`  Source: ${logDir} | Level: ${level}+ | Lines: ${lines}`));
    output.writeln();

    if (follow) {
      output.printWarning('--follow is not implemented (no streaming MCP log source); showing the current snapshot instead.');
    }

    const entries = readEntries();
    const shown = entries.slice(-lines);
    for (const log of shown) {
      let levelStr: string;
      switch (log.level) {
        case 'error':
          levelStr = output.error(log.level.toUpperCase().padEnd(5));
          break;
        case 'warn':
          levelStr = output.warning(log.level.toUpperCase().padEnd(5));
          break;
        case 'debug':
          levelStr = output.dim(log.level.toUpperCase().padEnd(5));
          break;
        default:
          levelStr = output.info(log.level.toUpperCase().padEnd(5));
      }
      output.writeln(`${output.dim(log.time)} ${levelStr} ${log.message}`);
    }

    if (shown.length === 0) {
      output.printInfo('No log entries match the current filters.');
    }

    return { success: true, data: { logDir, entries: shown } };
  }
};

// Restart command
const restartCommand: Command = {
  name: 'restart',
  description: 'Restart MCP server',
  options: [
    {
      name: 'force',
      short: 'f',
      description: 'Force restart without graceful shutdown',
      type: 'boolean',
      default: false
    }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const force = ctx.flags.force as boolean;

    output.printInfo('Restarting MCP Server...');

    try {
      const manager = getServerManager();
      const status = await manager.restart();

      output.printSuccess('MCP Server restarted');
      output.writeln(output.dim(`  PID: ${status.pid}`));

      return { success: true, data: status };
    } catch (error) {
      output.printError(`Failed to restart: ${(error as Error).message}`);
      return { success: false, exitCode: 1 };
    }
  }
};

// Main MCP command
export const mcpCommand: Command = {
  name: 'mcp',
  description: 'MCP server management',
  subcommands: [
    startCommand,
    stopCommand,
    statusCommand,
    healthCommand,
    restartCommand,
    toolsCommand,
    toggleCommand,
    execCommand,
    logsCommand
  ],
  options: [],
  examples: [
    { command: 'claude-flow mcp start', description: 'Start MCP server' },
    { command: 'claude-flow mcp start -t http -p 8080', description: 'Start HTTP server on port 8080' },
    { command: 'claude-flow mcp status', description: 'Show server status' },
    { command: 'claude-flow mcp tools', description: 'List tools' },
    { command: 'claude-flow mcp stop', description: 'Stop the server' }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    output.writeln();
    output.writeln(output.bold('MCP Server Management'));
    output.writeln();
    output.writeln('Usage: claude-flow mcp <subcommand> [options]');
    output.writeln();
    output.writeln('Subcommands:');
    output.printList([
      `${output.highlight('start')}    - Start MCP server`,
      `${output.highlight('stop')}     - Stop MCP server`,
      `${output.highlight('status')}   - Show server status`,
      `${output.highlight('health')}   - Check server health`,
      `${output.highlight('restart')}  - Restart MCP server`,
      `${output.highlight('tools')}    - List available tools`,
      `${output.highlight('toggle')}   - Enable/disable tools`,
      `${output.highlight('exec')}     - Execute a tool`,
      `${output.highlight('logs')}     - Show server logs`
    ]);

    return { success: true };
  }
};

export default mcpCommand;
