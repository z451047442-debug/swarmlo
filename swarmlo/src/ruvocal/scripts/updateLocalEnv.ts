/**
 * LOCAL DEVELOPMENT ONLY — this script regenerates .env.local from the chart's
 * prod.yaml for running the app on a dev machine. It intentionally rewrites
 * COOKIE_SECURE=false / LOG_LEVEL=info / NODE_ENV=development, which are
 * unsuitable for any deployed environment. Do NOT run it in CI or on servers.
 */
import fs from "fs";
import yaml from "js-yaml";

const file = fs.readFileSync("chart/env/prod.yaml", "utf8");

// have to do a weird stringify/parse because of some node error
const prod = JSON.parse(JSON.stringify(yaml.load(file)));
const vars = prod.envVars as Record<string, string>;

let PUBLIC_CONFIG = "";

Object.entries(vars)
	// filter keys used in prod with the proxy
	.filter(
		([key]) =>
			![
				"XFF_DEPTH",
				"ADDRESS_HEADER",
				"APP_BASE",
				"PUBLIC_ORIGIN",
				"PUBLIC_SHARE_PREFIX",
				"ADMIN_CLI_LOGIN",
			].includes(key)
	)
	.forEach(([key, value]) => {
		PUBLIC_CONFIG += `${key}=\`${value}\`\n`;
	});

const SECRET_CONFIG =
	(fs.existsSync(".env.SECRET_CONFIG")
		? fs.readFileSync(".env.SECRET_CONFIG", "utf8")
		: process.env.SECRET_CONFIG) ?? "";

// Prepend the content of the env variable SECRET_CONFIG
let full_config = `${PUBLIC_CONFIG}\n${SECRET_CONFIG}`;

// replace the internal proxy url with the public endpoint
full_config = full_config.replaceAll(
	"https://internal.api-inference.huggingface.co",
	"https://router.huggingface.co/hf-inference"
);

full_config = full_config.replaceAll("COOKIE_SECURE=`true`", "COOKIE_SECURE=`false`");
full_config = full_config.replaceAll("LOG_LEVEL=`debug`", "LOG_LEVEL=`info`");
full_config = full_config.replaceAll("NODE_ENV=`prod`", "NODE_ENV=`development`");

// Write full_config to .env.local
fs.writeFileSync(".env.local", full_config);
