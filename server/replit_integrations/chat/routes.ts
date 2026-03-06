import type { Express, Request, Response, NextFunction } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { chatStorage } from "./storage";
import { buildInsightsSummary, type InsightsSummary } from "../../insights";
import { requireAuth } from "../../auth";
import { storage } from "../../storage";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

const SCHEMA_DESCRIPTION = `Database: PostgreSQL — Table: assets_agg
Columns:
  - content_id (text): Unique identifier for each content asset
  - stage (enum: TOFU, MOFU, BOFU, UNKNOWN): Funnel stage classification
  - name (text): Asset display name
  - url (text): Asset URL
  - typecampaignmember (text): Campaign member type
  - product_franchise (text): Product/brand name (e.g., CloudShield, DataGuard)
  - utm_channel (text): Marketing channel (Organic, Paid, Email, Partner, Direct)
  - utm_campaign (text): Campaign identifier
  - utm_medium (text): Traffic medium (Search, Social, Email, Referral, Direct)
  - utm_term (text): Paid search keyword
  - utm_content (text): Ad/content variant
  - form_name (text): Lead capture form name
  - cta (text): Call-to-action label
  - objective (text): Business objective (e.g., NCA, Retention)
  - product_category (text): Product category
  - campaign_id (text): Campaign ID
  - campaign_name (text): Campaign name
  - date_stamp (text): Date of record
  - pageviews_sum (integer): Total page views
  - time_avg (real): Average time on page in seconds
  - downloads_sum (integer): Total downloads
  - unique_leads (integer): Number of unique leads generated
  - sqo_count (integer): Sales Qualified Opportunities count`;

function buildCIASystemPrompt(summary: InsightsSummary): string {
  return `You are a data analyst for marketing content performance. You answer questions using ONLY the data context provided below.

STRICT RULES — follow these on every response:

1. CONCISE ANSWERS ONLY. Respond in 1–3 sentences unless the user explicitly asks for a detailed explanation. No filler, no preamble, no unnecessary context.

2. GROUND EVERY ANSWER IN THE DATA. Only use information that exists in the dataset provided. Never infer, guess, or generate information beyond what the data supports.

3. IF THE ANSWER ISN'T IN THE DATA, SAY SO. When the context doesn't contain enough information, respond with: "I don't have enough data to answer that." Do not fabricate or approximate.

4. NO HALLUCINATION. Before returning a response, verify that every claim maps directly to a specific value, row, or passage in the context. If it doesn't, remove it.

5. CITE THE SOURCE. Reference the specific breakdown, column, or content asset the answer came from so the user can verify. Example: "(from Stage Breakdown: TOFU)" or "(from Top Content: asset-id-123)".

6. STRUCTURED OUTPUT FOR DATA QUESTIONS. When the user asks for numbers, comparisons, or lists, return a short table, bullet list, or single value — never a paragraph of prose.

7. FORMAT NUMBERS. Use commas for thousands, 2 decimal places for averages.

8. LIMITS. Top 5–10 results max for lists. Mention the total if there are more.

9. Never reveal database internals, SQL, or schema details.

10. If a question is vague, ask one clarifying question rather than guessing.

Dataset: ${summary.dataset_info.total_rows} content assets across ${summary.stage_summary.map(s => s.stage).join("/")} stages.`;
}

const LIBRARIAN_PROMPT = `You are the Content Librarian AI for Sage's CIA Platform. You help users find, evaluate, and compare content assets from the library. Follow these rules strictly:

## CORE RULES

1. **DATA INTEGRITY** — Query the complete record for any asset before claiming data is unavailable. Triple-check before saying a field doesn't exist. If a field exists but is empty/null for a specific asset, say: "This field exists in the dataset but is blank for this particular asset." Never say "URLs aren't in the data" or "I don't have that information" without exhaustively checking every field first. Getting caught giving wrong information about data availability is the worst possible outcome — it makes users distrust everything else you say. NEVER fabricate URLs, metrics, or any data.

2. **ANSWER FIRST, CLARIFY SECOND** — Always provide data in your first response, then ask for refinement. Never respond with only questions. When the user asks a broad question like "find the best content for a campaign," immediately show the top 3-5 best-performing assets overall, THEN ask: "Want me to narrow this down by funnel stage, product, or channel?" Maximum 1-2 clarifying questions per response, never 4-5 bullet points of questions. The user came to get answers, not to fill out a form.

3. **FUZZY MATCHING** — When a user's input doesn't exactly match the data (e.g., "Sage 40" when the data has "Sage 50"), find the closest match and proceed with it immediately. Say: "I don't see 'Sage 40' — did you mean Sage 50? Here are those results:" and show the data. Don't make users send another message just to confirm a typo correction.

4. **STRUCTURED DISPLAY** — Always present multiple assets as a clean comparison table:
| Rank | Asset Name | Stage | Channel | Views | Leads | SQOs | Avg Time | URL |
Highlight the top performer with a ⭐ or "Top Pick" tag. For a single asset, use a structured card layout with human-readable name, asset ID (smaller, for reference), all available fields as key-value pairs, and URL if it exists. Never dump raw pipe-separated metrics inline.

5. **HUMAN-READABLE NAMES** — Always translate asset IDs into readable names. Parse the ID structure and construct a name:
- "CL_ACS_CAFR_SMA_WBA_TOFU_0000OnDemandWebinarWhatsNewSFAFR" → "On-Demand Webinar: What's New in Sage 50 Accounting (French Canada, TOFU)"
- "CL_ACS_CAEN_SMA_WEB_TOFU_0000YearEndPayrollCampaignPt2" → "Year-End Payroll Campaign Part 2 (English Canada, TOFU)"
Show the readable name prominently. Put the raw ID in parentheses or smaller text for reference. Users should never have to decode asset IDs themselves. If a "name" field is available in the data, prefer that over parsing the ID.

6. **AUTO-EXPAND SEARCH** — When a query returns zero results, automatically broaden the search by relaxing one filter at a time. Show all levels in a single response:
- "No exact matches for TOFU + Sage 50 + Email + PDF."
- "Closest match (relaxed content type):" → show results
- "Broader match (relaxed channel):" → show results
Do this automatically. Never ask the user which filter to relax.

7. **BE DECISIVE** — Default to showing more data rather than asking which direction to go. Avoid ambiguous yes/no questions with two options. Instead of "Want to explore higher-performing assets, or stick with email?" — just show the higher-performing assets and add: "Want me to filter these to email-only?"

8. **STRATEGIC INSIGHTS** — After every data response, include one specific, actionable insight (1-2 sentences):
- "This asset has strong engagement (745s avg) but only 5 SQOs — the CTA may need optimization."
- "Year-end payroll content outperforms all other Sage 50 TOFU topics by 3x. Consider building your campaign around this theme."
Be a strategist, not just a data retriever.

9. **JOURNEY CONTEXT** — When evaluating or comparing content, suggest logical multi-touch sequences. For example: "This TOFU PDF performs best when paired with a MOFU nurture email and BOFU demo request for the same product segment. Using it as a standalone reduces conversion potential." Base these on funnel stage logic and performance patterns from the library data. Tag with [Assumption: based on funnel stage logic, not user journey data]. Do NOT show journey context if the question is purely about metrics or listing assets.

10. **CONCISE** — Keep responses short and scannable. Tables and cards, not paragraphs. Top 5-10 assets max, mention the total count.

11. **HONEST** — If you made a mistake, own it immediately. Don't wait to be caught. Only use the provided data — never make up assets or metrics.

12. **CONTENT COVERAGE AWARENESS** — Many assets in the library only have engagement/performance metrics and don't have their actual content file uploaded yet. When recommending an asset that doesn't have stored content, mention it once naturally: "This is a top performer based on engagement data. The actual content hasn't been uploaded yet, so I can't verify messaging quality or CTA effectiveness. Upload it in the Content Library for a complete assessment." When running gap analysis or evaluations, proactively note: "Of the assets I'm analyzing, X don't have content uploaded — uploading them would enable topic, messaging, and CTA analysis." Do NOT repeat this warning every time — mention it once per conversation when relevant, not on every response.`;

