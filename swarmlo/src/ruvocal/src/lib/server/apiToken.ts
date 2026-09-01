import { config } from "$lib/server/config";

/**
 * The OIDC access token (locals.token) belongs to the configured OIDC
 * provider (typically Hugging Face). Forwarding it to an arbitrary third-party
 * endpoint would leak the user's provider token. Only forward it to endpoints
 * hosted by the provider itself.
 */
export function isHuggingFaceHost(urlString: string): boolean {
	try {
		const u = new URL(urlString);
		const host = u.hostname.toLowerCase();
		return (
			host === "huggingface.co" ||
			host === "hf.co" ||
			host.endsWith(".huggingface.co") ||
			host.endsWith(".hf.co") ||
			host === "hf-inference.com"
		);
	} catch {
		return false;
	}
}

export function getApiToken(locals: App.Locals | undefined, baseUrl?: string) {
	if (config.USE_USER_TOKEN === "true") {
		if (!locals?.token) {
			throw new Error("User token not found");
		}
		// Only hand out the user's OIDC token when the target endpoint belongs to
		// the OIDC provider; otherwise fall back to the server-side key so the
		// user token is never leaked to third parties.
		if (!baseUrl || isHuggingFaceHost(baseUrl)) {
			return locals.token;
		}
		return config.OPENAI_API_KEY || config.HF_TOKEN;
	}
	return config.OPENAI_API_KEY || config.HF_TOKEN;
}
