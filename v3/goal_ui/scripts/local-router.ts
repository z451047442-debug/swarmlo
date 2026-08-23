// Local-only router: serves the 5 goal_ui Edge Functions without Supabase.
//
// Each function in supabase/functions/<name>/index.ts exports a `handler`;
// this router maps Supabase's /functions/v1/<name> URL shape onto them so the
// frontend's supabase.functions.invoke() calls work unchanged against
// VITE_SUPABASE_URL=http://localhost:54321.
//
// Kept OUTSIDE supabase/functions/ on purpose so `supabase functions deploy`
// never picks it up.
//
// Usage (from v3/goal_ui):
//   deno run --allow-net --allow-env --env-file=.env.local scripts/local-router.ts
// .env.local must contain: LOVABLE_API_KEY=<your key>
import { handler as generateResearchGoal } from "../supabase/functions/generate-research-goal/index.ts";
import { handler as researchStep } from "../supabase/functions/research-step/index.ts";
import { handler as researchApi } from "../supabase/functions/research-api/index.ts";
import { handler as generateActionItems } from "../supabase/functions/generate-action-items/index.ts";
import { handler as optimizeResearchConfig } from "../supabase/functions/optimize-research-config/index.ts";

type Handler = (req: Request) => Promise<Response>;

const routes: Record<string, Handler> = {
  "generate-research-goal": generateResearchGoal,
  "research-step": researchStep,
  "research-api": researchApi,
  "generate-action-items": generateActionItems,
  "optimize-research-config": optimizeResearchConfig,
};

const PORT = Number(Deno.env.get("PORT") ?? 54321);

Deno.serve({ port: PORT }, async (req) => {
  const url = new URL(req.url);
  const match = url.pathname.match(/^\/functions\/v1\/([a-z-]+)$/);
  const handler = match ? routes[match[1]] : undefined;
  if (!handler) {
    return new Response(
      JSON.stringify({
        error: `No function matches ${url.pathname}`,
        available: Object.keys(routes),
      }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }
  return handler(req);
});

console.log(
  `[local-router] serving ${Object.keys(routes).length} functions on http://localhost:${PORT}`,
);
