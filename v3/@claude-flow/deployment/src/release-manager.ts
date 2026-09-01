/**
 * Release Manager
 * Handles version bumping, changelog generation, and git tagging
 */

import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type {
  ReleaseOptions,
  ReleaseResult,
  PackageInfo,
  GitCommit,
  ChangelogEntry,
  VersionBumpType
} from './types.js';

/**
 * Strict semver whitelist: three purely numeric segments with an optional
 * `-channel.N` prerelease suffix. Rejects newlines, quotes, whitespace and
 * every shell metacharacter — a version that passes this can never inject
 * into a command line.
 */
const STRICT_VERSION_RE = /^\d+\.\d+\.\d+(?:-[a-z][a-z0-9]*\.\d+)?$/;

/**
 * Throw unless `value` is a strict semver (see STRICT_VERSION_RE).
 */
function assertValidVersion(value: string, label = 'version'): void {
  if (!STRICT_VERSION_RE.test(value)) {
    throw new Error(
      `Invalid ${label}: ${JSON.stringify(value)} (must match e.g. 1.2.3 or 1.2.3-alpha.1)`
    );
  }
}

/**
 * Charset for non-version tokens passed to git (tag prefix, changelog path).
 * No whitespace, quotes, or shell metacharacters; must not start with `-`
 * (would be parsed as a git flag) or `/` (would escape the repo root).
 */
const SAFE_TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

function assertSafeToken(value: string, label: string): void {
  if (!SAFE_TOKEN_RE.test(value) || value.includes('..')) {
    throw new Error(`Invalid ${label}: ${JSON.stringify(value)}`);
  }
}

/**
 * Args we pass to git ourselves; anything else starting with `-` is rejected.
 */
const ALLOWED_GIT_FLAGS = new Set([
  '--porcelain',
  '--tags',
  '--abbrev=0',
  '-m',
  '-a',
  '--pretty=format:%H%n%s%n%an%n%ai%n---COMMIT---',
]);

export class ReleaseManager {
  private cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  /**
   * Prepare a release with version bumping, changelog, and git tagging
   */
  async prepareRelease(options: ReleaseOptions = {}): Promise<ReleaseResult> {
    const {
      bumpType = 'patch',
      version,
      channel = 'latest',
      generateChangelog = true,
      createTag = true,
      commit = true,
      dryRun = false,
      skipValidation = false,
      tagPrefix = 'v',
      changelogPath = 'CHANGELOG.md'
    } = options;

    const result: ReleaseResult = {
      oldVersion: '',
      newVersion: '',
      success: false,
      warnings: []
    };

    try {
      // Whitelist-validate every user-controlled value BEFORE any command runs
      if (version) {
        assertValidVersion(version, 'version option');
      }
      assertSafeToken(tagPrefix, 'tagPrefix');
      assertSafeToken(changelogPath, 'changelogPath');

      // Read package.json
      const pkgPath = join(this.cwd, 'package.json');
      if (!existsSync(pkgPath)) {
        throw new Error('package.json not found');
      }

      const pkg: PackageInfo = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      result.oldVersion = pkg.version;

      // Check for uncommitted changes
      if (!skipValidation) {
        const gitStatus = this.execCommand(['git', 'status', '--porcelain'], true);
        if (gitStatus && !dryRun) {
          result.warnings?.push('Uncommitted changes detected');
        }
      }

      // Determine new version
      result.newVersion = version || this.bumpVersion(pkg.version, bumpType, channel);
      assertValidVersion(result.newVersion, 'bumped version');

      // Generate changelog if requested
      if (generateChangelog) {
        const commits = this.getCommitsSinceLastTag();
        const changelogEntry = this.generateChangelogEntry(result.newVersion, commits);
        result.changelog = this.formatChangelogEntry(changelogEntry);

        if (!dryRun) {
          this.updateChangelogFile(changelogPath, result.changelog);
        }
      }

      // Update package.json version
      if (!dryRun) {
        pkg.version = result.newVersion;
        writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
      }

      // Create git commit
      if (commit && !dryRun) {
        const commitMessage = `chore(release): ${result.newVersion}`;

        // Stage changes
        this.execCommand(['git', 'add', 'package.json', changelogPath]);

        // Commit
        this.execCommand(['git', 'commit', '-m', commitMessage]);

        result.commitHash = this.execCommand(['git', 'rev-parse', 'HEAD'], true).trim();
      }

      // Create git tag
      if (createTag && !dryRun) {
        result.tag = `${tagPrefix}${result.newVersion}`;
        assertSafeToken(result.tag, 'tag');
        const tagMessage = `Release ${result.newVersion}`;
        this.execCommand(['git', 'tag', '-a', result.tag, '-m', tagMessage]);
      }

      result.success = true;
      return result;

    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      return result;
    }
  }

