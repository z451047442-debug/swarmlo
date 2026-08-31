/**
 * V3 CLI Start Command
 * System startup for Claude Flow orchestration
 */

import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import { confirm, select } from '../prompt.js';
import { callMCPTool, MCPClientError } from '../mcp-client.js';
import * as fs from 'fs';
import * as path from 'path';
import { fork } from 'child_process';
import { fileURLToPath } from 'url';

// Default configuration
const DEFAULT_PORT = 3000;
const DEFAULT_TOPOLOGY = 'hierarchical-mesh';
const DEFAULT_MAX_AGENTS = 15;

// `start --daemon` uses its OWN PID file — the worker daemon command owns
// .claude-flow/daemon.pid and the two must not clobber each other.
const START_DAEMON_PID_FILE = '.claude-flow/start.pid';

// Check if project is initialized
function isInitialized(cwd: string): boolean {
  const configPath = path.join(cwd, '.claude-flow', 'config.yaml');
  return fs.existsSync(configPath);
}

// Simple YAML parser for config (basic implementation)
function parseSimpleYamlScalar(raw: string): unknown {
  const value = raw.trim();
  if (value === '') return {};
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (!isNaN(Number(value))) return Number(value);
  if (value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
  return value;
}

function parseSimpleYaml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = content.split('\n');
  const stack: Array<{ indent: number; obj: Record<string, unknown>; key?: string }> = [
    { indent: -1, obj: result }
  ];

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.trim().startsWith('#') || line.trim() === '') continue;

    // List items (`- value`) attach to the nearest container key, replacing
    // the empty object placeholder the `key:` line created.
    const listMatch = line.match(/^(\s*)- ?(.*)$/);
    if (listMatch) {
      const indent = listMatch[1].length;
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }
      const top = stack[stack.length - 1];
      if (stack.length >= 2 && top.key) {
        const owner = stack[stack.length - 2];
        const item = parseSimpleYamlScalar(listMatch[2]);
        const existing = owner.obj[top.key];
        if (Array.isArray(existing)) existing.push(item);
        else owner.obj[top.key] = [item];
      }
      continue;
    }

    const match = line.match(/^(\s*)(\w+):\s*(.*)$/);
    if (!match) continue;

    const indent = match[1].length;
    const key = match[2];
    const value = parseSimpleYamlScalar(match[3]);

    // Find parent based on indentation
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].obj;

    if (typeof value === 'object' && value !== null) {
      parent[key] = value;
      stack.push({ indent, obj: value as Record<string, unknown>, key });
    } else {
      parent[key] = value;
    }
  }

  return result;
}

// Load configuration
function loadConfig(cwd: string): Record<string, unknown> | null {
  const configPath = path.join(cwd, '.claude-flow', 'config.yaml');
  if (!fs.existsSync(configPath)) return null;

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return parseSimpleYaml(content);
  } catch {
    return null;
  }
}

/**
 * #P1 — real daemon backgrounding for `start --daemon`. Forks a detached
 * child that performs the actual startup and stays alive, then returns
 * immediately. Mirrors the daemon command's startBackgroundDaemon pattern
 * (daemon.ts): fork() with detached:true works on Windows too, unref() +
 * disconnect() sever the IPC pipe so the child survives the parent's exit.
 * The child writes its own PID file (`.claude-flow/start.pid` — separate
 * from the worker daemon's `.claude-flow/daemon.pid`, which is owned by
 * `claude-flow daemon` and must not be clobbered), with a 500ms fallback
 * write from the parent, same as daemon.ts.
 */
async function forkStartDaemon(
  cwd: string,
  forwarded: { port: number; topology?: string; skipMcp?: boolean },
): Promise<CommandResult> {
  // dist/src/commands/start.js -> dist/src/commands -> dist/src -> dist -> bin/cli.js
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const cliPath = path.resolve(__dirname, '..', '..', '..', 'bin', 'cli.js');
  if (!fs.existsSync(cliPath)) {
    output.printError(`CLI not found at: ${cliPath}`);
    return { success: false, exitCode: 1 };
  }

  const forkArgs = ['start', '--daemon'];
  forkArgs.push('--port', String(forwarded.port));
  if (forwarded.topology) {
    forkArgs.push('--topology', forwarded.topology);
  }
  if (forwarded.skipMcp) {
    forkArgs.push('--skip-mcp');
  }

  const child = fork(cliPath, forkArgs, {
    cwd,
    detached: true, // own process group on POSIX; independent session on Windows
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    env: { ...process.env, CLAUDE_FLOW_START_DAEMON: '1' },
  });

  const pid = child.pid;
  if (!pid || pid <= 0) {
    output.printError('Failed to get daemon PID');
    return { success: false, exitCode: 1 };
  }

  child.unref();
  try { child.disconnect(); } catch { /* IPC channel already closed */ }

  // Give the child time to start and write its own PID file; fall back to
  // writing it here so a fast parent exit can't leave a race window.
  await new Promise((resolve) => setTimeout(resolve, 500));
  const daemonPidPath = path.join(cwd, START_DAEMON_PID_FILE);
  if (!fs.existsSync(daemonPidPath)) {
    try { fs.writeFileSync(daemonPidPath, String(pid)); } catch { /* best-effort */ }
  }

  output.writeln();
  output.printSuccess(`Started in background (PID: ${pid})`);
  output.printInfo(`PID file: ${daemonPidPath}`);
  output.printInfo('Stop with: claude-flow start stop');
  return { success: true, data: { daemonPid: pid, pidFile: daemonPidPath } };
}

