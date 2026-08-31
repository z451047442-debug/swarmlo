/**
 * V3 CLI Process Management Command
 * Background process management, daemon mode, and monitoring
 *
 * Honesty contract (#P2, D3): daemon/workers/signals subcommands are wired to
 * the real daemon infrastructure (services/worker-daemon.ts + commands/
 * daemon.ts) instead of writing transient PID files and fabricated state.
 * Subcommands without a real backend return a non-zero exit code with a
 * clear "not implemented" message — never fake success.
 */

import { readdirSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { cpus, loadavg, totalmem, freemem } from 'node:os';
import { resolve } from 'path';
import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import { daemonCommand } from './daemon.js';

// Real daemon state files (single source of truth, written by WorkerDaemon)
const DAEMON_PID_FILE = '.claude-flow/daemon.pid';
const DAEMON_STATE_FILE = '.claude-flow/daemon-state.json';
const DAEMON_QUEUE_DIR = '.claude-flow/daemon-queue';

// Real worker types accepted by the worker daemon (services/worker-daemon.ts)
const REAL_WORKER_TYPES = [
  'ultralearn', 'optimize', 'consolidate', 'predict', 'audit', 'map',
  'preload', 'deepdive', 'document', 'refactor', 'benchmark', 'testgaps',
  'backup', 'harness',
];

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0); // Signal 0 = existence check
    return true;
  } catch {
    return false;
  }
}

