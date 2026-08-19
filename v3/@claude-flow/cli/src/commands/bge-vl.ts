/**
 * V3 CLI BGE-VL Command — ADR-384 multimodal pipeline entry point.
 *
 * Thin dispatcher that delegates each subcommand to
 * `plugins/swarmlo-bge-vl/scripts/bge-vl.mjs` via spawnSync — the exact
 * metaharness.ts pattern (ADR-150). The plugin script owns the Python
 * sidecar + graceful degradation; here we only resolve the plugin dir
 * and spawn node.
 *
 * SUBCOMMANDS
 *   embed | store | search | health | list | delete | purge | setup
 *
 * ADR-150 ARCHITECTURAL CONSTRAINT
 * --------------------------------
 * This file MUST NOT import or spawn python/torch/transformers directly.
 * The plugin relay handles all of that; a missing plugin or Python yields
 * {degraded:true} exit 0 from the relay, which we pass through verbatim.
 */

import type { Command, CommandContext, CommandResult } from '../types.js';
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the swarmlo-bge-vl plugin dir with the same 3-strategy walk-up
 * used by doctor.ts (checkMetaharnessIntegration): module-relative walk
 * (npx/global installs), cwd walk (monorepo dev), explicit node_modules.
 */
export function resolveBgeVlPluginDir(): string | null {
  const candidates: string[] = [];
  try {
    let q = __dirname;
    for (let i = 0; i < 8; i++) {
      candidates.push(join(q, 'plugins', 'swarmlo-bge-vl'));
      q = dirname(q);
    }
  } catch {
    // import.meta.url unavailable under some bundlers — cwd walk covers it.
  }
  let p = process.cwd();
  for (let i = 0; i < 8; i++) {
    candidates.push(join(p, 'plugins', 'swarmlo-bge-vl'));
    p = dirname(p);
  }
  candidates.push(join(process.cwd(), 'node_modules', '@claude-flow', 'cli', 'plugins', 'swarmlo-bge-vl'));
  for (const c of candidates) {
    if (existsSync(join(c, 'scripts', 'bge-vl.mjs'))) return c;
  }
  return null;
}

export const bgeVlCommand: Command = {
  name: 'bge-vl',
  description:
    'BGE-VL multimodal embeddings (ADR-384) — embed / store / search via the Python sidecar plugin with graceful degradation.',
  options: [
    {
      name: 'subcommand',
      description: 'One of: embed | store | search | health | list | delete | purge | setup',
      type: 'string' as const,
    },
  ],
  async action(context: CommandContext): Promise<CommandResult> {
    const args = (context as { args?: string[] }).args || [];

    // iter-42 bug class (metaharness.ts:278-312): the CLI parser consumes
    // `--text x` into context.flags, so round-trip parsed flags back into
    // argv — otherwise the relay receives only the positional bucket and
    // emits a graceful-but-wrong "missing arg" payload. Ported from the
    // metaharness iter-42 block (same SKIP_KEYS set, same toKebab helper,
    // same boolean/array/scalar handling). Unlike metaharness there is no
    // per-subcommand script dispatch here — the single relay script owns
    // subcommand parsing — so the whole positional bucket passes through.
    const ctxFlags = (context as { flags?: Record<string, unknown> }).flags || {};
    const reconstructedFlags: string[] = [];
    const SKIP_KEYS = new Set([
      '_',           // parser's positional bucket
      'config',      // global CLI flag (--config <path>); consumed before dispatch
      'verbose', 'v',
      'quiet', 'q',
      'help', 'h',
    ]);
    // Parser normalizes kebab-case → camelCase (--top-k → topK).
    // Plugin scripts expect kebab-case at argv, so we re-kebab here.
    const toKebab = (s: string): string =>
      s.replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`);
    for (const [key, value] of Object.entries(ctxFlags)) {
      if (SKIP_KEYS.has(key)) continue;
      if (value === undefined || value === null) continue;
      // Always use --kebab even for single-char keys: the relay matches
      // literal `--a` / `--b` via argv loop, not via a parser.
      // Reconstructing as short-form (`-a`) would silently misroute.
      const flag = `--${toKebab(key)}`;
      if (typeof value === 'boolean') {
        if (value === true) reconstructedFlags.push(flag);
        // false → omit (--no-X handled by users invoking explicit --no- form)
      } else if (Array.isArray(value)) {
        for (const v of value) reconstructedFlags.push(flag, String(v));
      } else {
        reconstructedFlags.push(flag, String(value));
      }
    }
    const subArgs = [...args, ...reconstructedFlags];

    const pluginDir = resolveBgeVlPluginDir();
    if (!pluginDir) {
      return {
        success: false,
        exitCode: 2,
        data: {
          degraded: true,
          reason: 'bge-vl-plugin-not-found',
          fix: 'the swarmlo-bge-vl plugin ships with @claude-flow/cli — reinstall if missing',
        },
      };
    }
    const scriptPath = join(pluginDir, 'scripts', 'bge-vl.mjs');
    const r = spawnSync('node', [scriptPath, ...subArgs], {
      stdio: 'inherit',
      env: process.env,
      timeout: 5 * 60 * 1000,
    });
    return {
      success: (r.status ?? 0) === 0,
      exitCode: r.status ?? 1,
      data: { scriptPath, args: subArgs },
    };
  },
};
