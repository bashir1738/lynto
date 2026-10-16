# Lynto

**Payments for autonomous software.**  
Deposit USDC. Use APIs. Settle automatically.

Lynto is a prepaid payment layer for AI agents and software services on [Arc](https://docs.arc.io) (Circle's USDC-native EVM L1). An agent owner deposits USDC once; the agent consumes paid APIs with offchain metering; the provider collects accumulated charges through **batched onchain settlement** — one settlement transaction per batch, not one per request.

---

## What's built

**Contracts** (`contracts/`)
- `LyntoPayments.sol` — OpenZeppelin v5, Solidity 0.8.28, `ReentrancyGuard` + CEI. Deposit / withdraw / reserve / release / settle with unique-batch-id double-charge protection and per-agent accounting.
- **61 passing Foundry tests** (deposits, withdrawals, reserve/release, settlement, duplicate batches, multi-agent, fuzz invariants).

**Backend** (`app/api`, `lib/`)
- Paid metering endpoint (`/api/paid-data`) with API-key auth, per-call USDC charging, and `x-request-id` idempotency.
- Settlement engine: threshold + manual batching, reserve sync, failed-batch retry with fresh batch IDs, offchain↔onchain reconciliation.
- Operator health endpoint (`/api/system/status`): key status, contract reachability, batch counts, reserve lag, accounting integrity.

**Dashboard** (`app/(app)`)
- **Overview** — 5-step live payment pipeline (Deposit → Meter → Reserve → Settle → Provider), key stats, agents grid, provider revenue, operator panel, funding panel.
- **Agents** — register (API key shown once), per-agent detail, deposit/withdraw.
- **Settlements** — filterable history, failed-batch retry, force reserve sync.
- **Integration** — quickstart, TypeScript SDK, curl + viem snippets, HTTP API reference.
- Mobile-responsive shell (collapsible sidebar drawer), skeleton shimmer loading, Celo yellow/black design system, Source Serif 4.

**Landing page** (`app/page.tsx`)
- Minimal yellow/black redesign, interactive savings calculator, code snippets, FAQ, animated logo cube.

---

## How it works

```
┌────────────┐  deposit USDC   ┌──────────────────┐
│ Agent owner│ ───────────────▶│  LyntoPayments   │  (prepaid balance escrow)
└────────────┘                 │  contract on Arc │
                               └────────┬─────────┘
                                        │ reserved / settle
┌────────────┐  paid API call  ┌───────▼──────────┐   accrue usage
│ Agent      │ ───────────────▶│  Next.js metering │ ─────────────┐
│ (Node/TS)  │ ◀───────────────│  backend          │              │
└────────────┘  data + charge  └───────┬──────────┘              │
                                       │ batch when threshold     │
                               ┌───────▼──────────┐              │
                               │  settle(batchId) │◀─────────────┘
                               │  → provider USDC │
                               └──────────────────┘
```

1. **Deposit** — The agent owner approves USDC and calls `deposit(amount)`. Funds enter the prepaid balance keyed by the agent wallet address.
2. **Meter** — Each successful paid API call records a usage row (price in integer 6-decimal USDC units). Failed calls are not charged. Retries with the same `x-request-id` are idempotent.
3. **Reserve** — Accrued unsettled usage is synced onchain via `reserve()`, locking funds so they cannot be withdrawn before settlement.
4. **Settle** — When the threshold is reached (or manually), the operator submits one `settle(agent, amount, batchId)` transaction. Unique batch IDs prevent double settlement.
5. **Withdraw** — Unreserved funds can be withdrawn by the agent at any time.

---

## Repository layout

```
lynto/
├── app/                    # Next.js App Router (UI + API route handlers)
│   ├── api/
│   │   ├── paid-data/      # GET/POST paid market-data endpoint
│   │   ├── usage/[agent]/  # Usage stats for an agent
│   │   ├── settle/         # Create + execute settlement batches
│   │   ├── agents/         # List/register agents
│   │   ├── overview/       # Dashboard aggregates
│   │   ├── settlements/    # Settlement history
│   │   ├── withdraw-prep/  # Sync reservations before withdrawal
│   │   └── system/status/  # Operator health & hardening endpoint
│   ├── (app)/              # Authenticated dashboard shell
│   │   ├── dashboard/      # Overview: live flow, stats, operator panel
│   │   ├── agents/         # Agent management + registration form
│   │   ├── transactions/   # Settlement history UI + hardening controls
│   │   └── integration/    # Quickstart, SDK, curl/viem, API reference
│   ├── page.tsx            # Public landing page
│   └── layout.tsx          # Root layout (Source Serif 4, favicon)
├── components/
│   ├── app-shell.tsx       # Dashboard shell: sidebar + header + mobile drawer
│   ├── sidebar-nav.tsx     # Sidebar navigation
│   ├── live-flow.tsx       # 5-step live payment pipeline
│   ├── operator-panel.tsx  # Operator status, settle, reserve-sync controls
│   ├── funding-panel.tsx   # Deposit / withdraw UI
│   ├── code-block.tsx      # Copyable code snippets
│   ├── wallet-connect.tsx  # RainbowKit connect button
│   └── ui/primitives.tsx   # Card, Stat, Badge, Skeleton, EmptyState…
├── lib/                    # arc.ts, contract.ts, db.ts, metering.ts, settlement.ts, auth.ts, wagmi.ts, theme.ts, utils.ts
├── prisma/                 # PostgreSQL schema
├── contracts/              # Foundry project (LyntoPayments.sol)
│   ├── src/LyntoPayments.sol
│   ├── test/LyntoPayments.t.sol   # 61 tests
│   └── script/Deploy.s.sol
├── scripts/
│   ├── seed.ts             # Register demo agent, print API key once
│   ├── demo-agent.ts       # Autonomous client that pays for API access
│   └── e2e-test.ts         # End-to-end checks against local anvil
└── .env.example
```

---

## Verified Arc network parameters

Confirmed from [Arc docs](https://docs.arc.io) and [Circle USDC addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses):

| Parameter | Value |
| --- | --- |
| Arc mainnet chain ID | `5042` |
| Arc testnet chain ID | `5042002` |
| Arc mainnet RPC | `https://rpc.mainnet.arc.io` |
| Arc testnet RPC | `https://rpc.testnet.arc.io` |
| USDC ERC-20 address (mainnet & testnet) | `0x3600000000000000000000000000000000000000` |
| USDC ERC-20 decimals | `6` |
| Mainnet explorer | https://explorer.arc.io |
| Testnet explorer | https://explorer.testnet.arc.io |

**Important:** On Arc, native USDC is the gas token (18 decimals for gas accounting). The ERC-20 interface at `0x3600…0000` uses **6 decimals** and is what Lynto uses for all prepaid accounting. Never mix the 18-decimal gas precision with 6-decimal ERC-20 amounts.

---

## Smart contract: `LyntoPayments.sol`

OpenZeppelin v5 · Solidity 0.8.28 · `ReentrancyGuard` + CEI pattern.

### Functions

| Function | Access | Description |
| --- | --- | --- |
| `deposit(amount)` | agent | `transferFrom` USDC, credit prepaid balance |
| `withdraw(amount)` | agent | Withdraw **unreserved** funds only |
| `reserve(agent, amount)` | operator | Lock funds for accrued unsettled usage |
| `release(agent, amount)` | operator | Unlock reserved funds (invalidated usage) |
| `settle(agent, amount, batchId)` | operator | Pay provider from reserved balance; mark batch settled |
| `setOperator(op, authorized)` | owner | Manage settlement operators |
| `setProvider(addr)` | owner | Update provider payout address |
| `balanceOf / reservedOf / availableOf` | view | Accounting views |

### Accounting model

Per agent (all values in USDC base units, 6 decimals):

| Concept | Storage | Meaning |
| --- | --- | --- |
| Total deposited | `totalDeposited` | Cumulative deposits |
| Prepaid balance | `balances` = deposited − withdrawn − settled | Funds held in contract |
| Reserved | `reserved` | Locked for accrued but unsettled API usage |
| Available | `availableOf` = balance − reserved | Withdrawable now |
| Settled | `totalSettled` | Paid out to provider |
| Withdrawn | `totalWithdrawn` | Returned to agent wallet |

**Critical rule:** Users cannot withdraw funds already reserved for accrued usage. The backend syncs `reserve()` before settlement and before the withdraw UI shows an available amount.

### Security properties (tested)

- Unique `batchId` prevents duplicate settlement (`BatchAlreadySettled`)
- Settlement amount cannot exceed `reserved[agent]`
- Unauthorized operators cannot reserve, release, or settle
- Zero amounts and zero addresses rejected
- No admin withdrawal of user deposits
- `nonReentrant` + checks-effects-interactions on all state-changing paths
- Accounting conservation invariant: `balance = deposited − withdrawn − settled`

**Trust model (MVP):** The settlement operator meters usage offchain and is trusted to report accurate amounts. This is **not** a trustless system. Batch IDs and reservations prevent operator double-charge of the same batch and user withdrawal of accrued funds, but the operator can still under/over-report relative to a fully decentralized metering system. Independent audits are recommended before large-value production use.

---

## Prerequisites

- Node.js ≥ 20, pnpm ≥ 9
- Foundry (`forge`, `cast`, `anvil`)
- PostgreSQL 14+
- A wallet with USDC on Arc (for mainnet demo)

---

## Setup

### 1. Install dependencies

```bash
# App (pnpm)
pnpm install

# Contracts (npm)
cd contracts && npm install && cd ..
```

### 2. Database

```bash
# Create a Postgres DB, then:
cp .env.example .env
# edit DATABASE_URL
pnpm db:push          # creates tables
pnpm db:generate      # generates Prisma client (also run by db:push)
```

### 3. Configure environment

Copy `.env.example` → `.env` and set:

- `DATABASE_URL`
- `LYNTO_CONTRACT_ADDRESS` / `NEXT_PUBLIC_LYNTO_CONTRACT_ADDRESS` (after deploy)
- `OPERATOR_PRIVATE_KEY` — **server-side only**, address must be authorized via `setOperator`
- `PROVIDER_ADDRESS` — receives settled USDC
- `ARC_CHAIN_ID` — `5042` mainnet, `5042002` testnet, `31337` local anvil

### 4. Deploy the contract

**Local (anvil):**

```bash
anvil &
cd contracts
export ANVIL_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
# Deploy MockUSDC + LyntoPayments (see scripts above or use forge create --broadcast)
```

**Arc testnet / mainnet:**

```bash
cd contracts
export USDC_ADDRESS=0x3600000000000000000000000000000000000000
export PROVIDER_ADDRESS=0xYourProvider
export OWNER_ADDRESS=0xYourOwner
export OPERATOR_ADDRESS=0xYourOperatorBackend

# Testnet
ARC_TESTNET_RPC=https://rpc.testnet.arc.io npm run deploy:testnet

# Mainnet (use small amounts!)
ARC_RPC=https://rpc.mainnet.arc.io npm run deploy:mainnet
```

Then set the deployed address in `.env` and authorize the operator from the owner account if it wasn’t done in the deploy script:

```bash
cast send $LYNTO_CONTRACT_ADDRESS "setOperator(address,bool)" $OPERATOR true \
  --rpc-url https://rpc.mainnet.arc.io --private-key $OWNER_KEY
```

### 5. Seed the demo agent

```bash
export DEMO_AGENT_WALLET_ADDRESS=0xYourAgentWallet
pnpm db:seed
# → prints API key ONCE; put it in .env as DEMO_AGENT_API_KEY
```

### 6. Run

```bash
pnpm dev          # Next.js on :3000
pnpm demo-agent   # autonomous paid-API client
```

---

## Testing

### Contract tests (Foundry)

```bash
cd contracts
npm run test          # 61 tests: deposits, withdrawals, reserve/release,
                      # settlement, duplicate batches, multi-agent, fuzz invariants
npm run test:gas
```

### Backend / E2E (local anvil)

1. Start anvil, deploy MockUSDC + LyntoPayments, set `OPERATOR_PRIVATE_KEY` to an anvil key authorized as operator.
2. Seed an agent, fund + deposit USDC via `cast`.
3. `pnpm dev` then `pnpm demo-agent`, or run the scripted checks in `scripts/e2e-test.ts`.

Verified locally:

| Scenario | Result |
| --- | --- |
| Unauthorized request | `401` |
| Successful paid request | `200`, charged, usage recorded |
| Idempotent retry (`x-request-id` reuse) | `duplicate: true`, not recharged |
| 20 concurrent requests | `20/20` OK (row-locked spending limit) |
| Batch settlement | Confirmed onchain tx, batch marked confirmed |
| Duplicate batch prevention | Unique batch IDs; re-settle finds no eligible records |
| Offchain ↔ onchain reconciliation | Settled sums match |
| Unfunded agent | `402` |

### Demo agent

```bash
pnpm demo-agent                     # local mode
LYNTO_MODE=mainnet pnpm demo-agent  # requires HTTPS app URL + real keys
```

---

## API reference (MVP)

| Route | Method | Auth | Description |
| --- | --- | --- | --- |
| `/api/paid-data` | GET/POST | `x-agent-api-key` | Paid market data; charges `0.001 USDC` per successful call |
| `/api/usage/[agent]` | GET | optional key | Usage stats + onchain balances |
| `/api/settle` | POST | operator (server key) | Create + execute settlement batch(es) |
| `/api/agents` | GET/POST | open (demo) | List / register agents |
| `/api/overview` | GET | — | Dashboard aggregates |
| `/api/settlements` | GET | — | Settlement history + explorer links |
| `/api/withdraw-prep` | POST | — | Force reserve sync, return withdrawable amount |
| `/api/system/status` | GET | — | Operator health, batch counts, reserve lag, accounting integrity |

**Request headers for paid calls:**

```
x-agent-api-key: lynto_...
x-request-id: <uuid>    # idempotency key (recommended)
```

---

## Arc Studio

Lynto’s contract was developed with Foundry and reviewed against Arc/Circle documentation. [Arc Studio](https://studio.arc.io) can be used to generate, review, test, and deploy the contract, and to scaffold app wiring:

```bash
npm install -g @circle-fin/arc-studio-cli
arc-studio login          # browser device-link
arc-studio run "Review contracts/src/LyntoPayments.sol for accounting and reentrancy issues" \
  --file contracts/src/LyntoPayments.sol \
  --output json
arc-studio deployments    # list Studio deploys (Arc testnet)
```

Arc Studio deploys to **Arc testnet only**. Mainnet deployment is performed by you with Foundry/`cast` using your own keys, after independent review.

---

## Mainnet demonstration checklist

1. Connect wallet on Arc mainnet (chain `5042`).
2. Approve + deposit a small USDC amount (e.g. `1 USDC`).
3. Run `pnpm demo-agent` (e.g. `DEMO_AGENT_CALLS=100`).
4. Watch the usage counter increase with **zero** onchain txs per API call.
5. Trigger settlement (manual button or auto at threshold).
6. Confirm the settlement tx on https://explorer.arc.io.
7. Verify the hash appears in the dashboard and links to the explorer.
8. Reconcile remaining available balance.
9. Withdraw unused unreserved funds.

Only claim a transaction as successful after its onchain receipt is verified (`status: success`).

---

## Grant deliverables

| Deliverable | Where |
| --- | --- |
| Arc Studio project | [studio.arc.io](https://studio.arc.io) (create/link project; CLI: `arc-studio deployments`) |
| Live app URL | Deploy this Next.js app (Vercel/Fly/etc.) + managed Postgres |
| Contract address | Set after mainnet deploy; shown in `Deploy.s.sol` logs |
| Settlement tx hash | Dashboard → Settlements; also `demo-agent` output |
| GitHub repository | This repo |
| Setup / test / deploy docs | This README |

---

## Scope (MVP boundaries)

- One network: Arc mainnet (testnet for development)
- One token: USDC (6-decimal ERC-20 interface)
- One demo agent, one paid endpoint, one provider
- Batched settlement + deposit/withdraw
- Single dashboard

Out of scope for v1: marketplace, governance, multi-provider routing, pricing tiers.

---

## Honest limitations & trust assumptions

1. **Operator-trusted metering.** Usage is recorded offchain by the Lynto backend. The operator is authorized to `reserve` and `settle`. A malicious operator could settle reserved amounts inaccurately; users should monitor `Settled` events.
2. **Reserve sync lag.** Onchain `reserved` is synced periodically and forced before withdrawal prep. A user who bypasses the UI and calls `withdraw` directly onchain between syncs could withdraw funds not yet reserved (the UI path prevents this; a fully hardened design would make every withdraw path backend-aware).
3. **Single operator key.** The operator private key lives in the server environment. Compromise of that key allows unauthorized settlements within reserved balances.
4. **No formal audit.** Tests pass and the design follows CEI + OpenZeppelin guards, but this is unaudited software. Do not secure large value without an independent audit.
5. **API auth is API-key based** (hashed at rest). Signed-request auth with agent wallets is a natural upgrade path.

---

## License

MIT
