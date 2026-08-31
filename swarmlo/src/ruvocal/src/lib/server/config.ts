import { env as publicEnv } from "$env/dynamic/public";
import { env as serverEnv } from "$env/dynamic/private";
import { building } from "$app/environment";
import type { RvfCollection } from "$lib/server/database/rvf";
import type { ConfigKey as ConfigKeyType } from "$lib/types/ConfigKey";
import type { Semaphore } from "$lib/types/Semaphore";
import { Semaphores } from "$lib/types/Semaphore";

export type PublicConfigKey = keyof typeof publicEnv;
const keysFromEnv = { ...publicEnv, ...serverEnv };
export type ConfigKey = keyof typeof keysFromEnv;

class ConfigManager {
	private keysFromDB: Partial<Record<ConfigKey, string>> = {};
	private isInitialized = false;

	private configCollection: RvfCollection<ConfigKeyType> | undefined;
	private semaphoreCollection: RvfCollection<Semaphore> | undefined;
	private lastConfigUpdate: Date | undefined;

	async init() {
		if (this.isInitialized) return;

		if (building || import.meta.env.MODE === "test") {
			this.isInitialized = true;
			return;
		}

		const { getCollectionsEarly } = await import("./database");
		const collections = await getCollectionsEarly();

		this.configCollection = collections.config;
		this.semaphoreCollection = collections.semaphores;

		await this.checkForUpdates().then(() => {
			this.isInitialized = true;
		});
	}

	get ConfigManagerEnabled() {
		return serverEnv.ENABLE_CONFIG_MANAGER === "true" && import.meta.env.MODE !== "test";
	}

	get isHuggingChat() {
		return this.get("PUBLIC_APP_ASSETS") === "huggingchat";
	}

	async checkForUpdates() {
		if (await this.isConfigStale()) {
			await this.updateConfig();
		}
	}

	async isConfigStale(): Promise<boolean> {
		if (!this.lastConfigUpdate || !this.isInitialized) {
			return true;
		}
		const count = await this.semaphoreCollection?.countDocuments({
			key: Semaphores.CONFIG_UPDATE,
			updatedAt: { $gt: this.lastConfigUpdate },
		});
		return count !== undefined && count > 0;
	}

	async updateConfig() {
		const configs = (await this.configCollection?.find({}).toArray()) ?? [];
		this.keysFromDB = configs.reduce(
			(acc, curr) => {
				acc[curr.key as ConfigKey] = curr.value;
				return acc;
			},
			{} as Record<ConfigKey, string>
		);

		this.lastConfigUpdate = new Date();
	}

	get(key: ConfigKey | ExtraConfigKeys): string {
		if (!this.ConfigManagerEnabled) {
			return keysFromEnv[key as ConfigKey] || "";
		}
		return this.keysFromDB[key as ConfigKey] || keysFromEnv[key as ConfigKey] || "";
	}

	async updateSemaphore() {
		await this.semaphoreCollection?.updateOne(
			{ key: Semaphores.CONFIG_UPDATE },
			{
				$set: {
					updatedAt: new Date(),
				},
				$setOnInsert: {
					createdAt: new Date(),
				},
			},
			{ upsert: true }
		);
	}

	async set(key: ConfigKey, value: string) {
		if (!this.ConfigManagerEnabled) throw new Error("Config manager is disabled");
		await this.configCollection?.updateOne({ key }, { $set: { value } }, { upsert: true });
		this.keysFromDB[key] = value;
		await this.updateSemaphore();
	}

	async delete(key: ConfigKey) {
		if (!this.ConfigManagerEnabled) throw new Error("Config manager is disabled");
		await this.configCollection?.deleteOne({ key });
		delete this.keysFromDB[key];
		await this.updateSemaphore();
	}

	async clear() {
		if (!this.ConfigManagerEnabled) throw new Error("Config manager is disabled");
		await this.configCollection?.deleteMany({});
		this.keysFromDB = {};
		await this.updateSemaphore();
	}

