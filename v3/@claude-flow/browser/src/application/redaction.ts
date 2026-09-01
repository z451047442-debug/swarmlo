/**
 * @claude-flow/browser - Sensitive-value redaction
 *
 * Shared redaction for browser trajectories, compiled workflows, and
 * ReasoningBank learning patterns. Mirrors the `[REDACTED]` convention
 * established by BrowserService.fill so credentials (passwords, tokens,
 * cookies, API keys) never leak into persisted artifacts.
 */

export const REDACTED_VALUE = '[REDACTED]';

const SENSITIVE_KEY_PATTERN =
  /password|passwd|secret|token|api[_-]?key|access[_-]?key|authorization|auth|cookie|otp|pin|credential|private[_-]?key|session/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

/** Redact a single value when its key is sensitive. */
export function redactSensitiveValue(key: string, value: unknown): unknown {
  if (typeof value === 'string' && value !== '' && SENSITIVE_KEY_PATTERN.test(key)) {
    return REDACTED_VALUE;
  }
  return value;
}

/**
 * Recursively redact sensitive values inside a step-input record.
 *
 * `redactTextValues` additionally forces redaction of `value`/`text` entries —
 * used by BrowserService for fill/type steps recorded without a security
 * scanner (the fill() method itself already redacts when a scanner is present).
 */
export function redactStepInput(
  input: Record<string, unknown>,
  options: { redactTextValues?: boolean } = {}
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (isPlainObject(value)) {
      out[key] = redactStepInput(value, options);
    } else if (
      options.redactTextValues &&
      (key === 'value' || key === 'text') &&
      typeof value === 'string' &&
      value !== ''
    ) {
      out[key] = REDACTED_VALUE;
    } else {
      out[key] = redactSensitiveValue(key, value);
    }
  }
  return out;
}
