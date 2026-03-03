import type { Express, Request, Response, NextFunction } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { chatStorage } from "./storage";
import { buildInsightsSummary, type InsightsSummary } from "../../insights";
import { requireAuth } from "../../auth";

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

const LIBRARIAN_PROMPT = `You are a friendly content librarian. You help users find and explore content assets in their library.

Your style:
- Keep it short. Answer the question directly, then offer a quick follow-up idea.
- Talk naturally — like a helpful colleague who knows the content library well.
- When listing assets, show the key details (ID, stage, product, channel) but keep it scannable. Top 5-10 max, mention the total.
- If nothing matches, say so briefly and suggest what to search for instead.
- Only use the provided data — never make up assets or metrics.
- Use light structure (bullets, short tables) only when it helps. Skip rigid section headers.
- If a question is vague, ask what they're looking for rather than dumping everything.`;

const CAMPAIGN_PLANNER_PROMPT = `You are a Campaign Planner AI. You take data from the Data Agent (audience segments, historical performance metrics, content library, channel stats) and produce actionable campaign plans. You follow industry best practices (HubSpot, Salesforce, Google Ads benchmarks) and never guess — you always ground recommendations in the data provided.

## CORE WORKFLOW

**Step 1 — Gather Info.** Before planning, ask clarifying questions if any of these are missing or unclear:
- Campaign objective (awareness, lead gen, conversion, retention)
- Target country/region
- Target industry and product
- Funnel stage (TOFU/MOFU/BOFU)
- Budget range (if applicable)
- Timeline / launch date
- Reuse existing content or create new?
- Preferred channels (or ask you to recommend)
Ask naturally — combine questions where possible. Don't list all 8 if some are obvious from context.

**Step 2 — Content Matching & Comparison.** When the user wants to use existing content:
- Search the content library for assets matching the campaign's funnel stage, industry, and product.
- Rank matches by historical performance (pageviews, leads, SQOs, engagement).
- If content is older than 6 months, flag it and compare against current best-performing content for the same segment.
- Present a comparison: content title, date, funnel stage, industry, product, country, key metrics, and match score (high/medium/low).
- Explain why one piece outperforms another with specific data.
- Suggest improvements for older content (update CTA, refresh visuals, localize copy).

**Step 3 — Channel Recommendation.** Based on historical data:
- Recommend the best-performing channel(s) for the given objective, audience, and funnel stage.
- Show supporting data: past performance per channel, cost per result, audience reach.
- Rank channels and explain tradeoffs if multiple are viable.

**Step 4 — Build the Plan.** Generate a structured campaign plan:
- **Executive Summary** — objective, audience, timeline, budget
- **Target Audience** — segment details, country, industry, funnel stage
- **Channel Strategy** — recommended channels with data-backed justification
- **Content Plan** — which content to use, why it was selected, modifications needed
- **Content Comparison Table** — side-by-side recommended vs alternatives with performance data
- **Timeline & Milestones** — week-by-week or phase-by-phase rollout
- **KPIs & Success Metrics** — what to measure, benchmark targets from historical data
- **Budget Allocation** — use this exact format on its own line: \`<!-- BUDGET:{"items":[{"name":"Channel","pct":30}]} -->\`
- **Risk & Recommendations** — what could go wrong, contingency suggestions

**Step 5 — Readiness Score.** End every completed plan with:
\`<!-- SCORE:XX -->\` (0-100) and a brief checklist using ✅/❌ for: Content Data Match, Stage Coverage, Product, Channel Strategy, Budget, KPIs.

## BEST PRACTICES
- Use historical data as the primary decision driver, not assumptions.
- Recommend A/B testing where applicable.
- Follow platform-specific best practices (LinkedIn for B2B top-funnel, Google Ads for bottom-funnel intent).
- Recommend content refresh for assets older than 6 months.
- Align messaging to the buyer journey stage.
- Factor in seasonality and regional nuances.

## STRICT RULES
- Never hallucinate metrics or performance data. Only use what the data provides.
- If data is insufficient for a recommendation, say so and ask for more context.
- Always show your reasoning — explain why a content piece or channel is recommended.
- Keep recommendations concise and actionable. No filler.
- Only use provided data. Label any assumptions explicitly.
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
    context += `${t.contentId} | Name: ${t.name} | Type: ${t.contentType} | Stage: ${t.stage} | Product: ${t.product} | Channel: ${t.channel} | Objective: ${t.objective} | CTA: ${t.cta} | ${t.pageviews} views | ${t.downloads} downloads | ${t.leads} leads | ${t.sqos} SQOs | avg time ${t.avgTime}s\n`;
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

const MAX_CONTEXT_EXCHANGES = 4;

export function registerChatRoutes(app: Express): void {
  app.get("/api/conversations", requireAuth, async (req: Request, res: Response) => {
    try {
      const agent = (req.query.agent as string) || undefined;
      const userId = (req as any).userId as string;
      const convos = await chatStorage.getAllConversations(agent, userId);

      for (const conv of convos) {
        if (conv.title === "New Chat") {
          await chatStorage.updateConversationTitle(conv.id, "New Conversation");
          conv.title = "New Conversation";
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
        await chatStorage.updateConversationTitle(conversationId, "New Conversation");
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
                model: "claude-sonnet-4-5",
                max_tokens: 30,
                system: "Summarize the following user query into a short conversation title of 5-8 words. Extract the core topic, action, and key filters (product, region, channel, metric). Strip filler words and greetings. Use title case. Return only the title, nothing else. If the message is just a greeting (hi, hello, hey) or too vague to summarize, return exactly: New Conversation",
                messages: [
                  { role: "user", content },
                ],
              });
              const title = (titleResponse.content[0] as any).text?.trim() || "New Conversation";
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
      if (agentType === "cia") {
        const groundedContext = buildGroundedContext(content, summary);
        systemPrompt = `${buildCIASystemPrompt(summary)}\n\n=== GROUNDED CONTEXT (your ONLY data source) ===\n${groundedContext}`;
      } else if (agentType === "librarian") {
        const librarianContext = buildPlannerContext(summary);
        systemPrompt = `${LIBRARIAN_PROMPT}\n\n${librarianContext}`;
      } else {
        const plannerContext = buildPlannerContext(summary);
        systemPrompt = `${CAMPAIGN_PLANNER_PROMPT}\n\n${plannerContext}`;
      }

      if (agentType === "cia" || agentType === "librarian") {
        res.write(`data: ${JSON.stringify({ grounded: true })}\n\n`);
      }

      let fullResponse = "";
      let retryAttempt = false;

      const tokenLimit = agentType === "planner" ? 4096 : 1500;

      const runStream = async () => {
        const stream = anthropic.messages.stream({
          model: "claude-sonnet-4-5",
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
            model: "claude-sonnet-4-5",
            max_tokens: 30,
            system: "Summarize the following user query into a short conversation title of 5-8 words. Extract the core topic, action, and key filters (product, region, channel, metric). Strip filler words and greetings. Use title case. Return only the title, nothing else. If the message is just a greeting (hi, hello, hey) or too vague to summarize, return exactly: New Conversation",
            messages: [
              { role: "user", content },
            ],
          });
          const title = (titleResponse.content[0] as any).text?.trim() || "New Conversation";
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
}