	getPublicConfig() {
		let config = {
			...Object.fromEntries(
				Object.entries(keysFromEnv).filter(([key]) => key.startsWith("PUBLIC_"))
			),
		} as Record<PublicConfigKey, string>;

		if (this.ConfigManagerEnabled) {
			config = {
				...config,
				...Object.fromEntries(
					Object.entries(this.keysFromDB).filter(([key]) => key.startsWith("PUBLIC_"))
				),
			};
		}

		const publicEnvKeys = Object.keys(publicEnv);

		return Object.fromEntries(
			Object.entries(config).filter(([key]) => publicEnvKeys.includes(key))
		) as Record<PublicConfigKey, string>;
	}
}

// Create the instance and initialize it.
const configManager = new ConfigManager();

export const ready = (async () => {
	if (!building) {
		await configManager.init();
	}
})();

type ExtraConfigKeys =
	| "HF_TOKEN"
	| "OLD_MODELS"
	| "ENABLE_ASSISTANTS"
	| "METRICS_ENABLED"
	| "METRICS_PORT"
	| "MCP_SERVERS"
	| "MCP_FORWARD_HF_USER_TOKEN"
	| "MCP_TOOL_TIMEOUT_MS"
	| "EXA_API_KEY"
	// Keys used across the codebase that are not declared in any committed env
	// template (SvelteKit derives ConfigKey from the local .env files, which
	// vary by machine — this list keeps the type stable).
	| "ADMIN_API_SECRET"
	| "ADMIN_CLI_LOGIN"
	| "ADMIN_TOKEN"
	| "ALLOWED_USER_DOMAINS"
	| "ALLOWED_USER_EMAILS"
	| "ALLOW_IFRAME"
	| "ALLOW_INSECURE_COOKIES"
	| "ALTERNATIVE_REDIRECT_URLS"
	| "AUTOMATIC_LOGIN"
	| "COOKIE_NAME"
	| "COOKIE_SAMESITE"
	| "COOKIE_SECURE"
	| "COUPLE_SESSION_WITH_COOKIE_NAME"
	| "ENABLE_DATA_EXPORT"
	| "EXPOSE_API"
	| "HF_ORG_ADMIN"
	| "HF_ORG_EARLY_ACCESS"
	| "LLM_ROUTER_ARCH_BASE_URL"
	| "LLM_ROUTER_ARCH_MODEL"
	| "LLM_ROUTER_ARCH_TIMEOUT_MS"
	| "LLM_ROUTER_ENABLE_MULTIMODAL"
	| "LLM_ROUTER_ENABLE_TOOLS"
	| "LLM_ROUTER_FALLBACK_MODEL"
	| "LLM_ROUTER_MAX_ASSISTANT_LENGTH"
	| "LLM_ROUTER_MAX_PREV_USER_LENGTH"
	| "LLM_ROUTER_MULTIMODAL_MODEL"
	| "LLM_ROUTER_OTHER_ROUTE"
	| "LLM_ROUTER_ROUTES_PATH"
	| "LLM_SUMMARIZATION"
	| "LOG_LEVEL"
	| "OPENID_CLIENT_ID"
	| "OPENID_CLIENT_SECRET"
	| "OPENID_CONFIG"
	| "OPENID_NAME_CLAIM"
	| "OPENID_PROVIDER_URL"
	| "OPENID_RESOURCE"
	| "OPENID_SCOPES"
	| "OPENID_TOLERANCE"
	| "PARQUET_EXPORT_DATASET"
	| "PARQUET_EXPORT_HF_TOKEN"
	| "PARQUET_EXPORT_SECRET"
	| "RATE_LIMIT"
	| "TASK_MODEL"
	| "TRANSCRIPTION_BASE_URL"
	| "TRANSCRIPTION_MODEL"
	| "TRUSTED_EMAIL_HEADER"
	| "USAGE_LIMITS"
	| "USE_USER_TOKEN"
	| "WEBHOOK_URL_REPORT_ASSISTANT";

type ConfigProxy = ConfigManager & { [K in ConfigKey | ExtraConfigKeys]: string };

export const config: ConfigProxy = new Proxy(configManager, {
	get(target, prop, receiver) {
		if (prop in target) {
			return Reflect.get(target, prop, receiver);
		}
		if (typeof prop === "string") {
			return target.get(prop as ConfigKey);
		}
		return undefined;
	},
	set(target, prop, value, receiver) {
		if (prop in target) {
			return Reflect.set(target, prop, value, receiver);
		}
		if (typeof prop === "string") {
			target.set(prop as ConfigKey, value);
			return true;
		}
		return false;
	},
}) as ConfigProxy;
