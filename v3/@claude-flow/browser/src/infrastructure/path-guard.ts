/**
 * @claude-flow/browser - Path guard for MCP file tools
 *
 * Mirrors the semantics of @claude-flow/security's PathValidator for the
 * browser package (which cannot import the security package without a
 * workspace install): rejects empty/oversized paths, resolves symlinks where
 * possible, and requires the final path to live inside an allowed root
 * (project cwd or the system temp directory).
 *
 * This prevents MCP tools such as sign-trajectory / verify-trajectory /
 * state-save / state-load from reading or writing arbitrary files.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const MAX_PATH_LENGTH = 4096;

export interface PathGuardResult {
  isValid: boolean;
  resolvedPath: string;
  errors: string[];
}

function allowedRoots(): string[] {
  const roots = new Set<string>([
    path.resolve(process.cwd()),
    path.resolve(os.tmpdir()),
  ]);
  return [...roots];
}

/**
 * Resolve symlinks when the file exists; otherwise canonicalize through the
 * deepest existing parent (write targets usually do not exist yet).
 */
function canonicalize(inputPath: string): string {
  try {
    return fs.realpathSync(inputPath);
  } catch {
    try {
      const realParent = fs.realpathSync(path.dirname(inputPath));
      return path.join(realParent, path.basename(inputPath));
    } catch {
      return inputPath;
    }
  }
}

/**
 * Validate a path supplied to an MCP file tool.
 * Returns the canonical resolved path on success (callers should use the
 * resolved path, not the raw input).
 */
export function validateFileToolPath(inputPath: string): PathGuardResult {
  if (!inputPath || inputPath.trim() === '') {
    return { isValid: false, resolvedPath: '', errors: ['Path is empty'] };
  }

  if (inputPath.length > MAX_PATH_LENGTH) {
    return {
      isValid: false,
      resolvedPath: '',
      errors: [`Path exceeds maximum length of ${MAX_PATH_LENGTH}`],
    };
  }

  if (inputPath.includes('\0')) {
    return { isValid: false, resolvedPath: '', errors: ['Path contains NUL byte'] };
  }

  const resolved = canonicalize(path.resolve(inputPath));
  const normalized = path.normalize(resolved);
  const roots = allowedRoots();

  const withinRoot = roots.some(
    root => normalized === root || normalized.startsWith(root + path.sep)
  );
  if (!withinRoot) {
    return {
      isValid: false,
      resolvedPath: '',
      errors: [
        `Path must be inside the project directory (${roots.join(', ')})`,
      ],
    };
  }

  return { isValid: true, resolvedPath: normalized, errors: [] };
}

/** Throw variant for call sites that want a single error message. */
export function assertFileToolPath(inputPath: string): string {
  const result = validateFileToolPath(inputPath);
  if (!result.isValid) {
    throw new Error(`path validation failed: ${result.errors.join('; ')}`);
  }
  return result.resolvedPath;
}
