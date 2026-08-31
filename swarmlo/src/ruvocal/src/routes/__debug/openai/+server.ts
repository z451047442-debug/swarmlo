import { json } from "@sveltejs/kit";
import { config } from "$lib/server/config";
import { requireAdmin } from "$lib/server/api/utils/requireAuth";
const DEFAULT_OPENAI_BASE = "https://router.huggingface.co/v1";

export async function GET({ locals }) {
	// Debug endpoint that probes the configured OpenAI base URL — admin only
	requireAdmin(locals);

	const base = (config.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE).replace(/\/$/, "");
	try {
		const res = await fetch(`${base}/models`);
		const text = await res.text();
		let length: number | null = null;
		try {
			const parsed = JSON.parse(text);
			length = Array.isArray(parsed?.data) ? parsed.data.length : null;
		} catch (_err) {
			length = null; // ignore parse errors
		}
		return json({ base, status: res.status, ok: res.ok, length, sample: text.slice(0, 1000) });
	} catch (e) {
		return json({ base, error: String(e) });
	}
}
