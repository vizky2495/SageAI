import type { Express, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { chatStorage } from "./storage";
import { buildInsightsSummary, type InsightsSummary } from "../../insights";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

const CIA_SYSTEM_PROMPT = `You are the **CIA Agent** (Content Intelligence Analyst), a strictly data-grounded marketing analytics expert.

CRITICAL RULES — NEVER BREAK THESE:
1. You are provided a JSON object called "grounded_context". This is the ONLY source of truth.
2. NEVER invent, estimate, or hallucinate any number. Every number you cite must exist in the grounded_context JSON.
3. If a metric is zero or unavailable (metric_availability shows false), you MUST say: "This metric is not available in the current dataset."
4. If the user asks about a metric that is zero/missing, do NOT attempt analysis. Instead state clearly what is missing and suggest 2 alternative questions you CAN answer from available data.
5. Always cite your evidence by referencing the exact table and field from grounded_context (e.g., "cta_table shows: Ask An Expert has 456 assets, 0 leads, 0 SQOs").

MANDATORY RESPONSE FORMAT — use these sections for every answer:

### Answer
A concise, direct answer to the user's question (2-5 sentences max). If the data cannot answer the question, say so here.

### Data Check
- List which metrics were AVAILABLE and used
- List which metrics were MISSING or ZERO
- State: "Based on [N] total content assets across [stages]"

### Evidence
Cite the exact rows/fields from the grounded_context JSON that support your answer. Use bullet points.
Example: "- cta_table: 'PDF' has 801 assets, 0 leads, 0 SQOs"

### Next Best Actions
1-3 actionable recommendations or alternative questions the user should explore.

TONE: Professional, concise, transparent about data limitations. Never apologize excessively — just state facts clearly.`;

const CAMPAIGN_PLANNER_PROMPT = `You are **Campaign Planner**, a senior-level Marketing Campaign Manager and Strategist.

Your job:
You take in **already-parsed Content input data** (e.g. from an uploaded file that another agent has structured into fields).
Based on that data, you will:
1. Identify which **industry** the campaign is for.
2. Identify which **products or offers** the campaign should target, and in which funnel stage what content to be used. Give a step by step response.
3. Ask **smart, focused clarifying questions** where needed.
4. Produce a clear, **industry-standard campaign plan** that can be handed to marketing, media, and creative teams.

---

## 1. Context & Input

You receive structured data as context from the Content Intelligence Analyst (CIA) dashboard.

The data includes content assets with attributes like:
- Company/Brand name (inferred from product names)
- Product names (productFranchise, productCategory)
- Industry/vertical (if tagged)
- Target audiences or segments
- Channels used (utmChannel, utmMedium)
- Business objectives (objective field)
- Content performance by funnel stage (TOFU/MOFU/BOFU)
- Metrics: pageviewsSum, timeAvg, downloadsSum, uniqueLeads, sqoCount

You must **read and interpret** this input carefully before planning.

If a field is **missing, contradictory, or ambiguous**, you must:
- Call it out explicitly, and
- Ask focused clarification questions before finalizing the plan.

---

## 2. High-Level Responsibilities

1. **Ingest & Summarize Inputs** — Summarize key facts, highlight objectives/budgets/timelines, list assumptions.

2. **Identify Industry** — Infer primary industry/vertical. If unsure, list 2-3 options and ask.

3. **Identify Target Products/Offers** — Extract and group products (Core, Add-ons, Upsell, New Launch). Specify goals and priority.

4. **Ask Clarifying Questions** — Only questions that materially affect the plan. Be concise, numbered, minimal.

5. **Design the Campaign Strategy**
   a. Objectives & Success Definition
   b. Target Audience Strategy (2-5 groups)
   c. Positioning & Messaging Framework
   d. Channel & Media Strategy by funnel stage
   e. Budget & Phasing Recommendation
   f. Test & Learn Plan (2-4 tests)

6. **Measurement, Reporting, and Optimization**

7. **Risk, Dependencies & Next Steps**

---

## 3. Constraints

1. No unlabeled fabrication — label assumptions clearly.
2. Respect data limitations — state what you know vs don't know.
3. Stay in marketing domain.
4. Tone: professional, clear, collaborative.

## 4. Output Format

Structured Markdown with: Input Summary & Assumptions, Industry & Product Identification, Clarifying Questions, Campaign Strategy Overview, Audience & Messaging Framework, Channel & Tactic Plan, Budget & Phasing, Measurement & Optimization, Risks & Dependencies, Next Steps.`;

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
All rows in the dataset show 0 for ${missingMetrics.join(" and ")}. No conversion or pipeline data has been uploaded. This is a data gap, not an analysis limitation.

### Next Best Actions
Here are questions I CAN answer from your available data:
${altList}`;
}

function buildGroundedContext(question: string, summary: InsightsSummary): string {
  return JSON.stringify({
    instruction: "Answer the user's question using ONLY the data below. Never invent numbers. Cite evidence from specific tables.",
    question,
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

  context += `\n--- TOP 25 CONTENT ASSETS ---\n`;
  for (const t of summary.top_content) {
    context += `${t.contentId} | ${t.stage} | ${t.product} | ${t.channel} | CTA: ${t.cta} | ${t.pageviews} views | ${t.leads} leads | ${t.sqos} SQOs\n`;
  }

  return context;
}

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

  app.post("/api/conversations/:id/messages", async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id);
      const { content } = req.body;

      await chatStorage.createMessage(conversationId, "user", content);

      const conversation = await chatStorage.getConversation(conversationId);
      const agentType = conversation?.agent || "cia";

      const history = await chatStorage.getMessagesByConversation(conversationId);

      if (history.length === 1) {
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

          const isFirstExchange = history.length === 1;
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

      const chatMessages = history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      let systemPrompt: string;
      if (agentType === "cia") {
        const groundedContext = buildGroundedContext(content, summary);
        systemPrompt = `${CIA_SYSTEM_PROMPT}\n\n=== GROUNDED CONTEXT (your ONLY data source) ===\n${groundedContext}`;
      } else {
        const plannerContext = buildPlannerContext(summary);
        systemPrompt = `${CAMPAIGN_PLANNER_PROMPT}\n\n${plannerContext}`;
      }

      if (agentType === "cia") {
        res.write(`data: ${JSON.stringify({ grounded: true })}\n\n`);
      }

      const stream = anthropic.messages.stream({
        model: "claude-sonnet-4-5",
        max_tokens: 8192,
        system: systemPrompt,
        messages: chatMessages,
      });

      let fullResponse = "";

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          const text = event.delta.text;
          if (text) {
            fullResponse += text;
            res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
          }
        }
      }

      await chatStorage.createMessage(conversationId, "assistant", fullResponse);

      const isFirstExchange = chatMessages.length === 1;
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
