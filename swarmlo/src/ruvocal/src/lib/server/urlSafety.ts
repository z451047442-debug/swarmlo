import { Address4, Address6 } from "ip-address";
import { isIP } from "node:net";
import dns from "node:dns";
import { Agent, fetch as undiciFetch } from "undici";

// Loopback hosts are exempt from connect-time IP checks: they can only reach
// the app's own machine (local MCP dev bridges), never scan a private network.
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);

const UNSAFE_IPV4_SUBNETS = [
	"0.0.0.0/8",
	"100.64.0.0/10",
	"127.0.0.0/8",
	"169.254.0.0/16",
	"172.16.0.0/12",
	"192.168.0.0/16",
].map((s) => new Address4(s));

function isUnsafeIp(address: string): boolean {
	const family = isIP(address);

	if (family === 4) {
		const addr = new Address4(address);
		return UNSAFE_IPV4_SUBNETS.some((subnet) => addr.isInSubnet(subnet));
	}

	if (family === 6) {
		const addr = new Address6(address);
		// Check IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1)
		if (addr.is4()) {
			const v4 = addr.to4();
			return UNSAFE_IPV4_SUBNETS.some((subnet) => v4.isInSubnet(subnet));
		}
		return addr.isLoopback() || addr.isLinkLocal();
	}

	return true; // Unknown format → block
}

/**
 * Synchronous URL validation: checks protocol and hostname string.
 */
export function isValidUrl(urlString: string): boolean {
	try {
		const url = new URL(urlString.trim());
		const hostname = url.hostname.toLowerCase();
		// Allow HTTP for localhost/loopback/Docker-internal (dev & local MCP bridge)
		if (
			hostname === "localhost" ||
			hostname === "127.0.0.1" ||
			hostname === "::1" ||
			hostname === "host.docker.internal"
		) {
			return url.protocol === "http:" || url.protocol === "https:";
		}
		// Allow HTTP for Docker-internal service names (no dots = private network)
		if (!hostname.includes(".") && url.protocol === "http:") {
			return true;
		}
		if (url.protocol !== "https:") {
			return false;
		}
		// If the hostname is a raw IP literal, validate it
		const cleanHostname = hostname.replace(/^\[|]$/g, "");
		if (isIP(cleanHostname)) {
			return !isUnsafeIp(cleanHostname);
		}
		return true;
	} catch {
		return false;
	}
}

/**
 * Assert that a resolved IP address is safe (not internal/private).
 * Throws if the IP is internal. Used in undici's custom DNS lookup
 * to validate IPs at connection time (prevents TOCTOU DNS rebinding).
 */
export function assertSafeIp(address: string, hostname: string): void {
	if (isUnsafeIp(address)) {
		throw new Error(`Resolved IP for ${hostname} is internal (${address})`);
	}
}

/**
 * Shared undici dispatcher that validates every resolved IP at connection time,
 * preventing TOCTOU DNS-rebinding to internal addresses.
 */
export const ssrfSafeAgent = new Agent({
	connect: {
		lookup: (hostname, options, callback) => {
			dns.lookup(hostname, options, (err, address, family) => {
				if (err) return callback(err, "", 4);
				if (typeof address === "string") {
					try {
						assertSafeIp(address, hostname);
					} catch (e) {
						return callback(e as Error, "", 4);
					}
				} else if (Array.isArray(address)) {
					for (const entry of address) {
						try {
							assertSafeIp(entry.address, hostname);
						} catch (e) {
							return callback(e as Error, "", 4);
						}
					}
				}
				return callback(null, address, family);
			});
		},
	},
});

/** fetch bound to the SSRF-safe dispatcher (usable as RequestInit-driven fetch). */
export const ssrfSafeFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
	const url = input instanceof URL || typeof input === "string" ? String(input) : input.url;
	// DOM RequestInit and undici RequestInit differ on `body`; the dispatcher is
	// what we actually need to inject, so cast the merged options at the boundary.
	const options = { ...init, dispatcher: ssrfSafeAgent } as unknown as Parameters<
		typeof undiciFetch
	>[1];
	return undiciFetch(url, options) as unknown as Promise<Response>;
};

/**
 * Pre-connect hostname check: resolve the host and reject private/internal
 * addresses before a connection is attempted. Loopback hosts are exempt (local
 * dev MCP bridges); this is belt-and-braces on top of the dispatcher's
 * connect-time lookup.
 */
export async function assertSafeHostForConnect(urlString: string): Promise<void> {
	let url: URL;
	try {
		url = new URL(urlString.trim());
	} catch {
		throw new Error("Invalid URL");
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") {
		throw new Error("Unsupported protocol");
	}
	const hostname = url.hostname.toLowerCase();
	if (LOOPBACK_HOSTS.has(hostname)) {
		return;
	}
	const clean = hostname.replace(/^\[|]$/g, "");
	if (isIP(clean)) {
		assertSafeIp(clean, hostname);
		return;
	}
	const addresses = await dns.promises.lookup(clean, { all: true });
	for (const { address } of addresses) {
		assertSafeIp(address, hostname);
	}
}
