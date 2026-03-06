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
- **Theming**: Dark/Light mode toggle with `ThemeProvider` (`client/src/lib/theme.tsx`). Persisted in `localStorage` (`cia-theme`). Flash prevention script in `index.html`. Toggle button in TopNav.
- **Animations**: Framer Motion for UI transitions.
- **Fonts**: DM Sans, Geist, Geist Mono.
- **AI Interaction (Unified Chat System)**: Single entry-point AI chat in `PageChat` component (`client/src/components/page-chat.tsx`):
    - **Welcome Banner**: Glassmorphic 320px card, fixed bottom-right, slides in 2s after page load. Shows data-driven greeting with real asset counts/SQO metrics from `GET /api/greeting-stats`. Contextual per agent (Content Librarian, Performance Analyst, Campaign Strategist). Two action buttons: primary action + "Open chat". Auto-minimizes to pill after 10s. Shows once per session per page (tracked in `sessionStorage`).
    - **Persistent Chat Pill**: After banner dismisses, 200px pill with CIA avatar + agent name + green active dot. Subtle pulse animation every 60s. Click opens chat panel. Always visible when chat is closed.
    - **Chat Panel** (⌘J): Right-side 420px × 65vh panel, fixed bottom-right. Glassmorphic bg `rgba(10,12,10,0.95)`, no overlay on page content. Conversation history sidebar (240px), fullscreen toggle, new conversation button. Supports file attachments, image lightbox, markdown tables, verdict badges. 4 quick-action starter chips + suggested prompts in empty state.
    - **Fullscreen Mode**: Expands chat to full viewport. Exit returns to corner panel.
    - **Context escalation**: Inline card chat → full chat via `window.dispatchEvent('open-full-chat')`. Auto-generated conversation titles (5-8 words via AI, first 6 words as fallback).
  - **AI Insights Bar** (`client/src/components/ai-insights-bar.tsx`): Slim 48px glassmorphic bar with rotating insights (crossfade every 8s), left/right nav. Backend `GET /api/ai-insights?page=` with 5-min cache. Shown on Content Library, Performance, and Analytics pages.
  - **Inline Card Intelligence** (in `content-library.tsx`):
    - **Hover Insights**: After 1.5s hover, glassmorphic tooltip with AI insight, performance bar (green/amber/red), micro-action buttons (Ask/Compare/Plan). Backend `GET /api/assets/:id/insight` with 5-min cache.
    - **Inline Chat Bubble**: Click "Ask" → 280px chat widget attached to card with asset context. Quick suggestions, streaming AI responses, "Continue in full chat →" escalation.
    - **Compare Mode**: Click "Compare" → card 1 selected with green pulsing border → click card 2 → glassmorphic comparison panel with side-by-side metrics table, AI verdict, action buttons (Deep dive/Plan with winner/Close). Backend `POST /api/assets/compare`.
