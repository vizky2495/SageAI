# Overview

**Content Intelligence Analyst (CIA)** is a marketing funnel analytics application designed to optimize content performance. It processes daily marketing data (CSV/Excel), intelligently maps and classifies content into funnel stages (TOFU, MOFU, BOFU) using AI, computes key performance metrics, and presents these insights through interactive dashboards. The application aims to provide a centralized platform for marketers to analyze content effectiveness, plan campaigns, and manage their content library, ultimately driving improved ROI on marketing efforts.

Key capabilities include:
- Ingestion and AI-powered mapping of diverse marketing data.
- Multi-page architecture for comprehensive analytics, content library management, and campaign planning.
- Interactive dashboards with drill-down analytics and customizable reporting.
- AI-driven content comparison for new assets and campaign strategy generation.
- User feedback and administrative functionalities.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend

- **Framework**: React 18 with TypeScript and Vite.
- **Routing**: Lightweight client-side routing with `wouter`.
- **State Management**: TanStack React Query for server state.
- **UI Components**: `shadcn/ui` with Radix UI primitives, custom "Sage" color palette, and Tailwind CSS v4 for styling.
- **Data Visualization**: Recharts for interactive charts.
- **Animations**: Framer Motion for UI transitions.
- **Fonts**: DM Sans, Geist, Geist Mono.
- **Pages**:
    - **Hub (`/`)**: Landing page with personalized greeting, navigation cards, "Upload & Evaluate Content" banner (links to campaign planner with upload pre-selected), recent activity feed, collapsible "Getting Started" guide, and light/dark theme toggle.
    - **Content Performance (`/performance`)**: KPI overview and high-level funnel insights.
    - **Deep Dive Analytics (`/analytics`)**: Detailed filtering and CTA/channel/product analysis.
    - **Content Library (`/content-library`)**: Content browsing, search, and an AI-powered Content Comparison tool. The comparison estimates new content performance against existing assets and provides strategic recommendations. PDF upload uses multi-stage extraction (pdfjs primary, raw buffer fallback), processes max 20 pages for large files (up to 50MB), and offers manual content entry as a fallback when extraction fails.
    - **Campaign Planner (`/campaign-planner`)**: AI-driven campaign strategy builder. Features guided intake form (objective, product, market, industry, funnel stage, content type, approach, budget, timeline) that sends structured briefs to the planner agent. Campaign history list shows auto-generated titles from parameters, Draft/Complete status tags with colored left borders, summary lines with channel mix and readiness scores, and content type icons. Completed plans show a summary dashboard card with objective/product/market metadata, readiness score, channel chips, and prominent Download PDF and Continue buttons. Sage green primary actions.
    - **Feedback (`/feedback`)**: User feedback submission and admin review.
    - **My Reports (`/reports`)**: Customizable, multi-page reporting dashboard with various chart types and data export.
    - **Admin (`/admin`)**: Data upload and AI-powered column mapping.

## Backend

- **Runtime**: Node.js with Express 5, written in TypeScript.
- **API Pattern**: RESTful JSON API (`/api/`) for data ingestion, analytics summaries, conversation management, and AI interaction.
- **Data Ingestion**: Handles Excel uploads, AI-powered column mapping via Claude Opus, and ingestion of mapped data.
- **Insights**: Provides structured JSON summaries for chatbot grounding.
- **Conversations**: CRUD operations for CIA Agent and Campaign Planner conversations, supporting SSE streaming for messages.
- **Validation**: Zod schemas for data validation.
- **Development**: Vite dev server integrated as Express middleware for HMR.
- **Production**: Static file serving from `dist/public`.

## Database

- **Type**: PostgreSQL (required via `DATABASE_URL`).
- **ORM**: Drizzle ORM with `node-postgres` driver.
- **Schema**: Defined in `shared/schema.ts`, including `assets_agg` (content performance data), `users`, `conversations`, and `messages` tables.
- **Custom Enums**: `funnel_stage` (TOFU, MOFU, BOFU, UNKNOWN).
- **Migrations**: Drizzle Kit for schema management.

## Storage Layer

- Abstracted database operations through an `IStorage` interface and `DatabaseStorage` implementation for flexibility.

## Build System

- **Development**: `npm run dev` starts Express with Vite for HMR.
- **Production**: `npm run build` compiles client (Vite) and server (esbuild) into a `dist/` directory. `npm start` runs the bundled server.

## Project Structure

Organized into `client/` (React frontend), `server/` (Express backend), `shared/` (common code), and `attached_assets/` (reference documents).

# External Dependencies

-   **PostgreSQL**: Primary database for all application data, accessed via `node-postgres`.
-   **Authentication System**: Custom email/password authentication with user/admin roles, session management, rate limiting, and secure token storage.
-   **Claude AI (Anthropic)**: Utilized via Replit AI integrations for:
    -   **CIA Agent**: Provides concise, data-grounded answers within dashboards.
    -   **Campaign Planner**: Generates comprehensive campaign strategies with a senior strategist persona, including budget allocations, readiness scores, and PDF export with Sage branding.
    -   **Content Librarian**: Powers content classification, comparison, and recommendation within the Content Library.
    -   Supports image attachments for vision-based analysis.
-   **Replit-specific Plugins**: For development environment enhancements (e.g., error modal, cartographer, dev banner).
-   **Google Fonts**: DM Sans, Geist, Geist Mono for consistent typography.