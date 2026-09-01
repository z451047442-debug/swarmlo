/**
 * Auto-install utility for optional MCP tool dependencies
 *
 * When an MCP tool requires an optional package that isn't installed,
 * this utility attempts to install it automatically on first use.
 */

import { spawnSync } from 'child_process';

// Track which packages we've attempted to install this session
const installAttempts = new Set<string>();

export interface AutoInstallOptions {
  /**
   * Timeout in milliseconds for npm install (default: 60000)
   */
  timeout?: number;

  /**
   * Whether to save to package.json (default: false)
   */
  save?: boolean;

  /**
   * Silent install (no console output)
   */
  silent?: boolean;
}

/**
 * Auto-install a package if not available
 *
 * @param packageName - npm package name to install
 * @param options - Installation options
 * @returns true if installed successfully or already attempted
 */
export async function autoInstallPackage(
  packageName: string,
  options: AutoInstallOptions = {}
): Promise<boolean> {
  const { timeout = 60000, save = false, silent = false } = options;

  // audit_2026-08-31: kill switch — SWARMLO_NO_AUTOINSTALL=1 (same
  // SWARMLO_NO_* convention as SWARMLO_NO_SKILLS_SH) hard-disables every
  // auto-install path so a tool call can never trigger a network npm
  // install without explicit consent.
  if (process.env.SWARMLO_NO_AUTOINSTALL === '1') {
    return false;
  }

  // Validate package name to prevent command injection (CVE fix)
  // Valid npm package names: @scope/name or name, alphanumeric with - . _ ~
  const validPackageName = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*(@[a-z0-9-._~]+)?$/i;
  if (!validPackageName.test(packageName)) {
    if (!silent) {
      console.error(`[claude-flow] Invalid package name: ${packageName}`);
    }
    return false;
  }

  // audit_2026-08-31: pin known optional packages to a fixed version
  // (OPTIONAL_PACKAGES map) instead of letting `npm install <name>` resolve
  // `@latest` — a future breaking alpha would silently land in the user's
  // project on the next tool call.
  const pinned = OPTIONAL_PACKAGES[packageName as keyof typeof OPTIONAL_PACKAGES]?.version;
  const installSpec = pinned ? `${packageName}@${pinned}` : packageName;

  // Only attempt once per session (keyed on the bare name so a caller that
  // passes a versioned spec later still hits the same guard)
  if (installAttempts.has(packageName)) {
    return false;
  }
  installAttempts.add(packageName);

  try {
    if (!silent) {
      console.error(`[claude-flow] Auto-installing ${installSpec}...`);
    }

    // Use spawn with array args to prevent shell injection
    const args = ['install', installSpec, save ? '--save' : '--no-save'];
    const result = spawnSync('npm', args, {
      stdio: silent ? 'pipe' : ['pipe', 'pipe', 'pipe'],
      timeout,
      shell: false, // Explicitly disable shell
    });

    if (result.status !== 0) {
      throw new Error(result.stderr?.toString() || 'Installation failed');
    }

    if (!silent) {
      console.error(`[claude-flow] Successfully installed ${packageName}`);
    }
    return true;
  } catch (error) {
    if (!silent) {
      console.error(`[claude-flow] Failed to auto-install ${packageName}: ${error}`);
    }
    return false;
  }
}

/**
 * Try to import a package, auto-install if not found, and retry
 *
 * @param packageName - npm package name
 * @param options - Installation options
 * @returns The imported module or null if failed
 */
export async function tryImportOrInstall<T = unknown>(
  packageName: string,
  options: AutoInstallOptions = {}
): Promise<T | null> {
  try {
    // First try to import
    return await import(packageName) as T;
  } catch {
    // Package not found, try to install
    const installed = await autoInstallPackage(packageName, options);
    if (installed) {
      try {
        // ESM caches failed imports, so we need to bust the cache
        // Add a timestamp query parameter to force a fresh import
        const cacheBuster = `?t=${Date.now()}`;
        return await import(`${packageName}${cacheBuster}`) as T;
      } catch {
        console.error(`[claude-flow] ${packageName} installed but failed to load. Restart MCP server.`);
        return null;
      }
    }
    return null;
  }
}

/**
 * Check if a package is available without installing
 */
export async function isPackageAvailable(packageName: string): Promise<boolean> {
  try {
    await import(packageName);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reset install attempts (useful for testing)
 */
export function resetInstallAttempts(): void {
  installAttempts.clear();
}

/**
 * Optional package dependencies and their purposes.
 *
 * `version` is the PIN used by autoInstallPackage — never resolve `@latest`
 * for an auto-installed dependency (a breaking release would land in the
 * user's project without consent). Update the pin deliberately when a new
 * version is verified compatible.
 */
export const OPTIONAL_PACKAGES = {
  '@claude-flow/aidefence': {
    version: '3.0.3',
    description: 'AI manipulation defense (prompt injection, PII detection)',
    tools: ['aidefence_scan', 'aidefence_analyze', 'aidefence_stats', 'aidefence_learn'],
  },
  '@claude-flow/embeddings': {
    version: '3.0.0-alpha.45',
    description: 'Vector embeddings with ONNX support',
    tools: ['embeddings_generate', 'embeddings_search', 'embeddings_batch'],
  },
  'onnxruntime-node': {
    version: '1.29.0',
    description: 'ONNX runtime for neural network inference',
    tools: ['neural_*'],
  },
} as const;

export default {
  autoInstallPackage,
  tryImportOrInstall,
  isPackageAvailable,
  resetInstallAttempts,
  OPTIONAL_PACKAGES,
};