  /**
   * Bump version based on type
   */
  private bumpVersion(
    currentVersion: string,
    bumpType: VersionBumpType,
    channel: string
  ): string {
    const versionMatch = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)(?:-([a-z]+)\.(\d+))?$/);

    if (!versionMatch) {
      throw new Error(`Invalid version format: ${currentVersion}`);
    }

    let [, major, minor, patch, prerelease, prereleaseNum] = versionMatch;
    let newMajor = parseInt(major);
    let newMinor = parseInt(minor);
    let newPatch = parseInt(patch);
    let newPrerelease: string | undefined = prerelease;
    let newPrereleaseNum = prereleaseNum ? parseInt(prereleaseNum) : 0;

    switch (bumpType) {
      case 'major':
        newMajor++;
        newMinor = 0;
        newPatch = 0;
        newPrerelease = undefined;
        break;

      case 'minor':
        newMinor++;
        newPatch = 0;
        newPrerelease = undefined;
        break;

      case 'patch':
        newPatch++;
        newPrerelease = undefined;
        break;

      case 'prerelease':
        if (newPrerelease && channel === newPrerelease) {
          newPrereleaseNum++;
        } else {
          newPrereleaseNum = 1;
          newPrerelease = channel;
        }
        break;
    }

    let version = `${newMajor}.${newMinor}.${newPatch}`;
    if (newPrerelease && bumpType === 'prerelease') {
      version += `-${newPrerelease}.${newPrereleaseNum}`;
    }

    return version;
  }

  /**
   * Get git commits since last tag
   */
  private getCommitsSinceLastTag(): GitCommit[] {
    try {
      const lastTag = this.execCommand(['git', 'describe', '--tags', '--abbrev=0'], true).trim();
      assertSafeToken(lastTag, 'git describe output');
      const range = `${lastTag}..HEAD`;
      return this.parseCommits(range);
    } catch {
      // No tags found, get all commits
      return this.parseCommits('');
    }
  }

  /**
   * Parse git commits
   */
  private parseCommits(range: string): GitCommit[] {
    const format = '--pretty=format:%H%n%s%n%an%n%ai%n---COMMIT---';
    const args = range
      ? ['git', 'log', range, format]
      : ['git', 'log', format];

    const output = this.execCommand(args, true);
    const commits: GitCommit[] = [];

    const commitBlocks = output.split('---COMMIT---').filter(Boolean);

    for (const block of commitBlocks) {
      const lines = block.trim().split('\n');
      if (lines.length < 4) continue;

      const [hash, message, author, date] = lines;

      // Parse conventional commit format
      const conventionalMatch = message.match(/^(\w+)(?:\(([^)]+)\))?: (.+)$/);

      commits.push({
        hash: hash.trim(),
        message: message.trim(),
        author: author.trim(),
        date: date.trim(),
        type: conventionalMatch?.[1],
        scope: conventionalMatch?.[2],
        breaking: message.includes('BREAKING CHANGE')
      });
    }

    return commits;
  }

  /**
   * Generate changelog entry from commits
   */
  private generateChangelogEntry(version: string, commits: GitCommit[]): ChangelogEntry {
    const entry: ChangelogEntry = {
      version,
      date: new Date().toISOString().split('T')[0],
      changes: {
        breaking: [],
        features: [],
        fixes: [],
        chore: [],
        docs: [],
        other: []
      }
    };

    for (const commit of commits) {
      const message = commit.scope
        ? `**${commit.scope}**: ${commit.message.split(':').slice(1).join(':').trim()}`
        : commit.message;

      if (commit.breaking) {
        entry.changes.breaking?.push(message);
      } else if (commit.type === 'feat') {
        entry.changes.features?.push(message);
      } else if (commit.type === 'fix') {
        entry.changes.fixes?.push(message);
      } else if (commit.type === 'chore') {
        entry.changes.chore?.push(message);
      } else if (commit.type === 'docs') {
        entry.changes.docs?.push(message);
      } else {
        entry.changes.other?.push(message);
      }
    }

    return entry;
  }

  /**
   * Format changelog entry as markdown
   */
  private formatChangelogEntry(entry: ChangelogEntry): string {
    let markdown = `## [${entry.version}] - ${entry.date}\n\n`;

    const sections = [
      { title: 'BREAKING CHANGES', items: entry.changes.breaking },
      { title: 'Features', items: entry.changes.features },
      { title: 'Bug Fixes', items: entry.changes.fixes },
      { title: 'Documentation', items: entry.changes.docs },
      { title: 'Chores', items: entry.changes.chore },
      { title: 'Other Changes', items: entry.changes.other }
    ];

    for (const section of sections) {
      if (section.items && section.items.length > 0) {
        markdown += `### ${section.title}\n\n`;
        for (const item of section.items) {
          markdown += `- ${item}\n`;
        }
        markdown += '\n';
      }
    }

    return markdown;
  }

  /**
   * Update CHANGELOG.md file
   */
  private updateChangelogFile(path: string, newEntry: string): void {
    const changelogPath = join(this.cwd, path);
    let content = '';

    if (existsSync(changelogPath)) {
      content = readFileSync(changelogPath, 'utf-8');

      // Insert after header
      const headerEnd = content.indexOf('\n\n') + 2;
      if (headerEnd > 1) {
        content = content.slice(0, headerEnd) + newEntry + content.slice(headerEnd);
      } else {
        content = newEntry + '\n' + content;
      }
    } else {
      content = `# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n${newEntry}`;
    }

    writeFileSync(changelogPath, content);
  }

  /**
   * Execute a git command safely.
   * Commands are passed as an argument array to execFileSync — no shell is
   * involved, so shell metacharacters in values are inert. Every non-flag
   * argument is additionally validated against a safe charset and must not
   * start with `-` (which git would treat as a flag).
   */
  private execCommand(args: string[], returnOutput = false): string {
    if (args.length === 0 || args[0] !== 'git') {
      throw new Error('Only git commands are allowed');
    }

    let isMessageValue = false;
    for (const arg of args.slice(1)) {
      if (isMessageValue) {
        // Value following `-m` is a single array element (no shell involved);
        // only forbid NUL bytes and absurd length.
        if (arg.includes('\0') || arg.length > 4096) {
          throw new Error(`Invalid git message value`);
        }
        isMessageValue = false;
        continue;
      }
      if (arg.startsWith('-')) {
        if (!ALLOWED_GIT_FLAGS.has(arg)) {
          throw new Error(`Invalid git flag: ${JSON.stringify(arg)}`);
        }
        isMessageValue = arg === '-m';
        continue;
      }
      if (!SAFE_TOKEN_RE.test(arg)) {
        throw new Error(`Invalid git argument: ${JSON.stringify(arg)}`);
      }
    }

    try {
      const output = execFileSync('git', args.slice(1), {
        cwd: this.cwd,
        encoding: 'utf-8',
        stdio: returnOutput ? 'pipe' : 'inherit',
        timeout: 30000, // 30 second timeout
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer limit
      });
      return returnOutput ? output : '';
    } catch (error) {
      if (returnOutput && error instanceof Error) {
        return '';
      }
      throw error;
    }
  }
}

/**
 * Convenience function to prepare a release
 */
export async function prepareRelease(
  options: ReleaseOptions = {}
): Promise<ReleaseResult> {
  const manager = new ReleaseManager();
  return manager.prepareRelease(options);
}
