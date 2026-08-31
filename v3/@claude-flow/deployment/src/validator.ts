/**
 * Pre-Release Validator
 * Validates package before release (lint, test, build, dependencies)
 */

import { execFileSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { ValidationOptions, ValidationResult, PackageInfo } from './types.js';

export class Validator {
  private cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  /**
   * Run all validation checks
   */
  async validate(options: ValidationOptions = {}): Promise<ValidationResult> {
    const {
      lint = true,
      test = true,
      build = true,
      checkDependencies = true,
      checkGitStatus = true,
      lintCommand = 'npm run lint',
      testCommand = 'npm test',
      buildCommand = 'npm run build'
    } = options;

    const result: ValidationResult = {
      valid: true,
      checks: {},
      errors: [],
      warnings: []
    };

    // Validate package.json
    console.log('Validating package.json...');
    result.checks.packageJson = await this.validatePackageJson();
    if (!result.checks.packageJson.passed) {
      result.valid = false;
      result.errors.push(...(result.checks.packageJson.errors || []));
    }

    // Check git status
    if (checkGitStatus) {
      console.log('Checking git status...');
      result.checks.gitStatus = await this.checkGitStatus();
      if (!result.checks.gitStatus.passed) {
        result.warnings.push(...(result.checks.gitStatus.errors || []));
      }
    }

    // Check dependencies
    if (checkDependencies) {
      console.log('Checking dependencies...');
      result.checks.dependencies = await this.checkDependencies();
      if (!result.checks.dependencies.passed) {
        result.valid = false;
        result.errors.push(...(result.checks.dependencies.errors || []));
      }
    }

    // Run linter
    if (lint) {
      console.log('Running linter...');
      result.checks.lint = await this.runLint(lintCommand);
      if (!result.checks.lint.passed) {
        result.valid = false;
        result.errors.push(...(result.checks.lint.errors || []));
      }
    }

    // Run tests
    if (test) {
      console.log('Running tests...');
      result.checks.test = await this.runTests(testCommand);
      if (!result.checks.test.passed) {
        result.valid = false;
        result.errors.push(...(result.checks.test.errors || []));
      }
    }

    // Run build
    if (build) {
      console.log('Running build...');
      result.checks.build = await this.runBuild(buildCommand);
      if (!result.checks.build.passed) {
        result.valid = false;
        result.errors.push(...(result.checks.build.errors || []));
      }
    }

    return result;
  }

  /**
   * Validate package.json structure and required fields
   */
  private async validatePackageJson(): Promise<{ passed: boolean; errors?: string[] }> {
    const errors: string[] = [];

    try {
      const pkgPath = join(this.cwd, 'package.json');
      if (!existsSync(pkgPath)) {
        errors.push('package.json not found');
        return { passed: false, errors };
      }

      const pkg: PackageInfo = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      // Check required fields
      if (!pkg.name) {
        errors.push('package.json missing "name" field');
      }
      if (!pkg.version) {
        errors.push('package.json missing "version" field');
      }
      if (!pkg.description) {
        errors.push('package.json missing "description" field (warning)');
      }

      // Validate version format
      if (pkg.version && !/^\d+\.\d+\.\d+(?:-[a-z]+\.\d+)?$/.test(pkg.version)) {
        errors.push(`Invalid version format: ${pkg.version}`);
      }

      // Check for repository field
      if (!pkg.repository) {
        errors.push('package.json missing "repository" field (recommended)');
      }

      // Warn about private package
      if (pkg.private) {
        errors.push('Package is marked as private - cannot be published');
      }

      return {
        passed: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined
      };

    } catch (error) {
      errors.push(`Failed to parse package.json: ${error}`);
      return { passed: false, errors };
    }
  }

  /**
   * Check git status for uncommitted changes
   */
  private async checkGitStatus(): Promise<{ passed: boolean; errors?: string[] }> {
    try {
      const status = this.execCommand('git status --porcelain', true);

      if (status.trim()) {
        return {
          passed: false,
          errors: ['Uncommitted changes detected. Commit or stash changes before release.']
        };
      }

      return { passed: true };
    } catch (error) {
      return {
        passed: false,
        errors: [`Git status check failed: ${error}`]
      };
    }
  }

  /**
   * Check for dependency issues
   */
  private async checkDependencies(): Promise<{ passed: boolean; errors?: string[] }> {
    const errors: string[] = [];

    try {
      // Check for npm audit issues
      try {
        this.execCommand('npm audit --audit-level moderate', false);
      } catch (error) {
        errors.push('npm audit found security vulnerabilities');
      }

      // Check for outdated dependencies (non-critical)
      try {
        const outdated = this.execCommand('npm outdated --json', true);
        if (outdated.trim()) {
          const outdatedPkgs = JSON.parse(outdated);
          const count = Object.keys(outdatedPkgs).length;
          if (count > 0) {
            errors.push(`${count} outdated dependencies found (warning)`);
          }
        }
      } catch {
        // Outdated check is non-critical
      }

      return {
        passed: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined
      };

    } catch (error) {
      errors.push(`Dependency check failed: ${error}`);
      return { passed: false, errors };
    }
  }

  /**
   * Run linter
   */
  private async runLint(command: string): Promise<{ passed: boolean; errors?: string[] }> {
    try {
      this.execCommand(command, false);
      return { passed: true };
    } catch (error) {
      return {
        passed: false,
        errors: [`Linting failed: ${error}`]
      };
    }
  }

  /**
   * Run tests
   */
  private async runTests(command: string): Promise<{ passed: boolean; errors?: string[] }> {
    try {
      this.execCommand(command, false);
      return { passed: true };
    } catch (error) {
      return {
        passed: false,
        errors: [`Tests failed: ${error}`]
      };
    }
  }

  /**
   * Run build
   */
  private async runBuild(command: string): Promise<{ passed: boolean; errors?: string[] }> {
    try {
      this.execCommand(command, false);
      return { passed: true };
    } catch (error) {
      return {
        passed: false,
        errors: [`Build failed: ${error}`]
      };
    }
  }

  /**
   * Split a command string into argv tokens, respecting single/double quotes
   * and backslash escapes. No shell is ever invoked — the resulting tokens are
   * passed straight to execFileSync, so metacharacters like `;`, `|`, `$`,
   * `\n` and `"` are inert data, not syntax.
   */
  private static splitCommand(cmd: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let quote: '"' | "'" | null = null;
    let i = 0;

    while (i < cmd.length) {
      const ch = cmd[i];
      if (quote) {
        if (ch === quote) {
          quote = null;
        } else if (ch === '\\' && quote === '"') {
          current += cmd[i + 1] ?? '\\';
          i++;
        } else {
          current += ch;
        }
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '\\') {
        current += cmd[i + 1] ?? '\\';
        i++;
      } else if (/\s/.test(ch)) {
        if (current) {
          tokens.push(current);
          current = '';
        }
      } else {
        current += ch;
      }
      i++;
    }

    if (quote) {
      throw new Error(`Unterminated quote in command: ${cmd}`);
    }
    if (current) {
      tokens.push(current);
    }
    return tokens;
  }

  /** Executables the validator is allowed to spawn. */
  private static readonly ALLOWED_EXECUTABLES = new Set(['npm', 'npx', 'git']);

  /**
   * Execute command safely.
   *
   * The command string is tokenized (respecting quotes) and spawned via
   * `execFileSync` with an argument array — no shell, so no command injection.
   * The executable is restricted to npm/npx/git and arguments are only checked
   * for NUL bytes (everything else is inert without a shell).
   */
  private execCommand(cmd: string, returnOutput = false): string {
    if (cmd.includes('\0')) {
      throw new Error('Invalid command: contains NUL byte');
    }

    const tokens = Validator.splitCommand(cmd);
    if (tokens.length === 0) {
      throw new Error('Empty command');
    }

    const exe = tokens[0];
    if (!Validator.ALLOWED_EXECUTABLES.has(exe)) {
      throw new Error(`Command not allowed: ${exe}`);
    }
    // Never let the first argument be parsed as a flag of the wrapper
    if (tokens[1]?.startsWith('-')) {
      throw new Error(`Command not allowed: ${exe} ${tokens[1]}`);
    }

    try {
      const output = execFileSync(exe, tokens.slice(1), {
        cwd: this.cwd,
        encoding: 'utf-8',
        shell: false,
        stdio: returnOutput ? 'pipe' : 'inherit',
        timeout: 60000, // 60 second timeout for builds
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer for build output
      });
      return returnOutput ? output : '';
    } catch (error) {
      throw error;
    }
  }
}

/**
 * Convenience function to validate package
 */
export async function validate(options: ValidationOptions = {}): Promise<ValidationResult> {
  const validator = new Validator();
  return validator.validate(options);
}
