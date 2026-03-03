import type { Express, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { chatStorage } from "./storage";
import { buildInsightsSummary, type InsightsSummary } from "../../insights";

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
  return `You are a strict data-only assistant. You have access to a PostgreSQL database with the following schema:

${SCHEMA_DESCRIPTION}

Rules you must follow absolutely:

1. ONLY answer questions that can be resolved using the provided aggregated data context below.
2. NEVER invent, estimate, assume, or hallucinate any data point that is not in the data context.
3. NEVER provide opinions, advice, recommendations, predictions, or creative content.
4. NEVER use outside knowledge — if the data does not contain the answer, say "This information is not available in the current dataset."
5. When the user asks a vague question, ask them to clarify by listing the available data dimensions (stages, channels, products, CTAs, etc.).
6. Keep responses short and factual — numbers, tables, one-line summaries only.
7. When showing numbers, format them properly: use commas for thousands (e.g., 1,234), 2 decimal places for averages/percentages, and label units clearly (e.g., "58.0 seconds").
8. If data has more than 20 items in a category, summarize the top 10 and say "Showing top 10 of [X] results."
9. Never reveal raw SQL queries, internal table names, or database structure in your responses to the user. The schema above is for your reference only — never quote it back.
10. If a metric is zero or unavailable (metric_availability shows false), you MUST say: "This metric is not available in the current dataset." Then suggest 2 alternative questions you CAN answer.

MANDATORY RESPONSE FORMAT — use these exact sections for every answer:

### Answer
A concise, direct answer to the user's question (2-5 sentences max). If the data cannot answer the question, say so here.

### Data Check
- List which metrics were AVAILABLE and used
- List which metrics were MISSING or ZERO
- State: "Based on ${summary.dataset_info.total_rows} content assets across ${summary.stage_summary.map(s => s.stage).join("/")}"

### Evidence
Cite the exact values from the data context that support your answer. Use bullet points.
Example: "- Channel: Email has 2 assets, 0 page views, 0 leads"

### Next Best Actions
1-3 alternative questions the user could explore with the available data. Keep these data-grounded.

TONE: Professional, concise, transparent about data limitations. Never apologize — just state facts clearly.`;
}

const LIBRARIAN_PROMPT = `You are **Content Librarian**, an expert content discovery assistant for the Content Intelligence Analyst (CIA) dashboard.

Your job:
Help users find, explore, and understand content assets in their library. You have access to the full content database.

## What you do:
1. **Find content** — Help users locate specific assets by content ID, name, URL, product, channel, stage, or any attribute.
2. **Discover patterns** — Show what content exists for a given product, channel, funnel stage, CTA type, or campaign.
3. **Summarize coverage** — Identify gaps or concentrations in the content library (e.g., "We have 50 TOFU assets but only 5 BOFU").
4. **Recommend exploration** — Suggest related content or areas to explore based on the user's query.

## Rules:
1. ONLY answer using the provided data context. Never invent content assets or metrics.
2. When listing content, include: Content ID, Stage, Product, Channel, and CTA when available.
3. Format responses with clear sections and bullet points for readability.
4. If a content ID or search term has no matches, say so clearly and suggest alternative searches.
5. Keep responses concise but comprehensive — show top 10 results and note the total count.
6. When the user asks vague questions, list available dimensions they can filter by.

## Response Format:
### Results
Direct answer with the content assets or information found.

### Coverage Summary
Brief note on how many assets match and what stages/products/channels they span.

### Explore Further
2-3 follow-up questions the user could ask to dig deeper.

TONE: Helpful, organized, data-driven. Like a knowledgeable librarian who knows every asset in the collection.`;