const CAMPAIGN_PLANNER_PROMPT = `You are a senior campaign strategist at a top-tier B2B marketing agency, working with Sage's Content Intelligence Analyst platform. You produce data-driven campaign plans that are presentation-ready for CMO-level stakeholders. You follow industry best practices (HubSpot, Salesforce, Google Ads benchmarks) and ground every recommendation in the data provided.

## EVALUATION-ONLY MANDATE
You evaluate, compare, and plan using EXISTING content only. You NEVER generate content briefs, titles, outlines, or drafts for new content. Your role is to assess what exists, recommend the best-performing assets, and advise on optimization of existing materials. If the user asks you to create new content, redirect them to upload an asset for evaluation or select from the existing library.

Optimization and refresh recommendations are encouraged:
- Refresh existing content (update statistics, modernize design)
- Update CTAs to be more specific and action-oriented
- Edit existing content to include trending topics or keywords
- Suggest uploading a replacement asset for evaluation

## TONE & VOICE
- Write like a senior strategist presenting to a CMO. Confident, precise, no hedging.
- Never use chatbot artifacts: no "I don't have data for this but I can still help," no "Would you like me to...", no "Here's what I found," no conversational filler.
- Never expose internal reasoning or data gaps with warnings. If data is missing, state an assumption and move on (e.g., "Based on industry benchmarks for US hospitality SMB...").
- Use third person or imperative voice: "The recommended approach is...", "This campaign targets...", "Allocate 40% of budget to..."
- Every recommendation must have a "why" backed by a specific number. Not "LinkedIn works well" but "LinkedIn is recommended based on 5.3% lead-to-SQO conversion for MOFU display content."
- Content references should use human-readable names, not raw asset IDs. Transform "CL_BMS_US_CON_CRERequestInfoForm" to "US Info Request Form - BMS" or similar.
- Tables should be clean and scannable with consistent column counts.
- KPI targets should be specific ranges with clear thresholds, not vague goals.

## SOURCE TAGGING REQUIREMENTS
Every data point, metric, recommendation, and claim MUST be tagged with exactly one of these source labels:
- [Internal Data] — derived directly from the content library / dashboard dataset
- [Web Research: <citation>] — sourced from external research, articles, or reports (include URL or publication name)
- [Industry Benchmark] — based on published industry standards (HubSpot, Gartner, Forrester, etc.)
- [Calculated: <formula>] — computed from internal data (show the formula or logic, e.g., "leads / pageviews * 100")
- [Assumption: <basis>] — professional estimate when data is unavailable (state the reasoning)

Place the tag inline at the end of the relevant sentence or data point. In tables, include the tag in the cell or as a footnote reference. Never leave a data point untagged.

## CORE WORKFLOW

**Gather Info.** Before planning, ask clarifying questions if any of these are missing:
- Campaign objective (awareness, lead gen, conversion, retention)
- Target country/region
- Target industry and product
- Funnel stage (TOFU/MOFU/BOFU)
- Budget range (if applicable)
- Timeline / launch date
- Preferred channels (or ask to recommend)
Ask naturally — combine questions where possible.

**Content Evaluation & Comparison.** For all content approaches:
- Search the content library for assets matching the campaign's funnel stage, industry, and product.
- Rank matches by historical performance (pageviews, leads, SQOs, engagement).
- If content is older than 6 months, flag it and compare against current best-performing content.
- Present a comparison table: Content Name (human-readable), Format, Funnel Stage, Product, Region, Lead-to-SQO%, Recommendation (Deploy As-Is / Refresh / Select Alternative).
- Explain why one piece outperforms another with specific data.

**Uploaded Content Evaluation.** When the user mentions uploaded content or a newly uploaded asset:
- Compare the uploaded asset against the top 5 historical matches from the content library (same content type, funnel stage, and product where possible).
- Present a comparison table showing the uploaded asset alongside the top 5 matches with all available metrics.
- Provide a clear verdict for the uploaded asset: Deploy As-Is / Refresh / Select Alternative.
- If "Deploy As-Is": confirm readiness and recommend channels and timing.
- If "Refresh": specify exactly what to update (CTA, statistics, design, messaging) with actionable details.
- If "Select Alternative": identify the better-performing existing asset and explain why with specific metrics.

**Channel Recommendation.** Based on historical data:
- Recommend best-performing channel(s) for the given objective, audience, and funnel stage.
- Present a ranked channel table: Channel, Why (1 sentence), Expected Conversion Range, Budget Allocation %.
- One short paragraph below explaining channel mix logic. No lengthy per-channel justifications.

**Build the Plan.** Generate a structured campaign plan following this document flow:
1. **Executive Summary** — 4-5 sentences: objective, target audience, primary channel, expected outcome, key risk. A busy executive should understand the entire plan from this section alone.
2. **Source Legend** — Brief key explaining the five source tag types used throughout the document: Internal Data, Web Research, Industry Benchmark, Calculated, Assumption. Each with a one-line description.
3. **Industry & Trend Analysis** — Market context, relevant industry trends, competitive landscape. Historical performance snapshot (clean table, max 5-6 rows). Key insight callout. Every data point tagged with its source.
4. **Content Evaluation & Comparison** — Comparison table of top 3-5 candidates from the library. For each: name, format, stage, product, region, key metrics, verdict (Deploy As-Is / Refresh / Select Alternative). Specific, actionable optimization edits where applicable (not "update the CTA" but "Replace generic CTA with industry-specific demo request: 'See how Sage 50 handles tip tracking — request a hospitality-focused demo'").
5. **Content Optimization Recommendations** — For assets marked "Refresh": detailed optimization steps. For all recommended assets: specific CTA improvements, messaging updates, design refresh suggestions. Never recommend creating new content from scratch.
6. **Content Journey Recommendations** — Since user-level journey/sequence data is not yet available, recommend logical multi-touch content sequences based on funnel stage logic and performance patterns. For each recommended asset, suggest a 2-3 step content sequence: TOFU entry point → MOFU nurture → BOFU conversion asset. Pull the best-performing assets from each stage for the same product/segment. Present as a mini-flow: [TOFU Asset] → [MOFU Asset] → [BOFU Asset] with timing recommendations (e.g., Week 1-2: distribute TOFU, Week 3-4: nurture with MOFU, Week 5-6: retarget with BOFU). Tag all journey recommendations with [Assumption: based on funnel stage logic and historical performance, not user journey data]. Include a note: "Connect your marketing automation platform to enable actual journey tracking and see real user content paths."
7. **Channel Recommendations** — Ranked channel table with budget allocation percentages. One paragraph on mix logic.
8. **Campaign Timeline** — Phase-based: Build, Launch, Optimize, Report. Each phase: dates, key actions, deliverables. When a journey-based sequence is recommended, the timeline should reflect the multi-touch sequence with specific timing between each touchpoint.
9. **KPIs & Expected Performance** — Table: Metric | Target | Source Tag | Benchmark Source | Success Threshold. Below: 3-4 clear pass/fail criteria.
10. **Budget Allocation** — Use this exact format on its own line: \`<!-- BUDGET:{"items":[{"name":"Channel","pct":30}]} -->\`
11. **Risks & Mitigation** — Max 4-5 risks in a table: Risk | Impact (High/Med/Low) | Mitigation | Contingency Trigger. Each risk specific to this campaign.
12. **Next Steps** — Numbered action items with owners and deadlines. This is a finished deliverable.

**Readiness Score.** End every completed plan with:
\`<!-- SCORE:XX -->\` (0-100) and a brief checklist using PASS/FAIL labels for: Content Data Match, Stage Coverage, Product, Channel Strategy, Budget, KPIs.

## BEST PRACTICES
- Use historical data as the primary decision driver, not assumptions.
- Recommend A/B testing where applicable.
- Follow platform-specific best practices (LinkedIn for B2B top-funnel, Google Ads for bottom-funnel intent).
- Recommend content refresh for assets older than 6 months.
- Align messaging to the buyer journey stage.
- Factor in seasonality and regional nuances.

## CONTENT COVERAGE AWARENESS
When recommending content for a campaign, check if the recommended asset has stored content analysis available. If it doesn't, note it once: "This is your top performer for this segment. Upload the content file in the Content Library so I can verify it's still relevant and analyze the CTA before you build a campaign around it." Do NOT block the plan or refuse to recommend an asset because content is missing — always proceed with engagement data and note the gap. Do NOT repeat this on every recommendation — mention it once when first relevant.

## STRICT RULES
- Never hallucinate metrics or performance data. Only use what the data provides.
- Never generate content briefs, titles, outlines, or drafts for new content. Evaluate and optimize existing content only.
- If data is insufficient, state professional assumptions with benchmark sources, not apologies. Tag with [Assumption: <basis>].
- Every recommendation needs specific data backing with a source tag.
- Keep recommendations concise and actionable. No filler or repetition.
- Only use provided data. Label assumptions explicitly.
- Do not include emoji or decorative unicode characters.
- Stay in marketing domain.`;

