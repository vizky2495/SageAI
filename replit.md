# Overview

**Content Intelligence Analyst (CIA)** is a marketing funnel analytics application. It ingests daily CSV files containing marketing performance data, classifies content into funnel stages (TOFU, MOFU, BOFU), computes key metrics per stage, and renders interactive dashboards. It also includes a **Prompt Studio** for managing and versioning AI prompt configurations used by the Content Intelligence Analyst agent, with collaborator tracking.

The app has two main pages:
1. **Funnel Dashboard** (`/`) — Upload CSVs, visualize funnel metrics with charts and tables, filter by stage/product/channel.
2. **Prompt Studio** (`/prompt-studio`) — CRUD interface for prompt versions and collaborators, supporting version tagging, compiled prompt content, and risk-level tracking.

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
  - `/api/versions` — CRUD for prompt versions (GET, POST, PATCH, DELETE)
  - `/api/collaborators` — CRUD for collaborators (GET, POST, PATCH, DELETE)
  - `/api/compile` — POST: deterministic compilation of collaborator layers into a single prompt
  - `/api/diff/:versionId/:compareId` — GET: line-level diff between two versions
- **Validation**: Zod schemas (generated from Drizzle schema via `drizzle-zod`)
- **Dev Server**: Vite dev server is integrated as Express middleware during development (see `server/vite.ts`). In production, static files are served from `dist/public`

## Database

- **Database**: PostgreSQL (required — `DATABASE_URL` environment variable must be set)
- **ORM**: Drizzle ORM with `node-postgres` driver
- **Schema Location**: `shared/schema.ts` — shared between client and server
- **Tables**:
  - `prompt_versions` — id (UUID), tag, author, summary, status (draft/released/latest), promptsCount, compiledSize, compiledContent, createdAt
  - `collaborators` — id (UUID), name, initials, file, focus, risk (low/medium/high), layerContent, lastEditedAt
- **Custom Enums**: `version_status` (draft, released, latest), `risk_level` (low, medium, high)
- **Migrations**: Drizzle Kit with `drizzle-kit push` command (`npm run db:push`). Migration output goes to `./migrations`
- **Seeding**: `server/seed.ts` provides initial data for prompt versions and collaborators

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
    pages/        → Page components (funnel-dashboard, prompt-studio, not-found)
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
- **No authentication** — The app currently has no auth mechanism; all API endpoints are open
- **No external AI API calls in current code** — The attached assets describe an AI agent persona, but the current codebase handles CSV parsing and prompt management locally. The build script includes `@google/generative-ai` and `openai` in its bundle allowlist, suggesting planned AI integrations
- **Replit-specific plugins** — `@replit/vite-plugin-runtime-error-modal`, `@replit/vite-plugin-cartographer`, `@replit/vite-plugin-dev-banner` for development on Replit
- **Google Fonts** — DM Sans, Geist, Geist Mono loaded via CDN