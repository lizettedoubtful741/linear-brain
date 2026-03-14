import { config } from "./config.ts";
import app from "./server/app.ts";

const server = Bun.serve({
  port: config.port,
  fetch: app.fetch,
  idleTimeout: 255, // seconds — headless Claude actions can take a while
});

console.log(`[linear-brain] Server running on http://localhost:${server.port}`);