interface MetricCheck {
  keyword: string;
  metricKey: keyof InsightsSummary["metric_availability"];
  label: string;
}

const METRIC_CHECKS: MetricCheck[] = [
  { keyword: "lead", metricKey: "leads", label: "leads (unique leads)" },
  { keyword: "conversion", metricKey: "leads", label: "leads/conversion data" },
  { keyword: "sqo", metricKey: "sqos", label: "SQOs (Sales Qualified Opportunities)" },
  { keyword: "qualified", metricKey: "sqos", label: "SQOs (Sales Qualified Opportunities)" },
  { keyword: "roi", metricKey: "sqos", label: "SQOs/ROI data" },
  { keyword: "revenue", metricKey: "sqos", label: "revenue/SQO data" },
  { keyword: "download", metricKey: "downloads", label: "downloads" },
  { keyword: "pageview", metricKey: "pageviews", label: "pageviews" },
  { keyword: "page view", metricKey: "pageviews", label: "pageviews" },
  { keyword: "traffic", metricKey: "pageviews", label: "pageviews/traffic data" },
  { keyword: "visit", metricKey: "pageviews", label: "pageviews/visit data" },
];

const FUZZY_FIELD_MAP: Record<string, string[]> = {
  "content_id": ["content", "asset", "content id", "asset id", "content name"],
  "stage": ["funnel", "stage", "funnel stage", "tofu", "mofu", "bofu"],
  "product_franchise": ["product", "brand", "franchise", "product name"],
  "utm_channel": ["channel", "marketing channel", "traffic source", "source"],
  "utm_medium": ["medium", "traffic medium"],
  "utm_campaign": ["campaign", "campaign name", "campaign id"],
  "cta": ["cta", "call to action", "button", "action"],
  "objective": ["objective", "goal", "business objective"],
  "pageviews_sum": ["views", "page views", "pageviews", "traffic", "visits", "impressions"],
  "time_avg": ["time", "time on page", "dwell time", "engagement time", "duration", "avg time", "average time"],
  "downloads_sum": ["downloads", "download count", "assets downloaded"],
  "unique_leads": ["leads", "lead count", "contacts", "new contacts", "lead generation", "lead gen"],
  "sqo_count": ["sqo", "sqos", "sales qualified", "qualified opportunities", "pipeline", "revenue"],
};

const PHRASING_MAP: Record<string, string> = {
  "how many": "COUNT",
  "count": "COUNT",
  "total": "SUM",
  "sum": "SUM",
  "average": "AVG",
  "mean": "AVG",
  "avg": "AVG",
  "highest": "ORDER BY DESC (Top)",
  "top": "ORDER BY DESC (Top)",
  "best": "ORDER BY DESC (Top)",
  "most": "ORDER BY DESC (Top)",
  "lowest": "ORDER BY ASC (Bottom)",
  "worst": "ORDER BY ASC (Bottom)",
  "bottom": "ORDER BY ASC (Bottom)",
  "least": "ORDER BY ASC (Bottom)",
  "fewest": "ORDER BY ASC (Bottom)",
  "breakdown": "GROUP BY",
  "by each": "GROUP BY",
  "per": "GROUP BY",
  "distribution": "GROUP BY",
  "split by": "GROUP BY",
  "compare": "GROUP BY",
};

function resolveUserTerms(question: string): { resolvedFields: string[]; operation: string | null } {
  const q = question.toLowerCase();
  const resolvedFields: string[] = [];

  for (const [dbField, aliases] of Object.entries(FUZZY_FIELD_MAP)) {
    for (const alias of aliases) {
      if (q.includes(alias)) {
        if (!resolvedFields.includes(dbField)) {
          resolvedFields.push(dbField);
        }
        break;
      }
    }
  }

  let operation: string | null = null;
  for (const [phrase, op] of Object.entries(PHRASING_MAP)) {
    if (q.includes(phrase)) {
      operation = op;
      break;
    }
  }

  return { resolvedFields, operation };
}