// Main start action
const startAction = async (ctx: CommandContext): Promise<CommandResult> => {
  const daemon = ctx.flags.daemon as boolean;
  const port = (ctx.flags.port as number) || DEFAULT_PORT;
  const topology = (ctx.flags.topology as string) || DEFAULT_TOPOLOGY;
  const skipMcp = ctx.flags['skip-mcp'] as boolean;
  const cwd = ctx.cwd;
  // Set by forkStartDaemon on the detached child — lets the child run the
  // full startup + keep-alive path without forking a grandchild.
  const isDaemonChild = process.env.CLAUDE_FLOW_START_DAEMON === '1';

  // Check initialization
  if (!isInitialized(cwd)) {
    output.printError('Swarmlo is not initialized in this directory');
    output.printInfo('Run "swarmlo init" first to initialize');
    return { success: false, exitCode: 1 };
  }

  // Parent path for --daemon: fork a detached child that performs the real
  // startup and stays alive, then return immediately.
  if (daemon && !isDaemonChild) {
    return forkStartDaemon(cwd, {
      port,
      topology: topology !== DEFAULT_TOPOLOGY ? topology : undefined,
      skipMcp: skipMcp === true,
    });
  }

  // Load configuration
  const config = loadConfig(cwd);
  const swarmConfig = (config?.swarm as Record<string, unknown>) || {};
  const mcpConfig = (config?.mcp as Record<string, unknown>) || {};

  const finalTopology = topology || (swarmConfig.topology as string) || DEFAULT_TOPOLOGY;
  const maxAgents = (swarmConfig.maxAgents as number) || DEFAULT_MAX_AGENTS;
  const autoStartMcp = (mcpConfig.autoStart as boolean) !== false && !skipMcp;
  const mcpPort = port || (mcpConfig.serverPort as number) || DEFAULT_PORT;

  output.writeln();
  output.writeln(output.bold('Starting Swarmlo V3'));
  output.writeln();

  const spinner = output.createSpinner({ text: 'Initializing system...' });

  try {
    // Step 1: Initialize swarm
    spinner.start();
    spinner.setText('Initializing V3 swarm...');

    const swarmResult = await callMCPTool<{
      swarmId: string;
      topology: string;
      initializedAt: string;
      config: Record<string, unknown>;
    }>('swarm_init', {
      topology: finalTopology,
      maxAgents,
      autoScaling: swarmConfig.autoScale !== false,
      v3Mode: true
    });

    spinner.succeed(`Swarm initialized (${finalTopology})`);

    // Step 2: Start MCP server if configured
    let mcpResult: Record<string, unknown> | null = null;
    if (autoStartMcp) {
      spinner.setText('Starting MCP server...');
      spinner.start();

      try {
        mcpResult = await callMCPTool<{
          serverId: string;
          port: number;
          transport: string;
          startedAt: string;
        }>('mcp_start', {
          port: mcpPort,
          transport: mcpConfig.transportType || 'stdio',
          tools: mcpConfig.tools || ['agent', 'swarm', 'memory', 'task']
        });

        spinner.succeed(`MCP server started on port ${mcpPort}`);
      } catch (error) {
        spinner.fail('MCP server failed to start');
        output.printWarning(
          error instanceof MCPClientError
            ? error.message
            : String(error)
        );
        // Continue without MCP
      }
    }

    // Step 3: Run health check
    spinner.setText('Running health checks...');
    spinner.start();

    const healthResult = await callMCPTool<{
      status: 'healthy' | 'degraded' | 'unhealthy';
      checks: Array<{ name: string; status: string; message?: string }>;
    }>('swarm_health', {
      swarmId: swarmResult.swarmId
    });

    if (healthResult.status === 'healthy') {
      spinner.succeed('Health checks passed');
    } else {
      spinner.fail(`Health check: ${healthResult.status}`);
    }

    // Success output
    output.writeln();
    output.printSuccess('Swarmlo V3 is running!');
    output.writeln();

    // Status display
    output.printBox(
      [
        `Swarm ID:  ${swarmResult.swarmId}`,
        `Topology:  ${finalTopology}`,
        `Max Agents: ${maxAgents}`,
        `MCP Server: ${autoStartMcp ? `localhost:${mcpPort}` : 'disabled'}`,
        `Mode:      ${daemon ? 'Daemon' : 'Foreground'}`,
        `Health:    ${healthResult.status}`
      ].join('\n'),
      'System Status'
    );

    output.writeln();
    output.writeln(output.bold('Quick Commands:'));
    output.printList([
      `${output.highlight('claude-flow status')} - View system status`,
      `${output.highlight('claude-flow agent spawn -t coder')} - Spawn an agent`,
      `${output.highlight('claude-flow swarm status')} - View swarm details`,
      `${output.highlight('claude-flow stop')} - Stop the system`
    ]);

    // Daemon mode (detached child only — the parent forked above and
    // returned). Previously the keep-alive interval was unref'd, so the
    // process exited as soon as this action returned (bin/cli.js calls
    // process.exit(0) after one-shot commands), leaving a stale PID file.
    // Now the interval is a ref'd handle (same pattern as the daemon
    // command's foreground path, daemon.ts) and the process blocks forever,
    // so the PID in `.claude-flow/daemon.pid` genuinely matches a live
    // daemon until `claude-flow start stop` removes it.
    if (daemon) {
      output.writeln();
      output.printInfo('Running in daemon mode. Use "claude-flow start stop" to stop.');

      // Store PID for daemon management (own PID file — see START_DAEMON_PID_FILE)
      const daemonPidPath = path.join(cwd, START_DAEMON_PID_FILE);
      fs.writeFileSync(daemonPidPath, String(process.pid));

      const cleanup = () => {
        try {
          if (fs.existsSync(daemonPidPath)) fs.unlinkSync(daemonPidPath);
        } catch { /* ignore */ }
      };
      process.on('exit', cleanup);
      process.on('SIGINT', () => { cleanup(); process.exit(0); });
      process.on('SIGTERM', () => { cleanup(); process.exit(0); });
      if (process.platform !== 'win32') {
        // Prevent SIGHUP from killing the daemon when the terminal closes.
        process.on('SIGHUP', () => { /* keep running */ });
      }

      // Ref'd keep-alive handle — the event loop cannot drain while this
      // interval is active, so the process stays alive until stopped. If the
      // PID file disappears (e.g. `claude-flow start stop` or `daemon stop`
      // removed it without signalling us), self-terminate.
      setInterval(() => {
        if (!fs.existsSync(daemonPidPath)) process.exit(0);
      }, 5000);
      await new Promise(() => {}); // Never resolves — daemon runs until stopped.
    }

    const result = {
      swarmId: swarmResult.swarmId,
      topology: finalTopology,
      maxAgents,
      mcp: mcpResult ? {
        port: mcpPort,
        transport: mcpConfig.transportType || 'stdio'
      } : null,
      health: healthResult.status,
      daemon,
      startedAt: new Date().toISOString()
    };

    if (ctx.flags.format === 'json') {
      output.printJson(result);
    }

    return { success: true, data: result };
  } catch (error) {
    spinner.fail('Startup failed');
    if (error instanceof MCPClientError) {
      output.printError(`Failed to start: ${error.message}`);
    } else {
      output.printError(`Unexpected error: ${String(error)}`);
    }
    return { success: false, exitCode: 1 };
  }
};

