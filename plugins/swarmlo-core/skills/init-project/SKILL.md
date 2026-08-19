---
name: init-project
description: Initialize a new Swarmlo project with MCP tools, hooks, and agent configuration. Use when setting up Swarmlo in a fresh repo, or when the user says "init swarmlo", "set up swarmlo", or asks how to bootstrap the MCP server, hooks, and agent configs from scratch.
argument-hint: "[--preset standard|minimal|full]"
allowed-tools: Bash(npx *) Read Write Edit
---
Run `npx swarmlo-cli@latest init --wizard` to set up the project interactively, or `npx swarmlo-cli@latest init --preset standard` for defaults.

This creates CLAUDE.md, .claude/settings.json, and .claude-flow/ config with MCP server registration for the `swarmlo` MCP tools.
