import { Hono } from "hono";
import { LinearWebhookClient, LINEAR_WEBHOOK_SIGNATURE_HEADER, LINEAR_WEBHOOK_TS_HEADER } from "@linear/sdk/webhooks";
import { config } from "../../config.ts";
import { db } from "../../queue/db.ts";

const webhooks = new Hono();

const webhookClient = config.linearWebhookSecret
  ? new LinearWebhookClient(config.linearWebhookSecret)
  : null;

interface WebhookEvent {
  type: string;
  action: "create" | "update" | "remove";
  data: Record<string, unknown> | null;
  organizationId?: string;
  webhookTimestamp?: number;
}

function logWebhookEvent(event: WebhookEvent): void {
  const id =
    Date.now().toString(36).toUpperCase().padStart(10, "0") +
    Math.random().toString(36).slice(2, 14).toUpperCase().padStart(12, "0");
  db.run(
    `INSERT INTO audit_log (id, created_at, action, proposal_id, details) VALUES (?, ?, ?, NULL, ?)`,
    [
      id,
      new Date().toISOString(),
      `webhook:${event.type}:${event.action}`,
      JSON.stringify({ type: event.type, action: event.action, data: event.data }),
    ]
  );
}

// POST /webhooks/linear
webhooks.post("/webhooks/linear", async (c) => {
  const rawBody = await c.req.text();

  // --- Signature verification ---
  if (webhookClient) {
    const signature = c.req.header(LINEAR_WEBHOOK_SIGNATURE_HEADER);
    const timestamp = c.req.header(LINEAR_WEBHOOK_TS_HEADER) ?? undefined;

    if (!signature) {
      console.warn("[webhooks] Missing linear-signature header — rejected");
      return c.json({ error: "Missing signature" }, 400);
    }

    let valid: boolean;
    try {
      valid = webhookClient.verify(Buffer.from(rawBody), signature, timestamp);
    } catch {
      valid = false;
    }
    if (!valid) {
      console.warn("[webhooks] Invalid webhook signature — rejected");
      return c.json({ error: "Invalid signature" }, 401);
    }
  } else {
    console.warn("[webhooks] LINEAR_WEBHOOK_SECRET not set — accepting without verification (dev only)");
  }

  // --- Parse body ---
  let event: WebhookEvent;
  try {
    event = JSON.parse(rawBody) as WebhookEvent;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { type, action } = event;
  console.log(`[webhooks] ${type}:${action}`);

  // --- Dispatch by event type ---
  switch (type) {
    case "Issue": {
      const id = event.data?.id ?? "(unknown)";
      const title = event.data?.title ?? "(no title)";
      console.log(`[webhooks] Issue ${action}: ${String(id)} — "${String(title)}"`);
      break;
    }
    case "Comment": {
      const id = event.data?.id ?? "(unknown)";
      const issueId = event.data?.issueId ?? "(unknown)";
      console.log(`[webhooks] Comment ${action}: ${String(id)} on issue ${String(issueId)}`);
      break;
    }
    default:
      console.log(`[webhooks] Ignoring unhandled type: ${type}`);
  }

  logWebhookEvent(event);
  return c.json({ ok: true });
});

export default webhooks;
