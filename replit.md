# Overview

The **Content Intelligence Analyst (CIA)** is a marketing funnel analytics application designed to optimize content performance. It automates the processing of daily marketing data, intelligently classifies content into funnel stages (TOFU, MOFU, BOFU) using AI, computes key performance metrics, and visualizes insights through interactive dashboards. The application aims to provide marketers with a centralized platform for analyzing content effectiveness, planning campaigns, and managing content, thereby improving marketing ROI. Key capabilities include AI-powered data mapping, multi-page analytics, interactive dashboards with drill-down capabilities, AI-driven content comparison, and campaign strategy generation.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend

-   **Framework**: React 18 with TypeScript and Vite.
-   **UI/UX**: `shadcn/ui` with Radix UI, custom "Sage" color palette, Tailwind CSS v4, Recharts for data visualization, Framer Motion for animations. Dark/Light mode is supported and persisted.
-   **AI Interaction**:
    -   **Unified Chat System**: A single entry-point AI chat accessible via a persistent pill or a fixed bottom-right panel. Features welcome banners, conversation history, fullscreen mode, file attachments, and context escalation from inline insights. **Comparison-Aware Chat**: When a content comparison is active, the Content Librarian chat automatically receives full context (both content texts, comparison analysis results, metadata, engagement data) via `comparison-context-update` CustomEvent. The chat pill shows "Comparison active — ask me" with a compare icon, quick actions switch to comparison-specific prompts, and a context note banner appears. The backend (`buildComparisonContextPrompt`) injects the full comparison context into the Librarian's system prompt using short readable names, enabling detailed follow-up questions about specific content sections, engagement patterns, and strategic recommendations without re-explaining the comparison.
    -   **AI Insights Bar**: A slim glassmorphic bar displaying rotating insights on analytics pages.
    -   **Inline Card Intelligence**: Provides hover insights on content cards, inline chat bubbles with asset context, and a "Compare Mode" for side-by-side content analysis with AI verdicts.
-   **Core Pages**:
    -   **Hub**: Landing page for navigation.
    -   **Content Performance & Deep Dive Analytics**: Dashboards for KPI overview, funnel insights, filtering, and CTA/channel analysis.
    -   **Content Library**: For content browsing, search, and AI-powered comparison. Includes content availability indicators, upload functionality, content coverage metrics, and detailed preview panels (with AI analysis for uploaded content). The Content Comparison feature supports **2–5 content pieces** (default 2 slots, expandable via "Add Content" button). Each slot can upload PDF, select from library, or enter manually. **Short Readable Names**: All comparison labels use AI-generated short names (3-5 words, stripped of CL_ prefixes, segment codes, and metadata). `generateShortName()` is defined in `content-comparison.tsx`, `comparison-pdf.ts`, and `server/routes.ts` + `chat/routes.ts`. Slot 1 = "Baseline" (Teal #006362), Slot 2 = "Challenger" (Jade #00A65C) — role labels shown as subtle secondary text. If short names collide, a stage suffix or numeric disambiguator is added. The AI prompt instructs Claude to use actual content names in verdicts and suggestions, never "Content A/B". For 2-content comparisons, uses the existing full-comparison endpoint with 4-dimension Content Resonance framework. For 3–5 content comparisons, uses the multi-comparison endpoint (`/api/assets/multi-comparison`) providing per-content analysis, cross-content analysis (shared themes, differentiators, content gaps), overall rankings with scores, and "best for" badges. Features **duplicate detection** (90%+ text overlap triggers a prominent alert banner, shortened report skipping redundant sections), and a **metadata health indicator** flagging fields where AI analysis found "Weak" resonance (product/stage/country/industry mismatches). **Standalone Analysis**: Uploading a PDF via "Upload a new PDF" shows a full analysis view (readiness gauge, breakdown bars, performance forecast, recommendations, similar content, overlap risk) before comparison. Users can proceed to comparison or ask the Content Librarian about the analysis. Content text is stored in `content_stored` on library save for chat access.
    -   **Campaign Planner**: An AI-driven tool for generating campaign strategies based on structured briefs. Features guided intake, campaign history, and plan summary dashboards with PDF export.
    -   **Feedback & My Reports & Admin**: Standard pages for user feedback, customizable reports, and administrative tasks like data upload and AI column mapping.

## Backend

-   **Runtime**: Node.js with Express 5, written in TypeScript.
-   **API**: RESTful JSON API for data ingestion, analytics, conversation management, and AI interactions.
-   **Data Ingestion**: Handles Excel uploads, AI-powered column mapping (via Claude Opus), and mapped data ingestion.
-   **Content Storage**: Manages full content retrieval and storage, including fetching from URLs, uploading files (PDF, DOCX, PPTX, images), AI analysis for summaries, topics, CTAs, structure, messaging themes, and structured keyword tag extraction. Content is stored as base64 in PostgreSQL. **Upload Date Tracking**: `dateStored` (immutable, set on first upload) and `dateLastUpdated` (set on every re-upload/update) in `content_stored`. Shown on content cards (relative time) and preview panels (full timestamp). Chat agents include upload dates in their context and distinguish them from content creation dates or engagement data dates. `upsertContent` in `storage.ts` preserves `dateStored` on updates.
-   **Structured Keyword Tags**: AI-generated tags (topic, audience, intent) and user-added tags, visually differentiated and searchable in the Content Library.
-   **Conversations**: CRUD operations for CIA Agent and Campaign Planner conversations with SSE streaming.
-   **Validation**: Zod schemas for data validation.

## Database

-   **Type**: PostgreSQL.
-   **ORM**: Drizzle ORM with `node-postgres`.
-   **Schema**: Includes `assets_agg` (content performance), `users`, `conversations`, `messages`, and `content_stored` tables, with custom enums like `funnel_stage`.
-   **Migrations**: Drizzle Kit.

## Build System

-   **Development**: `npm run dev` (Express + Vite HMR).
-   **Production**: `npm run build` (client/server compilation), `npm start` (bundled server).

## Project Structure

Organized into `client/`, `server/`, `shared/`, and `attached_assets/` directories.

# External Dependencies

-   **PostgreSQL**: Primary database.
-   **Authentication System**: Custom email/password authentication with user/admin roles and session management.
-   **Claude AI (Anthropic)**: Utilized for:
    -   CIA Agent (Performance Analyst) for data-grounded answers. Uses analytics-brief tone: no emojis, no dramatic language, data-first insights, plain section headers, clean tables with observations below, "Summary" labels. 17 strict rules enforced.
    -   Campaign Planner for generating campaign strategies.
    -   Content Comparison for resonance analysis.
    -   Content Librarian for classification, comparison, and recommendations. Has full access to all uploaded content analysis (summaries, topics, CTAs, messaging themes, structure, keyword tags) via `buildContentLibraryContext()`. Capped at 50 assets with truncated summaries for prompt stability.
    -   Supports image attachments for vision-based analysis.
    -   Uses Replit AI integrations for API access.
-   **Google Fonts**: DM Sans, Geist, Geist Mono.