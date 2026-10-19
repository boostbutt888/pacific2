# Pacific2

Multi-tenant, web-based F&B SaaS (POS, self-order kiosk, KDS, QMS, QR ordering, Back Office). A STYL product line.

**State: repo skeleton, `0.7.0` (Architecture phase, Gate G5).** Only the money/tax package has real logic. Every other app is a shell. Feature work follows the T-### tasks in `docs/tech/SPRINT_PLAN.md`.

Design docs live next to this repo, in `../docs/` (the docs workspace is not part of this repo):

- `docs/tech/ARCHITECTURE.md`, `docs/tech/adr/`, `docs/tech/DATA_MODEL.md`, `docs/tech/API.md`, `docs/tech/SECURITY.md`
- `docs/tech/SPRINT_PLAN.md` (T-### tasks), `docs/tech/BUILD_LOG.md`

## Layout

| Path                 | What                                                                                                        | Stack                |
| -------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------- |
| `apps/api`           | REST `/v1` API. Later also runs the realtime gateway and the worker as separate entry points (ADR-003)      | NestJS 10, Node 22   |
| `apps/backoffice`    | Back Office + Site Builder, static export, all data via the API (ADR-001 R1)                                | Next.js 15, React 19 |
| `apps/pos`           | Counter POS PWA (offline cash, ADR-007)                                                                     | React 19 + Vite 6    |
| `apps/sok`           | Self-order kiosk PWA                                                                                        | React 19 + Vite 6    |
| `apps/kds`           | Kitchen display PWA                                                                                         | React 19 + Vite 6    |
| `apps/qms`           | Queue board PWA                                                                                             | React 19 + Vite 6    |
| `apps/cop`           | Customer ordering portal (Pickup QR) + status page                                                          | React 19 + Vite 6    |
| `packages/money`     | Integer-cent money, GST per store order, largest-remainder allocation, cash rounding, gateway fee (ADR-009) | TypeScript, Vitest   |
| `packages/tokens`    | Design tokens synced from `docs/ui/tokens.json` (G4 approved)                                               | JSON + CSS variables |
| `packages/contracts` | Shared enums and real-time event schemas                                                                    | zod                  |

## Prerequisites

- Node.js 22 LTS (`.nvmrc`). Node 24 also works locally.
- pnpm 9 via Corepack: `corepack enable` (or `corepack pnpm <command>` if you cannot write to the Node folder).
- Docker (for PostgreSQL 16 and Redis 7, from Sprint 0 task work onward).

## Setup

```bash
corepack enable
pnpm install
pnpm lint          # ESLint, zero warnings allowed
pnpm typecheck     # tsc --noEmit in every package
pnpm test          # Vitest: money worked examples W1-W25 + invariants, tokens, contracts, api
pnpm build         # Vite builds, Next static export, Nest build
```

Run one app: `pnpm --filter @pacific2/pos dev` (ports: api 3000, backoffice 3001, pos 5101, sok 5102, kds 5103, qms 5104, cop 5105).

Local services: copy `.env.example` to `.env`, set a local password, then `docker compose up -d`.

Sync design tokens after a UI change: `pnpm tokens:sync` (copies `../docs/ui/tokens.json` and `tokens.css`).

## Rules (code-review gate, `agents/tech-lead.md`)

1. Tenant isolation: every tenant table has `operator_id` and forced RLS; the isolation suite must pass 100% (ADR-002, SECURITY.md).
2. No secrets in the repo. `.env` is git-ignored; CI runs gitleaks. Deployed secrets come from AWS Secrets Manager.
3. Idempotent order creation: client UUIDv7 ids double as `Idempotency-Key` (ADR-007, API.md §1.3).
4. Money in integer cents with explicit rounding; floats, `toFixed` and `Math.round` are lint errors in `packages/money`.
5. GST and service charge are unit-tested against the ADR-009 worked examples.
6. Lint and type-check clean; QA smoke passes before a build is tagged (`BUILD_LOG.md`).

## Remote

Local only until Sun 2026-11-01 (D-106). Then pushed to the private repo `pacific2` in the STYL GitHub organisation (D-073). Do not add a remote before the org name is confirmed.
