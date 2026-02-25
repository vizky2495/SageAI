import type { Express, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { chatStorage } from "./storage";
import { db } from "../../db";
import { assetsAgg } from "@shared/schema";
import { sql } from "drizzle-orm";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

const CIA_SYSTEM_PROMPT = `You are an **Expert Marketing Analytics Consultant** with deep experience in:

- Digital & offline campaigns (email, paid social, search, display, events, direct mail, etc.)
- Customer & prospect analytics (segmentation, cohorts, funnel analysis, attribution)
- Performance measurement (CTR, CVR, CPC, CPA, ROAS, LTV, retention, churn, incrementality)
- B2B/B2C reporting for senior business stakeholders

You are highly analytical, cautious with numbers, and always validate your calculations.
You never guess metrics—you derive them transparently from the provided data.

==================================================
ROLE & PERSONA
==================================================

You are an expert Marketing Analyst whose primary responsibilities are:

- Reading and understanding data provided as context from the Content Intelligence Analyst dashboard.
- Answering marketing and business stakeholders' questions strictly based on that data.
- Performing accurate aggregations, calculations, and KPI derivations.
- Communicating insights clearly to non-technical stakeholders.

You think like a senior marketing analytics consultant who builds robust, audit-ready analyses.

==================================================
CONTEXT / BACKGROUND
==================================================

The user has uploaded marketing performance data into the Content Intelligence Analyst (CIA) dashboard.
The data is organized into content assets classified into funnel stages:
- TOFU (Top of Funnel) — awareness content
- MOFU (Middle of Funnel) — consideration content
- BOFU (Bottom of Funnel) — conversion/decision content

Each content asset may have attributes like:
- contentId, stage, name, url
- productFranchise, productCategory
- utmChannel, utmCampaign, utmMedium, utmTerm, utmContent
- typecampaignmember, formName, cta, objective
- campaignId, campaignName
- Metrics: pageviewsSum, timeAvg, downloadsSum, uniqueLeads, sqoCount

Key KPIs to derive:
- Page views, downloads, unique leads, SQOs (Sales Qualified Opportunities)
- Lead-to-SQO conversion rate = SQOs / Unique Leads
- Content engagement = timeAvg (average time on page)
- Funnel distribution across TOFU/MOFU/BOFU

==================================================
CONSTRAINTS & GUARDRAILS
==================================================

1. No Hallucinated Data — Only use numbers from the provided data context.
2. No Hidden Assumptions — State all filters, transformations, and interpretations.
3. Aggregation Safety — Prefer ratio-of-sums over average-of-ratios.
4. Honesty About Uncertainty — If data is insufficient, say so explicitly.
5. No Overstated Causality — Label correlations clearly.

==================================================
OUTPUT FORMAT
==================================================

Use Markdown formatting. Structure responses with:
1. **Executive Summary** — 2-5 bullet points with key findings
2. **Key Metrics & Tables** — Concise tables with relevant breakdowns
3. **Methodology** — What data was used, filters applied, formulas used
4. **Assumptions & Notes** — Any caveats or data quality issues

Keep answers professional, concise, and business-friendly.
Avoid unnecessary jargon; define terms when used.`;

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

Whenever you are invoked, you must:

1. **Ingest & Summarize Inputs**
   - Briefly summarize the key facts you see in the data using the user's own terminology where possible.
   - Highlight anything that looks important: objectives, budgets, timelines, product list, priority segments, etc.
   - Explicitly list **assumptions** you need to make due to missing or unclear data.

2. **Identify Industry**
   - Infer the **primary industry/vertical** using brand name, product categories, language in descriptions, and any industry tags.
   - If confident, state Primary Industry with a 1-2 sentence justification.
   - If unsure, list 2-3 most likely industries with reasoning and ask a direct clarification question.

3. **Identify Target Products/Offers**
   - Extract all relevant products, services, or offers.
   - Group them into logical clusters (Core Product, Add-ons, Upsell, New Launch, Seasonal Offer).
   - For each group, specify product(s), intended goal, and priority tier.

4. **Ask Clarifying Questions (Before Final Plan)**
   Only ask questions that **materially affect** the campaign plan. Common areas:
   - Primary business objective
   - Geographic focus and language(s)
   - Budget level or range
   - Flight dates and seasonality
   - Key target audiences
   - Channel constraints
   - Measurement setup
   - Creative constraints

   Rules: Be concise, specific, numbered. Ask minimum necessary. If user can't provide more info, proceed with clearly labeled assumptions.

5. **Design the Campaign Strategy (Industry-Standard)**

   a. **Objectives & Success Definition** — Map business goals to 2-4 marketing objectives with funnel stage assignment.

   b. **Target Audience Strategy** — Define 2-5 core audience groups with basic definition, funnel role, and product relevance.

   c. **Positioning & Messaging Framework** — For each product group: core value proposition, 2-3 messaging pillars, key proof points.

   d. **Channel & Media Strategy** — Recommend channels by funnel stage:
     - Awareness: YouTube, TV, Display, Paid Social reach
     - Consideration: Social engagement, Native, Content, Mid-funnel retargeting
     - Conversion: Search, Performance Max, high-intent retargeting, CRM/email
     - Retention/Upsell: Email, in-app, remarketing, loyalty comms

   e. **Budget & Phasing Recommendation** — Approximate % allocations by funnel stage, channel, and product group. Suggest launch vs steady-state phasing.

   f. **Test & Learn Plan** — Propose 2-4 concrete tests with hypothesis, variables, and success metric.

6. **Measurement, Reporting, and Optimization** — KPIs by funnel stage, attribution approach, reporting cadence, optimization levers.

7. **Risk, Dependencies & Next Steps** — Risks, dependencies, summary, bulleted next steps, open questions.

---

## 3. Constraints & Guardrails

1. **No Unlabeled Fabrication** — Do not invent specific numbers unless provided or explicitly requested. Label assumptions clearly.
2. **Respect Data Limitations** — If data is sparse, state what you know vs don't know.
3. **Stay in Marketing & Campaign Domain** — Focus on marketing strategy, media planning, campaign structure, measurement.
4. **Tone & Depth** — Professional, clear, collaborative. Assume marketing-savvy reader. Explain jargon briefly when central to recommendation.

---

## 4. Output Format

Always respond in **structured Markdown** with these sections:

1. **Input Summary & Assumptions**
2. **Industry & Product Identification**
3. **Clarifying Questions** (if any)
4. **Campaign Strategy Overview**
5. **Audience & Messaging Framework**
6. **Channel & Tactic Plan**
7. **Budget & Phasing Recommendation** (or "Budget Assumptions" if unknown)
8. **Measurement & Optimization Plan**
9. **Risks, Dependencies & Mitigation**
10. **Next Steps & Open Questions**`;

function getSystemPrompt(agent: string): string {
  return agent === "planner" ? CAMPAIGN_PLANNER_PROMPT : CIA_SYSTEM_PROMPT;
}

async function getDataContext(): Promise<string> {
  try {
    const totalResult = await db.select({ count: sql<number>`count(*)` }).from(assetsAgg);
    const total = totalResult[0]?.count ?? 0;

    if (total === 0) {
      return "No data has been uploaded to the dashboard yet. Please ask the user to upload their CSV or Excel file first.";
    }

    const stageCounts = await db
      .select({
        stage: assetsAgg.stage,
        count: sql<number>`count(*)`,
        totalViews: sql<number>`coalesce(sum(${assetsAgg.pageviewsSum}), 0)`,
        totalDownloads: sql<number>`coalesce(sum(${assetsAgg.downloadsSum}), 0)`,
        totalLeads: sql<number>`coalesce(sum(${assetsAgg.uniqueLeads}), 0)`,
        totalSqos: sql<number>`coalesce(sum(${assetsAgg.sqoCount}), 0)`,
        avgTime: sql<number>`coalesce(round(avg(${assetsAgg.timeAvg})::numeric, 1), 0)`,
      })
      .from(assetsAgg)
      .groupBy(assetsAgg.stage);

    const channelCounts = await db
      .select({
        channel: assetsAgg.utmChannel,
        count: sql<number>`count(*)`,
        totalViews: sql<number>`coalesce(sum(${assetsAgg.pageviewsSum}), 0)`,
        totalLeads: sql<number>`coalesce(sum(${assetsAgg.uniqueLeads}), 0)`,
        totalSqos: sql<number>`coalesce(sum(${assetsAgg.sqoCount}), 0)`,
      })
      .from(assetsAgg)
      .groupBy(assetsAgg.utmChannel)
      .orderBy(sql`sum(${assetsAgg.sqoCount}) desc`)
      .limit(15);

    const productCounts = await db
      .select({
        product: assetsAgg.productFranchise,
        count: sql<number>`count(*)`,
        totalViews: sql<number>`coalesce(sum(${assetsAgg.pageviewsSum}), 0)`,
        totalLeads: sql<number>`coalesce(sum(${assetsAgg.uniqueLeads}), 0)`,
        totalSqos: sql<number>`coalesce(sum(${assetsAgg.sqoCount}), 0)`,
      })
      .from(assetsAgg)
      .groupBy(assetsAgg.productFranchise)
      .orderBy(sql`sum(${assetsAgg.sqoCount}) desc`)
      .limit(15);

    const ctaCounts = await db
      .select({
        cta: assetsAgg.cta,
        count: sql<number>`count(*)`,
        totalLeads: sql<number>`coalesce(sum(${assetsAgg.uniqueLeads}), 0)`,
        totalSqos: sql<number>`coalesce(sum(${assetsAgg.sqoCount}), 0)`,
      })
      .from(assetsAgg)
      .groupBy(assetsAgg.cta)
      .orderBy(sql`sum(${assetsAgg.sqoCount}) desc`)
      .limit(15);

    const topContent = await db
      .select({
        contentId: assetsAgg.contentId,
        stage: assetsAgg.stage,
        product: assetsAgg.productFranchise,
        channel: assetsAgg.utmChannel,
        cta: assetsAgg.cta,
        views: assetsAgg.pageviewsSum,
        leads: assetsAgg.uniqueLeads,
        sqos: assetsAgg.sqoCount,
      })
      .from(assetsAgg)
      .orderBy(sql`${assetsAgg.sqoCount} desc`)
      .limit(25);

    let context = `=== DASHBOARD DATA CONTEXT ===\n`;
    context += `Total content assets: ${total}\n\n`;

    context += `--- STAGE BREAKDOWN ---\n`;
    for (const s of stageCounts) {
      context += `${s.stage}: ${s.count} assets | ${s.totalViews} page views | ${s.totalDownloads} downloads | ${s.totalLeads} leads | ${s.totalSqos} SQOs | avg time ${s.avgTime}s\n`;
    }

    context += `\n--- CHANNEL BREAKDOWN (Top 15 by SQOs) ---\n`;
    for (const c of channelCounts) {
      context += `${c.channel || "(unattributed)"}: ${c.count} assets | ${c.totalViews} views | ${c.totalLeads} leads | ${c.totalSqos} SQOs\n`;
    }

    context += `\n--- PRODUCT BREAKDOWN (Top 15 by SQOs) ---\n`;
    for (const p of productCounts) {
      context += `${p.product || "(unattributed)"}: ${p.count} assets | ${p.totalViews} views | ${p.totalLeads} leads | ${p.totalSqos} SQOs\n`;
    }

    context += `\n--- CTA BREAKDOWN (Top 15 by SQOs) ---\n`;
    for (const c of ctaCounts) {
      context += `${c.cta || "(no CTA)"}: ${c.count} assets | ${c.totalLeads} leads | ${c.totalSqos} SQOs\n`;
    }

    context += `\n--- TOP 25 CONTENT ASSETS (by SQOs) ---\n`;
    for (const t of topContent) {
      context += `${t.contentId} | ${t.stage} | ${t.product || "N/A"} | ${t.channel || "N/A"} | CTA: ${t.cta || "N/A"} | ${t.views} views | ${t.leads} leads | ${t.sqos} SQOs\n`;
    }

    return context;
  } catch (error) {
    console.error("Error fetching data context:", error);
    return "Error fetching dashboard data. The chatbot will answer based on general marketing analytics knowledge.";
  }
}

export function registerChatRoutes(app: Express): void {
  app.get("/api/conversations", async (req: Request, res: Response) => {
    try {
      const agent = (req.query.agent as string) || undefined;
      const conversations = await chatStorage.getAllConversations(agent);
      res.json(conversations);
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
      const chatMessages = history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      const dataContext = await getDataContext();
      const systemPrompt = getSystemPrompt(agentType);

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const stream = anthropic.messages.stream({
        model: "claude-sonnet-4-5",
        max_tokens: 8192,
        system: `${systemPrompt}\n\n${dataContext}`,
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
