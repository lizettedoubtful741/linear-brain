function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`[config] Missing required environment variable: ${key}`);
    process.exit(1);
  }
  return value;
}

export const config = {
  linearApiKey: requireEnv("LINEAR_API_KEY"),
  // Optional — if set, webhook signatures are verified; if absent, webhooks are accepted but unverified (dev only)
  linearWebhookSecret: process.env.LINEAR_WEBHOOK_SECRET ?? null,
  port: Number(process.env.PORT ?? 3000),
  databasePath: process.env.DATABASE_PATH ?? "./data/brain.db",
};

export type Config = typeof config;
