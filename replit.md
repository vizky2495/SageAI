# Overview

**Content Intelligence Analyst (CIA)** is a marketing funnel analytics application. It ingests daily CSV and Excel (.xlsx) files containing marketing performance data, uses Claude Opus AI to intelligently map columns to the standardized schema, classifies content into funnel stages (TOFU, MOFU, BOFU), computes key metrics per stage, and renders interactive dashboards.

The app has a multi-page architecture:
1. **Hub** (`/`) — Landing page with three launcher cards: Content Library, Content Performance, Campaign Planner. No TopNav — the hub IS the navigation.
2. **Content Performance** (`/performance`) — Overview with KPI cards (TOFU/MOFU/BOFU), compact funnel area chart, quick-glance top channels/products, and navigation cards to Analytics & Content Library
3. **Deep Dive Analytics** (`/analytics`) — Full filter bar (stage, type, channel, product, industry, campaign), CTA Breakdown bar charts per stage, Channel/Product/Industry mix cards with stage drilldowns, CTA Analysis table, Top Content tables
4. **Content Library** (`/content-library`) — Browse all content assets by funnel stage, search by content ID, infinite scroll, URL preview. Includes a **Content Comparison** tool (collapsible) for uploading two PDFs side by side — extracts text via `pdf-parse`, shows page count, word count, vocabulary overlap percentage, unique words per document, and full extracted text preview.
5. **Campaign Planner** (`/campaign-planner`) — Full-page AI campaign strategy builder using the planner agent (Claude). Conversation list + chat UI.
6. **Feedback** (`/feedback`) — User feedback hub for suggestions and bug reports (admin-only view). Filterable by type and status. Stats overview. Floating quick-submit button on the Hub page only. "View all" link visible only to admins.
7. **My Reports** (`/reports`) — Power BI-style customizable reporting dashboard with multi-page tabs. Users create configurable views by picking chart type (Bar, Stacked Bar, Donut, Table, KPI Cards, Area, Scorecard, Heatmap Matrix), dimension (Stage, Channel, Product, Content Type, Campaign, CTA), measure (Count, Page Views, Leads, SQOs), optional stage filter, and size. Multi-page tabs with rename/duplicate/delete. Drag-and-drop reorder. Per-widget CSV download + global "Extract Data" export. Layout persisted to localStorage (`cia_reports_v2`).
8. **Admin** (`/admin`) — Upload CSVs or Excel files with AI-powered column mapping via Claude Opus

**Shared data hook**: `client/src/hooks/use-funnel-data.ts` exports `useFunnelData()` hook (returns { rows, dataLoading, uploadDiagnostics, byStage }), all shared types (NormalizedRow, FunnelStage, StageKey, TopContentRow, TopByStage, UploadDiagnostics), and utility functions (sum, pct, formatCompact, formatPct, stageMeta). Used by both the Dashboard and Analytics pages.

**Sample data**: `server/seed.ts` populates realistic performance metrics (pageviews, time on page, downloads, leads, SQOs) on uploaded content assets using deterministic hashing. Metrics are shaped by funnel stage (TOFU=high pageviews/low conversion, BOFU=low pageviews/high conversion), channel (Organic/Search boosts), and CTA type (Demo/Trial boost leads). Runs only if metrics are all zero.

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
  - `users` — id (UUID), displayName (unique), isAdmin (boolean), createdAt
  - `conversations` — id (serial), title, agent (cia/planner), userId, createdAt
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
- **Authentication** — Login page gates all app access. Two roles: User (validated against `USER_PASSWORD` secret) and Admin (validated against `ADMIN_PASSWORD` secret). Users enter email + password; new users provide first name + last name and must use @sage.com email addresses (enforced on both client and server). Returning users (email exists in DB) skip name fields and use stored values. Auth context (`client/src/lib/auth.tsx`) provides `{ user, isLoggedIn, isAdmin, login, logout }` where AuthUser includes `id, displayName, firstName, lastName, isAdmin`. Token stored in `localStorage["cia_token"]`, user object in `localStorage["cia_user"]`. Returning users with expired tokens get email pre-filled. Auth module (`server/auth.ts`) manages sessions with 24-hour TTL, hourly cleanup, `requireAuth` middleware (protects ALL API routes), `requireAdmin` middleware (admin-only routes), rate limiting on login (20 attempts per 15 min via `express-rate-limit`), and server-side logout endpoint. `authFetch` helper in `client/src/lib/queryClient.ts` auto-injects Authorization headers on all API calls. Conversation ownership enforced server-side using session userId (not client-provided). Hub page shows personalized time-of-day greeting with user's first name and displays full name (First Last) in user pill. Logout button on Hub page.
- **Claude AI (Anthropic)** — CIA Agent, Campaign Planner, and Content Librarian use `claude-sonnet-4-5` via Replit AI integrations (`@anthropic-ai/sdk`). CIA agent uses strict data-grounded system prompt: 1-3 sentence concise answers, cite sources, structured output (tables/bullets) for data questions, explicit "I don't have enough data" refusals, no hallucination. Uses grounded context from `buildInsightsSummary()` (server/insights.ts) with deterministic pre-checks for missing metrics, fuzzy field matching. Conversation history limited to last 4 exchanges to save tokens. Retry logic on failed LLM streams. Conversation titles are LLM-generated from the user's first message only (5-8 words, title case), with "New Conversation" fallback for vague messages.
- **Campaign Planner (enhanced)** — Campaign Planner AI with comprehensive workflow: gather info (objective, region, industry, product, stage, budget, timeline, channels) → content matching & comparison (like-for-like, performance-ranked, age-flagged) → channel recommendation (data-backed, ranked) → structured campaign plan (executive summary, target audience, channel strategy, content plan, comparison table, timeline, KPIs, budget allocation, risk/recommendations). Follows best practices: A/B testing, platform-specific strategies, content refresh for 6mo+ assets, seasonality. Includes inline budget allocation bar chart (Recharts, parsed from `<!-- BUDGET:{} -->` markers), campaign readiness score (0-100 circular ring + checklist parsed from `<!-- SCORE:XX -->`), and PDF export via jsPDF. Enhanced `buildPlannerContext` includes content-type breakdown, content-type×stage matrix, and expanded top-50 assets with type/objective/name fields.
- **Per-page chat agents**: Each page has its own embedded chat agent via `PageChat` component (Copilot-style right side panel, triggered from a centered bottom pill bar). Content Performance & Analytics use CIA agent, Content Library uses Librarian agent, Campaign Planner has full-page chat. Chat supports image attachments (Paperclip button) — images are sent to Claude as vision content blocks for analysis; displayed as thumbnails in user bubbles with lightbox zoom.
- **Chat API**: `GET /api/chat/suggestions` returns dynamic suggested questions and dataset label based on actual data; `GET /api/insights/summary` returns structured JSON truth layer (includes content_type_mix, content_type_stage_matrix)
- **Replit-specific plugins** — `@replit/vite-plugin-runtime-error-modal`, `@replit/vite-plugin-cartographer`, `@replit/vite-plugin-dev-banner` for development on Replit
- **Google Fonts** — DM Sans, Geist, Geist Mono loaded via CDN