---
name: trader-risk
description: Assess portfolio risk using npx --ignore-scripts -y neural-trader@2.8.11 — VaR, CVaR, Sharpe, position sizing, circuit breaker status
allowed-tools: Bash Read mcp__plugin_swarmlo-core_swarmlo__memory_store mcp__plugin_swarmlo-core_swarmlo__memory_search
argument-hint: "[--symbol TICKER] [--portfolio NAME]"
---
Assess portfolio and position risk using neural-trader's risk engine.

Steps:
1. Ensure neural-trader is available:
   `npm ls neural-trader 2>/dev/null || npm install --ignore-scripts neural-trader`
2. Run risk assessment:
   ```bash
   # Single position
   npx --ignore-scripts -y neural-trader@2.8.11 --risk assess --symbol TICKER
   npx --ignore-scripts -y neural-trader@2.8.11 --var --symbol TICKER --investment 10000

   # Portfolio-wide
   npx --ignore-scripts -y neural-trader@2.8.11 --risk assess --portfolio NAME
   npx --ignore-scripts -y neural-trader@2.8.11 --correlation --portfolio NAME --flag-threshold 0.8
   ```
3. Calculate position sizing:
   ```bash
   npx --ignore-scripts -y neural-trader@2.8.11 --risk-tolerance 0.02 --symbol TICKER
   npx --ignore-scripts -y neural-trader@2.8.11 --position-sizing kelly --symbol TICKER
   ```
4. Check circuit breaker status:
   - Daily loss limit (3%), weekly loss limit (5%)
   - Correlation spike (>0.85), volatility regime (VIX > 2x)
   - Max positions, single-name concentration (>10%)
5. Present: risk metrics, position sizing recommendation, active breakers, alerts
6. Store assessment:
   `mcp__plugin_swarmlo-core_swarmlo__memory_store({ key: "risk-TICKER-DATE", value: "RISK_METRICS", namespace: "trading-risk" })`
