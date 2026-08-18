/**
 * ADR-382 Part B — removed-agent detection for `swarmlo migrate status`.
 *
 * Tests target detectRemovedAgentGaps() directly (not the full statusCommand
 * action) because the production call path defaults to the REAL
 * os.homedir() plugin registry — asserting against that would make the
 * suite depend on whatever happens to be installed on the machine running
 * it. The homeDir override exists precisely so tests can supply an isolated
 * registry.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectRemovedAgentGaps, type RemovedAgentMapping } from '../src/commands/migrate-agent-detection.js';

const REMOVED_AGENTS: RemovedAgentMapping[] = [
  { basename: 'coder.md', plugin: 'swarmlo-core' },
  { basename: 'researcher.md', plugin: 'swarmlo-core' },
  { basename: 'reviewer.md', plugin: 'swarmlo-core' },
  { basename: 'tester.md', plugin: 'swarmlo-testgen' },
  { basename: 'memory-specialist.md', plugin: 'swarmlo-rag-memory' },
  { basename: 'security-auditor.md', plugin: 'swarmlo-security-audit' },
  { basename: 'sparc-orchestrator.md', plugin: 'swarmlo-sparc' },
  { basename: 'goal-planner.md', plugin: 'swarmlo-goals' },
  { basename: 'adr-architect.md', plugin: 'swarmlo-adr' },
];

function project(): string {
  return mkdtempSync(join(tmpdir(), 'migrate-agent-gaps-'));
}

function emptyHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'migrate-agent-gaps-home-'));
  return home;
}

function homeWithInstalledPlugins(plugins: Record<string, Array<{ scope?: string; projectPath?: string }>>): string {
  const home = emptyHome();
  mkdirSync(join(home, '.claude', 'plugins'), { recursive: true });
  writeFileSync(
    join(home, '.claude', 'plugins', 'installed_plugins.json'),
    JSON.stringify({ version: 2, plugins: plugins })
  );
  return home;
}

describe('detectRemovedAgentGaps', () => {
  it('surfaces all 9 suggestions when every agent is missing and no plugins are installed', () => {
    const cwd = project();
    const homeDir = emptyHome();

    const gaps = detectRemovedAgentGaps(cwd, REMOVED_AGENTS, { homeDir });

    expect(gaps).toHaveLength(9);
    expect(gaps.map(g => g.agent).sort()).toEqual(
      [...REMOVED_AGENTS.map(a => a.basename)].sort()
    );
    for (const gap of gaps) {
      // #2985: must be the Claude Code marketplace command — `swarmlo plugins
      // install` targets the npm-package plugin system and cannot install
      // these marketplace plugins.
      expect(gap.installCommand).toBe(`/plugin install ${gap.plugin}@swarmlo`);
    }
  });

  it('does not flag agents whose owning plugin is installed (user scope)', () => {
    const cwd = project();
    const homeDir = homeWithInstalledPlugins({
      'swarmlo-core@swarmlo': [{ scope: 'user' }],
    });

    const gaps = detectRemovedAgentGaps(cwd, REMOVED_AGENTS, { homeDir });

    const flaggedAgents = gaps.map(g => g.agent);
    expect(flaggedAgents).not.toContain('coder.md');
    expect(flaggedAgents).not.toContain('researcher.md');
    expect(flaggedAgents).not.toContain('reviewer.md');
    // The other 6 (different owning plugins) are still flagged.
    expect(gaps).toHaveLength(6);
  });

  it('honors project-scoped installs only for the matching project', () => {
    const cwd = project();
    const otherProject = project();
    const homeDir = homeWithInstalledPlugins({
      'swarmlo-testgen@swarmlo': [{ scope: 'project', projectPath: otherProject }],
    });

    const gaps = detectRemovedAgentGaps(cwd, REMOVED_AGENTS, { homeDir });

    // Installed for a different project — tester.md should still be flagged here.
    expect(gaps.map(g => g.agent)).toContain('tester.md');
  });

  it('reports no gaps when every agent basename is present on disk', () => {
    const cwd = project();
    const homeDir = emptyHome();
    const agentsDir = join(cwd, '.claude', 'agents');
    mkdirSync(join(agentsDir, 'core'), { recursive: true });
    mkdirSync(join(agentsDir, 'testing'), { recursive: true });
    mkdirSync(join(agentsDir, 'memory'), { recursive: true });

    for (const { basename } of REMOVED_AGENTS) {
      // Distribution across subdirectories doesn't matter — detection walks
      // the whole .claude/agents/ tree, matching the "**/basename.md" intent.
      writeFileSync(join(agentsDir, 'core', basename), '# stub agent\n');
    }

    const gaps = detectRemovedAgentGaps(cwd, REMOVED_AGENTS, { homeDir });

    expect(gaps).toEqual([]);
  });

  it('reports no gaps for a project with no .claude/agents directory at all once plugins cover everything', () => {
    const cwd = project();
    const homeDir = homeWithInstalledPlugins({
      'swarmlo-core@swarmlo': [{ scope: 'user' }],
      'swarmlo-testgen@swarmlo': [{ scope: 'user' }],
      'swarmlo-rag-memory@swarmlo': [{ scope: 'user' }],
      'swarmlo-security-audit@swarmlo': [{ scope: 'user' }],
      'swarmlo-sparc@swarmlo': [{ scope: 'user' }],
      'swarmlo-goals@swarmlo': [{ scope: 'user' }],
      'swarmlo-adr@swarmlo': [{ scope: 'user' }],
    });

    const gaps = detectRemovedAgentGaps(cwd, REMOVED_AGENTS, { homeDir });

    expect(gaps).toEqual([]);
  });
});