// Stop subcommand
const stopCommand: Command = {
  name: 'stop',
  description: 'Stop the Swarmlo system',
  options: [
    {
      name: 'force',
      short: 'f',
      description: 'Force stop without graceful shutdown',
      type: 'boolean',
      default: false
    },
    {
      name: 'timeout',
      description: 'Shutdown timeout in seconds',
      type: 'number',
      default: 30
    }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const force = ctx.flags.force as boolean;
    const timeout = ctx.flags.timeout as number;

    output.writeln();
    output.writeln(output.bold('Stopping Swarmlo'));
    output.writeln();

    if (!force && ctx.interactive) {
      const confirmed = await confirm({
        message: 'Are you sure you want to stop Swarmlo?',
        default: false
      });

      if (!confirmed) {
        output.printInfo('Operation cancelled');
        return { success: true };
      }
    }

    const spinner = output.createSpinner({ text: 'Stopping system...' });
    spinner.start();

    try {
      // Stop MCP server
      spinner.setText('Stopping MCP server...');
      try {
        await callMCPTool('mcp_stop', { graceful: !force, timeout });
        spinner.succeed('MCP server stopped');
      } catch {
        spinner.fail('MCP server was not running');
      }

      // Stop swarm
      spinner.setText('Stopping swarm...');
      spinner.start();
      try {
        await callMCPTool('swarm_shutdown', {
          graceful: !force,
          timeout,
          saveState: true
        });
        spinner.succeed('Swarm stopped');
      } catch {
        spinner.fail('Swarm was not running');
      }

      // Clean up daemon PID — and terminate the daemon child if it is still
      // alive (same as the daemon command's stop: SIGTERM, wait, then remove
      // the PID file). Previously this only deleted the file, orphaning the
      // background process; the child's keep-alive now also self-terminates
      // within 5s if the PID file vanishes.
      const daemonPidPath = path.join(ctx.cwd, START_DAEMON_PID_FILE);
      if (fs.existsSync(daemonPidPath)) {
        try {
          const pid = parseInt(fs.readFileSync(daemonPidPath, 'utf-8').trim(), 10);
          if (!Number.isNaN(pid) && pid !== process.pid) {
            try {
              process.kill(pid, 0); // alive?
              process.kill(pid, 'SIGTERM');
            } catch { /* already dead */ }
          }
        } catch { /* unreadable PID file */ }
        try {
          fs.unlinkSync(daemonPidPath);
        } catch { /* ignore */ }
      }

      output.writeln();
      output.printSuccess('Swarmlo stopped successfully');

      return {
        success: true,
        data: { stopped: true, force, stoppedAt: new Date().toISOString() }
      };
    } catch (error) {
      spinner.fail('Stop failed');
      output.printError(`Failed to stop: ${error instanceof Error ? error.message : String(error)}`);
      return { success: false, exitCode: 1 };
    }
  }
};

