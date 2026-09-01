import { vi, afterAll } from "vitest";
import dotenv from "dotenv";
import { resolve } from "path";
import fs from "fs";

// Load the .env file — optional: tests must run without a committed env
// template. Fall back to .env.local, then to an empty environment.
const envPath = resolve(__dirname, "../../.env");
const envLocalPath = resolve(__dirname, "../../.env.local");
dotenv.config({ path: fs.existsSync(envPath) ? envPath : envLocalPath });

// Read the .env file content (empty string when neither exists)
const envContent = fs.existsSync(envPath)
	? fs.readFileSync(envPath, "utf-8")
	: fs.existsSync(envLocalPath)
		? fs.readFileSync(envLocalPath, "utf-8")
		: "";

// Parse the .env content
const envVars = dotenv.parse(envContent);

// Separate public and private variables
const publicEnv = {};
const privateEnv = {};

for (const [key, value] of Object.entries(envVars)) {
	if (key.startsWith("PUBLIC_")) {
		publicEnv[key] = value;
	} else {
		privateEnv[key] = value;
	}
}

vi.mock("$env/dynamic/public", () => ({
	env: publicEnv,
}));

vi.mock("$env/dynamic/private", async () => {
	return {
		env: {
			...privateEnv,
			// RVF store uses in-memory for tests (no file path = no persistence)
			RVF_DB_PATH: "",
			// OIDC claim defaults: without a committed .env, OIDConfig parses
			// NAME_CLAIM as "" which breaks updateUser's zod setKey.
			OPENID_NAME_CLAIM: privateEnv["OPENID_NAME_CLAIM"] || "name",
		},
	};
});

afterAll(async () => {
	// No cleanup needed — RVF store is in-memory for tests
});
