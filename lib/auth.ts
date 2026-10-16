// Agent authentication: API-key scoped credentials.
// Keys are stored hashed (SHA-256) in the database; raw keys never logged.

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "./db";

export function generateApiKey(): string {
  return `lynto_${randomBytes(24).toString("hex")}`;
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Authenticate an agent from request headers.
 * Accepts `x-agent-api-key` or `authorization: Bearer <key>`.
 */
export async function authenticateAgent(req: Request) {
  const headerKey =
    req.headers.get("x-agent-api-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!headerKey) {
    return { agent: null, error: "Missing API key" as const };
  }

  const apiKeyHash = hashApiKey(headerKey);
  const agent = await prisma.agent.findUnique({ where: { apiKeyHash } });

  if (!agent) {
    return { agent: null, error: "Invalid API key" as const };
  }
  if (agent.status !== "active") {
    return { agent: null, error: "Agent is not active" as const };
  }
  return { agent, error: null };
}

/**
 * Authenticate a settlement operator via server-side private key presence.
 * The operator key never reaches the browser.
 */
export function hasOperatorCredentials(): boolean {
  return Boolean(
    process.env.OPERATOR_PRIVATE_KEY && process.env.LYNTO_CONTRACT_ADDRESS
  );
}

/** Extract idempotency key from headers (optional client-supplied request ID). */
export function getIdempotencyKey(req: Request): string | null {
  return (
    req.headers.get("x-request-id") ??
    req.headers.get("idempotency-key") ??
    null
  );
}