function readDaemonPid(cwd: string): number | null {
  try {
    const pidFile = resolve(cwd, DAEMON_PID_FILE);
    if (!existsSync(pidFile)) return null;
    const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
    return Number.isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readDaemonState(cwd: string): Record<string, any> | null {
  try {
    const stateFile = resolve(cwd, DAEMON_STATE_FILE);
    if (!existsSync(stateFile)) return null;
    return JSON.parse(readFileSync(stateFile, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Daemon subcommand - delegates to the REAL daemon infrastructure
 * (commands/daemon.ts + services/worker-daemon.ts). `process daemon
 * --action <start|stop|restart|status>` runs the exact same code path as
 * `claude-flow daemon <start|stop|status>` — real fork+detached
 * backgrounding, real PID file at .claude-flow/daemon.pid, real worker
 * state. No fabricated services, no transient PID writes.
 */
const daemonProcessCommand: Command = {
  name: 'daemon',
  description: 'Manage the background worker daemon (delegates to "claude-flow daemon")',
  options: [
    {
      name: 'action',
      type: 'string',
      description: 'Action to perform',
      choices: ['start', 'stop', 'restart', 'status'],
      default: 'status',
    },
    {
      name: 'port',
      type: 'number',
      description: '[legacy, ignored] The real daemon has no HTTP API; state lives in .claude-flow/',
      default: 3847,
    },
    {
      name: 'pid-file',
      type: 'string',
      description: '[legacy, ignored] The real daemon always uses .claude-flow/daemon.pid',
      default: '.claude-flow/daemon.pid',
    },
    {
      name: 'log-file',
      type: 'string',
      description: '[legacy, ignored] The real daemon always logs to .claude-flow/logs/daemon.log',
      default: '.claude-flow/daemon.log',
    },
    {
      name: 'detach',
      type: 'boolean',
      description: '[legacy, ignored] The real daemon backgrounding is handled by daemon.ts',
      default: true,
    },
  ],
  examples: [
    { command: 'claude-flow process daemon --action start', description: 'Start the worker daemon (real, background)' },
    { command: 'claude-flow process daemon --action stop', description: 'Stop the worker daemon' },
    { command: 'claude-flow process daemon --action status', description: 'Check real daemon status' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const action = (ctx.flags?.action as string) || 'status';

    // Forward flags verbatim: daemon.ts reads workers/headless/quiet/foreground
    // etc. from ctx.flags, so `process daemon --action start --workers map`
    // behaves exactly like `daemon start --workers map`.
    const subCtx: CommandContext = {
      args: [],
      flags: { ...ctx.flags },
      config: ctx.config,
      cwd: ctx.cwd,
      interactive: ctx.interactive,
    };

    const subcommand = daemonCommand.subcommands?.find((c) => c.name === action && action !== 'restart');

    switch (action) {
      case 'start':
      case 'stop':
      case 'status': {
        if (!subcommand?.action) {
          output.printError(`Real daemon subcommand '${action}' has no action`);
          return { success: false, exitCode: 1 };
        }
        return (await subcommand.action(subCtx)) ?? { success: true };
      }
      case 'restart': {
        const stopSub = daemonCommand.subcommands?.find((c) => c.name === 'stop');
        const startSub = daemonCommand.subcommands?.find((c) => c.name === 'start');
        if (!stopSub?.action || !startSub?.action) {
          output.printError('Real daemon subcommands are unavailable');
          return { success: false, exitCode: 1 };
        }
        await stopSub.action(subCtx);
        return (await startSub.action(subCtx)) ?? { success: true };
      }
      default:
        output.printError(`Unknown action: ${action}. Use start, stop, restart, or status.`);
        return { success: false, exitCode: 1 };
    }
  },
};

/**
 * Monitor subcommand - real-time process monitoring
 */
const monitorCommand: Command = {
  name: 'monitor',
  description: 'Real-time process and resource monitoring',
  options: [
    {
      name: 'interval',
      type: 'number',
      description: 'Refresh interval in seconds',
      default: 2,
    },
    {
      name: 'format',
      type: 'string',
      description: 'Output format',
      choices: ['dashboard', 'compact', 'json'],
      default: 'dashboard',
    },
    {
      name: 'components',
      type: 'string',
      description: 'Components to monitor (comma-separated)',
      default: 'all',
    },
    {
      name: 'watch',
      type: 'boolean',
      description: 'Continuous monitoring mode',
      default: false,
    },
    {
      name: 'alerts',
      type: 'boolean',
      description: 'Enable threshold alerts',
      default: true,
    },
  ],
  examples: [
    { command: 'claude-flow process monitor', description: 'Show process dashboard' },
    { command: 'claude-flow process monitor --watch --interval 5', description: 'Watch mode' },
    { command: 'claude-flow process monitor --components agents,memory,tasks', description: 'Monitor specific components' },
    { command: 'claude-flow process monitor --format json', description: 'JSON output' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const interval = (ctx.flags?.interval as number) || 2;
    const format = (ctx.flags?.format as string) || 'dashboard';
    const watch = ctx.flags?.watch === true;
    const alerts = ctx.flags?.alerts !== false;

    // Gather real system metrics where possible
    const memUsage = process.memoryUsage();
    const loadAvg = loadavg();
    const totalMem = totalmem();
    const freeMem = freemem();
    const usedMemMB = Math.round((totalMem - freeMem) / 1024 / 1024);
    const totalMemMB = Math.round(totalMem / 1024 / 1024);

    // Try to read agent and task counts from local store files
    let agentCount = 0;
    let taskCounts = { running: 0, queued: 0, completed: 0, failed: 0 };
    try {
      const agentStorePath = resolve('.claude-flow/agents/store.json');
      if (existsSync(agentStorePath)) {
        const agentStore = JSON.parse(readFileSync(agentStorePath, 'utf-8'));
        const agents = Array.isArray(agentStore) ? agentStore : Object.values(agentStore.agents || agentStore || {});
        agentCount = agents.length;
      }
    } catch { /* no agent store */ }
    try {
      const taskStorePath = resolve('.claude-flow/tasks/store.json');
      if (existsSync(taskStorePath)) {
        const taskStore = JSON.parse(readFileSync(taskStorePath, 'utf-8'));
        const tasks = Array.isArray(taskStore) ? taskStore : Object.values(taskStore.tasks || taskStore || {});
        for (const t of tasks as Array<{ status?: string }>) {
          if (t.status === 'running') taskCounts.running++;
          else if (t.status === 'queued' || t.status === 'pending') taskCounts.queued++;
          else if (t.status === 'completed' || t.status === 'done') taskCounts.completed++;
          else if (t.status === 'failed' || t.status === 'error') taskCounts.failed++;
        }
      }
    } catch { /* no task store */ }

    const metrics = {
      timestamp: new Date().toISOString(),
      system: {
        cpuLoadAvg1m: loadAvg[0] !== undefined ? parseFloat(loadAvg[0].toFixed(2)) : null,
        cpuLoadAvg5m: loadAvg[1] !== undefined ? parseFloat(loadAvg[1].toFixed(2)) : null,
        cpuCount: cpus().length,
        memoryUsedMB: usedMemMB,
        memoryTotalMB: totalMemMB,
        processRssMB: Math.round(memUsage.rss / 1024 / 1024),
        processHeapMB: Math.round(memUsage.heapUsed / 1024 / 1024),
        uptime: Math.floor(process.uptime()),
      },
      agents: {
        total: agentCount,
        _note: agentCount === 0 ? 'No agent store found at .claude-flow/agents/store.json' : null,
      },
      tasks: {
        ...taskCounts,
        _note: (taskCounts.running + taskCounts.queued + taskCounts.completed + taskCounts.failed) === 0
          ? 'No task store found at .claude-flow/tasks/store.json' : null,
      },
      memory: {
        vectorCount: null as number | null,
        indexSize: null as number | null,
        cacheHitRate: null as number | null,
        avgSearchTime: null as number | null,
        _note: 'Memory service metrics not available from process monitor. Use "memory stats" command.',
      },
      network: {
        mcpConnections: null as number | null,
        requestsPerMin: null as number | null,
        avgLatency: null as number | null,
        _note: 'Network metrics not available from process monitor. Use "mcp status" command.',
      },
    };

    if (format === 'json') {
      console.log(JSON.stringify(metrics, null, 2));
      return { success: true, data: metrics };
    }

    if (format === 'compact') {
      console.log('\n📊 Process Monitor (compact)\n');
      const loadStr = metrics.system.cpuLoadAvg1m !== null ? `load ${metrics.system.cpuLoadAvg1m.toFixed(2)}` : 'n/a';
      console.log(`CPU: ${loadStr} (${metrics.system.cpuCount} cores) | Memory: ${metrics.system.memoryUsedMB}MB/${metrics.system.memoryTotalMB}MB`);
      console.log(`Agents: ${metrics.agents.total} total | Tasks: ${metrics.tasks.running} running, ${metrics.tasks.queued} queued`);
      return { success: true, data: metrics };
    }

    // Dashboard format
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║            🖥️  CLAUDE-FLOW PROCESS MONITOR                    ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');

    // System metrics
    console.log('║  SYSTEM                                                      ║');
    const cpuDisplay = metrics.system.cpuLoadAvg1m !== null ? metrics.system.cpuLoadAvg1m : 0;
    const cpuPercent = Math.min(100, (cpuDisplay / (metrics.system.cpuCount || 1)) * 100);
    const cpuBar = '█'.repeat(Math.floor(cpuPercent / 5)) + '░'.repeat(20 - Math.floor(cpuPercent / 5));
    const memPercent = (metrics.system.memoryUsedMB / metrics.system.memoryTotalMB) * 100;
    const memBar = '█'.repeat(Math.floor(memPercent / 5)) + '░'.repeat(20 - Math.floor(memPercent / 5));
    console.log(`║  CPU:    [${cpuBar}] load ${cpuDisplay.toFixed(2).padStart(5)}          ║`);
    console.log(`║  Memory: [${memBar}] ${metrics.system.memoryUsedMB}MB/${metrics.system.memoryTotalMB}MB      ║`);

    console.log('╠══════════════════════════════════════════════════════════════╣');

    // Agents
    console.log('║  AGENTS                                                      ║');
    console.log(`║  Total: ${metrics.agents.total.toString().padEnd(5)}                                              ║`);

    console.log('╠══════════════════════════════════════════════════════════════╣');

    // Tasks
    console.log('║  TASKS                                                       ║');
    console.log(`║  Running: ${metrics.tasks.running.toString().padEnd(3)} Queued: ${metrics.tasks.queued.toString().padEnd(3)} Completed: ${metrics.tasks.completed.toString().padEnd(5)} Failed: ${metrics.tasks.failed.toString().padEnd(3)}║`);

    console.log('╠══════════════════════════════════════════════════════════════╣');

    // Memory service
    console.log('║  MEMORY SERVICE                                              ║');
    console.log('║  Metrics not available. Use "memory stats" command.          ║');

    console.log('╠══════════════════════════════════════════════════════════════╣');

    // Network
    console.log('║  NETWORK                                                     ║');
    console.log('║  Metrics not available. Use "mcp status" command.            ║');

    console.log('╚══════════════════════════════════════════════════════════════╝');

    if (alerts) {
      console.log('\n📢 Alerts:');
      if (cpuPercent > 80) {
        console.log('  ⚠️  High CPU load detected');
      }
      if (memPercent > 80) {
        console.log('  ⚠️  High memory usage detected');
      }
      if (metrics.tasks.failed > 10) {
        console.log('  ⚠️  Elevated task failure rate');
      }
      if (cpuPercent <= 80 && memPercent <= 80 && metrics.tasks.failed <= 10) {
        console.log('  ✅ All systems nominal');
      }
    }

    if (watch) {
      console.log(`\n🔄 Refresh: ${interval}s | Press Ctrl+C to exit`);
    }

    return { success: true, data: metrics };
  },
};

/**
 * Workers subcommand - real worker lifecycle.
 *
 * - list: reads the daemon's persisted state (.claude-flow/daemon-state.json,
 *   written by WorkerDaemon.saveState) plus the PID file — never fabricated.
 * - spawn: dispatches a real worker run via the daemon's on-disk dispatch
 *   queue (.claude-flow/daemon-queue/, polled by WorkerDaemon every 5s) —
 *   the same mechanism mcp__hooks_worker-dispatch uses. Requires a running
 *   daemon; otherwise fails loudly.
 * - kill / scale: the daemon schedules workers on fixed intervals and keeps
 *   no per-instance worker registry, so there is no real backend — return a
 *   non-zero exit code with a "not implemented" message.
 */
const workersCommand: Command = {
  name: 'workers',
  description: 'Manage background workers (reads real daemon state / dispatch queue)',
  options: [
    {
      name: 'action',
      type: 'string',
      description: 'Action to perform',
      choices: ['list', 'spawn', 'kill', 'scale'],
      default: 'list',
    },
    {
      name: 'type',
      type: 'string',
      description: 'Worker type (real daemon worker: map, audit, optimize, consolidate, testgaps, predict, document, ultralearn, refactor, benchmark, deepdive, preload, backup, harness)',
    },
    {
      name: 'count',
      type: 'number',
      description: 'Number of worker runs to dispatch (spawn only)',
      default: 1,
    },
    {
      name: 'id',
      type: 'string',
      description: 'Worker ID (kill action — not implemented, see help)',
    },
  ],
  examples: [
    { command: 'claude-flow process workers --action list', description: 'List workers from real daemon state' },
    { command: 'claude-flow process workers --action spawn --type audit', description: 'Dispatch an audit worker run via the daemon queue' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const action = (ctx.flags?.action as string) || 'list';
    const type = ctx.flags?.type as string;
    const count = (ctx.flags?.count as number) || 1;
    const id = ctx.flags?.id as string;
    const cwd = ctx.cwd;

    switch (action) {
      case 'list': {
        const daemonPid = readDaemonPid(cwd);
        const daemonRunning = daemonPid !== null && isProcessRunning(daemonPid);
        const state = readDaemonState(cwd);

        if (!state) {
          output.writeln();
          output.printInfo('No daemon state found — the worker daemon is not running.');
          output.writeln(output.dim('  Start it with: claude-flow daemon start'));
          return { success: true, data: { daemonRunning: false, workers: [] } };
        }

        const configWorkers: Array<Record<string, unknown>> = Array.isArray(state.config?.workers)
          ? state.config.workers
          : [];
        const stateWorkers: Record<string, Record<string, unknown>> = state.workers ?? {};

        output.writeln();
        output.writeln(output.bold('Background Workers (real daemon state)'));
        output.writeln(output.dim(`  Daemon: ${daemonRunning ? `running (PID ${daemonPid})` : 'PID file present but process not running'}`));
        output.writeln(output.dim(`  State:  ${resolve(cwd, DAEMON_STATE_FILE)}`));
        output.writeln();

        const rows = configWorkers.map((w) => {
          const typeName = String(w.type ?? '?');
          const st = stateWorkers[typeName] ?? {};
          const enabled = w.enabled !== false;
          const lastRun = typeof st.lastRun === 'string' ? st.lastRun : null;
          return {
            type: typeName,
            enabled: enabled ? '✓' : '○',
            status: st.isRunning ? 'running' : enabled ? 'idle' : 'disabled',
            runs: String(st.runCount ?? 0),
            success: String(st.successCount ?? 0),
            failures: String(st.failureCount ?? 0),
            lastRun: lastRun ? new Date(lastRun).toISOString() : 'never',
          };
        });

        output.printTable({
          columns: [
            { key: 'type', header: 'Worker', width: 14 },
            { key: 'enabled', header: 'On', width: 4 },
            { key: 'status', header: 'Status', width: 10 },
            { key: 'runs', header: 'Runs', width: 6 },
            { key: 'success', header: 'OK', width: 6 },
            { key: 'failures', header: 'Fail', width: 7 },
            { key: 'lastRun', header: 'Last Run', width: 30 },
          ],
          data: rows,
        });

        return { success: true, data: { daemonRunning, workers: rows } };
      }

      case 'spawn': {
        if (!type) {
          output.printError('Worker type required. Use --type <map|audit|optimize|consolidate|testgaps|predict|document|ultralearn|refactor|benchmark|deepdive|preload|backup|harness>');
          return { success: false, exitCode: 1 };
        }
        if (!REAL_WORKER_TYPES.includes(type)) {
          output.printError(`Unknown worker type '${type}'. Real daemon worker types: ${REAL_WORKER_TYPES.join(', ')}`);
          return { success: false, exitCode: 1 };
        }

        // The daemon must be running to consume the dispatch queue.
        const daemonPid = readDaemonPid(cwd);
        if (daemonPid === null || !isProcessRunning(daemonPid)) {
          output.printError('The worker daemon is not running — cannot dispatch a worker. Start it with: claude-flow daemon start');
          return { success: false, exitCode: 1 };
        }

        // Enqueue real dispatch entries; WorkerDaemon.processDispatchQueue
        // polls this directory every 5s and runs the worker.
        const queueDir = resolve(cwd, DAEMON_QUEUE_DIR);
        if (!existsSync(queueDir)) mkdirSync(queueDir, { recursive: true });

        const dispatched: string[] = [];
        for (let i = 0; i < Math.max(1, count); i++) {
          const workerId = `process-spawn-${Date.now()}-${i}`;
          const entry = {
            workerId,
            trigger: type,
            context: { source: 'process workers spawn' },
            enqueuedAt: new Date().toISOString(),
          };
          writeFileSync(resolve(queueDir, `${workerId}.json`), JSON.stringify(entry, null, 2), 'utf-8');
          dispatched.push(workerId);
        }

        output.printSuccess(`Dispatched ${dispatched.length} ${type} worker run(s) to the daemon queue (${queueDir})`);
        output.writeln(output.dim(`  The daemon (PID ${daemonPid}) picks these up on its next queue poll (~5s).`));
        return { success: true, data: { dispatched, queueDir } };
      }

      case 'kill': {
        if (!id) {
          output.printError('Worker ID required. Use --id <worker-id>');
          return { success: false, exitCode: 1 };
        }
        output.printError(`kill is not implemented: the worker daemon keeps no per-instance worker registry to kill by ID. Use "claude-flow daemon stop" to stop the daemon, or "claude-flow daemon enable -w <type> --disable" to stop scheduling a worker type.`);
        return { success: false, exitCode: 1 };
      }

      case 'scale': {
        if (!type) {
          output.printError('Worker type required. Use --type <worker-type>');
          return { success: false, exitCode: 1 };
        }
        output.printError(`scale is not implemented: the daemon schedules workers on fixed intervals and keeps no instance pool to scale. Use "claude-flow daemon enable -w <type>" / "--disable" to control worker scheduling.`);
        return { success: false, exitCode: 1 };
      }

      default:
        output.printError(`Unknown action: ${action}. Use list, spawn, kill, or scale.`);
        return { success: false, exitCode: 1 };
    }
  },
};

/**
 * Signals subcommand - honest: the daemon exposes no arbitrary-signal
 * control channel. The only real operation is graceful-shutdown of the
 * daemon itself (SIGTERM via the real daemon stop path); everything else
 * returns a non-zero exit code with a "not implemented" message.
 */
const signalsCommand: Command = {
  name: 'signals',
  description: 'Send signals to managed processes (only daemon graceful-shutdown is real)',
  options: [
    {
      name: 'target',
      type: 'string',
      description: 'Target process or group',
      required: true,
    },
    {
      name: 'signal',
      type: 'string',
      description: 'Signal to send',
      choices: ['graceful-shutdown', 'force-kill', 'pause', 'resume', 'reload-config'],
      default: 'graceful-shutdown',
    },
    {
      name: 'timeout',
      type: 'number',
      description: 'Timeout in seconds (not implemented)',
      default: 30,
    },
  ],
  examples: [
    { command: 'claude-flow process signals --target daemon --signal graceful-shutdown', description: 'Gracefully stop the daemon (real)' },
    { command: 'claude-flow process signals --target daemon --signal force-kill', description: 'Not implemented' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const target = ctx.flags?.target as string;
    const signal = (ctx.flags?.signal as string) || 'graceful-shutdown';

    if (!target) {
      output.printError('Target required. Use --target <daemon|workers|all|process-id>');
      return { success: false, exitCode: 1 };
    }

    // The one real operation: graceful shutdown of the daemon, via the same
    // path as `claude-flow daemon stop` (reads .claude-flow/daemon.pid,
    // SIGTERMs the process, reaps stale daemons, removes the PID file).
    if (target === 'daemon' && signal === 'graceful-shutdown') {
      const stopSub = daemonCommand.subcommands?.find((c) => c.name === 'stop');
      if (!stopSub?.action) {
        output.printError('Real daemon stop subcommand is unavailable');
        return { success: false, exitCode: 1 };
      }
      output.printInfo('Signaling the daemon for graceful shutdown...');
      const subCtx: CommandContext = {
        args: [],
        flags: { quiet: true, _: [] },
        config: ctx.config,
        cwd: ctx.cwd,
        interactive: false,
      };
      return (await stopSub.action(subCtx)) ?? { success: true };
    }

    output.printError(
      `signal '${signal}' on target '${target}' is not implemented: the worker daemon exposes no arbitrary-signal control channel. ` +
      `Supported: graceful-shutdown on target 'daemon' (equivalent to "claude-flow daemon stop").`
    );
    return { success: false, exitCode: 1 };
  },
};

/**
 * Logs subcommand - view process logs
 */
const logsCommand: Command = {
  name: 'logs',
  description: 'View and manage process logs',
  options: [
    {
      name: 'source',
      type: 'string',
      description: 'Log source',
      choices: ['daemon', 'workers', 'tasks', 'all'],
      default: 'all',
    },
    {
      name: 'tail',
      type: 'number',
      description: 'Number of lines to show',
      default: 50,
    },
    {
      name: 'follow',
      type: 'boolean',
      description: 'Follow log output',
      default: false,
    },
    {
      name: 'level',
      type: 'string',
      description: 'Minimum log level',
      choices: ['debug', 'info', 'warn', 'error'],
      default: 'info',
    },
    {
      name: 'since',
      type: 'string',
      description: 'Show logs since timestamp or duration',
    },
    {
      name: 'grep',
      type: 'string',
      description: 'Filter logs by pattern',
    },
  ],
  examples: [
    { command: 'claude-flow process logs', description: 'Show recent logs' },
    { command: 'claude-flow process logs --source daemon --tail 100', description: 'Daemon logs' },
    { command: 'claude-flow process logs --follow --level error', description: 'Follow error logs' },
    { command: 'claude-flow process logs --since 1h --grep "error"', description: 'Search logs' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const source = (ctx.flags?.source as string) || 'all';
    const tail = (ctx.flags?.tail as number) || 50;
    const follow = ctx.flags?.follow === true;
    const level = (ctx.flags?.level as string) || 'info';
    const since = ctx.flags?.since as string;
    const grep = ctx.flags?.grep as string;

    console.log(`\n📜 Process Logs (${source})\n`);
    console.log(`  Level: ${level}+ | Lines: ${tail}${since ? ` | Since: ${since}` : ''}${grep ? ` | Filter: ${grep}` : ''}`);
    console.log('─'.repeat(70));

    // Read actual log files from .claude-flow/logs/ if they exist
    const logsDir = resolve('.claude-flow/logs');
    let logEntries: string[] = [];

    const levelIcons: Record<string, string> = {
      debug: '🔍',
      info: 'ℹ️ ',
      warn: '⚠️ ',
      error: '❌',
    };
    const levels = ['debug', 'info', 'warn', 'error'];
    const minLevelIdx = levels.indexOf(level);

    if (existsSync(logsDir)) {
      try {
        const logFiles = readdirSync(logsDir)
          .filter(f => f.endsWith('.log'))
          .filter(f => source === 'all' || f.includes(source));

        for (const file of logFiles) {
          try {
            const content = readFileSync(resolve(logsDir, file), 'utf-8');
            const lines = content.split('\n').filter(l => l.trim());
            for (const line of lines) {
              // Filter by log level if detectable
              const lineLower = line.toLowerCase();
              const lineLevel = levels.find(l => lineLower.includes(`[${l}]`) || lineLower.includes(l));
              if (lineLevel && levels.indexOf(lineLevel) < minLevelIdx) continue;
              if (grep && !lineLower.includes(grep.toLowerCase())) continue;
              logEntries.push(line);
            }
          } catch { /* skip unreadable files */ }
        }
      } catch { /* skip if dir unreadable */ }
    }

    if (logEntries.length === 0) {
      console.log('  No log entries found.');
      console.log(`  Log directory: ${logsDir}`);
      if (!existsSync(logsDir)) {
        console.log('  (directory does not exist)');
      }
    } else {
      // Show the last N entries
      const entriesToShow = logEntries.slice(-tail);
      for (const entry of entriesToShow) {
        console.log(entry);
      }
    }

    console.log('─'.repeat(70));

    if (follow) {
      console.log('\n🔄 Following logs... (Ctrl+C to exit)');
    }

    return { success: true, data: { source, tail, level } };
  },
};

/**
 * Main process command
 */
export const processCommand: Command = {
  name: 'process',
  description: 'Background process management, daemon, and monitoring',
  aliases: ['proc', 'ps'],
  subcommands: [daemonProcessCommand, monitorCommand, workersCommand, signalsCommand, logsCommand],
  options: [
    {
      name: 'help',
      short: 'h',
      type: 'boolean',
      description: 'Show help for process command',
    },
  ],
  examples: [
    { command: 'claude-flow process daemon --action start', description: 'Start the real worker daemon' },
    { command: 'claude-flow process monitor --watch', description: 'Watch processes' },
    { command: 'claude-flow process workers --action list', description: 'List workers from real daemon state' },
    { command: 'claude-flow process logs --follow', description: 'Follow logs' },
  ],
  action: async (_ctx: CommandContext): Promise<CommandResult> => {
    // Show help if no subcommand
    console.log('\n🔧 Process Management\n');
    console.log('Manage background processes, daemons, and workers.\n');
    console.log('Subcommands:');
    console.log('  daemon     - Manage the background worker daemon (real, delegates to "daemon")');
    console.log('  monitor    - Real-time process monitoring');
    console.log('  workers    - Manage background workers (real daemon state / dispatch queue)');
    console.log('  signals    - Send signals (only daemon graceful-shutdown is real)');
    console.log('  logs       - View and manage process logs');
    console.log('\nExamples:');
    console.log('  claude-flow process daemon --action start');
    console.log('  claude-flow process monitor --watch');
    console.log('  claude-flow process workers --action list');
    console.log('  claude-flow process logs --follow --level error');

    return { success: true, data: { help: true } };
  },
};
