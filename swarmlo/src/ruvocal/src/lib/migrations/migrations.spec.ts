import { afterEach, assert, beforeAll, describe, expect, it } from "vitest";
import { migrations } from "./routines";
import { acquireLock, isDBLocked, refreshLock, releaseLock } from "./lock";
import { Semaphores } from "$lib/types/Semaphore";
import { collections, ready } from "$lib/server/database";

describe(
	"migrations",
	{
		retry: 3,
	},
	() => {
		beforeAll(async () => {
			await ready;
		}, 20000);

		it("should not have duplicates guid", async () => {
			const guids = migrations.map((m) => m._id.toString());
			const uniqueGuids = [...new Set(guids)];
			expect(uniqueGuids.length).toBe(guids.length);
		});

		it("should acquire only one lock on DB", async () => {
			const results = await Promise.all(
				new Array(1000).fill(0).map(() => acquireLock(Semaphores.TEST_MIGRATION))
			);
			const locks = results.filter((r) => r);

			// RVF locks are in-memory (single-process store) — the semaphores
			// collection is no longer used for locking.
			const semaphores = await collections.semaphores.find({}).toArray();

			expect(locks.length).toBe(1);
			expect(semaphores).toBeDefined();
			expect(semaphores.length).toBe(0);
			expect(typeof locks[0]).toBe("string");
			await releaseLock(Semaphores.TEST_MIGRATION, locks[0] as string);
		});

		it("should read the lock correctly", async () => {
			const lockId = await acquireLock(Semaphores.TEST_MIGRATION);
			assert(lockId);
			expect(await isDBLocked(Semaphores.TEST_MIGRATION)).toBe(true);
			expect(!!(await acquireLock(Semaphores.TEST_MIGRATION))).toBe(false);
			await releaseLock(Semaphores.TEST_MIGRATION, lockId);
			expect(await isDBLocked(Semaphores.TEST_MIGRATION)).toBe(false);
		});

		it("should refresh the lock", async () => {
			const lockId = await acquireLock(Semaphores.TEST_MIGRATION);
			assert(lockId);

			// refreshLock keeps the lock alive: it returns true and a competing
			// acquire still fails while the lock is held.
			expect(await refreshLock(Semaphores.TEST_MIGRATION, lockId)).toBe(true);
			expect(await isDBLocked(Semaphores.TEST_MIGRATION)).toBe(true);

			// A stale lockId cannot refresh (or release) the live lock.
			expect(await refreshLock(Semaphores.TEST_MIGRATION, "stale-id")).toBe(false);

			await releaseLock(Semaphores.TEST_MIGRATION, lockId);
		});

		afterEach(async () => {
			await collections.semaphores.deleteMany({});
			await collections.migrationResults.deleteMany({});
		});
	}
);