function checkDeterministicRefusal(
  question: string,
  availability: InsightsSummary["metric_availability"],
  summary: InsightsSummary
): string | null {
  const q = question.toLowerCase();

  const missingMetrics: string[] = [];
  for (const check of METRIC_CHECKS) {
    if (q.includes(check.keyword) && !availability[check.metricKey]) {
      if (!missingMetrics.includes(check.label)) {
        missingMetrics.push(check.label);
      }
    }
  }

  if (missingMetrics.length === 0) return null;

  const availableMetrics: string[] = [];
  if (availability.pageviews) availableMetrics.push("pageviews");
  if (availability.downloads) availableMetrics.push("downloads");
  if (availability.time_on_page) availableMetrics.push("time on page");
  if (availability.leads) availableMetrics.push("leads");
  if (availability.sqos) availableMetrics.push("SQOs");

  const stages = summary.stage_summary.map(s => `${s.stage} (${s.count})`).join(", ");
  const products = summary.product_mix.slice(0, 5).map(p => p.product).join(", ");

  const altQuestions: string[] = [];
  if (availability.pageviews || availability.time_on_page) {
    altQuestions.push("Which content has the highest engagement?");
  }
  if (summary.stage_summary.length > 0) {
    altQuestions.push("What's the content breakdown by funnel stage?");
  }
  if (summary.cta_table.length > 0) {
    altQuestions.push("Which CTAs have the most content?");
  }
  if (summary.channel_mix.length > 0) {
    altQuestions.push("How is content split across channels?");
  }

  const suggestions = altQuestions.slice(0, 2).map(q => `- "${q}"`).join("\n");

  return `I don't have **${missingMetrics.join(" or ")}** data in the current dataset — those values are all zero across ${summary.dataset_info.total_rows} assets.

${availableMetrics.length > 0 ? `What I do have: ${availableMetrics.join(", ")}. ` : ""}Here are a couple things I can help with instead:\n${suggestions}`;
}

function buildGroundedContext(question: string, summary: InsightsSummary): string {
  const { resolvedFields, operation } = resolveUserTerms(question);

  return JSON.stringify({
    instruction: "Answer concisely using ONLY the data below. Lead with the key insight, then brief supporting numbers. Keep it conversational — no rigid sections unless truly needed. Never invent numbers.",
    question,
    resolved_fields: resolvedFields.length > 0 ? resolvedFields : "No specific fields matched — use all available data",
    detected_operation: operation || "Not detected — infer from question",
    dataset_info: summary.dataset_info,
    metric_availability: summary.metric_availability,
    metric_totals: summary.metric_totals,
    stage_summary: summary.stage_summary,
    cta_table: summary.cta_table,
    channel_mix: summary.channel_mix,
    product_mix: summary.product_mix,
    top_content: summary.top_content,
  }, null, 2);
}

function buildPlannerContext(summary: InsightsSummary): string {
  let context = `=== DASHBOARD DATA CONTEXT ===\n`;
  context += `Total content assets: ${summary.dataset_info.total_rows}\n\n`;

  context += `--- STAGE BREAKDOWN ---\n`;
  for (const s of summary.stage_summary) {
    context += `${s.stage}: ${s.count} assets | ${s.pageviews} page views | ${s.downloads} downloads | ${s.leads} leads | ${s.sqos} SQOs | avg time ${s.avg_time}s\n`;
  }

  context += `\n--- CONTENT TYPE BREAKDOWN ---\n`;
  context += `(Use this to compare same content types — PDF vs PDF, Webinar vs Webinar, etc.)\n`;
  for (const c of summary.content_type_mix) {
    context += `${c.contentType}: ${c.count} assets | ${c.pageviews} views | ${c.downloads} downloads | ${c.leads} leads | ${c.sqos} SQOs | avg time ${c.avgTime}s\n`;
  }

  context += `\n--- CONTENT TYPE × FUNNEL STAGE MATRIX ---\n`;
  context += `(Critical for like-for-like comparison: same type + same stage)\n`;
  for (const c of summary.content_type_stage_matrix) {
    context += `${c.contentType} in ${c.stage}: ${c.count} assets | ${c.pageviews} views | ${c.downloads} downloads | ${c.leads} leads | ${c.sqos} SQOs | avg time ${c.avgTime}s\n`;
  }

  context += `\n--- CHANNEL BREAKDOWN ---\n`;
  for (const c of summary.channel_mix) {
    context += `${c.channel}: ${c.count} assets | ${c.pageviews} views | ${c.leads} leads | ${c.sqos} SQOs\n`;
  }

  context += `\n--- PRODUCT BREAKDOWN ---\n`;
  for (const p of summary.product_mix) {
    context += `${p.product}: ${p.count} assets | ${p.pageviews} views | ${p.leads} leads | ${p.sqos} SQOs\n`;
  }

  context += `\n--- CTA BREAKDOWN ---\n`;
  for (const c of summary.cta_table) {
    context += `${c.cta}: ${c.count} assets | ${c.leads} leads | ${c.sqos} SQOs\n`;
  }

  context += `\n--- TOP 50 CONTENT ASSETS (with type, objective, all metrics) ---\n`;
  for (const t of summary.top_content) {
    context += `${t.contentId} | Name: ${t.name} | URL: ${t.url || "N/A"} | Type: ${t.contentType} | Stage: ${t.stage} | Product: ${t.product} | Channel: ${t.channel} | Objective: ${t.objective} | CTA: ${t.cta} | ${t.pageviews} views | ${t.downloads} downloads | ${t.leads} leads | ${t.sqos} SQOs | avg time ${t.avgTime}s\n`;
  }

  return context;
}

function buildDynamicSuggestions(summary: InsightsSummary): string[] {
  const suggestions: string[] = [];

  if (summary.stage_summary.length > 1) {
    suggestions.push("What is the content breakdown across funnel stages?");
  }

  if (summary.channel_mix.length > 1) {
    const topChannel = summary.channel_mix[0]?.channel;
    if (topChannel) {
      suggestions.push(`How does ${topChannel} compare to other channels?`);
    }
  }

  if (summary.product_mix.length > 1) {
    suggestions.push("Which product has the most content assets?");
  }

  if (summary.metric_availability.time_on_page) {
    suggestions.push("Which content has the highest average time on page?");
  }

  if (summary.metric_availability.pageviews) {
    suggestions.push("What are the top 10 content assets by page views?");
  }

  if (summary.metric_availability.leads) {
    suggestions.push("Which funnel stage generates the most leads?");
  }

  if (summary.metric_availability.sqos) {
    suggestions.push("What content drives the most SQOs?");
  }

  if (summary.cta_table.length > 1) {
    suggestions.push("Which CTAs have the most associated content?");
  }

  return suggestions.slice(0, 5);
}

function getDatasetLabel(summary: InsightsSummary): string {
  const products = summary.product_mix.map(p => p.product).filter(p => p !== "(unattributed)");
  if (products.length > 0) {
    return `${summary.dataset_info.total_rows} assets — ${products.slice(0, 3).join(", ")}`;
  }
  return `${summary.dataset_info.total_rows} content assets`;
}

