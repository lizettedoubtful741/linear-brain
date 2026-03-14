import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { getTeams, getCurrentCycle } from "../linear/reader.ts";
import api from "./routes/api.ts";
import webhooks from "./routes/webhooks.ts";

const app = new Hono();

// Health check
app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Temporary dev route — verify Linear API connection
app.get("/debug/linear", async (c) => {
  try {
    const teams = await getTeams();
    const cycles = await Promise.all(
      teams.map(async (team) => ({
        teamId: team.id,
        teamName: team.name,
        currentCycle: await getCurrentCycle(team.id),
      }))
    );
    return c.json({ teams, cycles });
  } catch (err) {
    console.error("[debug/linear]", err);
    return c.json({ error: String(err) }, 500);
  }
});

// API and webhook routes
app.route("/", api);
app.route("/", webhooks);

// Serve built SPA static assets
app.use("/*", serveStatic({ root: "./dist/web" }));

// SPA fallback — serve index.html for client-side routes
app.get("*", serveStatic({ root: "./dist/web", path: "index.html" }));

export default app;