- **Pages**:
    - **Hub (`/`)**: Landing page with navigation to core modules.
    - **Content Performance (`/performance`)**: KPI overview and high-level funnel insights. Full-width layout with AI Insights Bar and AI chat pill/banner.
    - **Deep Dive Analytics (`/analytics`)**: Detailed filtering and CTA/channel/product analysis. Full-width layout with AI Insights Bar and AI chat pill/banner. Includes Content Journey Mapping placeholder section (requires marketing automation integration for user-level touchpoint sequence data to enable Sankey flow visualization, journey rankings, and drop-off analysis).
    - **Content Library (`/content-library`)**: Content browsing, search (with Product/Campaign/Channel/Industry/Content Status filters), and an AI-powered Content Comparison tool. Full-width layout with AI Insights Bar, AI chat pill/banner (Content Librarian agent), inline card hover insights, inline chat bubble, and compare mode.
      - **Content Availability Indicators**: Cards show clean 8px status dots — green filled circle for uploaded/analyzed content (tooltip: "Content uploaded — preview and analysis available"), gray outlined circle with "+" for no content (tooltip: "Content not uploaded — click to add"). Cards with content show summary, topic tags, and CTA pill; cards without content show only engagement metrics (clean, no empty states).
      - **Card Upload Popover**: Clicking the gray "+" opens a compact popover with asset name, drag-and-drop zone, file size/name feedback during upload, and error state with "Try again" button.
      - **Content Coverage Indicator**: Progress bars above stage carousels showing "Content uploaded: X of Y" per stage (TOFU/MOFU/BOFU) with thin green progress bars.
      - **Content Availability Filter**: Dropdown in filter panel to show "All assets", "With content", or "Without content" — backend-supported via `contentAvailability` query param.
      - **Preview Panel (no content)**: Inviting upload prompt with muted-green icon, large drag-and-drop zone, collapsible URL fetch secondary option, full engagement metrics grid (6 metrics), and action buttons (Compare performance only, Ask AI).
      - **Preview Panel (with content)**: PDF viewer/content preview, AI analysis (summary, topics, CTA, structure, messaging themes), engagement metrics, download/re-fetch/source links, prominent "Upload new version" section.
      - Content Comparison uses a 4-dimension Content Resonance framework (Country, Industry, Funnel Stage, Product) to answer "Which content will resonate better with my target audience and why?" Flow: intake (3 content approaches: upload PDF, select from library, enter manually) → baseline selection → comparison results with 6 sections. `POST /api/assets/full-comparison` endpoint accepts `country`/`industry` for both assets, fetches stored content, calls Claude for resonance-based analysis. Response shape: `{ nameA, nameB, contentOverview, resonanceAssessment, topicRelevance, sharedAndDifferent, verdict, suggestions, metricsA, metricsB, metadata }`. Each resonance dimension rated Strong/Moderate/Weak with explanation. Source tags: `[Source: Content Analysis]`, `[Source: Internal Data]`, `[Source: AI Recommendation]`. PDF download (`client/src/lib/comparison-pdf.ts`) generates Sage-branded 7-page report with jsPDF (black bg, green accents, branded cover). "Plan Campaign" button opens `CampaignContextModal` with pre-filled parameters, editable fields, content selection checkboxes, and comparison insights textarea. On submit, stores full context to `sessionStorage` (`cia-campaign-context`) and navigates to Campaign Planner, which auto-detects the context, skips intake form, shows a comparison banner, creates a conversation with the full structured prompt (resonance assessment, verdict, suggestions, metrics, overview), and triggers AI plan generation immediately.
    - **Campaign Planner (`/campaign-planner`)**: AI-driven campaign strategy builder. Features guided intake form (objective, product, market, industry, funnel stage, content type, approach, budget, timeline) that sends structured briefs to the planner agent. Campaign history list shows auto-generated titles from parameters, Draft/Complete status tags with colored left borders, summary lines with channel mix and readiness scores, and content type icons. Completed plans show a summary dashboard card with objective/product/market metadata, readiness score, channel chips, and prominent Download PDF and Continue buttons. Sage green primary actions.
    - **Feedback (`/feedback`)**: User feedback submission and admin review.
    - **My Reports (`/reports`)**: Customizable, multi-page reporting dashboard with various chart types and data export.
    - **Admin (`/admin`)**: Data upload and AI-powered column mapping.

## Backend

- **Runtime**: Node.js with Express 5, written in TypeScript.
- **API Pattern**: RESTful JSON API (`/api/`) for data ingestion, analytics summaries, conversation management, and AI interaction.
- **Data Ingestion**: Handles Excel uploads, AI-powered column mapping via Claude Opus, and ingestion of mapped data.
- **Insights**: Provides structured JSON summaries for chatbot grounding. CIA and Librarian agents also receive campaign plan summaries (objective, product, market, channels, readiness scores) from the user's Campaign Planner conversations via `buildCampaignPlansSummary()`, enabling cross-agent awareness of planned campaigns.
- **Content Storage System** (`server/content-routes.ts`): Full content retrieval and storage pipeline. Endpoints: `POST /api/content/fetch-url` (fetches URL, extracts text from PDF/HTML via pdfjs/cheerio, AI analysis), `POST /api/content/upload-file` (processes PDF/DOCX/PPTX/images, AI analysis), `GET /api/content/status` (status map for card indicators), `GET /api/content/:assetId` (full stored content), `DELETE /api/content/:assetId`, `POST /api/content/refresh` (re-fetch from URL), `POST /api/content/bulk-fetch` (admin SSE bulk fetch), `GET /api/content/stats`. AI analysis extracts summary, topics, CTA, structure, messaging themes via Claude. Files stored as base64 in PostgreSQL for persistence.
- **Conversations**: CRUD operations for CIA Agent and Campaign Planner conversations, supporting SSE streaming for messages.
- **Validation**: Zod schemas for data validation.
- **Development**: Vite dev server integrated as Express middleware for HMR.
- **Production**: Static file serving from `dist/public`.

## Database

- **Type**: PostgreSQL (required via `DATABASE_URL`).
- **ORM**: Drizzle ORM with `node-postgres` driver.
- **Schema**: Defined in `shared/schema.ts`, including `assets_agg` (content performance data), `users`, `conversations`, `messages`, and `content_stored` (content retrieval & analysis) tables.
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