import { collections } from "$lib/server/database";
import { flushToDisk } from "$lib/server/database/rvf";
import { models } from "$lib/server/models";

/**
 * Health check with a storage write probe: reports OK only when the RVF store
 * is actually writable and the model registry has loaded. A corrupt or
 * read-only database must not silently report OK.
 */
export async function GET() {
	try {
		// Write probe: force a flush to disk and verify the file was produced.
		await flushToDisk();

		// Read probe: the collections must be queryable.
		const count = await collections.conversations.countDocuments();

		if (models.length === 0) {
			return new Response("Degraded: model registry not loaded yet", { status: 503 });
		}

		return new Response(`OK (conversations: ${count}, models: ${models.length})`, {
			status: 200,
		});
	} catch (err) {
		console.error("[healthcheck] Storage probe failed:", err);
		return new Response("Storage not writable", { status: 503 });
	}
}
