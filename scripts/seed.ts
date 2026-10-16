// Seed script: register the demo agent and print the API key once.
// Usage: pnpm db:seed
// Requires DATABASE_URL and optional DEMO_AGENT_WALLET_ADDRESS.

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "crypto";

const prisma = new PrismaClient();

function generateApiKey(): string {
  return `lynto_${randomBytes(24).toString("hex")}`;
}

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

async function main() {
  const walletAddress = (
    process.env.DEMO_AGENT_WALLET_ADDRESS ??
    "0x0000000000000000000000000000000000000001"
  ).toLowerCase();

  const existing = await prisma.agent.findUnique({ where: { walletAddress } });

  if (existing) {
    console.log("Demo agent already exists:", existing.id, existing.walletAddress);
    console.log("(API key is not retrievable — re-register with a new wallet if lost.)");
    return;
  }

  const apiKey = generateApiKey();
  const agent = await prisma.agent.create({
    data: {
      name: "Demo Agent",
      walletAddress,
      apiKeyHash: hashApiKey(apiKey),
      status: "active",
    },
  });

  console.log("Created demo agent:");
  console.log("  id:            ", agent.id);
  console.log("  name:          ", agent.name);
  console.log("  walletAddress: ", agent.walletAddress);
  console.log("  apiKey:        ", apiKey);
  console.log("");
  console.log("Set DEMO_AGENT_API_KEY in your .env (shown once).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