async function buildCampaignPlansSummary(userId: string): Promise<string | null> {
  try {
    const plannerConvos = await chatStorage.getAllConversations("planner", userId);
    if (plannerConvos.length === 0) return null;

    const planSummaries: string[] = [];

    for (const conv of plannerConvos.slice(0, 20)) {
      const msgs = await chatStorage.getMessagesByConversation(conv.id);
      if (msgs.length < 2) continue;

      const userMessages = msgs.filter(m => m.role === "user");
      const assistantMessages = msgs.filter(m => m.role === "assistant");
      if (userMessages.length === 0 || assistantMessages.length === 0) continue;

      const extract = (label: string): string => {
        for (const msg of userMessages) {
          const match = msg.content.match(new RegExp(`- ${label}:\\s*(.+)`, "i"));
          if (match) return match[1].trim();
        }
        return "";
      };

      const objective = extract("Objective");
      const product = extract("Product");
      const market = extract("Target Market") || extract("Market");
      const funnelStage = extract("Funnel Stage");
      const contentType = extract("Content Type");
      const industry = extract("Industry");

      let readinessScore: number | null = null;
      let channels: string[] = [];

      for (let i = assistantMessages.length - 1; i >= 0; i--) {
        const msgContent = assistantMessages[i].content;
        if (readinessScore === null) {
          const scoreMatch = msgContent.match(/<!-- SCORE:(\d+) -->/);
          if (scoreMatch) readinessScore = parseInt(scoreMatch[1]);
        }
        if (channels.length === 0) {
          const budgetMatch = msgContent.match(/<!-- BUDGET:([\s\S]*?) -->/);
          if (budgetMatch) {
            try {
              const budgetData = JSON.parse(budgetMatch[1].replace(/\s+/g, " "));
              if (budgetData.items) {
                channels = budgetData.items.map((item: { name: string; pct: number }) => `${item.name} (${item.pct}%)`);
              }
            } catch {}
          }
        }
        if (readinessScore !== null && channels.length > 0) break;
      }

      const status = readinessScore !== null ? "Complete" : "Draft";

      let planLine = `Plan: "${conv.title}" [${status}]`;
      if (objective) planLine += ` | Objective: ${objective}`;
      if (product) planLine += ` | Product: ${product}`;
      if (market) planLine += ` | Market: ${market}`;
      if (funnelStage) planLine += ` | Stage: ${funnelStage}`;
      if (contentType) planLine += ` | Content Type: ${contentType}`;
      if (industry) planLine += ` | Industry: ${industry}`;
      if (readinessScore !== null) planLine += ` | Readiness: ${readinessScore}/100`;
      if (channels.length > 0) planLine += ` | Channels: ${channels.join(", ")}`;

      planSummaries.push(planLine);
    }

    if (planSummaries.length === 0) return null;

    return `\n--- CAMPAIGN PLANS (${planSummaries.length} plans from Campaign Planner) ---\n` +
      planSummaries.join("\n") + "\n";
  } catch (err) {
    console.error("Error building campaign plans summary:", err);
    return null;
  }
}

const MAX_CONTEXT_EXCHANGES = 4;

async function buildContentLibraryContext(): Promise<string | null> {
  try {
    const allContent = await storage.getAllStoredContentAnalysis();
    if (allContent.length === 0) return null;

    let ctx = `\n\n=== CONTENT LIBRARY: UPLOADED & ANALYZED CONTENT ===\n`;
    ctx += `Total assets with content uploaded: ${allContent.length}\n`;
    ctx += `Use this data to answer questions about content quality, topics, CTAs, messaging themes, structure, and keyword tags.\n\n`;

    const analyzed = allContent.filter(c => c.contentSummary || c.extractedTopics?.length || c.extractedCta);
    const displayList = analyzed.length > 0 ? analyzed : allContent;
    const capped = displayList.slice(0, 50);
    if (capped.length < displayList.length) {
      ctx += `(Showing ${capped.length} of ${displayList.length} assets with uploaded content)\n\n`;
    }

    for (const c of capped) {
      const topicTags = (c.keywordTags.topic_tags || []).join(", ");
      const audienceTags = (c.keywordTags.audience_tags || []).join(", ");
      const intentTags = (c.keywordTags.intent_tags || []).join(", ");
      const userTags = (c.keywordTags.user_added_tags || []).join(", ");
      ctx += `--- ${c.assetId} ---\n`;
      ctx += `Format: ${c.contentFormat || "unknown"} | Source: ${c.sourceType === "url_fetched" ? "URL fetched" : c.sourceType === "file_uploaded" ? (c.originalFilename || "Uploaded file") : c.sourceType}\n`;
      const summary = c.contentSummary && c.contentSummary.length > 300 ? c.contentSummary.slice(0, 300) + "..." : c.contentSummary;
      if (summary) ctx += `Summary: ${summary}\n`;
      if (c.extractedTopics?.length) ctx += `Topics: ${c.extractedTopics.join(", ")}\n`;
      if (c.extractedCta) ctx += `CTA: "${c.extractedCta.text}" (${c.extractedCta.type}, strength: ${c.extractedCta.strength})\n`;
      if (c.messagingThemes?.length) ctx += `Messaging Themes: ${c.messagingThemes.join(", ")}\n`;
      if (c.contentStructure) ctx += `Structure: ${c.contentStructure.wordCount} words, ${c.contentStructure.sectionCount} sections, ${c.contentStructure.pageCount} pages\n`;
      if (topicTags) ctx += `Topic Tags: ${topicTags}\n`;
      if (audienceTags) ctx += `Audience Tags: ${audienceTags}\n`;
      if (intentTags) ctx += `Intent Tags: ${intentTags}\n`;
      if (userTags) ctx += `Custom Tags: ${userTags}\n`;
      ctx += `\n`;
    }

    return ctx;
  } catch (err) {
    console.error("Content library context error:", err);
    return null;
  }
}

async function buildContentStorageContext(userMessage: string): Promise<string | null> {
  try {
    const assetIdPatterns = userMessage.match(/[A-Z]{2}_[A-Z]+_[A-Z0-9_]+/g) || [];
    const mentionedAssets = [...new Set(assetIdPatterns)];

    if (mentionedAssets.length === 0) return null;

    const contentParts: string[] = [];
    for (const assetId of mentionedAssets.slice(0, 5)) {
      const content = await storage.getContentByAssetId(assetId);
      if (content && content.fetchStatus !== "not_stored") {
        contentParts.push(
          `--- Stored Content: ${assetId} ---\n` +
          `Format: ${content.contentFormat || "unknown"}\n` +
          `Summary: ${content.contentSummary || "N/A"}\n` +
          `Topics: ${(content.extractedTopics || []).join(", ") || "N/A"}\n` +
          `CTA: ${content.extractedCta ? `"${content.extractedCta.text}" (${content.extractedCta.type}, ${content.extractedCta.strength})` : "None detected"}\n` +
          `Messaging Themes: ${(content.messagingThemes || []).join(", ") || "N/A"}\n` +
          `Structure: ${content.contentStructure ? `${content.contentStructure.wordCount} words, ${content.contentStructure.sectionCount} sections` : "N/A"}\n` +
          `Source: ${content.sourceType === "url_fetched" ? content.sourceUrl || "URL" : content.sourceType === "file_uploaded" ? content.originalFilename || "Uploaded file" : "Unknown"}`
        );
      } else {
        contentParts.push(
          `--- ${assetId} ---\nContent not stored. Only performance metrics are available for this asset. Suggest the user fetch or upload the content for deeper analysis.`
        );
      }
    }

    if (contentParts.length === 0) return null;
    return `\n\n=== STORED CONTENT ANALYSIS ===\nThe following content has been retrieved and analyzed. Use this for content-quality questions (messaging, CTA, topics, structure). Performance metrics are in the main dataset above.\n${contentParts.join("\n\n")}`;
  } catch (err) {
    console.error("Content storage context error:", err);
    return null;
  }
}

const assetInsightCache = new Map<string, { insight: string; performance: string; timestamp: number }>();
const ASSET_INSIGHT_TTL = 5 * 60 * 1000;

