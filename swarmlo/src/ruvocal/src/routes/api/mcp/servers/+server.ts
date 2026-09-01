import type { MCPServer } from "$lib/types/Tool";
import { config } from "$lib/server/config";
import { requireAuth } from "$lib/server/api/utils/requireAuth";

export async function GET({ locals }) {
	// Server configuration is visible to signed-in users only
	requireAuth(locals);
	// Parse MCP_SERVERS environment variable
	const mcpServersEnv = config.MCP_SERVERS || "[]";

	let servers: Array<{ name: string; url: string; headers?: Record<string, string> }> = [];

	try {
		servers = JSON.parse(mcpServersEnv);
		if (!Array.isArray(servers)) {
			servers = [];
		}
	} catch (error) {
		console.error("Failed to parse MCP_SERVERS env variable:", error);
		servers = [];
	}

	// Convert internal server config to client MCPServer format
	const mcpServers: MCPServer[] = servers.map((server) => ({
		id: `base-${server.name}`, // Stable ID based on name
		name: server.name,
		url: server.url,
		type: "base" as const,
		// headers intentionally omitted
		isLocked: false, // Base servers can be toggled by users
		status: undefined, // Status determined client-side via health check
	}));

	return Response.json(mcpServers);
}
