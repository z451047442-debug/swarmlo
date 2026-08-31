import type { Semaphores } from "$lib/types/Semaphore";

/**
 * In-process distributed lock for the RVF single-file store.
 *
 * RVF has no unique index / TTL index (the Mongo-based implementation was a
 * no-op here — every acquire "succeeded", and stale locks would spin forever
 * after a crash). This implementation keeps locks in memory with a timestamp
 * TTL:
 *   - acquireLock  succeeds only if no live (unexpired) lock exists for the key
 *   - refreshLock  extends the TTL while a long job is running
 *   - isDBLocked   reports whether a live lock exists
 *
 * Because RVF is a single-process store (deployment MUST be single-instance
 * with a persistent volume, see cloudbuild.yaml), an in-memory lock is
 * correct; on restart all locks are cleared, which is exactly what we want
 * after a crash.
 */

const LOCK_TTL_MS = 3 * 60 * 1000; // 3 minutes, matching the old deleteAt

interface LockEntry {
	lockId: string;
	expiresAt: number;
}

const locks = new Map<string, LockEntry>();

function purgeExpired(): void {
	const now = Date.now();
	for (const [key, entry] of locks) {
		if (entry.expiresAt <= now) {
			locks.delete(key);
		}
	}
}

/**
 * Returns the lock id if the lock was acquired, false otherwise
 */
export async function acquireLock(key: Semaphores | string): Promise<string | false> {
	purgeExpired();
	if (locks.has(key)) {
		return false;
	}

	const lockId = crypto.randomUUID();
	locks.set(key, { lockId, expiresAt: Date.now() + LOCK_TTL_MS });
	return lockId;
}

export async function releaseLock(key: Semaphores | string, lockId: string): Promise<void> {
	const entry = locks.get(key);
	if (entry && entry.lockId === lockId) {
		locks.delete(key);
	}
}

export async function isDBLocked(key: Semaphores | string): Promise<boolean> {
	purgeExpired();
	return locks.has(key);
}

export async function refreshLock(key: Semaphores | string, lockId: string): Promise<boolean> {
	const entry = locks.get(key);
	if (!entry || entry.lockId !== lockId) {
		return false;
	}
	entry.expiresAt = Date.now() + LOCK_TTL_MS;
	return true;
}