async function generateAssetInsight(
  assetId: string,
  summary: InsightsSummary
): Promise<{ insight: string; performance: string }> {
  const cached = assetInsightCache.get(assetId);
  if (cached && Date.now() - cached.timestamp < ASSET_INSIGHT_TTL) {
    return { insight: cached.insight, performance: cached.performance };
  }

  const asset = summary.top_content.find(a => a.contentId === assetId);

  if (!asset) {
    const allPageviews = summary.top_content.map(a => a.pageviews);
    const median = allPageviews.length > 0
      ? allPageviews.sort((a, b) => a - b)[Math.floor(allPageviews.length / 2)]
      : 0;
    const result = {
      insight: "This asset has limited activity data. Consider refreshing its distribution strategy.",
      performance: median > 0 ? "red" : "neutral",
    };
    assetInsightCache.set(assetId, { ...result, timestamp: Date.now() });
    return result;
  }

  const stageAssets = summary.top_content.filter(a => a.stage === asset.stage);
  const primaryMetric = asset.stage === "BOFU" ? "sqos" : asset.stage === "MOFU" ? "leads" : "pageviews";
  const metricValues = stageAssets.map(a => (a as any)[primaryMetric] as number).sort((a, b) => a - b);
  const assetMetricVal = (asset as any)[primaryMetric] as number;
  const median = metricValues.length > 0 ? metricValues[Math.floor(metricValues.length / 2)] : 0;
  const p75 = metricValues.length > 0 ? metricValues[Math.floor(metricValues.length * 0.75)] : 0;

  let performance = "amber";
  if (median > 0) {
    if (assetMetricVal >= p75) performance = "green";
    else if (assetMetricVal < median * 0.5) performance = "red";
  }

  let insight: string;
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 80,
      system: "You generate one-line insights about content marketing assets. Be specific, data-driven, and actionable. Reference actual metrics. No filler. Max 15 words.",
      messages: [{
        role: "user",
        content: `Asset: ${asset.contentId}\nStage: ${asset.stage}\nChannel: ${asset.channel}\nProduct: ${asset.product}\nPageviews: ${asset.pageviews}\nLeads: ${asset.leads}\nSQOs: ${asset.sqos}\nAvg Time: ${asset.avgTime}s\nStage median ${primaryMetric}: ${median}\nStage top 25% threshold: ${p75}\nPerformance: ${performance}`,
      }],
    });
    insight = ((response.content[0] as any).text || "").trim();
    if (!insight) throw new Error("Empty response");
  } catch {
    if (performance === "green") {
      insight = `Top performer: ${assetMetricVal} ${primaryMetric}, above ${median} stage median.`;
    } else if (performance === "red") {
      insight = `Below average: ${assetMetricVal} ${primaryMetric} vs ${median} stage median. Needs optimization.`;
    } else {
      insight = `Average performer with ${assetMetricVal} ${primaryMetric}. Room for growth.`;
    }
  }

  const result = { insight, performance };
  assetInsightCache.set(assetId, { ...result, timestamp: Date.now() });
  return result;
}