// Restart subcommand
const restartCommand: Command = {
  name: 'restart',
  description: 'Restart the Swarmlo system',
  options: [
    {
      name: 'force',
      short: 'f',
      description: 'Force restart',
      type: 'boolean',
      default: false
    }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    output.writeln();
    output.writeln(output.bold('Restarting Swarmlo'));
    output.writeln();

    // Stop first
    const stopCtx = { ...ctx, flags: { ...ctx.flags } };
    const stopResult = await stopCommand.action!(stopCtx);

    if (stopResult && !stopResult.success) {
      output.printWarning('Stop failed, attempting to start anyway...');
    }

    // Wait briefly
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Start again
    const startResult = await startAction(ctx);

    return {
      success: startResult.success,
      data: {
        restarted: startResult.success,
        restartedAt: new Date().toISOString()
      }
    };
  }
};

// Quick start subcommand
const quickCommand: Command = {
  name: 'quick',
  aliases: ['q'],
  description: 'Quick start with default settings',
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    // Initialize if needed
    if (!isInitialized(ctx.cwd)) {
      output.printInfo('Project not initialized, running init first...');
      output.writeln();

      // Call init with minimal settings
      const { initCommand } = await import('./init.js');
      const initCtx = {
        ...ctx,
        flags: { ...ctx.flags, minimal: true }
      };
      await initCommand.action!(initCtx);
      output.writeln();
    }

    // Start with defaults
    return startAction({
      ...ctx,
      flags: { ...ctx.flags, topology: 'mesh' }
    });
  }
};

// Main start command
export const startCommand: Command = {
  name: 'start',
  description: 'Start the Swarmlo orchestration system',
  subcommands: [stopCommand, restartCommand, quickCommand],
  options: [
    {
      name: 'daemon',
      short: 'd',
      description: 'Run as daemon in background',
      type: 'boolean',
      default: false
    },
    {
      name: 'port',
      short: 'p',
      description: 'MCP server port',
      type: 'number',
      default: DEFAULT_PORT
    },
    {
      name: 'topology',
      short: 't',
      description: 'Swarm topology (hierarchical-mesh, mesh, hierarchical, ring, star)',
      type: 'string',
      choices: ['hierarchical-mesh', 'mesh', 'hierarchical', 'ring', 'star']
    },
    {
      name: 'skip-mcp',
      description: 'Skip starting MCP server',
      type: 'boolean',
      default: false
    }
  ],
  examples: [
    { command: 'claude-flow start', description: 'Start with configuration defaults' },
    { command: 'claude-flow start --daemon', description: 'Start as background daemon' },
    { command: 'claude-flow start --port 3001', description: 'Start MCP on custom port' },
    { command: 'claude-flow start --topology mesh', description: 'Start with mesh topology' },
    { command: 'claude-flow start --skip-mcp', description: 'Start without MCP server' },
    { command: 'claude-flow start quick', description: 'Quick start with defaults' },
    { command: 'claude-flow start stop', description: 'Stop the running system' }
  ],
  action: startAction
};

export default startCommand;