const CAMPAIGN_PLANNER_PROMPT = `You are **Campaign Planner**, a content-effectiveness assessment specialist and campaign strategist.

Your primary job is to help users evaluate how a **specific content piece** will perform in a campaign by comparing it against **similar content that already exists in the database**. You then build a data-backed campaign plan grounded in that assessment.

---

## 1. MANDATORY: Ask Questions First

Before creating ANY plan, you MUST gather information from the user. Ask these questions clearly and wait for answers:

1. **What content piece** are you planning to use? (title, description, or link)
2. **What content type** is it? (PDF, Webinar, Video, Blog, Demo, Trial, SMA, or other)
3. **What product** is it for? (product name or franchise)
4. **What industry or business objective** does it target? (e.g., NCA — New Customer Acquisition, Retention, Cross-sell, etc.)
5. **What funnel stage** are you targeting? (TOFU — awareness, MOFU — consideration, BOFU — decision)
6. **What is the campaign goal?** (e.g., generate leads, drive downloads, increase pageviews, convert SQOs)

Do NOT skip these questions. Do NOT make assumptions. Ask them all in your first response, clearly numbered.

---

## 2. Content Effectiveness Assessment

Once you have the user's answers, perform a **like-for-like comparison** using the data context provided:

### Matching Rules (STRICT):
1. **Content type must match** — ALWAYS compare same type: PDF vs PDF, Webinar vs Webinar, Video vs Video, etc. Never compare a PDF to a Webinar.
2. **Priority for narrowing matches** (in order):
   a. **Funnel stage** (highest priority) — match TOFU/MOFU/BOFU first
   b. **Industry/Objective** — match the objective field (NCA, Retention, etc.)
   c. **Product** — match productFranchise
3. **If exact match exists** (same type + same stage + same objective + same product): Report those benchmarks directly.
4. **If partial match only**: Explain clearly which criteria you relaxed and why. Example: "I couldn't find a PDF for CloudShield in MOFU with NCA objective, but here's how PDFs in MOFU performed across all products and objectives."
5. **If no match at all** for that content type: Say so honestly and suggest the closest available data.

### Benchmark Metrics to Report:
For matched content, show a comparison table with:
- Number of similar assets found
- Average pageviews
- Average time on page (seconds)
- Total downloads
- Total unique leads
- Total SQOs (Sales Qualified Opportunities)
- Best-performing asset in that group (with its metrics)

---

## 3. Campaign Plan (After Assessment)

Only AFTER the content effectiveness assessment, build the campaign plan:

1. **Input Summary & Assumptions** — What the user told you, what you assumed
2. **Content Effectiveness Assessment** — The comparison data (table format)
3. **Recommendation** — Based on data, is this content type effective for this stage/product? What worked best?
4. **Campaign Strategy Overview** — Objectives, target audience, positioning
5. **Channel & Tactic Plan** — Which channels to use, based on what performed well in the data
6. **Budget & Phasing** — When you recommend a budget split, output it in this exact format on its own line:
   \`<!-- BUDGET:{"items":[{"name":"Channel Name","pct":30},{"name":"Channel 2","pct":25}]} -->\`
   Then also write the budget as a readable table for the user.
7. **Measurement & KPIs** — What to track, expected benchmarks based on similar content performance
8. **Risks & Next Steps**

---

## 4. Campaign Readiness Score

At the END of every completed plan, output a readiness score. Use this EXACT format:

\`<!-- SCORE:XX -->\`

Where XX is 0-100, scored as:
- Content data match found: 20 points (full match = 20, partial = 10, none = 0)
- Funnel stage coverage: 20 points (stage identified and data available = 20)
- Product identified: 15 points (clear product = 15, vague = 5)
- Channel strategy defined: 15 points (channels recommended with data backing = 15)
- Budget allocated: 15 points (budget split provided = 15)
- KPIs defined: 15 points (measurable KPIs set = 15)

Then output a checklist:
- ✅ or ❌ Content Data Match — [brief reason]
- ✅ or ❌ Funnel Stage Coverage — [brief reason]
- ✅ or ❌ Product Identified — [brief reason]
- ✅ or ❌ Channel Strategy — [brief reason]
- ✅ or ❌ Budget Allocated — [brief reason]
- ✅ or ❌ KPIs Defined — [brief reason]

---

## 5. Constraints

1. No unlabeled fabrication — label all assumptions clearly.
2. Respect data limitations — state what you know vs don't know from the data.
3. ALWAYS compare same content types (PDF to PDF, Webinar to Webinar, etc.).
4. Prioritize: funnel stage > objective/industry > product when finding matches.
5. Stay in marketing domain.
6. Tone: professional, data-driven, collaborative.`;

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

  let alternatives = "";
  if (availability.pageviews || availability.time_on_page) {
    alternatives += "\n- \"Which content assets have the highest engagement (page views / time on page)?\"";
  }
  if (summary.stage_summary.length > 0) {
    alternatives += "\n- \"What is the content distribution across funnel stages (TOFU/MOFU/BOFU)?\"";
  }
  if (summary.cta_table.length > 0) {
    alternatives += "\n- \"Which CTAs have the most content assets?\"";
  }
  if (summary.channel_mix.length > 0) {
    alternatives += "\n- \"How is content distributed across channels?\"";
  }

  const altList = alternatives.split("\n").filter(Boolean).slice(0, 2).join("\n");

  return `### Answer
Cannot answer this question because **${missingMetrics.join(" and ")}** ${missingMetrics.length === 1 ? "is" : "are"} missing or zero across the entire dataset.

### Data Check
- **Available metrics**: ${availableMetrics.length > 0 ? availableMetrics.join(", ") : "none with non-zero values"}
- **Missing/zero metrics**: ${missingMetrics.join(", ")}
- Based on ${summary.dataset_info.total_rows} total content assets across stages: ${stages}
- Products in dataset: ${products}

### Evidence
All rows in the dataset show 0 for ${missingMetrics.join(" and ")}. No data has been uploaded for these metrics. This is a data gap, not an analysis limitation.

### Next Best Actions
Here are questions I CAN answer from your available data:
${altList}`;
}