export function registerChatRoutes(app: Express): void {
  app.get("/api/assets/:id/insight", requireAuth, async (req: Request, res: Response) => {
    try {
      const assetId = decodeURIComponent(String(req.params.id));
      const summary = await buildInsightsSummary();
      if (!summary) {
        return res.json({ insight: "No data available yet.", performance: "neutral" });
      }
      const result = await generateAssetInsight(assetId, summary);
      res.json(result);
    } catch (error) {
      console.error("Error generating asset insight:", error);
      res.status(500).json({ error: "Failed to generate insight" });
    }
  });
  app.get("/api/conversations", requireAuth, async (req: Request, res: Response) => {
    try {
      const agent = (req.query.agent as string) || undefined;
      const userId = (req as any).userId as string;
      const convos = await chatStorage.getAllConversations(agent, userId);

      for (const conv of convos) {
        if (conv.title === "New Chat" || conv.title === "New Conversation") {
          conv.title = "Untitled Chat";
        }
      }

      res.json(convos);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  app.get("/api/conversations/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req as any).userId as string;
      const conversation = await chatStorage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      if (conversation.userId && conversation.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const messages = await chatStorage.getMessagesByConversation(id);
      res.json({ ...conversation, messages });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  app.post("/api/conversations", requireAuth, async (req: Request, res: Response) => {
    try {
      const { title, agent } = req.body;
      const userId = (req as any).userId as string;
      const conversation = await chatStorage.createConversation(title || "New Chat", agent || "cia", userId);
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  app.delete("/api/conversations/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req as any).userId as string;
      const conversation = await chatStorage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      if (conversation.userId && conversation.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      await chatStorage.deleteConversation(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  app.get("/api/chat/suggestions", requireAuth, async (_req: Request, res: Response) => {
    try {
      const summary = await buildInsightsSummary();
      if (!summary) {
        res.json({ suggestions: [], datasetLabel: "No data uploaded" });
        return;
      }
      const suggestions = buildDynamicSuggestions(summary);
      const datasetLabel = getDatasetLabel(summary);
      res.json({ suggestions, datasetLabel });
    } catch (error) {
      console.error("Error generating suggestions:", error);
      res.json({ suggestions: [], datasetLabel: "Unknown" });
    }
  });

  app.post("/api/conversations/:id/messages", requireAuth, async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id);
      const { content } = req.body;
      let { images } = req.body;

      if (images && Array.isArray(images)) {
        const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
        const MAX_IMAGES = 5;
        images = images.slice(0, MAX_IMAGES).filter((img: string) => {
          if (typeof img !== "string") return false;
          const match = img.match(/^data:image\/(png|jpeg|gif|webp);base64,/);
          if (!match) return false;
          const base64Part = img.split(",")[1];
          const sizeInBytes = (base64Part.length * 3) / 4;
          return sizeInBytes <= MAX_IMAGE_SIZE;
        });
        if (images.length === 0) images = undefined;
      } else {
        images = undefined;
      }

      await chatStorage.createMessage(conversationId, "user", content);

      const conversation = await chatStorage.getConversation(conversationId);
      const agentType = conversation?.agent || "cia";

      const allHistory = await chatStorage.getMessagesByConversation(conversationId);

      if (allHistory.length === 1) {
        const fallbackTitle = content.slice(0, 50).split(/\s+/).slice(0, 6).join(" ") + (content.length > 50 ? "..." : "");
        await chatStorage.updateConversationTitle(conversationId, fallbackTitle);
      }

      const summary = await buildInsightsSummary();

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      if (!summary) {
        const noDataMsg = "No data has been uploaded to the dashboard yet. Please upload a CSV or Excel file first, then ask me your question.";
        await chatStorage.createMessage(conversationId, "assistant", noDataMsg);
        res.write(`data: ${JSON.stringify({ content: noDataMsg, grounded: true })}\n\n`);
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
        return;
      }

      if (agentType === "cia") {
        const refusal = checkDeterministicRefusal(content, summary.metric_availability, summary);
        if (refusal) {
          await chatStorage.createMessage(conversationId, "assistant", refusal);
          res.write(`data: ${JSON.stringify({ content: refusal, grounded: true })}\n\n`);

          const isFirstExchange = allHistory.length === 1;
          if (isFirstExchange) {
            try {
              const titleResponse = await anthropic.messages.create({
                model: "claude-sonnet-4-6",
                max_tokens: 30,
                system: "Summarize the following user query into a short conversation title of 5-8 words. Extract the core topic, action, and key filters (product, region, channel, metric). Strip filler words and greetings. Use title case. Return only the title, nothing else.",
                messages: [
                  { role: "user", content },
                ],
              });
              const rawTitle = (titleResponse.content[0] as any).text?.trim();
              const title = (rawTitle && rawTitle !== "New Conversation") ? rawTitle : content.slice(0, 50).split(/\s+/).slice(0, 6).join(" ");
              await chatStorage.updateConversationTitle(conversationId, title);
              res.write(`data: ${JSON.stringify({ title })}\n\n`);
            } catch (e) {
              console.error("Failed to generate title:", e);
            }
          }

          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          res.end();
          return;
        }
      }

      const maxMessages = MAX_CONTEXT_EXCHANGES * 2;
      const recentHistory = allHistory.length > maxMessages
        ? allHistory.slice(-maxMessages)
        : allHistory;

      const chatMessages: Array<{ role: "user" | "assistant"; content: string | Array<any> }> = recentHistory.map((m, idx) => {
        if (idx === recentHistory.length - 1 && m.role === "user" && images && images.length > 0) {
          const contentBlocks: any[] = [];
          for (const img of images) {
            const match = img.match(/^data:(image\/\w+);base64,(.+)$/);
            if (match) {
              contentBlocks.push({
                type: "image",
                source: {
                  type: "base64",
                  media_type: match[1],
                  data: match[2],
                },
              });
            }
          }
          contentBlocks.push({ type: "text", text: m.content });
          return { role: m.role as "user" | "assistant", content: contentBlocks };
        }
        return { role: m.role as "user" | "assistant", content: m.content };
      });

      let systemPrompt: string;
      const userId = (req as any).userId as string;
      const campaignContext = (agentType === "cia" || agentType === "librarian")
        ? await buildCampaignPlansSummary(userId)
        : null;

      const contentStorageCtx = (agentType === "cia" || agentType === "librarian")
        ? await buildContentStorageContext(content)
        : null;

      const contentLibraryCtx = (agentType === "librarian")
        ? await buildContentLibraryContext()
        : null;

      if (agentType === "cia") {
        const groundedContext = buildGroundedContext(content, summary);
        systemPrompt = `${buildCIASystemPrompt(summary)}\n\n=== GROUNDED CONTEXT (your ONLY data source) ===\n${groundedContext}`;
        if (campaignContext) {
          systemPrompt += `\n\n=== CAMPAIGN PLANNING DATA ===\nThe following campaign plans have been created in the Campaign Planner. You can reference this data when users ask about planned campaigns, strategies, or content allocation.\n${campaignContext}`;
        }
        if (contentStorageCtx) {
          systemPrompt += contentStorageCtx;
        }
      } else if (agentType === "librarian") {
        const librarianContext = buildPlannerContext(summary);
        systemPrompt = `${LIBRARIAN_PROMPT}\n\n${librarianContext}`;
        if (contentLibraryCtx) {
          systemPrompt += contentLibraryCtx;
        }
        if (campaignContext) {
          systemPrompt += `\n${campaignContext}`;
        }
        if (contentStorageCtx) {
          systemPrompt += contentStorageCtx;
        }
      } else {
        const plannerContext = buildPlannerContext(summary);
        systemPrompt = `${CAMPAIGN_PLANNER_PROMPT}\n\n${plannerContext}`;
      }

      if (agentType === "cia" || agentType === "librarian") {
        res.write(`data: ${JSON.stringify({ grounded: true })}\n\n`);
      }

      let fullResponse = "";
      let retryAttempt = false;

      const tokenLimit = agentType === "planner" ? 4096 : agentType === "librarian" ? 2500 : 1500;

      const runStream = async () => {
        const stream = anthropic.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: tokenLimit,
          system: systemPrompt,
          messages: chatMessages,
        });

        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const text = event.delta.text;
            if (text) {
              fullResponse += text;
              res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
            }
          }
        }
      };

      try {
        await runStream();
      } catch (streamError) {
        if (!retryAttempt) {
          retryAttempt = true;
          console.error("First stream attempt failed, retrying:", streamError);
          fullResponse = "";
          try {
            await runStream();
          } catch (retryError) {
            console.error("Retry also failed:", retryError);
            const errMsg = "I encountered an issue processing your question. Please try rephrasing it.";
            fullResponse = errMsg;
            res.write(`data: ${JSON.stringify({ content: errMsg, error: true })}\n\n`);
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            await chatStorage.createMessage(conversationId, "assistant", fullResponse);
            res.end();
            return;
          }
        }
      }

      await chatStorage.createMessage(conversationId, "assistant", fullResponse);

      const isFirstExchange = allHistory.length === 1;
      if (isFirstExchange && fullResponse.length > 0) {
        try {
          const titleResponse = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 30,
            system: "Summarize the following user query into a short conversation title of 5-8 words. Extract the core topic, action, and key filters (product, region, channel, metric). Strip filler words and greetings. Use title case. Return only the title, nothing else.",
            messages: [
              { role: "user", content },
            ],
          });
          const rawTitle = (titleResponse.content[0] as any).text?.trim();
          const title = (rawTitle && rawTitle !== "New Conversation") ? rawTitle : content.slice(0, 50).split(/\s+/).slice(0, 6).join(" ");
          await chatStorage.updateConversationTitle(conversationId, title);
          res.write(`data: ${JSON.stringify({ title })}\n\n`);
        } catch (e) {
          console.error("Failed to generate title:", e);
        }
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error sending message:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to get response" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to send message" });
      }
    }
  });

  const insightsCache = new Map<string, { insights: string[]; timestamp: number }>();
  const INSIGHTS_CACHE_TTL = 5 * 60 * 1000;

  function generateInsightsFromSummary(summary: InsightsSummary, page: string): string[] {
    const insights: string[] = [];

    if (page === "content-library") {
      const totalAssets = summary.dataset_info.total_rows;
      insights.push(`Your library contains ${totalAssets.toLocaleString()} content assets across ${summary.stage_summary.length} funnel stages`);

      const stages = summary.stage_summary;
      const maxStage = stages.reduce((a, b) => (b.count > a.count ? b : a), stages[0]);
      const minStage = stages.reduce((a, b) => (b.count < a.count ? b : a), stages[0]);
      if (maxStage && minStage && maxStage.stage !== minStage.stage) {
        insights.push(`${maxStage.stage} has ${maxStage.count} assets while ${minStage.stage} only has ${minStage.count} — potential funnel gap`);
      }

      const zeroSqoStages = stages.filter(s => s.sqos === 0);
      if (zeroSqoStages.length > 0 && zeroSqoStages.length < stages.length) {
        insights.push(`${zeroSqoStages.map(s => s.stage).join(", ")} stage${zeroSqoStages.length > 1 ? "s have" : " has"} zero SQOs — review content effectiveness`);
      }

      if (summary.metric_availability.time_on_page) {
        const topByTime = [...summary.top_content].sort((a, b) => b.avgTime - a.avgTime);
        if (topByTime.length > 0) {
          const best = topByTime[0];
          insights.push(`Highest engagement: "${best.name || best.contentId}" averages ${Math.round(best.avgTime)}s on page`);
        }
      }

      if (summary.product_mix.length > 1) {
        const topProduct = summary.product_mix[0];
        insights.push(`${topProduct.product} leads with ${topProduct.count} assets and ${topProduct.pageviews.toLocaleString()} total views`);
      }

      const lowPerformers = summary.top_content.filter(c => c.pageviews === 0 && c.leads === 0);
      if (lowPerformers.length > 0) {
        insights.push(`${lowPerformers.length} assets have zero views and zero leads — consider refreshing or retiring`);
      }
    }

    if (page === "performance") {
      if (summary.channel_mix.length > 1) {
        const topChannel = summary.channel_mix[0];
        const secondChannel = summary.channel_mix[1];
        insights.push(`${topChannel.channel} dominates with ${topChannel.count} assets vs ${secondChannel.channel} at ${secondChannel.count}`);
      }

      if (summary.metric_availability.sqos) {
        const totalSqos = summary.metric_totals.sqos;
        const topSqoStage = summary.stage_summary.reduce((a, b) => (b.sqos > a.sqos ? b : a), summary.stage_summary[0]);
        if (topSqoStage) {
          insights.push(`${topSqoStage.stage} drives ${topSqoStage.sqos} of ${totalSqos} total SQOs (${totalSqos > 0 ? Math.round((topSqoStage.sqos / totalSqos) * 100) : 0}%)`);
        }
      }

      if (summary.metric_availability.pageviews) {
        insights.push(`Total pageviews across all content: ${summary.metric_totals.pageviews.toLocaleString()}`);
      }

      if (summary.metric_availability.leads) {
        insights.push(`${summary.metric_totals.leads.toLocaleString()} total leads generated across the funnel`);
      }

      if (summary.product_mix.length > 2) {
        const withSqos = summary.product_mix.filter(p => p.sqos > 0);
        insights.push(`${withSqos.length} of ${summary.product_mix.length} products are generating SQOs`);
      }
    }

    if (page === "analytics") {
      if (summary.cta_table.length > 1) {
        const topCta = summary.cta_table[0];
        insights.push(`"${topCta.cta}" is the most common CTA with ${topCta.count} assets`);
      }

      if (summary.channel_mix.length > 1) {
        const channelsByViews = [...summary.channel_mix].sort((a, b) => b.pageviews - a.pageviews);
        if (channelsByViews[0]) {
          insights.push(`${channelsByViews[0].channel} leads in traffic with ${channelsByViews[0].pageviews.toLocaleString()} pageviews`);
        }
      }

      if (summary.metric_availability.sqos && summary.metric_availability.leads) {
        const convRate = summary.metric_totals.leads > 0 ? (summary.metric_totals.sqos / summary.metric_totals.leads * 100).toFixed(1) : "0";
        insights.push(`Overall lead-to-SQO conversion: ${convRate}% across ${summary.dataset_info.total_rows} assets`);
      }

      if (summary.content_type_mix.length > 1) {
        const topType = summary.content_type_mix[0];
        insights.push(`${topType.contentType} is your most-used content format with ${topType.count} assets`);
      }

      const stagesWithGaps = summary.stage_summary.filter(s => s.count < summary.dataset_info.total_rows * 0.1);
      if (stagesWithGaps.length > 0) {
        insights.push(`${stagesWithGaps.map(s => s.stage).join(", ")} represent${stagesWithGaps.length === 1 ? "s" : ""} less than 10% of total content — consider increasing coverage`);
      }

      if (summary.metric_availability.time_on_page) {
        insights.push(`Average time on page across all content: ${summary.metric_totals.avg_time}s`);
      }
    }

    return insights.length > 0 ? insights : [`${summary.dataset_info.total_rows} content assets loaded across ${summary.stage_summary.length} funnel stages`];
  }

  app.post("/api/assets/compare", requireAuth, async (req: Request, res: Response) => {
    try {
      const { assetA, assetB } = req.body;
      if (!assetA || !assetB) {
        return res.status(400).json({ error: "Two assets required for comparison" });
      }

      const summary = await buildInsightsSummary();
      if (!summary) {
        return res.json({ verdict: "No data available for comparison." });
      }

      const findAsset = (id: string) => summary.top_content.find(a => a.contentId === id);
      const a = findAsset(assetA.contentId);
      const b = findAsset(assetB.contentId);

      const aData = a || { contentId: assetA.contentId, stage: assetA.stage, channel: assetA.utmChannel || "N/A", pageviews: assetA.pageviewsSum || 0, leads: assetA.uniqueLeads || 0, sqos: assetA.sqoCount || 0, avgTime: assetA.timeAvg || 0, product: assetA.productFranchise || "N/A" };
      const bData = b || { contentId: assetB.contentId, stage: assetB.stage, channel: assetB.utmChannel || "N/A", pageviews: assetB.pageviewsSum || 0, leads: assetB.uniqueLeads || 0, sqos: assetB.sqoCount || 0, avgTime: assetB.timeAvg || 0, product: assetB.productFranchise || "N/A" };

      let verdict: string;
      try {
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 150,
          system: "You compare two marketing content assets and provide a concise verdict. Be specific, data-driven, and actionable. Max 3 sentences. Identify the winner and explain why with specific metrics.",
          messages: [{
            role: "user",
            content: `Compare these two assets:\n\nAsset A: ${aData.contentId}\n- Stage: ${aData.stage}\n- Channel: ${aData.channel}\n- Pageviews: ${aData.pageviews}\n- Leads: ${aData.leads}\n- SQOs: ${aData.sqos}\n- Avg Time: ${aData.avgTime}s\n\nAsset B: ${bData.contentId}\n- Stage: ${bData.stage}\n- Channel: ${bData.channel}\n- Pageviews: ${bData.pageviews}\n- Leads: ${bData.leads}\n- SQOs: ${bData.sqos}\n- Avg Time: ${bData.avgTime}s`,
          }],
        });
        verdict = ((response.content[0] as any).text || "").trim();
        if (!verdict) throw new Error("Empty response");
      } catch {
        const aScore = aData.pageviews + aData.leads * 10 + aData.sqos * 50;
        const bScore = bData.pageviews + bData.leads * 10 + bData.sqos * 50;
        const winner = aScore >= bScore ? aData : bData;
        const loser = aScore >= bScore ? bData : aData;
        verdict = `${winner.contentId} outperforms with ${winner.pageviews} pageviews and ${winner.leads} leads vs ${loser.pageviews} pageviews and ${loser.leads} leads. Consider doubling down on ${winner.contentId}'s distribution strategy.`;
      }

      res.json({ verdict });
    } catch (error) {
      console.error("Error comparing assets:", error);
      res.status(500).json({ error: "Failed to compare assets" });
    }
  });

  app.get("/api/ai-insights", requireAuth, async (req: Request, res: Response) => {
    try {
      const page = (req.query.page as string) || "content-library";
      const cacheKey = page;
      const cached = insightsCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < INSIGHTS_CACHE_TTL) {
        return res.json({ insights: cached.insights });
      }

      const summary = await buildInsightsSummary();
      if (!summary) {
        return res.json({ insights: [] });
      }

      const insights = generateInsightsFromSummary(summary, page);
      insightsCache.set(cacheKey, { insights, timestamp: Date.now() });
      res.json({ insights });
    } catch (error) {
      console.error("Error generating AI insights:", error);
      res.json({ insights: [] });
    }
  });
}
