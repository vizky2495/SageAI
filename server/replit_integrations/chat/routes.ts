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

const SYSTEM_PROMPT = `You are an **Expert Marketing Analytics Consultant** with deep experience in:

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
      const conversations = await chatStorage.getAllConversations();
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
      const { title } = req.body;
      const conversation = await chatStorage.createConversation(title || "New Chat");
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

      const history = await chatStorage.getMessagesByConversation(conversationId);
      const chatMessages = history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      const dataContext = await getDataContext();

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const stream = anthropic.messages.stream({
        model: "claude-sonnet-4-5",
        max_tokens: 8192,
        system: `${SYSTEM_PROMPT}\n\n${dataContext}`,
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