function buildGroundedContext(question: string, summary: InsightsSummary): string {
  const { resolvedFields, operation } = resolveUserTerms(question);

  return JSON.stringify({
    instruction: "Answer the user's question using ONLY the data below. Never invent numbers. Cite evidence from specific tables. Format numbers with commas for thousands, 2 decimal places for averages.",
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
  app.get("/api/conversations", async (req: Request, res: Response) => {
    try {
      const agent = (req.query.agent as string) || undefined;
      const convos = await chatStorage.getAllConversations(agent);

      for (const conv of convos) {
        if (conv.title === "New Chat") {
          const msgs = await chatStorage.getMessagesByConversation(conv.id);
          const firstUserMsg = msgs.find(m => m.role === "user");
          if (firstUserMsg) {
            const title = firstUserMsg.content.slice(0, 60) + (firstUserMsg.content.length > 60 ? "..." : "");
            await chatStorage.updateConversationTitle(conv.id, title);
            conv.title = title;
          }
        }
      }

      res.json(convos);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  app.get("/api/conversations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const conversation = await chatStorage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const messages = await chatStorage.getMessagesByConversation(id);
      res.json({ ...conversation, messages });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  app.post("/api/conversations", async (req: Request, res: Response) => {
    try {
      const { title, agent } = req.body;
      const conversation = await chatStorage.createConversation(title || "New Chat", agent || "cia");
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  app.delete("/api/conversations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await chatStorage.deleteConversation(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  app.get("/api/chat/suggestions", async (_req: Request, res: Response) => {
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

  app.post("/api/conversations/:id/messages", async (req: Request, res: Response) => {
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
        const fallback = content.slice(0, 60) + (content.length > 60 ? "..." : "");
        await chatStorage.updateConversationTitle(conversationId, fallback);
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
                max_tokens: 60,
                system: "Generate a short, catchy one-liner title (max 6 words) for this chat conversation. Return ONLY the title text, no quotes, no punctuation at the end.",
                messages: [
                  { role: "user", content },
                  { role: "assistant", content: refusal.slice(0, 300) },
                ],
              });
              const title = (titleResponse.content[0] as any).text?.trim() || content.slice(0, 50);
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

      const runStream = async () => {
        const stream = anthropic.messages.stream({
          model: "claude-sonnet-4-5",
          max_tokens: 8192,
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
            max_tokens: 60,
            system: "Generate a short, catchy one-liner title (max 6 words) for this chat conversation. Return ONLY the title text, no quotes, no punctuation at the end.",
            messages: [
              { role: "user", content: chatMessages[0].content },
              { role: "assistant", content: fullResponse.slice(0, 500) },
            ],
          });
          const title = (titleResponse.content[0] as any).text?.trim() || content.slice(0, 50);
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
