import { Hono } from "hono";
import { getTeams, getCurrentCycle } from "../linear/reader.ts";
import dashboard from "./routes/dashboard.ts";
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

// Dashboard (HTML), API, and webhook routes
app.route("/", dashboard);
app.route("/", api);
app.route("/", webhooks);

export default app;
