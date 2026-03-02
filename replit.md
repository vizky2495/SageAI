# Overview

**Content Intelligence Analyst (CIA)** is a marketing funnel analytics application. It ingests daily CSV and Excel (.xlsx) files containing marketing performance data, uses Claude Opus AI to intelligently map columns to the standardized schema, classifies content into funnel stages (TOFU, MOFU, BOFU), computes key metrics per stage, and renders interactive dashboards.

The app has a multi-page architecture:
1. **Dashboard Overview** (`/`) — Clean overview with KPI cards (TOFU/MOFU/BOFU), compact funnel area chart, quick-glance top channels/products, and navigation cards to Analytics & Content Library
2. **Deep Dive Analytics** (`/analytics`) — Full filter bar (stage, type, channel, product, industry, campaign), CTA Breakdown bar charts per stage, Channel/Product/Industry mix cards with stage drilldowns, CTA Analysis table, Top Content tables
3. **Content Library** (`/content-library`) — Browse all content assets by funnel stage, search by content ID, infinite scroll, URL preview
4. **Admin** (`/admin`) — Upload CSVs or Excel files with AI-powered column mapping via Claude Opus

**Shared data hook**: `client/src/hooks/use-funnel-data.ts` exports `useFunnelData()` hook (returns { rows, dataLoading, uploadDiagnostics, byStage }), all shared types (NormalizedRow, FunnelStage, StageKey, TopContentRow, TopByStage, UploadDiagnostics), and utility functions (sum, pct, formatCompact, formatPct, stageMeta). Used by both the Dashboard and Analytics pages.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend

- **Framework**: React 18 with TypeScript, bundled by Vite
- **Routing**: `wouter` (lightweight client-side router)
- **State/Data Fetching**: TanStack React Query for server state management. API calls go through a centralized `apiRequest` helper in `client/src/lib/queryClient.ts`
- **UI Components**: shadcn/ui (new-york style) with Radix UI primitives. All UI components live in `client/src/components/ui/`. Uses a custom "Sage" color palette defined via CSS variables in `client/src/index.css`
- **Styling**: Tailwind CSS v4 (via `@tailwindcss/vite` plugin), with `class-variance-authority` for component variants
- **Charts**: Recharts (Area, Bar charts) for data visualization
- **Animations**: Framer Motion for transitions
- **Fonts**: DM Sans, Geist, Geist Mono (Google Fonts)

## Backend

- **Runtime**: Node.js with Express 5
- **Language**: TypeScript, run via `tsx` in development
- **API Pattern**: RESTful JSON API under `/api/` prefix
  - `/api/assets/upload-excel` — POST: parse Excel (.xlsx) files sent as base64, returns headers + rows
  - `/api/assets/analyze` — POST: sends headers + sample rows to Claude Opus for intelligent column mapping
  - `/api/assets/ingest-mapped` — POST: uses AI-generated column mapping to ingest rows without dropping mismatched columns
  - `/api/insights/summary` — GET: structured JSON truth layer (dataset_info, metric_availability, stage/cta/channel/product breakdowns) used by chatbot
  - `/api/conversations` — GET (with ?agent= filter), POST: conversation CRUD for CIA Agent and Campaign Planner
  - `/api/conversations/:id/messages` — POST: send message with SSE streaming, deterministic pre-checks for missing metrics, grounded context pipeline
- **Validation**: Zod schemas (generated from Drizzle schema via `drizzle-zod`)
- **Dev Server**: Vite dev server is integrated as Express middleware during development (see `server/vite.ts`). In production, static files are served from `dist/public`

## Database

- **Database**: PostgreSQL (required — `DATABASE_URL` environment variable must be set)
- **ORM**: Drizzle ORM with `node-postgres` driver
- **Schema Location**: `shared/schema.ts` — shared between client and server
- **Tables**:
  - `assets_agg` — id (UUID), contentId, stage (TOFU/MOFU/BOFU/UNKNOWN), name, url, typecampaignmember, productFranchise, utmChannel, utmCampaign, utmMedium, utmTerm, utmContent, formName, cta, objective, productCategory, campaignId, campaignName, dateStamp, pageviewsSum, timeAvg, downloadsSum, uniqueLeads, sqoCount, createdAt
  - `conversations` — id (serial), title, agent (cia/planner), createdAt
  - `messages` — id (serial), conversationId, role (user/assistant), content, createdAt
- **Custom Enums**: `funnel_stage` (TOFU, MOFU, BOFU, UNKNOWN)
- **Migrations**: Drizzle Kit with `drizzle-kit push` command (`npm run db:push`). Migration output goes to `./migrations`

## Storage Layer

- `server/storage.ts` defines an `IStorage` interface and `DatabaseStorage` implementation
- All database operations are abstracted through this storage interface, making it possible to swap implementations

## Build System

- **Development**: `npm run dev` starts the Express server with Vite middleware for HMR
- **Production Build**: `npm run build` runs a custom build script (`script/build.ts`) that:
  1. Builds the client with Vite (output to `dist/public`)
  2. Bundles the server with esbuild (output to `dist/index.cjs`), externalizing most dependencies but bundling key ones (listed in allowlist) to reduce cold start times
- **Production Start**: `npm start` runs the bundled server

## Project Structure

```
client/           → React frontend
  src/
    components/   → Shared components (top-nav, ui/)
    hooks/        → Custom React hooks
    lib/          → Utilities (queryClient, utils)
    pages/        → Page components (funnel-dashboard, analytics, content-library-page, admin, not-found)
server/           → Express backend
  index.ts        → Entry point, middleware setup
  routes.ts       → API route registration
  storage.ts      → Database access layer
  db.ts           → Drizzle/PostgreSQL connection
  seed.ts         → Database seeding
  static.ts       → Production static file serving
  vite.ts         → Vite dev server integration
shared/           → Code shared between client and server
  schema.ts       → Drizzle table definitions + Zod schemas
attached_assets/  → Reference documents (agent prompts/specs)
```

# External Dependencies

- **PostgreSQL** — Primary database, connected via `DATABASE_URL` environment variable. Uses `pg` (node-postgres) connection pool
- **Admin authentication** — Upload/ingest routes protected by `requireAdmin` middleware; token-based auth via `POST /api/admin/login` with `ADMIN_PASSWORD` secret; tokens stored in `sessionStorage` as `"admin_token"`
- **Claude AI (Anthropic)** — CIA Agent and Campaign Planner use `claude-sonnet-4-5` via Replit AI integrations (`@anthropic-ai/sdk`). CIA agent uses grounded context from `buildInsightsSummary()` (server/insights.ts) with deterministic pre-checks for missing metrics, fuzzy field matching, and strict data-only system prompt. Conversation history limited to last 4 exchanges to save tokens. Retry logic on failed LLM streams.
- **Chat API**: `GET /api/chat/suggestions` returns dynamic suggested questions and dataset label based on actual data; `GET /api/insights/summary` returns structured JSON truth layer
- **Replit-specific plugins** — `@replit/vite-plugin-runtime-error-modal`, `@replit/vite-plugin-cartographer`, `@replit/vite-plugin-dev-banner` for development on Replit
- **Google Fonts** — DM Sans, Geist, Geist Mono loaded via CDN