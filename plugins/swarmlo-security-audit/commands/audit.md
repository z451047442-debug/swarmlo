---
name: audit
description: Run a security audit on the project
---
$ARGUMENTS
Run a Swarmlo security audit. Accepts optional flags:

Usage: /audit [--depth quick|standard|deep] [--target <dir>] [--fix]

Defaults to `--depth standard` on the current project root. Parse the depth from $ARGUMENTS (quick, standard, or deep).

Steps:
1. `npx swarmlo-cli@3.39.1 security scan --depth DEPTH --target . --output json`
2. `npx swarmlo-cli@3.39.1 security cve --list`
3. `npx swarmlo-cli@3.39.1 security threats --model stride --export md`

Store findings in memory for pattern training:
`npx swarmlo-cli@3.39.1 memory store --namespace security-findings --key "audit-YYYY-MM-DD" --value "FINDINGS_SUMMARY"`
