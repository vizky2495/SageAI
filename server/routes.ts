import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

import { z } from "zod";
import https from "https";
import http from "http";
import Anthropic from "@anthropic-ai/sdk";
import * as XLSX from "xlsx";
import { buildInsightsSummary } from "./insights";
import {
  requireAuth,
  requireAdmin,
  loginLimiter,
  getSessionFromRequest,
  createSession,
  destroySession,
  adminTokens,
} from "./auth";
import { registerContentRoutes, analyzeContentWithAI } from "./content-routes";
import { type StructuredKeywordTags, normalizeKeywordTags, flattenKeywordTags } from "@shared/schema";
import { parseDelimitedText } from "./csv-parser";
import { buildJourneySummaries, getJourneyBuildProgress, resetJourneyBuildProgress } from "./journey-builder";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  registerContentRoutes(app);

  const JOURNEY_CACHE_TTL_MS = 5 * 60 * 1000;
  let journeySummaryCache: any = null;
  let journeySummaryCacheTime = 0;

  const feedbackTagsSchema = z.object({
    contentId: z.string().min(1),
    author: z.string().min(1),
    tags: z.array(z.string()).min(1),
    note: z.string().optional().nullable(),
    salesforceRef: z.string().optional().nullable(),
  });

  app.post("/api/sales-feedback", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = feedbackTagsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid feedback data", errors: parsed.error.flatten().fieldErrors });
      }
      const { contentId, author, tags, note, salesforceRef } = parsed.data;
      const { ALL_FEEDBACK_TAGS } = await import("@shared/schema");
      const allValid = tags.every((t: string) => ALL_FEEDBACK_TAGS.includes(t as any));
      if (!allValid) {
        return res.status(400).json({ message: "One or more tags are not in the predefined list" });
      }
      const entry = await storage.createSalesFeedback({
        contentId,
        author,
        tags,
        note: note || null,
        salesforceRef: salesforceRef || null,
      });
      res.status(201).json(entry);
    } catch (err: any) {
      console.error("Sales feedback create error:", err);
      res.status(500).json({ message: "Failed to submit feedback" });
    }
  });

  app.get("/api/sales-feedback/recent", requireAuth, async (req: Request, res: Response) => {
    try {
      const limit = Math.max(1, Math.min(parseInt(req.query.limit as string) || 5, 20));
      const entries = await storage.getRecentSalesFeedback(limit);
      res.json(entries);
    } catch (err: any) {
      console.error("Recent sales feedback error:", err);
      res.status(500).json({ message: "Failed to fetch recent feedback" });
    }
  });

  app.get("/api/sales-feedback/:contentId", requireAuth, async (req: Request, res: Response) => {
    try {
      const entries = await storage.getSalesFeedbackByContentId(req.params.contentId as string);
      res.json(entries);
    } catch (err: any) {
      console.error("Sales feedback fetch error:", err);
      res.status(500).json({ message: "Failed to fetch feedback" });
    }
  });

  app.post("/api/sales-feedback/batch-stats", requireAuth, async (req: Request, res: Response) => {
    try {
      const { contentIds } = req.body as { contentIds?: string[] };
      if (!Array.isArray(contentIds) || contentIds.length === 0) {
        return res.json({});
      }
      const stats = await storage.getSalesFeedbackStatsBatch(contentIds.slice(0, 500));
      res.json(stats);
    } catch (err: any) {
      console.error("Sales feedback batch stats error:", err);
      res.status(500).json({ message: "Failed to fetch batch feedback stats" });
    }
  });

  app.get("/api/sales-feedback/:contentId/stats", requireAuth, async (req: Request, res: Response) => {
    try {
      const stats = await storage.getSalesFeedbackStats(req.params.contentId as string);
      res.json(stats);
    } catch (err: any) {
      console.error("Sales feedback stats error:", err);
      res.status(500).json({ message: "Failed to fetch feedback stats" });
    }
  });

  app.post("/api/auth/login", loginLimiter, async (req: Request, res: Response) => {
    try {
      const { displayName, password, role, firstName, lastName } = req.body as { displayName?: string; password?: string; role?: string; firstName?: string; lastName?: string };
      if (!displayName?.trim() || !password) {
        return res.status(400).json({ message: "Email and password are required." });
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const emailLower = displayName.trim().toLowerCase();
      if (!emailRegex.test(emailLower)) {
        return res.status(400).json({ message: "Please enter a valid email address." });
      }
      if (!emailLower.endsWith("@sage.com")) {
        return res.status(400).json({ message: "Only @sage.com email addresses are allowed." });
      }
      const isAdminRole = role === "admin";
      const expectedPassword = isAdminRole ? process.env.ADMIN_PASSWORD : process.env.USER_PASSWORD;
      if (!expectedPassword) {
        return res.status(500).json({ message: `${isAdminRole ? "Admin" : "User"} password not configured.` });
      }
      if (password !== expectedPassword) {
        return res.status(401).json({ message: "Invalid password." });
      }
      let user = await storage.getUserByDisplayName(emailLower);
      let isNewUser = false;
      if (user) {
        if (isAdminRole && !user.isAdmin) {
          user = await storage.updateUserAdmin(user.id, true) || user;
        }
      } else {
        if (!firstName?.trim() || !lastName?.trim()) {
          return res.status(400).json({ message: "Looks like you're new here! Please enter your first and last name to get started.", needsName: true });
        }
        user = await storage.createUser({ displayName: emailLower, firstName: firstName.trim(), lastName: lastName.trim(), isAdmin: isAdminRole });
        isNewUser = true;
      }
      const token = createSession(user.id, user.isAdmin);
      res.json({ token, user: { id: user.id, displayName: user.displayName, firstName: user.firstName, lastName: user.lastName, isAdmin: user.isAdmin }, isNewUser });
    } catch (error) {
      console.error("Auth login error:", error);
      res.status(500).json({ message: "Login failed." });
    }
  });

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    const session = getSessionFromRequest(req);
    if (!session) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUserById(session.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    res.json({ id: user.id, displayName: user.displayName, firstName: user.firstName, lastName: user.lastName, isAdmin: user.isAdmin });
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith("Bearer ")) {
      destroySession(auth.slice(7));
    }
    res.json({ ok: true });
  });

  app.post("/api/admin/login", loginLimiter, (req: Request, res: Response) => {
    const { password } = req.body as { password?: string };
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      return res.status(500).json({ message: "Admin password not configured" });
    }
    if (!password || password !== adminPassword) {
      return res.status(401).json({ message: "Invalid password" });
    }
    const token = createSession("admin-legacy", true);
    res.json({ token });
  });

  app.get("/api/admin/check", requireAdmin, (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  const MAX_PDF_SIZE_MB = 50;
  const MAX_PDF_BYTES = MAX_PDF_SIZE_MB * 1024 * 1024;
  const MAX_PDF_PAGES = 20;

  const analysisCache = new Map<string, { result: any; timestamp: number }>();
  const CACHE_TTL_MS = 30 * 60 * 1000;

  function getCacheKey(filename: string, wordCount: number, pageCount: number, textHash: string): string {
    return `${filename}:${wordCount}:${pageCount}:${textHash}`;
  }

  function simpleHash(text: string): string {
    let hash = 0;
    const sample = text.slice(0, 500) + text.slice(-500);
    for (let i = 0; i < sample.length; i++) {
      const char = sample.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return hash.toString(36);
  }

  function generateFallbackAnalysis(
    classification: any,
    benchmarks: any[],
    aggregateBenchmarks: any,
    wordCount: number,
    pageCount: number
  ) {
    let structureScore = 40;
    if (pageCount >= 3) structureScore += 10;
    if (pageCount >= 8) structureScore += 10;
    if (wordCount >= 500) structureScore += 10;
    if (wordCount >= 2000) structureScore += 10;

    let ctaScore = 30;
    const avgCtaCount = aggregateBenchmarks?.avgCtaCount || 0;
    if (avgCtaCount >= 2) ctaScore += 15;
    if (avgCtaCount >= 3) ctaScore += 10;

    let topicScore = 35;
    if (classification.topic && classification.topic !== "Business Management") topicScore += 15;
    if (classification.product !== "General") topicScore += 10;
    if (classification.industry !== "General") topicScore += 5;

    let formatScore = 40;
    if (["Whitepaper", "eBook", "Guide", "Case Study"].includes(classification.contentType)) formatScore += 15;
    if (["Report", "Brochure"].includes(classification.contentType)) formatScore += 10;

    structureScore = Math.min(structureScore, 100);
    ctaScore = Math.min(ctaScore, 100);
    topicScore = Math.min(topicScore, 100);
    formatScore = Math.min(formatScore, 100);

    const readinessScore = Math.round(structureScore * 0.3 + ctaScore * 0.2 + topicScore * 0.3 + formatScore * 0.2);

    const primaryMetric = classification.stage === "BOFU" ? "sqos" : classification.stage === "MOFU" ? "leads" : "pageviews";

    let low = 0;
    let high = 0;
    let confidence: "low" | "medium" | "high" = "low";

    if (aggregateBenchmarks) {
      const metricStats = aggregateBenchmarks[primaryMetric];
      if (metricStats && metricStats.median > 0) {
        const qualityMultiplier = readinessScore / 100;
        low = Math.round(metricStats.median * 0.5 * qualityMultiplier);
        high = Math.round(metricStats.median * 1.5 * qualityMultiplier);
        if (low < metricStats.min) low = metricStats.min;

        confidence = aggregateBenchmarks.sampleSize >= 20 ? "medium" : "low";
        if (benchmarks.length >= 3 && benchmarks[0].relevanceScore >= 40) confidence = "medium";
      }
    }

    const recommendations: any[] = [];
    if (benchmarks.length > 0) {
      const topAsset = benchmarks[0];
      const topMetricVal = primaryMetric === "sqos" ? topAsset.sqos : primaryMetric === "leads" ? topAsset.leads : topAsset.pageviews;
      recommendations.push({
        priority: 1,
        text: `Model after ${topAsset.contentId} (${topMetricVal} ${primaryMetric}, ${topAsset.relevanceScore}% match) — study its structure, CTA placement, and channel strategy.`,
        contentId: topAsset.contentId,
      });
    }
    if (benchmarks.length > 1) {
      const b = benchmarks[1];
      recommendations.push({
        priority: 2,
        text: `Apply the distribution strategy from ${b.contentId} (channel: ${b.channel || "mixed"}, ${b.pageviews} pageviews) to maximize reach.`,
        contentId: b.contentId,
      });
    }
    if (benchmarks.length > 2) {
      const b = benchmarks[2];
      recommendations.push({
        priority: 3,
        text: `Review ${b.contentId} for topic coverage and keyword alignment — it achieved ${b.leads} leads via ${b.cta || "standard"} CTAs.`,
        contentId: b.contentId,
      });
    }
    if (aggregateBenchmarks && benchmarks.length >= 2) {
      recommendations.push({
        priority: 4,
        text: `Target ${aggregateBenchmarks.pageviews.median}+ pageviews (stage median) and ${aggregateBenchmarks.leads.median}+ leads. Top performers in this stage reach ${aggregateBenchmarks.pageviews.max} pageviews.`,
        contentId: benchmarks[0].contentId,
      });
    }

    return {
      isFallbackAnalysis: true,
      readinessScore,
      readinessBreakdown: {
        structure: structureScore,
        ctas: ctaScore,
        topicDepth: topicScore,
        format: formatScore,
      },
      performanceForecast: {
        metric: primaryMetric,
        projectedRange: [low, high],
        confidence,
      },
      recommendations,
      reusability: benchmarks.slice(0, 3).map((b: any) => ({
        contentId: b.contentId,
        overlap: Math.round(b.relevanceScore * 0.8),
        cannibalizationRisk: b.relevanceScore >= 60 ? "medium" : "low",
        repurposingOpportunity: b.relevanceScore < 40 ? "high" : "medium",
      })),
      topAction: benchmarks.length > 0
        ? `Benchmark against ${benchmarks[0].contentId} and optimize CTAs for ${classification.stage} conversion — similar content averages ${aggregateBenchmarks ? aggregateBenchmarks[primaryMetric]?.median || 0 : 0} ${primaryMetric}.`
        : `Focus on ${classification.stage} best practices for ${classification.contentType} content.`,
    };
  }

  async function runAnalysis(
    classification: any,
    benchmarks: any[],
    aggregateBenchmarks: any,
    textSnippet: string,
    filename: string,
    wordCount: number,
    pageCount: number
  ) {
    const compSetSummary = benchmarks.map((b: any) =>
      `- ${b.contentId}: ${b.type || "unknown"}, ${b.stage}, views=${b.pageviews}, leads=${b.leads}, sqos=${b.sqos}, match=${b.relevanceScore}%`
    ).join("\n");

    const benchmarkSummary = aggregateBenchmarks
      ? `Pool: ${aggregateBenchmarks.sampleSize} of ${aggregateBenchmarks.totalPoolSize} assets. Pageviews: ${aggregateBenchmarks.pageviews.min}-${aggregateBenchmarks.pageviews.max} (median ${aggregateBenchmarks.pageviews.median}). Leads: ${aggregateBenchmarks.leads.min}-${aggregateBenchmarks.leads.max} (median ${aggregateBenchmarks.leads.median}). SQOs: ${aggregateBenchmarks.sqos.min}-${aggregateBenchmarks.sqos.max} (median ${aggregateBenchmarks.sqos.median}). Avg CTAs: ${aggregateBenchmarks.avgCtaCount}.`
      : "No benchmark data available.";

    const anthropic = new Anthropic({
      apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY!,
      baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || undefined,
    });
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      system: `You are a senior content strategist for Sage's content analytics platform. Analyze uploaded PDF content against real performance data from Sage's marketing dataset.

RULES:
- Every recommendation MUST cite a specific Content ID from the comparison set with its actual metrics.
- Performance forecasts MUST be based on the benchmark data provided (medians, ranges from real dataset). Use the comparison set metrics to estimate where new content would land.
- For TOFU: primary metric is pageviews. For MOFU: primary metric is leads. For BOFU: primary metric is SQOs.
- projectedRange should reflect realistic estimates based on benchmark medians and the content's quality/relevance. Scale by readiness score.
- No generic advice. Be data-specific. Cite actual numbers from the comparison set and benchmarks.

Return ONLY valid JSON matching this schema:
{"readinessScore":<0-100>,"readinessBreakdown":{"structure":<0-100>,"ctas":<0-100>,"topicDepth":<0-100>,"format":<0-100>},"performanceForecast":{"metric":"<pageviews|leads|sqos>","projectedRange":[<low>,<high>],"confidence":"<low|medium|high>"},"recommendations":[{"priority":<1-5>,"text":"<specific advice citing Content ID and its actual metrics>","contentId":"<ID>"}],"reusability":[{"contentId":"<ID>","overlap":<0-100>,"cannibalizationRisk":"<low|medium|high>","repurposingOpportunity":"<low|medium|high>"}],"topAction":"<single sentence with projected metric range>"}`,
      messages: [{
        role: "user",
        content: `Analyze this content:
Filename: ${filename} | Type: ${classification.contentType} | Stage: ${classification.stage} | Product: ${classification.product} | Industry: ${classification.industry} | Topic: ${classification.topic} | Pages: ${pageCount} | Words: ${wordCount}

Text excerpt (first 1000 chars):
${textSnippet.slice(0, 1000)}

Comparison set:
${compSetSummary || "No comparison assets found."}

Benchmarks: ${benchmarkSummary}`
      }],
    });

    const raw = (msg.content[0] as any).text || "";
    const parsed = parseJsonRobust(raw);
    if (!parsed.readinessScore || !parsed.recommendations) throw new Error("Incomplete analysis");
    return { ...parsed, isFallbackAnalysis: false };
  }

  function ruleBasedClassify(text: string, pageCount: number, filename: string): {
    contentType: string; stage: string; product: string; industry: string; topic: string; confidence: number;
  } {
    const lower = text.toLowerCase();
    const fn = filename.toLowerCase();

    let contentType = "Document";
    if (fn.includes("whitepaper") || fn.includes("white-paper") || pageCount >= 8) contentType = "Whitepaper";
    else if (fn.includes("ebook") || fn.includes("e-book") || pageCount >= 15) contentType = "eBook";
    else if (fn.includes("case") || lower.includes("case study") || lower.includes("customer story")) contentType = "Case Study";
    else if (fn.includes("datasheet") || fn.includes("data-sheet") || lower.includes("data sheet")) contentType = "Datasheet";
    else if (fn.includes("guide") || lower.includes("step-by-step") || lower.includes("how to")) contentType = "Guide";
    else if (fn.includes("infographic")) contentType = "Infographic";
    else if (fn.includes("brochure")) contentType = "Brochure";
    else if (fn.includes("checklist")) contentType = "Checklist";
    else if (fn.includes("webinar") || lower.includes("webinar")) contentType = "Webinar";
    else if (pageCount <= 2) contentType = "Flyer";

    let stage = "TOFU";
    if (lower.includes("demo") || lower.includes("pricing") || lower.includes("roi") || lower.includes("implementation") || lower.includes("case study") || lower.includes("proposal")) stage = "BOFU";
    else if (lower.includes("comparison") || lower.includes("evaluation") || lower.includes("buyer") || lower.includes("solution") || lower.includes("feature") || lower.includes("integration")) stage = "MOFU";

    const products: Record<string, string[]> = {
      "Sage Intacct": ["intacct", "sage intacct"],
      "Sage X3": ["sage x3", "enterprise management"],
      "Sage 200": ["sage 200"],
      "Sage 300": ["sage 300"],
      "Sage 50": ["sage 50"],
      "Sage HR": ["sage hr", "sage people", "human resource"],
      "Sage Payroll": ["payroll"],
      "Sage CRM": ["sage crm"],
    };
    let product = "General";
    for (const [name, kws] of Object.entries(products)) {
      if (kws.some(k => lower.includes(k))) { product = name; break; }
    }

    const industries: Record<string, string[]> = {
      "Financial Services": ["financial services", "banking", "fintech", "insurance"],
      "Healthcare": ["healthcare", "hospital", "medical", "hipaa"],
      "Manufacturing": ["manufacturing", "supply chain", "inventory"],
      "Nonprofit": ["nonprofit", "non-profit", "charity", "foundation"],
      "Construction": ["construction", "contractor", "project costing"],
      "Professional Services": ["professional services", "consulting", "legal"],
      "Technology": ["saas", "software", "cloud", "technology"],
      "Retail": ["retail", "e-commerce", "ecommerce", "pos"],
      "Real Estate": ["real estate", "property management"],
      "Education": ["education", "university", "school"],
    };
    let industry = "General";
    for (const [name, kws] of Object.entries(industries)) {
      if (kws.some(k => lower.includes(k))) { industry = name; break; }
    }

    let topic = "Business Management";
    const topicMap: Record<string, string[]> = {
      "Cloud ERP": ["cloud erp", "erp solution", "enterprise resource"],
      "Financial Management": ["accounting", "financial management", "general ledger", "accounts payable", "accounts receivable"],
      "Digital Transformation": ["digital transformation", "automation", "modernize"],
      "Compliance": ["compliance", "audit", "regulation", "gaap", "ifrs"],
      "Reporting & Analytics": ["reporting", "analytics", "dashboard", "business intelligence"],
    };
    for (const [name, kws] of Object.entries(topicMap)) {
      if (kws.some(k => lower.includes(k))) { topic = name; break; }
    }

    return { contentType, stage, product, industry, topic, confidence: 0.5 };
  }

  function parseJsonRobust(raw: string): any {
    let cleaned = raw.trim();
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) cleaned = fenceMatch[1].trim();
    const braceStart = cleaned.indexOf("{");
    const braceEnd = cleaned.lastIndexOf("}");
    if (braceStart !== -1 && braceEnd > braceStart) {
      cleaned = cleaned.slice(braceStart, braceEnd + 1);
    }
    return JSON.parse(cleaned);
  }

  app.post("/api/assets/extract-pdf", requireAuth, async (req: Request, res: Response) => {
    try {
      const { fileBase64, filename } = req.body as { fileBase64?: string; filename?: string };
      if (!fileBase64 || !filename) {
        return res.status(400).json({ error: "File and filename are required." });
      }
      if (!filename.toLowerCase().endsWith(".pdf")) {
        return res.status(400).json({ error: "Only PDF files are supported." });
      }
      const buffer = Buffer.from(fileBase64, "base64");
      if (buffer.length > MAX_PDF_BYTES) {
        return res.status(413).json({ error: `PDF exceeds the ${MAX_PDF_SIZE_MB}MB size limit.` });
      }

      let text = "";
      let pageCount = 0;
      let extractionMethod = "pdf-parse";

      try {
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: buffer });
        const result = await parser.getText();
        text = (result.text || "").trim();
        pageCount = result.total || 0;
      } catch (parseErr: any) {
        console.error("PDF extraction error:", parseErr);
        return res.status(422).json({
          error: "Could not extract text from this PDF. Try uploading a different file or enter details manually.",
        });
      }

      if (!text || text.length < 20) {
        return res.status(422).json({
          error: "This PDF is image-based and doesn't contain extractable text. Please upload a text-based PDF or enter the content details manually.",
          isImageOnly: true,
        });
      }

      const wordCount = text.split(/\s+/).length;

      const textSnippet = text.slice(0, 2000);
      let classification: any = null;
      let isFallback = false;

      try {
        const anthropic = new Anthropic({
          apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY!,
          baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || undefined,
        });
        const msg = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 200,
          system: `You are a B2B content classifier for Sage, an accounting and business management software company. Given extracted PDF text and metadata, classify the content. Return ONLY valid JSON with these fields:
{"contentType":"<Whitepaper|eBook|Case Study|Datasheet|Guide|Infographic|Brochure|Checklist|Webinar|Flyer|Report|Document>","stage":"<TOFU|MOFU|BOFU>","product":"<Sage product name or General>","industry":"<target industry or General>","topic":"<primary topic>","confidence":<0.0-1.0>}
No explanation, no markdown, no extra text. Only JSON.`,
          messages: [
            { role: "user", content: `Filename: ${filename}\nPages: ${pageCount}\nWord count: ${wordCount}\n\nText excerpt:\n${textSnippet}` },
          ],
        });
        const raw = (msg.content[0] as any).text || "";
        classification = parseJsonRobust(raw);
        if (!classification.contentType || !classification.stage) throw new Error("Missing fields");
      } catch (aiErr) {
        console.error("AI classification failed, using rule-based fallback:", aiErr);
        classification = ruleBasedClassify(text, pageCount, filename);
        isFallback = true;
      }

      let matchedAssets: any[] = [];
      let aggregateBenchmarks: any = null;
      try {
        const allAssets = await storage.getAllAssets();

        const sameStage = allAssets.filter(a => a.stage === classification.stage);
        const sameStagePool = sameStage.length >= 5 ? sameStage : allAssets.filter(a => a.stage !== "UNKNOWN");

        const primaryMetricKey: Record<string, string> = { TOFU: "pageviewsSum", MOFU: "uniqueLeads", BOFU: "sqoCount" };
        const metricKey = primaryMetricKey[classification.stage] || "pageviewsSum";

        const metricValues = sameStagePool.map(a => (a as any)[metricKey] || 0).sort((x: number, y: number) => x - y);
        const q75Index = Math.floor(metricValues.length * 0.75);
        const q75Threshold = metricValues.length > 0 ? metricValues[q75Index] : 0;
        const topPerformers = sameStagePool.filter(a => ((a as any)[metricKey] || 0) >= q75Threshold);

        const pool = topPerformers.length >= 3 ? topPerformers : sameStagePool;

        const classTopicWords: Set<string> = new Set(
          (classification.topic || "").toLowerCase().split(/\s+/).filter((w: string) => w.length > 3)
        );

        const classProductWords: Set<string> = new Set(
          (classification.product || "").toLowerCase().split(/\s+/).filter((w: string) => w.length > 2)
        );

        const pdfWords: Set<string> = new Set(
          text.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3).slice(0, 500)
        );

        const scored = pool.map(a => {
          let productScore = 0;
          if (classification.product !== "General") {
            const assetProductFields = [a.productFranchise, a.productCategory].filter(Boolean).join(" ").toLowerCase();
            if (assetProductFields) {
              for (const pw of classProductWords) {
                if (assetProductFields.includes(pw)) { productScore = 1; break; }
              }
              if (productScore === 0) {
                const cp = classification.product.toLowerCase();
                if (assetProductFields.includes(cp) || cp.includes(assetProductFields.split(" ")[0])) productScore = 0.6;
              }
            }
          }

          let topicScore = 0;
          if (classTopicWords.size > 0) {
            const assetWords: Set<string> = new Set(
              [a.name, a.objective, a.cta, a.campaignName, a.contentId, a.productCategory]
                .filter(Boolean)
                .join(" ")
                .toLowerCase()
                .split(/[\s_\-]+/)
                .filter(w => w.length > 3)
            );
            const overlap = Array.from(classTopicWords).filter(w => assetWords.has(w)).length;
            topicScore = classTopicWords.size > 0 ? Math.min(overlap / classTopicWords.size, 1) : 0;
          }

          let industryScore = 0;
          if (classification.industry !== "General") {
            const ci = classification.industry.toLowerCase();
            const ciWords = ci.split(/\s+/).filter((w: string) => w.length > 3);
            const fields = [a.productCategory, a.campaignName, a.name, a.objective, a.contentId].filter(Boolean).join(" ").toLowerCase();
            for (const w of ciWords) {
              if (fields.includes(w)) { industryScore = 1; break; }
            }
          }

          let contentSimilarity = 0;
          if (pdfWords.size > 0) {
            const assetTextWords: Set<string> = new Set(
              [a.name, a.objective, a.cta, a.contentId, a.productFranchise, a.productCategory, a.utmCampaign]
                .filter(Boolean)
                .join(" ")
                .toLowerCase()
                .split(/[\s_\-]+/)
                .filter(w => w.length > 3)
            );
            if (assetTextWords.size > 0) {
              const matchCount = Array.from(assetTextWords).filter(w => pdfWords.has(w)).length;
              contentSimilarity = Math.min(matchCount / Math.max(assetTextWords.size, 1), 1);
            }
          }

          const relevance = productScore * 0.4 + topicScore * 0.3 + industryScore * 0.15 + contentSimilarity * 0.15;

          return { asset: a, relevance };
        });

        scored.sort((a, b) => b.relevance - a.relevance);
        const top5 = scored.slice(0, 5);

        matchedAssets = top5.map(s => ({
          contentId: s.asset.contentId,
          name: s.asset.name,
          stage: s.asset.stage,
          type: s.asset.typecampaignmember,
          product: s.asset.productFranchise,
          channel: s.asset.utmChannel,
          cta: s.asset.cta,
          pageviews: s.asset.pageviewsSum || 0,
          downloads: s.asset.downloadsSum || 0,
          leads: s.asset.uniqueLeads || 0,
          sqos: s.asset.sqoCount || 0,
          avgTime: s.asset.timeAvg || 0,
          relevanceScore: Math.round(s.relevance * 100),
        }));

        const stats = (arr: number[]) => {
          if (arr.length === 0) return { min: 0, max: 0, mean: 0, median: 0 };
          const sorted = [...arr].sort((a, b) => a - b);
          const sum = sorted.reduce((a, b) => a + b, 0);
          const mean = sum / sorted.length;
          const mid = Math.floor(sorted.length / 2);
          const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
          return { min: sorted[0], max: sorted[sorted.length - 1], mean: Math.round(mean * 10) / 10, median };
        };

        const benchmarkPool = topPerformers.length >= 3 ? topPerformers : sameStagePool;
        const pv = benchmarkPool.map(a => a.pageviewsSum || 0);
        const dl = benchmarkPool.map(a => a.downloadsSum || 0);
        const ld = benchmarkPool.map(a => a.uniqueLeads || 0);
        const sq = benchmarkPool.map(a => a.sqoCount || 0);
        const tm = benchmarkPool.map(a => a.timeAvg || 0);

        const ctaCounts = benchmarkPool.map(a => {
          if (!a.cta) return 0;
          return a.cta.split(/[,;|]/).filter((s: string) => s.trim()).length;
        });

        aggregateBenchmarks = {
          sampleSize: benchmarkPool.length,
          totalPoolSize: sameStagePool.length,
          pageviews: stats(pv),
          downloads: stats(dl),
          leads: stats(ld),
          sqos: stats(sq),
          timeOnPage: stats(tm),
          avgCtaCount: ctaCounts.length > 0 ? Math.round(ctaCounts.reduce((a: number, b: number) => a + b, 0) / ctaCounts.length * 10) / 10 : 0,
        };
      } catch (benchErr) {
        console.error("Benchmark lookup failed:", benchErr);
      }

      let analysis: any = null;
      const cacheKey = getCacheKey(filename, wordCount, pageCount, simpleHash(text));
      const cached = analysisCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        analysis = cached.result;
      } else {
        if (matchedAssets.length === 0) {
          analysis = generateFallbackAnalysis(classification, matchedAssets, aggregateBenchmarks, wordCount, pageCount);
        } else {
          try {
            const textSnippet = text.slice(0, 2000);
            analysis = await runAnalysis(classification, matchedAssets, aggregateBenchmarks, textSnippet, filename, wordCount, pageCount);
          } catch (analysisErr) {
            console.error("AI analysis failed, using fallback:", analysisErr);
            analysis = generateFallbackAnalysis(classification, matchedAssets, aggregateBenchmarks, wordCount, pageCount);
          }
        }
        analysisCache.set(cacheKey, { result: analysis, timestamp: Date.now() });
      }

      res.json({
        filename,
        pageCount,
        wordCount,
        text,
        classification,
        isFallback,
        benchmarks: matchedAssets,
        aggregateBenchmarks,
        analysis,
      });
    } catch (error: any) {
      console.error("PDF extraction failed:", error);
      res.status(500).json({ error: "Could not extract text from this PDF. Try uploading a different file or enter details manually." });
    }
  });

  app.post("/api/assets/full-comparison", requireAuth, async (req: Request, res: Response) => {
    try {
      const { contentA, contentB } = req.body as {
        contentA: { contentId: string; name: string; stage: string; product: string | null; type: string | null; country?: string; industry?: string; text?: string; metrics: { pageviews: number; downloads: number; leads: number; sqos: number; avgTime: number } };
        contentB: { name: string; contentId?: string; stage: string; product: string; contentType: string; industry: string; country?: string; topic: string; text?: string; metrics?: { pageviews: number; downloads: number; leads: number; sqos: number; avgTime: number } };
      };

      if (!contentA || !contentB) {
        return res.status(400).json({ error: "Both contentA and contentB are required." });
      }

      function toReadableName(raw: string): string {
        if (!raw || raw.length < 5) return raw;
        const parts = raw.split("_");
        if (parts.length < 4) return raw;
        const regionMap: Record<string, string> = { US: "US", UK: "UK", CA: "Canada", CAEN: "English Canada", CAFR: "French Canada", DE: "Germany", FR: "France", AU: "Australia", ZA: "South Africa" };
        const stageMap: Record<string, string> = { TOFU: "TOFU", MOFU: "MOFU", BOFU: "BOFU" };
        let region = "", stage = "";
        const chunks: string[] = [];
        for (const p of parts.slice(2)) {
          if (regionMap[p]) { region = regionMap[p]; continue; }
          if (stageMap[p]) { stage = stageMap[p]; continue; }
          if (/^[A-Z]{2,4}$/.test(p) && p.length <= 4) continue;
          if (/^\d{4}/.test(p)) { chunks.push(p.replace(/^\d+/, "")); continue; }
          chunks.push(p);
        }
        const name = chunks.join(" ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").replace(/\|/g, ", ").trim();
        if (!name) return raw;
        const suffix = [region, stage].filter(Boolean).join(", ");
        return suffix ? `${name} (${suffix})` : name;
      }

      function toShortName(raw: string): string {
        if (!raw || raw.length < 3) return raw;
        let s = raw;
        s = s.replace(/^CL_[A-Z0-9]+_[A-Z]{2,4}_[A-Z]{2,4}_[A-Z]+_[A-Z]+_/i, "");
        s = s.replace(/\s*\([^)]*\)\s*$/g, "");
        s = s.replace(/\s*[,|]\s*(GO|TOP|BOT|MID|GNRC|CER|COM|NFS)\b/gi, "");
        s = s.replace(/\s*(GO|TOP|BOT|MID|GNRC|CER|COM|NFS)\s*[,|]/gi, "");
        s = s.replace(/\s*[,|]\s*(English\s+)?(Canada|Australia|US|UK|France|Germany|Spain|Ireland|South Africa)\s*/gi, "");
        s = s.replace(/\s*(TOFU|MOFU|BOFU)\s*/gi, "");
        s = s.replace(/\b(PDF|DOCX|PPTX|DOC)\b/gi, "");
        s = s.replace(/\bWhitepaper[-\s]*/gi, "");
        s = s.replace(/\bBrochure[-\s]*/gi, () => "Brochure ");
        s = s.replace(/([a-z])([A-Z])/g, "$1 $2");
        s = s.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
        s = s.replace(/_/g, " ");
        s = s.replace(/\s*[-|,]\s*$/, "");
        s = s.trim().replace(/\s+/g, " ");
        if (!s) return raw.length > 25 ? raw.slice(0, 25) + "…" : raw;
        const words = s.split(" ").filter(Boolean);
        return words.length > 4 ? words.slice(0, 4).join(" ") : words.join(" ");
      }

      const nameA = toReadableName(contentA.name);
      const nameB = toReadableName(contentB.name);
      let shortA = toShortName(contentA.name);
      let shortB = toShortName(contentB.name);
      if (shortA === shortB) {
        const sA0 = contentA.stage || "TOFU";
        const sB0 = contentB.stage || "TOFU";
        if (sA0 !== sB0) { shortA = `${shortA} (${sA0})`; shortB = `${shortB} (${sB0})`; }
        else { shortA = `${shortA} (1)`; shortB = `${shortB} (2)`; }
      }
      const countryA = contentA.country || "";
      const countryB = contentB.country || "";
      const industryA = contentA.industry || "";
      const industryB = contentB.industry || contentB.industry || "";
      const stageA = contentA.stage || "TOFU";
      const stageB = contentB.stage || "TOFU";
      const productA = contentA.product || "General";
      const productB = contentB.product || "General";
      const typeA = contentA.type || "Document";
      const typeB = contentB.contentType || "Document";

      let contentAStored: any = null;
      let contentBStored: any = null;
      try { contentAStored = await storage.getContentByAssetId(contentA.contentId); } catch (e) { console.error("Failed to fetch content A:", contentA.contentId, e); }
      try { if (contentB.contentId) contentBStored = await storage.getContentByAssetId(contentB.contentId); } catch (e) { console.error("Failed to fetch content B:", contentB.contentId, e); }

      console.log(`[Comparison] Content A (${contentA.contentId}): stored=${!!contentAStored}, textLen=${contentAStored?.contentText?.length || 0}, inlineTextLen=${contentA.text?.length || 0}`);
      console.log(`[Comparison] Content B (${contentB.contentId || 'no-id'}): stored=${!!contentBStored}, textLen=${contentBStored?.contentText?.length || 0}, inlineTextLen=${contentB.text?.length || 0}`);

      const aTextForAnalysis = contentAStored?.contentText || contentA.text || "";
      const bTextForAnalysis = contentBStored?.contentText || contentB.text || "";
      const bothHaveContent = !!(aTextForAnalysis && bTextForAnalysis);
      console.log(`[Comparison] bothHaveContent=${bothHaveContent}, aTextLen=${aTextForAnalysis.length}, bTextLen=${bTextForAnalysis.length}`);

      let isDuplicate = false;
      let duplicateMessage = "";
      if (bothHaveContent) {
        const normalizeForComparison = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();
        const normA = normalizeForComparison(aTextForAnalysis);
        const normB = normalizeForComparison(bTextForAnalysis);
        if (normA.length > 50 && normB.length > 50) {
          const shorter = normA.length <= normB.length ? normA : normB;
          const longer = normA.length > normB.length ? normA : normB;
          let matchingChars = 0;
          const chunkSize = 100;
          for (let i = 0; i < shorter.length; i += chunkSize) {
            const chunk = shorter.slice(i, i + chunkSize);
            if (longer.includes(chunk)) matchingChars += chunk.length;
          }
          const similarity = matchingChars / shorter.length;
          console.log(`[Comparison] Text similarity: ${(similarity * 100).toFixed(1)}%`);
          if (similarity >= 0.9) {
            isDuplicate = true;
            const mislabelled = normA === normB ? `${shortB} appears to be an identical copy of ${shortA}.` : `${shortB} appears to be a near-identical copy of ${shortA}.`;
            duplicateMessage = `DUPLICATE CONTENT DETECTED: ${shortA} and ${shortB} contain identical or near-identical text (${Math.round(similarity * 100)}% overlap). ${mislabelled} See Verdict for recommended actions.`;
          }
        }
      }

      const metricsA = contentA.metrics || { pageviews: 0, downloads: 0, leads: 0, sqos: 0, avgTime: 0 };
      const metricsB = contentB.metrics || { pageviews: 0, downloads: 0, leads: 0, sqos: 0, avgTime: 0 };
      const aHasMetrics = metricsA.pageviews > 0 || metricsA.downloads > 0 || metricsA.leads > 0 || metricsA.sqos > 0;
      const bHasMetrics = metricsB.pageviews > 0 || metricsB.downloads > 0 || metricsB.leads > 0 || metricsB.sqos > 0;

      const aSummary = contentAStored?.contentSummary && contentAStored.contentSummary !== "AI analysis unavailable" ? contentAStored.contentSummary : "";
      const bSummary = contentBStored?.contentSummary && contentBStored.contentSummary !== "AI analysis unavailable" ? contentBStored.contentSummary : "";
      const aStructure = contentAStored?.contentStructure || {};
      const bStructure = contentBStored?.contentStructure || {};
      const aStructuredTags = normalizeKeywordTags(contentAStored?.keywordTags as any);
      const bStructuredTags = normalizeKeywordTags(contentBStored?.keywordTags as any);

      let resonanceAnalysis: any = null;

      let feedbackA: { totalCount: number; tagCounts: Record<string, number>; sentimentScore: number } | null = null;
      let feedbackB: { totalCount: number; tagCounts: Record<string, number>; sentimentScore: number } | null = null;
      let feedbackEntriesA: any[] = [];
      let feedbackEntriesB: any[] = [];
      try {
        const cidA = contentA.contentId || nameA;
        const cidB = contentB.contentId || nameB;
        const [fa, fb, entriesA, entriesB] = await Promise.all([
          storage.getSalesFeedbackStats(cidA),
          storage.getSalesFeedbackStats(cidB),
          storage.getSalesFeedbackByContentId(cidA),
          storage.getSalesFeedbackByContentId(cidB),
        ]);
        if (fa.totalCount > 0) feedbackA = fa;
        if (fb.totalCount > 0) feedbackB = fb;
        feedbackEntriesA = entriesA;
        feedbackEntriesB = entriesB;
      } catch {}

      const buildFeedbackBlock = (fb: typeof feedbackA, name: string) => {
        if (!fb || fb.totalCount === 0) return "No sales feedback";
        const topTags = Object.entries(fb.tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, c]) => `${t} (×${c})`).join(", ");
        const sentLabel = fb.sentimentScore > 0.2 ? "positive" : fb.sentimentScore < -0.2 ? "negative" : "mixed";
        return `${fb.totalCount} SDR reviews | Sentiment: ${sentLabel} (${fb.sentimentScore}) | Top tags: ${topTags}`;
      };

      const hasAnyContent = !!(aTextForAnalysis || bTextForAnalysis);

      if (hasAnyContent) {
        try {
          const anthropic = new Anthropic({
            apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY!,
            baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || undefined,
          });

          const engagementBlockA = aHasMetrics
            ? `Pageviews: ${metricsA.pageviews}, Downloads: ${metricsA.downloads}, Leads: ${metricsA.leads}, SQOs: ${metricsA.sqos}, Avg Time: ${metricsA.avgTime}s`
            : "No engagement data available";
          const engagementBlockB = bHasMetrics
            ? `Pageviews: ${metricsB.pageviews}, Downloads: ${metricsB.downloads}, Leads: ${metricsB.leads}, SQOs: ${metricsB.sqos}, Avg Time: ${metricsB.avgTime}s`
            : "No engagement data available";

          const whatMakesItWorkInstruction = (aHasMetrics || bHasMetrics)
            ? `
  "whatMakesItWork": {
    ${aHasMetrics ? '"a": [{ "factor": "factor name", "explanation": "connect content characteristics to engagement data — why does this work?", "source": "Content Analysis + Internal Data" }],' : '"a": null,'}
    ${bHasMetrics ? '"b": [{ "factor": "factor name", "explanation": "connect content characteristics to engagement data — why does this work?", "source": "Content Analysis + Internal Data" }]' : '"b": null'}
  },` : '';

          const aReadable = !!aTextForAnalysis;
          const bReadable = !!bTextForAnalysis;

          const analysisMsg = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 4000,
            system: `You are a senior content strategist producing a CONCISE comparison report. Be brief and scannable — a busy campaign planner should understand this in 5 minutes.

CRITICAL HONESTY RULES:
- ONLY analyze content you were given FULL TEXT for. "${shortA}" (Baseline) readable: ${aReadable}. "${shortB}" (Challenger) readable: ${bReadable}.
- If content text was NOT provided for an asset, you MUST NOT generate tags, summaries, topic analysis, resonance ratings, or improvement suggestions for it. Instead set those fields to null.
- NEVER guess tags from titles, filenames, or metadata. Tags come ONLY from reading actual content text.
- NEVER write speculative summaries like "Based on the title, this likely covers..." — if you didn't read it, say nothing.

CONCISENESS RULES:
- contentOverview.summary: 3-4 sentences max combining what it covers, audience, tone, and structure. NOT separate fields.
- keyTopics: 4-5 bullet items max, one sentence each. Not paragraphs.
- resonance explanations: 1 sentence each. Example: "Moderate — no Canada-specific regulations referenced despite Canadian market tag."
- sharedAndDifferent: 3-4 bullet points each for overlap and divergence. Not paragraphs.
- whatMakesItWork: 2-3 bullet points max, one line each connecting content to metrics. Only for assets with engagement data AND readable content.
- whatCouldBeImproved: 2-3 bullet points max. Only for readable content where you found specific gaps.
- verdict: 1 paragraph max. The key conclusion only.
- suggestions: Maximum 4 items, 1-2 sentences each.

SUGGESTION RULES — CRITICAL:
- This tool evaluates EXISTING content only. NEVER suggest creating, developing, building, writing, or producing NEW content.
- Suggestions MUST focus on: improving the existing content pieces being compared, better deployment strategies, metadata corrections, re-tagging, re-positioning, format prioritisation, or which existing content to prioritize for campaigns.
- ALWAYS use the actual content names "${shortA}" and "${shortB}" in your analysis, verdict, and suggestions. NEVER say "Content A" or "Content B".
- Good: "${shortA}'s narrative case study format with concrete ROI metrics is more effective for BOFU than ${shortB}'s whitepaper format. Prioritize ${shortA}'s format for BOFU campaigns in the ANZ market."
- Good: "${shortB} covers both TOFU and BOFU topics — consider splitting it into two separately tagged assets for better funnel targeting."
- Bad: "Develop an Australian accounting case study mirroring ${shortA}'s structure." — FORBIDDEN, this recommends creating new content.
- Bad: "Create a localized version for the Canadian market." — FORBIDDEN.
- If you catch yourself suggesting to "create", "develop", "build", "write", "produce", or "design" something new, STOP and rephrase as advice about the existing content.

METADATA DETECTION:
- For each readable content, detect the actual country/region, product, and industry from the content text.
- Return these in "detectedMetadata" so we can enrich empty/generic metadata fields.

Return ONLY valid JSON:
{
  "contentOverview": {
    "a": ${aReadable ? '{ "summary": "3-4 sentence overview combining coverage, audience, tone, structure" }' : 'null'},
    "b": ${bReadable ? '{ "summary": "3-4 sentence overview" }' : 'null'}
  },
  "detectedMetadata": {
    "a": ${aReadable ? '{ "country": "detected country/region or null", "product": "detected product name or null", "industry": "detected industry or null" }' : 'null'},
    "b": ${bReadable ? '{ "country": "detected country/region or null", "product": "detected product name or null", "industry": "detected industry or null" }' : 'null'}
  },
  "keywordTagsA": ${aReadable ? '["Specific Tag 1", "Specific Tag 2", "...8-15 tags from READING the content"]' : '[]'},
  "keywordTagsB": ${bReadable ? '["Specific Tag 1", "Specific Tag 2", "...8-15 tags"]' : '[]'},
  "keyTopics": {
    "a": ${aReadable ? '[{ "topic": "topic name", "detail": "one sentence on what content says about this" }]' : 'null'},
    "b": ${bReadable ? '[{ "topic": "topic name", "detail": "one sentence" }]' : 'null'},
    "comparisonInsight": ${aReadable && bReadable ? '"1-2 sentences on how they differ — use actual content names"' : aReadable ? `"Analysis based on ${shortA} only. ${shortB} could not be read."` : `"Analysis based on ${shortB} only. ${shortA} could not be read."`}
  },
  "resonanceAssessment": {
    "a": ${aReadable ? '{ "countryFit": { "rating": "Strong|Moderate|Weak", "explanation": "1 sentence" }, "industryFit": { "rating": "...", "explanation": "1 sentence" }, "funnelStageFit": { "rating": "...", "explanation": "1 sentence" }, "productFit": { "rating": "...", "explanation": "1 sentence" } }' : 'null'},
    "b": ${bReadable ? '{ "countryFit": { "rating": "...", "explanation": "1 sentence" }, "industryFit": {...}, "funnelStageFit": {...}, "productFit": {...} }' : 'null'},
    "suggestedStageA": "TOFU|MOFU|BOFU or null",
    "suggestedStageB": "TOFU|MOFU|BOFU or null"
  },
  "sharedAndDifferent": ${aReadable && bReadable ? '{ "overlap": ["3-4 short bullet points"], "divergence": ["3-4 short bullet points"] }' : 'null'},${(aHasMetrics && aReadable) || (bHasMetrics && bReadable) ? `
  "whatMakesItWork": {
    ${aHasMetrics && aReadable ? '"a": [{ "point": "one line connecting content characteristic to metric" }],' : '"a": null,'}
    ${bHasMetrics && bReadable ? '"b": [{ "point": "one line connecting content characteristic to metric" }]' : '"b": null'}
  },` : ''}
  "whatCouldBeImproved": {
    "a": ${aReadable ? '[{ "point": "specific gap found — one line" }]' : 'null'},
    "b": ${bReadable ? '[{ "point": "specific gap found — one line" }]' : 'null'}
  },
  "verdict": "1 paragraph using actual names '${shortA}' and '${shortB}': which resonates better and why. ${!aReadable || !bReadable ? 'Acknowledge that only one content was readable.' : 'Based on actual content and real data only.'} NEVER say Content A or Content B.",
  "suggestions": [{ "text": "1-2 sentence actionable suggestion", "source": "AI Recommendation|Content Analysis|Internal Data" }]
}`,
            messages: [{
              role: "user",
              content: `BASELINE — "${shortA}" (Full ID: ${nameA}):
Tagged Stage: ${stageA} | Product: ${productA} | Country/Region: ${countryA || "Not specified"} | Industry: ${industryA || "Not specified"} | Format: ${contentAStored?.contentFormat || typeA}
${aSummary ? `Summary: ${aSummary}` : ""}
Structure: ${aStructure.wordCount || "?"} words, ${aStructure.pageCount || "?"} pages
Engagement data: ${engagementBlockA}
Sales feedback: ${buildFeedbackBlock(feedbackA, shortA)}

${aTextForAnalysis ? `FULL CONTENT TEXT:\n${aTextForAnalysis.slice(0, 12000)}` : "NO CONTENT TEXT AVAILABLE — do NOT generate tags, summaries, or analysis for this asset."}

---

CHALLENGER — "${shortB}" (Full ID: ${nameB}):
Tagged Stage: ${stageB} | Product: ${productB} | Country/Region: ${countryB || "Not specified"} | Industry: ${industryB || "Not specified"} | Format: ${contentBStored?.contentFormat || typeB}
${bSummary ? `Summary: ${bSummary}` : ""}
Structure: ${bStructure.wordCount || "?"} words, ${bStructure.pageCount || "?"} pages
Engagement data: ${engagementBlockB}
Sales feedback: ${buildFeedbackBlock(feedbackB, shortB)}

${bTextForAnalysis ? `FULL CONTENT TEXT:\n${bTextForAnalysis.slice(0, 12000)}` : "NO CONTENT TEXT AVAILABLE — do NOT generate tags, summaries, or analysis for this asset."}`,
            }],
          });
          const analysisText = ((analysisMsg.content[0] as any).text || "").trim();
          const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            resonanceAnalysis = JSON.parse(jsonMatch[0]);
          }
        } catch (analysisErr) {
          console.error("Content resonance analysis failed:", analysisErr);
        }
      }

      const contentOverview = resonanceAnalysis?.contentOverview || null;
      const resonanceAssessment = resonanceAnalysis?.resonanceAssessment || null;
      const sharedAndDifferent = resonanceAnalysis?.sharedAndDifferent || null;
      const keyTopics = resonanceAnalysis?.keyTopics || null;
      const whatMakesItWork = resonanceAnalysis?.whatMakesItWork || null;
      const whatCouldBeImproved = resonanceAnalysis?.whatCouldBeImproved || null;

      const aReadable = !!aTextForAnalysis;
      const bReadable = !!bTextForAnalysis;

      const detected = resonanceAnalysis?.detectedMetadata || {};
      const isGenericVal = (v: string) => {
        if (!v) return true;
        const normalized = v.trim().toLowerCase();
        return normalized === "" || normalized === "general" || normalized === "not specified" || normalized === "n/a" || normalized === "unknown";
      };

      let finalCountryA = countryA;
      let finalCountryB = countryB;
      let finalProductA = productA;
      let finalProductB = productB;
      let finalIndustryA = industryA;
      let finalIndustryB = industryB;
      const metadataEnrichments: string[] = [];

      if (detected.a) {
        if (isGenericVal(finalCountryA) && detected.a.country && detected.a.country !== "null") {
          finalCountryA = `${detected.a.country} [Detected from content]`;
          metadataEnrichments.push(`Country for ${nameA}: "${detected.a.country}"`);
        }
        if (isGenericVal(finalProductA) && detected.a.product && detected.a.product !== "null") {
          finalProductA = `${detected.a.product} [Detected from content]`;
          metadataEnrichments.push(`Product for ${nameA}: "${detected.a.product}"`);
        }
        if (isGenericVal(finalIndustryA) && detected.a.industry && detected.a.industry !== "null") {
          finalIndustryA = `${detected.a.industry} [Detected from content]`;
          metadataEnrichments.push(`Industry for ${nameA}: "${detected.a.industry}"`);
        }
      }
      if (detected.b) {
        if (isGenericVal(finalCountryB) && detected.b.country && detected.b.country !== "null") {
          finalCountryB = `${detected.b.country} [Detected from content]`;
          metadataEnrichments.push(`Country for ${nameB}: "${detected.b.country}"`);
        }
        if (isGenericVal(finalProductB) && detected.b.product && detected.b.product !== "null") {
          finalProductB = `${detected.b.product} [Detected from content]`;
          metadataEnrichments.push(`Product for ${nameB}: "${detected.b.product}"`);
        }
        if (isGenericVal(finalIndustryB) && detected.b.industry && detected.b.industry !== "null") {
          finalIndustryB = `${detected.b.industry} [Detected from content]`;
          metadataEnrichments.push(`Industry for ${nameB}: "${detected.b.industry}"`);
        }
      }

      const finalTagsA: StructuredKeywordTags = aReadable
        ? (resonanceAnalysis?.keywordTagsA
          ? { topic_tags: resonanceAnalysis.keywordTagsA, audience_tags: [], intent_tags: [], user_added_tags: [] }
          : aStructuredTags)
        : { topic_tags: [], audience_tags: [], intent_tags: [], user_added_tags: [] };
      const finalTagsB: StructuredKeywordTags = bReadable
        ? (resonanceAnalysis?.keywordTagsB
          ? { topic_tags: resonanceAnalysis.keywordTagsB, audience_tags: [], intent_tags: [], user_added_tags: [] }
          : bStructuredTags)
        : { topic_tags: [], audience_tags: [], intent_tags: [], user_added_tags: [] };

      if (aReadable && flattenKeywordTags(aStructuredTags).length > 0) {
        Object.assign(finalTagsA, aStructuredTags);
      }
      if (bReadable && flattenKeywordTags(bStructuredTags).length > 0) {
        Object.assign(finalTagsB, bStructuredTags);
      }

      const flatA = flattenKeywordTags(finalTagsA);
      const flatB = flattenKeywordTags(finalTagsB);
      const sharedTags = flatA.filter((t: string) => flatB.some((bt: string) => bt.toLowerCase() === t.toLowerCase()));
      const uniqueTagsA = flatA.filter((t: string) => !sharedTags.some((st: string) => st.toLowerCase() === t.toLowerCase()));
      const uniqueTagsB = flatB.filter((t: string) => !sharedTags.some((st: string) => st.toLowerCase() === t.toLowerCase()));

      const structuredSharedTags: StructuredKeywordTags = { topic_tags: [], audience_tags: [], intent_tags: [], user_added_tags: [] };
      const structuredUniqueTagsA: StructuredKeywordTags = { topic_tags: [], audience_tags: [], intent_tags: [], user_added_tags: [] };
      const structuredUniqueTagsB: StructuredKeywordTags = { topic_tags: [], audience_tags: [], intent_tags: [], user_added_tags: [] };
      for (const tagType of ['topic_tags', 'audience_tags', 'intent_tags', 'user_added_tags'] as const) {
        const aTags = finalTagsA[tagType];
        const bTags = finalTagsB[tagType];
        const bLower = bTags.map(t => t.toLowerCase());
        const aLower = aTags.map(t => t.toLowerCase());
        structuredSharedTags[tagType] = aTags.filter(t => bLower.includes(t.toLowerCase()));
        structuredUniqueTagsA[tagType] = aTags.filter(t => !bLower.includes(t.toLowerCase()));
        structuredUniqueTagsB[tagType] = bTags.filter(t => !aLower.includes(t.toLowerCase()));
      }

      let verdict = resonanceAnalysis?.verdict || "";
      let suggestions: { text: string; source: string }[] = resonanceAnalysis?.suggestions || [];

      const createContentPatterns = [
        /\b(create|develop|build|write|produce|draft|generate|launch|commission|author|design|craft)\b.*\b(new|additional|original|another|more|fresh|dedicated|separate|similar|equivalent|complementary|localized|localised|tailored|bespoke)\b/i,
        /\b(create|develop|build|write|produce|draft|generate|launch|design|craft)\b.*\b(content|asset|piece|case study|whitepaper|brochure|document|guide|ebook|webinar|blog|article|video|infographic|report|resource|one-pager|factsheet|landing page)\b/i,
        /\b(develop|create|produce|write|craft|design)\b\s+(a|an|the|one)\s+\w+\s*(case study|whitepaper|brochure|guide|ebook|webinar|blog|article|version)/i,
        /\b(develop|create|produce|write|craft)\b\s+(an?\s+)?(Australian|Canadian|UK|US|French|German|Spanish|Irish|local|regional|market-specific|ANZ)/i,
        /\bcreating\b.*\bcontent\b/i,
        /\bmirroring\b.*\bstructure\b/i,
      ];
      suggestions = suggestions.filter(s => !createContentPatterns.some(rx => rx.test(s.text)));

      if (!verdict) {
        if (!aReadable && !bReadable) {
          verdict = "Neither content could be analyzed — text could not be extracted from either file. Upload readable files (text-based PDF or DOCX) to enable comparison.";
        } else if (!aReadable || !bReadable) {
          const readable = aReadable ? nameA : nameB;
          const unreadable = aReadable ? nameB : nameA;
          verdict = `This analysis covers ${readable} only. ${unreadable} could not be analyzed because the text could not be extracted. Re-upload ${unreadable} as a text-based PDF or DOCX to enable full comparison.`;
        }
      }

      if (!aReadable && !bReadable && suggestions.length === 0) {
        suggestions = [{ text: "Re-upload both content files as text-based PDFs or DOCX to enable analysis.", source: "AI Recommendation" }];
      } else if ((!aReadable || !bReadable) && suggestions.length > 0) {
        const unreadable = !aReadable ? nameA : nameB;
        suggestions.push({ text: `Re-upload ${unreadable} as a text-based PDF or DOCX to enable full analysis.`, source: "AI Recommendation" });
      }

      if (metadataEnrichments.length > 0) {
        const enrichedFields = metadataEnrichments.join(", ");
        suggestions.push({ text: `Asset metadata shows generic values for fields that content analysis detected as specific: ${enrichedFields}. Update the asset tags for better campaign segmentation.`, source: "Content Analysis" });
      }

      suggestions = suggestions.slice(0, 4);

      const performanceDisplay = (aHasMetrics && bHasMetrics) ? "table" : (aHasMetrics || bHasMetrics) ? "inline" : "none";
      let performanceInlineSummary: string | null = null;
      if (performanceDisplay === "inline") {
        const hasM = aHasMetrics ? metricsA : metricsB;
        const hasName = aHasMetrics ? nameA : nameB;
        const noName = aHasMetrics ? nameB : nameA;
        performanceInlineSummary = `${hasName}: ${hasM.pageviews} pageviews, ${hasM.leads} leads, ${hasM.sqos} SQOs, ${hasM.avgTime}s avg time. ${noName} has no engagement data.`;
      }

      const aTotalEngagement = metricsA.pageviews + metricsA.downloads + metricsA.leads + metricsA.sqos;
      const bTotalEngagement = metricsB.pageviews + metricsB.downloads + metricsB.leads + metricsB.sqos;
      const lowEngagement = aTotalEngagement < 10 && bTotalEngagement < 10;

      const metadataIssues: { asset: string; field: string; tagged: string; issue: string }[] = [];
      if (resonanceAssessment) {
        const checkAsset = (assessment: any, assetName: string, stage: string, product: string, country: string, industry: string) => {
          if (!assessment) return;
          if (assessment.productFit?.rating === "Weak" && !isGenericVal(product)) {
            metadataIssues.push({ asset: assetName, field: "Product", tagged: product, issue: assessment.productFit.explanation || `Tagged as "${product}" but content does not align` });
          }
          if (assessment.funnelStageFit?.rating === "Weak" && stage) {
            metadataIssues.push({ asset: assetName, field: "Funnel Stage", tagged: stage, issue: assessment.funnelStageFit.explanation || `Tagged as ${stage} but content does not match this stage` });
          }
          if (assessment.countryFit?.rating === "Weak" && !isGenericVal(country)) {
            metadataIssues.push({ asset: assetName, field: "Country/Region", tagged: country, issue: assessment.countryFit.explanation || `Tagged as "${country}" but content contains no relevant references` });
          }
          if (assessment.industryFit?.rating === "Weak" && !isGenericVal(industry)) {
            metadataIssues.push({ asset: assetName, field: "Industry", tagged: industry, issue: assessment.industryFit.explanation || `Tagged as "${industry}" but content does not target this industry` });
          }
        };
        checkAsset(resonanceAssessment.a, nameA, stageA, finalProductA, finalCountryA, finalIndustryA);
        checkAsset(resonanceAssessment.b, nameB, stageB, finalProductB, finalCountryB, finalIndustryB);
      }

      res.json({
        nameA,
        nameB,
        contentOverview,
        resonanceAssessment,
        sharedAndDifferent,
        keyTopics,
        whatMakesItWork,
        whatCouldBeImproved,
        keywordTagsA: finalTagsA,
        keywordTagsB: finalTagsB,
        sharedTags,
        uniqueTagsA,
        uniqueTagsB,
        structuredSharedTags,
        structuredUniqueTagsA,
        structuredUniqueTagsB,
        verdict,
        suggestions,
        metricsA: { ...metricsA, hasData: aHasMetrics },
        metricsB: { ...metricsB, hasData: bHasMetrics },
        performanceDisplay,
        performanceInlineSummary,
        lowEngagement,
        isDuplicate,
        duplicateMessage,
        metadataIssues,
        metadata: {
          stageA, stageB,
          productA: finalProductA, productB: finalProductB,
          countryA: finalCountryA, countryB: finalCountryB,
          industryA: finalIndustryA, industryB: finalIndustryB,
          typeA, typeB,
          wordCountA: aStructure.wordCount || null,
          wordCountB: bStructure.wordCount || null,
          formatA: contentAStored?.contentFormat || typeA,
          formatB: contentBStored?.contentFormat || typeB,
          summaryA: aSummary,
          summaryB: bSummary,
          bothHaveContent,
          aHasContent: !!aTextForAnalysis,
          bHasContent: !!bTextForAnalysis,
        },
        salesSignal: (feedbackA || feedbackB) ? {
          a: feedbackA ? {
            totalCount: feedbackA.totalCount,
            sentimentScore: feedbackA.sentimentScore,
            tagCounts: feedbackA.tagCounts,
            topTags: Object.entries(feedbackA.tagCounts).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([tag, count]) => ({ tag, count })),
            entries: feedbackEntriesA.slice(0, 10).map(e => ({
              author: e.author,
              tags: e.tags,
              note: e.note || null,
              salesforceRef: e.salesforceRef || null,
              createdAt: e.createdAt,
            })),
          } : null,
          b: feedbackB ? {
            totalCount: feedbackB.totalCount,
            sentimentScore: feedbackB.sentimentScore,
            tagCounts: feedbackB.tagCounts,
            topTags: Object.entries(feedbackB.tagCounts).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([tag, count]) => ({ tag, count })),
            entries: feedbackEntriesB.slice(0, 10).map(e => ({
              author: e.author,
              tags: e.tags,
              note: e.note || null,
              salesforceRef: e.salesforceRef || null,
              createdAt: e.createdAt,
            })),
          } : null,
        } : null,
      });
    } catch (error: any) {
      console.error("Comparison analysis failed:", error);
      res.status(500).json({ error: "Comparison analysis failed. Please try again." });
    }
  });

  app.post("/api/assets/multi-comparison", requireAuth, async (req: Request, res: Response) => {
    try {
      const { contents } = req.body as {
        contents: Array<{
          name: string;
          contentId?: string;
          stage: string;
          product?: string;
          type?: string;
          contentType?: string;
          country?: string;
          industry?: string;
          text?: string;
          metrics?: { pageviews: number; downloads: number; leads: number; sqos: number; avgTime: number };
        }>;
      };

      if (!Array.isArray(contents) || contents.length < 2 || contents.length > 5) {
        return res.status(400).json({ error: "Between 2 and 5 content pieces are required." });
      }

      function toReadableNameMulti(raw: string): string {
        if (!raw || raw.length < 5) return raw;
        const parts = raw.split("_");
        if (parts.length < 4) return raw;
        const regionMap: Record<string, string> = { US: "US", UK: "UK", CA: "Canada", CAEN: "English Canada", CAFR: "French Canada", DE: "Germany", FR: "France", AU: "Australia", ZA: "South Africa" };
        const stageMap: Record<string, string> = { TOFU: "TOFU", MOFU: "MOFU", BOFU: "BOFU" };
        let region = "", stage = "";
        const chunks: string[] = [];
        for (const p of parts.slice(2)) {
          if (regionMap[p]) { region = regionMap[p]; continue; }
          if (stageMap[p]) { stage = stageMap[p]; continue; }
          if (/^[A-Z]{2,4}$/.test(p) && p.length <= 4) continue;
          if (/^\d{4}/.test(p)) { chunks.push(p.replace(/^\d+/, "")); continue; }
          chunks.push(p);
        }
        const name = chunks.join(" ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").replace(/\|/g, ", ").trim();
        if (!name) return raw;
        const suffix = [region, stage].filter(Boolean).join(", ");
        return suffix ? `${name} (${suffix})` : name;
      }

      const enrichedContents = await Promise.all(contents.map(async (c, idx) => {
        const readableName = toReadableNameMulti(c.name);
        const stage = c.stage || "TOFU";
        const product = c.product || "General";
        const contentType = c.type || c.contentType || "Document";
        const country = c.country || "";
        const industry = c.industry || "";
        const metrics = c.metrics || { pageviews: 0, downloads: 0, leads: 0, sqos: 0, avgTime: 0 };
        const hasMetrics = metrics.pageviews > 0 || metrics.downloads > 0 || metrics.leads > 0 || metrics.sqos > 0;

        let storedContent: any = null;
        if (c.contentId) {
          try {
            storedContent = await storage.getContentByAssetId(c.contentId);
          } catch (e) {
            console.error(`Failed to fetch content for ${c.contentId}:`, e);
          }
        }

        const textForAnalysis = storedContent?.contentText || c.text || "";
        const summary = storedContent?.contentSummary && storedContent.contentSummary !== "AI analysis unavailable" ? storedContent.contentSummary : "";
        const structure = storedContent?.contentStructure || {};
        const tags = normalizeKeywordTags(storedContent?.keywordTags as any);
        const format = storedContent?.contentFormat || contentType;

        return {
          index: idx,
          label: `Content ${String.fromCharCode(65 + idx)}`,
          name: readableName,
          contentId: c.contentId || `manual-${idx}`,
          stage,
          product,
          contentType,
          country,
          industry,
          metrics,
          hasMetrics,
          textForAnalysis,
          readable: !!textForAnalysis,
          summary,
          structure,
          tags,
          format,
        };
      }));

      const readableContents = enrichedContents.filter(c => c.readable);
      const contentCount = enrichedContents.length;

      const multiFeedbackMap: Record<string, { totalCount: number; tagCounts: Record<string, number>; sentimentScore: number }> = {};
      const multiFeedbackEntries: Record<string, any[]> = {};
      try {
        const allCids = enrichedContents.map(c => c.contentId).filter(Boolean);
        const batchStats = await storage.getSalesFeedbackStatsBatch(allCids);
        const cidsWithFeedback = allCids.filter(cid => batchStats[cid] && batchStats[cid].totalCount > 0);
        const [statsResults, entriesResults] = await Promise.all([
          Promise.all(cidsWithFeedback.map(cid => storage.getSalesFeedbackStats(cid))),
          Promise.all(cidsWithFeedback.map(cid => storage.getSalesFeedbackByContentId(cid))),
        ]);
        cidsWithFeedback.forEach((cid, i) => {
          multiFeedbackMap[cid] = statsResults[i];
          multiFeedbackEntries[cid] = entriesResults[i];
        });
      } catch {}

      const buildMultiFeedbackBlock = (contentId: string) => {
        const fb = multiFeedbackMap[contentId];
        if (!fb || fb.totalCount === 0) return "No sales feedback";
        const topTags = Object.entries(fb.tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, c]) => `${t} (×${c})`).join(", ");
        const sentLabel = fb.sentimentScore > 0.2 ? "positive" : fb.sentimentScore < -0.2 ? "negative" : "mixed";
        return `${fb.totalCount} SDR reviews | Sentiment: ${sentLabel} (${fb.sentimentScore}) | Top tags: ${topTags}`;
      };

      const contentBlocks = enrichedContents.map(c => {
        const engagementBlock = c.hasMetrics
          ? `Pageviews: ${c.metrics.pageviews}, Downloads: ${c.metrics.downloads}, Leads: ${c.metrics.leads}, SQOs: ${c.metrics.sqos}, Avg Time: ${c.metrics.avgTime}s`
          : "No engagement data available";

        return `${c.label} — "${c.name}":
Tagged Stage: ${c.stage} | Product: ${c.product} | Country/Region: ${c.country || "Not specified"} | Industry: ${c.industry || "Not specified"} | Format: ${c.format}
${c.summary ? `Summary: ${c.summary}` : ""}
Structure: ${c.structure.wordCount || "?"} words, ${c.structure.pageCount || "?"} pages
Engagement data: ${engagementBlock}
Sales feedback: ${buildMultiFeedbackBlock(c.contentId)}

${c.textForAnalysis ? `FULL CONTENT TEXT:\n${c.textForAnalysis.slice(0, 8000)}` : "NO CONTENT TEXT AVAILABLE — do NOT generate tags, summaries, or analysis for this asset."}`;
      }).join("\n\n---\n\n");

      const contentsJsonSchema = enrichedContents.map(c => {
        if (!c.readable) {
          return `{ "name": "${c.name}", "summary": null, "resonance": null, "keyTopics": null, "whatWorks": null, "improvements": null, "keywordTags": [] }`;
        }
        return `{ "name": "${c.name}", "summary": "3-4 sentence overview", "resonance": { "countryFit": "Strong|Moderate|Weak", "industryFit": "Strong|Moderate|Weak", "funnelStageFit": "Strong|Moderate|Weak", "productFit": "Strong|Moderate|Weak" }, "keyTopics": ["topic1", "topic2"], "whatWorks": ["strength1", "strength2"], "improvements": ["gap1", "gap2"], "keywordTags": ["tag1", "tag2", "...8-15 tags"] }`;
      }).join(",\n    ");

      let multiAnalysis: any = null;

      try {
        const anthropic = new Anthropic({
          apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY!,
          baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || undefined,
        });

        const analysisMsg = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 6000,
          system: `You are a senior content strategist producing a multi-content comparison report for ${contentCount} content pieces. Be concise and scannable.

CRITICAL HONESTY RULES:
- ONLY analyze content you were given FULL TEXT for. Each content's readability is noted.
- If content text was NOT provided, set that content's analysis fields to null.
- NEVER guess from titles or filenames alone.

CONCISENESS RULES:
- Summaries: 3-4 sentences max.
- Key topics: 3-5 items max per content.
- Resonance ratings: use Strong/Moderate/Weak only.
- Cross analysis items: 3-5 bullet points each.
- Rankings: score 0-100 with 1-sentence reason.
- Verdict: 1-2 paragraphs max.
- Suggestions: max 5 items, 1-2 sentences each.

SUGGESTION RULES — CRITICAL:
- This tool evaluates EXISTING content only. NEVER suggest creating, developing, building, writing, or producing NEW content.
- Suggestions MUST focus on: improving the existing content pieces being compared, better deployment strategies, metadata corrections, re-tagging, re-positioning, format prioritisation, or which existing content to prioritize for campaigns.
- ALWAYS refer to content by its actual name, NEVER use generic labels like "Content A", "Content B", etc.
- Good: "[Name]'s narrative case study format with concrete ROI metrics is more effective for BOFU — prioritize it for campaigns in the ANZ market."
- Good: "[Name] covers both TOFU and BOFU topics — consider splitting it into two separately tagged assets for better funnel targeting."
- Bad: "Develop a new case study mirroring [Name]'s structure." — FORBIDDEN, this recommends creating new content.
- Bad: "Create a localized version for the Canadian market." — FORBIDDEN.
- If you catch yourself suggesting to "create", "develop", "build", "write", "produce", or "design" something new, STOP and rephrase as advice about the existing content.

Return ONLY valid JSON matching this schema:
{
  "contents": [
    ${contentsJsonSchema}
  ],
  "crossAnalysis": {
    "sharedThemes": ["theme shared across multiple contents"],
    "differentiators": ["what makes each content unique"],
    "contentGaps": ["topics or angles missing across the set"]
  },
  "rankings": {
    "overall": [{ "name": "content name", "score": 85, "reason": "1-sentence reason" }],
    "byMetric": {
      "bestForLeads": "content name or null",
      "bestForEngagement": "content name or null",
      "bestForConversion": "content name or null"
    }
  },
  "verdict": "1-2 paragraphs: which content resonates best overall and why, key takeaways for the content set",
  "suggestions": [{ "text": "actionable suggestion", "source": "AI Recommendation|Content Analysis|Internal Data" }]
}`,
          messages: [{
            role: "user",
            content: `Compare these ${contentCount} content pieces:\n\n${contentBlocks}`,
          }],
        });

        const analysisText = ((analysisMsg.content[0] as any).text || "").trim();
        const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          multiAnalysis = JSON.parse(jsonMatch[0]);
        }
      } catch (analysisErr) {
        console.error("Multi-comparison AI analysis failed:", analysisErr);
      }

      if (!multiAnalysis) {
        multiAnalysis = {
          contents: enrichedContents.map(c => ({
            name: c.name,
            summary: c.readable ? c.summary || "Content available but AI analysis failed." : null,
            resonance: null,
            keyTopics: null,
            whatWorks: null,
            improvements: null,
            keywordTags: flattenKeywordTags(c.tags),
          })),
          crossAnalysis: { sharedThemes: [], differentiators: [], contentGaps: [] },
          rankings: {
            overall: enrichedContents.map(c => ({ name: c.name, score: 0, reason: "AI analysis unavailable" })),
            byMetric: { bestForLeads: null, bestForEngagement: null, bestForConversion: null },
          },
          verdict: "AI analysis was unavailable. Please try again.",
          suggestions: [{ text: "Retry the comparison when AI services are available.", source: "AI Recommendation" }],
        };
      }

      const createContentPatternsMulti = [
        /\b(create|develop|build|write|produce|draft|generate|launch|commission|author|design|craft)\b.*\b(new|additional|original|another|more|fresh|dedicated|separate|similar|equivalent|complementary|localized|localised|tailored|bespoke)\b/i,
        /\b(create|develop|build|write|produce|draft|generate|launch|design|craft)\b.*\b(content|asset|piece|case study|whitepaper|brochure|document|guide|ebook|webinar|blog|article|video|infographic|report|resource|one-pager|factsheet|landing page)\b/i,
        /\b(develop|create|produce|write|craft|design)\b\s+(a|an|the|one)\s+\w+\s*(case study|whitepaper|brochure|guide|ebook|webinar|blog|article|version)/i,
        /\b(develop|create|produce|write|craft)\b\s+(an?\s+)?(Australian|Canadian|UK|US|French|German|Spanish|Irish|local|regional|market-specific|ANZ)/i,
        /\bcreating\b.*\bcontent\b/i,
        /\bmirroring\b.*\bstructure\b/i,
      ];
      if (multiAnalysis.suggestions) {
        multiAnalysis.suggestions = multiAnalysis.suggestions.filter((s: any) => !createContentPatternsMulti.some(rx => rx.test(s.text)));
        multiAnalysis.suggestions = multiAnalysis.suggestions.slice(0, 5);
      }

      const contentDetails = enrichedContents.map(c => ({
        name: c.name,
        contentId: c.contentId,
        stage: c.stage,
        product: c.product,
        contentType: c.contentType,
        country: c.country,
        industry: c.industry,
        format: c.format,
        hasMetrics: c.hasMetrics,
        hasContent: c.readable,
        metrics: c.metrics,
        wordCount: c.structure.wordCount || null,
        pageCount: c.structure.pageCount || null,
        summary: c.summary,
        tags: c.tags,
      }));

      const multiSalesSignal: Record<string, any> = {};
      for (const c of enrichedContents) {
        const fb = multiFeedbackMap[c.contentId];
        if (fb && fb.totalCount > 0) {
          const entries = multiFeedbackEntries[c.contentId] || [];
          multiSalesSignal[c.name] = {
            totalCount: fb.totalCount,
            sentimentScore: fb.sentimentScore,
            tagCounts: fb.tagCounts,
            topTags: Object.entries(fb.tagCounts).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([tag, count]) => ({ tag, count })),
            entries: entries.slice(0, 10).map((e: any) => ({
              author: e.author,
              tags: e.tags,
              note: e.note || null,
              salesforceRef: e.salesforceRef || null,
              createdAt: e.createdAt,
            })),
          };
        }
      }

      res.json({
        contentCount,
        contentDetails,
        contents: multiAnalysis.contents || [],
        crossAnalysis: multiAnalysis.crossAnalysis || { sharedThemes: [], differentiators: [], contentGaps: [] },
        rankings: multiAnalysis.rankings || { overall: [], byMetric: { bestForLeads: null, bestForEngagement: null, bestForConversion: null } },
        verdict: multiAnalysis.verdict || "",
        suggestions: multiAnalysis.suggestions || [],
        salesSignal: Object.keys(multiSalesSignal).length > 0 ? multiSalesSignal : null,
      });
    } catch (error: any) {
      console.error("Multi-comparison analysis failed:", error);
      res.status(500).json({ error: "Multi-comparison analysis failed. Please try again." });
    }
  });

  app.post("/api/assets/ingest", requireAdmin, async (req, res) => {
    try {
      const { rows } = req.body as { rows: any[] };
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ message: "No rows provided" });
      }

      const aggMap = new Map<string, any>();

      for (const rawRow of rows) {
        const r: Record<string, any> = {};
        for (const [k, v] of Object.entries(rawRow)) {
          r[k.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")] = v;
        }
        const contentId = str(r.content) || str(r.content_id) || str(r.asset_id) || "";
        if (!contentId) continue;

        const stage = classifyStageServer(contentId, r);
        const key = contentId;

        if (!aggMap.has(key)) {
          aggMap.set(key, {
            contentId,
            stage,
            name: str(r.name) || null,
            url: isValidUrl(str(r.url)) ? str(r.url) : null,
            typecampaignmember: str(r.typecampaignmember__c) || str(r.typecampaignmember) || str(r.content_type) || null,
            productFranchise: str(r.product_franchise__c) || str(r.product_franchise_c) || str(r.product_franchise) || null,
            utmChannel: str(r.utm_channel) || str(r.channel) || null,
            utmCampaign: str(r.utm_campaign) || str(r.utm_campoaign) || null,
            utmMedium: str(r.utm_medium) || null,
            utmTerm: str(r.utm_term) || null,
            utmContent: str(r.utm_content) || str(r.utm_cintent) || null,
            formName: str(r.form_name) || str(r.form_name__c) || null,
            cta: str(r.cta) || null,
            objective: str(r.objective__c) || str(r.objective_c) || str(r.objective) || null,
            productCategory: str(r.product_category__c) || str(r.product_category_c) || str(r.product_category) || null,
            campaignId: str(r.campaign_id) || null,
            campaignName: str(r.campaign_name) || str(r.campaignname) || str(r.campaign) || null,
            dateStamp: str(r.date_stamp) || str(r.datestamp) || null,
            clientIds: new Set<string>(),
            timeTotal: 0,
            timeCount: 0,
            downloadsSum: 0,
            leadIds: new Set<string>(),
            sqoLeadIds: new Set<string>(),
          });
        }

        const agg = aggMap.get(key)!;

        const clientId = str(r.google_clientid1) || str(r.google_clientid) || str(r.clientid);
        if (clientId) agg.clientIds.add(clientId);

        const timeVal = num(r.total_time_on_page_seconds || r.avg_time_on_page || r.time_on_page || r.time_spent_seconds);
        if (timeVal) {
          agg.timeTotal += timeVal;
          agg.timeCount += 1;
        }
        agg.downloadsSum += num(r.total_downloads || r.downloads) || 0;

        const leadId = str(r.leadorcontactid) || str(r.leadid) || str(r.contactid) || str(r.lead_or_contact_id);
        if (leadId) agg.leadIds.add(leadId);

        const isSqo = num(r.is_sqo || r.sqo_flag || r.sqo || r.sqos);
        if (isSqo && isSqo > 0 && leadId) agg.sqoLeadIds.add(leadId);
      }

      const assets = Array.from(aggMap.values()).map((a) => ({
        contentId: a.contentId,
        stage: a.stage as "TOFU" | "MOFU" | "BOFU" | "UNKNOWN",
        name: a.name,
        url: a.url,
        typecampaignmember: a.typecampaignmember,
        productFranchise: a.productFranchise,
        utmChannel: a.utmChannel,
        utmCampaign: a.utmCampaign,
        utmMedium: a.utmMedium,
        utmTerm: a.utmTerm,
        utmContent: a.utmContent,
        formName: a.formName,
        cta: a.cta,
        objective: a.objective,
        productCategory: a.productCategory,
        campaignId: a.campaignId,
        campaignName: a.campaignName,
        dateStamp: a.dateStamp,
        pageviewsSum: a.clientIds.size,
        timeAvg: a.timeCount > 0 ? Math.round(a.timeTotal / a.timeCount) : 0,
        downloadsSum: a.downloadsSum,
        uniqueLeads: a.leadIds.size,
        sqoCount: a.sqoLeadIds.size,
      }));

      await storage.clearAssets();
      await storage.bulkInsertAssets(assets);

      res.json({ ingested: assets.length });
    } catch (err: any) {
      console.error("Ingest error:", err);
      res.status(500).json({ message: err.message || "Ingestion failed" });
    }
  });

  app.get("/api/assets", requireAuth, async (req, res) => {
    const stage = String(req.query.stage || "TOFU");
    const search = req.query.search ? String(req.query.search) : undefined;
    const product = req.query.product ? String(req.query.product) : undefined;
    const channel = req.query.channel ? String(req.query.channel) : undefined;
    const campaign = req.query.campaign ? String(req.query.campaign) : undefined;
    const industry = req.query.industry ? String(req.query.industry) : undefined;
    const contentAvailability = req.query.contentAvailability ? String(req.query.contentAvailability) : undefined;
    const tagFilter = req.query.tagFilter ? String(req.query.tagFilter).split(",").filter(Boolean) : undefined;
    const limit = Math.min(Number(req.query.limit) || 25, 100);
    const offset = Number(req.query.offset) || 0;

    const result = await storage.getAssets({ stage, search, product, channel, campaign, industry, contentAvailability, tagFilter, limit, offset });
    res.json(result);
  });

  app.get("/api/assets/filter-options", requireAuth, async (_req, res) => {
    const options = await storage.getAssetFilterOptions();
    res.json(options);
  });

  app.get("/api/assets/all", requireAuth, async (_req, res) => {
    const assets = await storage.getAllAssets();
    res.json(assets);
  });

  app.get("/api/assets/search-picker", requireAuth, async (req, res) => {
    const q = String(req.query.q || "").trim().toLowerCase();
    if (!q || q.length < 2) {
      return res.json([]);
    }
    const allAssets = await storage.getAllAssets();
    const matches = allAssets
      .filter(a => {
        const searchable = [a.contentId, a.name, a.productFranchise, a.productCategory, a.stage, a.typecampaignmember]
          .filter(Boolean).join(" ").toLowerCase();
        return searchable.includes(q);
      })
      .slice(0, 20)
      .map(a => ({
        id: a.id,
        contentId: a.contentId,
        name: a.name,
        stage: a.stage,
        product: a.productFranchise || a.productCategory || null,
        channel: a.utmChannel,
        cta: a.cta,
        type: a.typecampaignmember,
        pageviews: a.pageviewsSum || 0,
        downloads: a.downloadsSum || 0,
        leads: a.uniqueLeads || 0,
        sqos: a.sqoCount || 0,
        avgTime: a.timeAvg || 0,
      }));
    res.json(matches);
  });

  app.post("/api/feedback", requireAuth, async (req: Request, res: Response) => {
    try {
      const { type, title, description, page } = req.body;
      if (!type || !title || !description) {
        return res.status(400).json({ message: "type, title, and description are required" });
      }
      if (!["suggestion", "bug"].includes(type)) {
        return res.status(400).json({ message: "type must be 'suggestion' or 'bug'" });
      }
      const item = await storage.createFeedback({ type, title, description, page: page || null });
      res.status(201).json(item);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to create feedback" });
    }
  });

  app.get("/api/feedback", requireAuth, async (req: Request, res: Response) => {
    try {
      const type = req.query.type ? String(req.query.type) : undefined;
      const status = req.query.status ? String(req.query.status) : undefined;
      const items = await storage.getFeedback({ type, status });
      res.json(items);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch feedback" });
    }
  });

  app.patch("/api/feedback/:id/status", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
      const { status } = req.body as { status: string };
      if (!["open", "in_progress", "resolved", "closed"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const item = await storage.updateFeedbackStatus(id, status);
      if (!item) return res.status(404).json({ message: "Feedback not found" });
      res.json(item);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to update feedback" });
    }
  });

  app.get("/api/comparison-history", requireAuth, async (req: Request, res: Response) => {
    try {
      const { assetId, performedBy, limit, offset } = req.query as { assetId?: string; performedBy?: string; limit?: string; offset?: string };
      const result = await storage.getComparisonHistory({
        assetId,
        performedBy,
        limit: limit ? parseInt(limit) : 50,
        offset: offset ? parseInt(offset) : 0,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch comparison history" });
    }
  });

  app.get("/api/comparison-history/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
      const entry = await storage.getComparisonHistoryById(id);
      if (!entry) return res.status(404).json({ message: "Comparison not found" });
      res.json(entry);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch comparison" });
    }
  });

  app.post("/api/comparison-history", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      let performedByName = "Unknown";
      if (userId) {
        const u = await storage.getUserById(userId);
        if (u) performedByName = u.displayName || (u as any).email || "Unknown";
      }
      const entry = await storage.createComparisonHistory({
        ...req.body,
        performedByUserId: userId || null,
        performedByName,
      });
      res.json(entry);
    } catch (err: any) {
      console.error("Failed to save comparison:", err);
      res.status(500).json({ message: "Failed to save comparison" });
    }
  });

  app.patch("/api/comparison-history/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
      const updated = await storage.updateComparisonHistory(id, req.body);
      if (!updated) return res.status(404).json({ message: "Comparison not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to update comparison" });
    }
  });

  app.get("/api/comparison-counts", requireAuth, async (req: Request, res: Response) => {
    try {
      const { assetIds } = req.query as { assetIds?: string };
      if (!assetIds) return res.json({});
      const ids = assetIds.split(",").filter(Boolean);
      const counts = await storage.getComparisonCountsForAssets(ids);
      res.json(counts);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch comparison counts" });
    }
  });

  app.post("/api/assets/upload-excel", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { base64, filename } = req.body as { base64: string; filename: string };
      if (!base64) {
        return res.status(400).json({ message: "No file data provided" });
      }

      const buffer = Buffer.from(base64, "base64");
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        return res.status(400).json({ message: "No sheets found in the file" });
      }

      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" }) as Record<string, any>[];
      if (rows.length === 0) {
        return res.status(400).json({ message: "No data rows found in the sheet" });
      }

      const headers = Object.keys(rows[0]);

      res.json({
        headers,
        rowCount: rows.length,
        sampleRows: rows.slice(0, 5),
        sheetName,
        filename,
        rows,
      });
    } catch (err: any) {
      console.error("Excel parse error:", err);
      res.status(500).json({ message: "Failed to parse Excel file: " + (err.message || "Unknown error") });
    }
  });

  app.post("/api/journey/upload", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { base64, filename } = req.body as { base64: string; filename: string };
      if (!base64) {
        return res.status(400).json({ message: "No file data provided" });
      }

      const buffer = Buffer.from(base64, "base64");
      const ext = (filename || "").toLowerCase().split(".").pop() || "";

      let rows: Record<string, any>[] = [];
      let headers: string[] = [];

      if (ext === "xlsx" || ext === "xls") {
        const workbook = XLSX.read(buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          return res.status(400).json({ message: "No sheets found in the file" });
        }
        rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" }) as Record<string, any>[];
      } else {
        const text = buffer.toString("utf-8");
        const parsed = parseDelimitedText(text);
        headers = parsed.headers;
        rows = parsed.rows;
      }

      if (rows.length === 0) {
        return res.status(400).json({ message: "No data rows found" });
      }

      if (headers.length === 0) {
        headers = Object.keys(rows[0]);
      }

      const targetFields = [
        { field: "email_address", description: "Email address of the contact" },
        { field: "contact_id", description: "Unique contact/lead identifier" },
        { field: "asset_id", description: "Content asset identifier (e.g. CL_ACS_US_...)" },
        { field: "activity_type", description: "Type of interaction (e.g. Form Submit, Email Open, Page View)" },
        { field: "activity_date", description: "Date/timestamp of the interaction" },
        { field: "campaign_name", description: "Campaign name" },
        { field: "sfdc_campaign_id", description: "Salesforce campaign ID" },
        { field: "lead_status", description: "Lead status (e.g. MQL, SQL)" },
        { field: "form_name", description: "Form name for form submissions" },
        { field: "form_score", description: "Lead/form score value" },
        { field: "page_url", description: "Page URL of the interaction" },
        { field: "referrer", description: "Referrer URL" },
        { field: "channel", description: "Marketing channel" },
        { field: "source", description: "Traffic source" },
        { field: "country", description: "Country of the contact" },
        { field: "product", description: "Product associated with the interaction" },
      ];

      const suggestedMapping: Record<string, string> = {};
      for (const tf of targetFields) {
        const lowerField = tf.field.toLowerCase();
        for (const h of headers) {
          const lh = h.toLowerCase().replace(/[\s_-]+/g, "_");
          if (lh === lowerField || lh.includes(lowerField) || lowerField.includes(lh)) {
            suggestedMapping[tf.field] = h;
            break;
          }
        }
        if (!suggestedMapping[tf.field]) {
          const aliases: Record<string, string[]> = {
            email_address: ["email", "e_mail", "emailaddress", "email_addr", "contact_email"],
            contact_id: ["contactid", "lead_id", "leadid", "contact", "eloqua_contact_id"],
            asset_id: ["content_id", "contentid", "asset", "content", "campaign_id_content"],
            activity_type: ["type", "action", "activity", "event_type", "interaction_type", "action_type"],
            activity_date: ["date", "timestamp", "datetime", "activity_timestamp", "event_date", "activitydate"],
            campaign_name: ["campaign", "campaignname"],
            page_url: ["url", "pageurl", "page", "landing_page"],
            channel: ["utm_channel", "marketing_channel"],
            source: ["utm_source", "traffic_source"],
            country: ["region", "geo", "location"],
            product: ["product_franchise", "product_line"],
          };
          const fieldAliases = aliases[tf.field] || [];
          for (const alias of fieldAliases) {
            for (const h of headers) {
              const lh = h.toLowerCase().replace(/[\s_-]+/g, "_");
              if (lh === alias || lh.includes(alias)) {
                suggestedMapping[tf.field] = h;
                break;
              }
            }
            if (suggestedMapping[tf.field]) break;
          }
        }
      }

      const redactedSampleRows = rows.slice(0, 5).map(row => {
        const redacted: Record<string, any> = {};
        for (const [key, value] of Object.entries(row)) {
          const lk = key.toLowerCase();
          if (typeof value === "string" && (lk.includes("email") || value.match(/^[^@\s]+@[^@\s]+\.[^@\s]+$/))) {
            redacted[key] = value.replace(/^(.{2}).*(@.*)$/, "$1***$2");
          } else {
            redacted[key] = value;
          }
        }
        return redacted;
      });

      res.json({
        headers,
        rowCount: rows.length,
        sampleRows: redactedSampleRows,
        filename,
        suggestedMapping,
        targetFields: targetFields.map(f => ({ field: f.field, description: f.description })),
      });
    } catch (err: any) {
      console.error("Journey file parse error:", err);
      res.status(500).json({ message: "Failed to parse file: " + (err.message || "Unknown error") });
    }
  });

  async function processJourneyData(base64: string, filename: string, fieldMapping: Record<string, string>) {
    const crypto = await import("crypto");
    const buffer = Buffer.from(base64, "base64");
    const ext = (filename || "").toLowerCase().split(".").pop() || "";

    let rawRows: Record<string, any>[] = [];

    if (ext === "xlsx" || ext === "xls") {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      if (sheetName) {
        rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" }) as Record<string, any>[];
      }
    } else {
      const text = buffer.toString("utf-8");
      const parsed = parseDelimitedText(text);
      rawRows = parsed.rows;
    }

    if (rawRows.length === 0) {
      throw new Error("No data rows found");
    }

    const dirtyValues = new Set(["missing", "none", "undefined", "null", "n/a", "na", "-", "", "unknown"]);
    const cleanVal = (v: any): string | null => {
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      return dirtyValues.has(s.toLowerCase()) ? null : s;
    };

    const interactionTypeMap: Record<string, string> = {
      "request a demo": "demo_request",
      "demo request": "demo_request",
      "form submit": "form_submit",
      "form submission": "form_submit",
      "email open": "email_open",
      "email click": "email_click",
      "email click-through": "email_click",
      "page view": "page_view",
      "pageview": "page_view",
      "web visit": "page_view",
      "content download": "content_download",
      "download": "content_download",
      "webinar attend": "webinar_attend",
      "webinar registration": "webinar_register",
      "event attend": "event_attend",
      "trial signup": "trial_signup",
      "free trial": "trial_signup",
    };

    const normalizeInteractionType = (raw: string | null): string | null => {
      if (!raw) return null;
      const lower = raw.toLowerCase().trim();
      return interactionTypeMap[lower] || lower.replace(/[\s-]+/g, "_");
    };

    const countryPatterns: Record<string, string> = {
      "en-ng": "Nigeria", "en-gb": "United Kingdom", "en-us": "United States",
      "en-za": "South Africa", "en-ke": "Kenya", "en-au": "Australia",
      "en-ca": "Canada", "en-ie": "Ireland", "en-ae": "UAE",
      "fr-fr": "France", "de-de": "Germany", "es-es": "Spain",
      "pt-br": "Brazil", "en-sg": "Singapore", "en-my": "Malaysia",
      "en-in": "India", "en-ph": "Philippines", "en-hk": "Hong Kong",
    };

    const extractCountryFromUrl = (url: string | null): string | null => {
      if (!url) return null;
      for (const [pattern, country] of Object.entries(countryPatterns)) {
        if (url.toLowerCase().includes(`/${pattern}/`) || url.toLowerCase().includes(`/${pattern}`)) {
          return country;
        }
      }
      return null;
    };

    const parseTimestamp = (val: any): Date | null => {
      if (!val) return null;
      if (val instanceof Date) return val;
      const s = String(val).trim();
      if (!s) return null;
      const d = new Date(s);
      if (!isNaN(d.getTime())) return d;
      const excelNum = Number(s);
      if (!isNaN(excelNum) && excelNum > 10000) {
        const excelDate = new Date((excelNum - 25569) * 86400 * 1000);
        if (!isNaN(excelDate.getTime())) return excelDate;
      }
      return null;
    };

    const getField = (row: Record<string, any>, targetField: string): any => {
      const sourceCol = fieldMapping[targetField];
      if (!sourceCol) return null;
      return row[sourceCol] ?? null;
    };

    let allAssets: { contentId: string; stage: string; productFranchise: string | null; campaignName: string | null }[] = [];
    try {
      const dbAssets = await storage.getAllAssets();
      allAssets = dbAssets.map(a => ({
        contentId: a.contentId,
        stage: a.stage,
        productFranchise: a.productFranchise,
        campaignName: a.campaignName,
      }));
    } catch (_) {}

    const assetLookup = new Map<string, { stage: string; product: string | null; campaign: string | null }>();
    for (const a of allAssets) {
      assetLookup.set(a.contentId, { stage: a.stage, product: a.productFranchise, campaign: a.campaignName });
    }

    const uploadedAssetLookup = new Map<string, { country: string | null; product: string | null; funnelStage: string | null }>();
    try {
      const uploadedList = await storage.getUploadedAssets({});
      for (const ua of uploadedList) {
        uploadedAssetLookup.set(ua.contentId, {
          country: ua.country || null,
          product: ua.product || null,
          funnelStage: ua.funnelStage || null,
        });
      }
    } catch (_) {}

    const contentStoredIds = new Set<string>();
    try {
      const contentStatusMap = await storage.getContentStatusMap();
      for (const assetId of Object.keys(contentStatusMap)) {
        contentStoredIds.add(assetId);
      }
    } catch (_) {}

    const batchId = crypto.randomUUID();
    const processed: any[] = [];
    let duplicatesRemoved = 0;
    let emailsHashed = 0;
    let dirtyValuesCleaned = 0;
    let matchedAssets = 0;
    let unmatchedAssets = 0;

    const dedupeMap = new Map<string, number[]>();

    const preProcessed: { row: Record<string, any>; sortKey: string; sortTs: number }[] = [];
    for (const row of rawRows) {
      const email = cleanVal(getField(row, "email_address"));
      const contactId = cleanVal(getField(row, "contact_id"));
      const rawAssetId = cleanVal(getField(row, "asset_id"));
      const rawDate = getField(row, "activity_date");
      const ts = parseTimestamp(rawDate);
      const contact = email ? email.toLowerCase() : (contactId || "");
      const sortKey = `${contact}|${rawAssetId || ""}`;
      preProcessed.push({ row, sortKey, sortTs: ts?.getTime() || 0 });
    }
    preProcessed.sort((a, b) => {
      if (a.sortKey !== b.sortKey) return a.sortKey < b.sortKey ? -1 : 1;
      return a.sortTs - b.sortTs;
    });

    for (const { row } of preProcessed) {
      const email = cleanVal(getField(row, "email_address"));
      const contactId = cleanVal(getField(row, "contact_id"));

      let contactHash: string;
      if (email) {
        contactHash = crypto.createHash("sha256").update(email.toLowerCase()).digest("hex");
        emailsHashed++;
      } else if (contactId) {
        contactHash = crypto.createHash("sha256").update(contactId).digest("hex");
      } else {
        continue;
      }

      const rawAssetId = cleanVal(getField(row, "asset_id"));
      const rawType = cleanVal(getField(row, "activity_type"));
      const rawDate = getField(row, "activity_date");
      const rawCampaign = cleanVal(getField(row, "campaign_name"));
      const rawSfdc = cleanVal(getField(row, "sfdc_campaign_id"));
      const rawLeadStatus = cleanVal(getField(row, "lead_status"));
      const rawFormName = cleanVal(getField(row, "form_name"));
      const rawFormScore = getField(row, "form_score");
      const rawPageUrl = cleanVal(getField(row, "page_url"));
      const rawReferrer = cleanVal(getField(row, "referrer"));
      const rawChannel = cleanVal(getField(row, "channel"));
      const rawSource = cleanVal(getField(row, "source"));
      const rawCountry = cleanVal(getField(row, "country"));
      const rawProduct = cleanVal(getField(row, "product"));

      for (const v of [rawAssetId, rawType, rawCampaign, rawSfdc, rawLeadStatus, rawFormName, rawPageUrl, rawReferrer, rawChannel, rawSource, rawCountry, rawProduct]) {
        if (v === null) dirtyValuesCleaned++;
      }

      const interactionType = normalizeInteractionType(rawType);
      const timestamp = parseTimestamp(rawDate);
      const urlCountry = extractCountryFromUrl(rawPageUrl);
      const country = rawCountry || urlCountry;

      let funnelStage: string | null = null;
      let product = rawProduct;
      let enrichedCountry = country;

      if (rawAssetId) {
        const aggMatch = assetLookup.get(rawAssetId);
        const uploadedMatch = uploadedAssetLookup.get(rawAssetId);
        const contentMatch = contentStoredIds.has(rawAssetId);

        if (aggMatch || uploadedMatch || contentMatch) {
          matchedAssets++;
          if (aggMatch) {
            funnelStage = aggMatch.stage;
            if (!product) product = aggMatch.product;
          }
          if (uploadedMatch) {
            if (!funnelStage) funnelStage = uploadedMatch.funnelStage;
            if (!product) product = uploadedMatch.product;
            if (!enrichedCountry) enrichedCountry = uploadedMatch.country;
          }
        } else {
          unmatchedAssets++;
        }
      }

      const dedupeKey = `${contactHash}|${rawAssetId || ""}`;
      if (timestamp) {
        const ts = timestamp.getTime();
        const prevTimestamps = dedupeMap.get(dedupeKey);
        if (prevTimestamps) {
          const isDup = prevTimestamps.some(prev => Math.abs(ts - prev) < 60000);
          if (isDup) {
            duplicatesRemoved++;
            continue;
          }
          prevTimestamps.push(ts);
        } else {
          dedupeMap.set(dedupeKey, [ts]);
        }
      }

      const formScore = rawFormScore ? parseFloat(String(rawFormScore)) : null;

      processed.push({
        contactHash,
        assetId: rawAssetId,
        interactionType,
        interactionTimestamp: timestamp,
        funnelStage,
        product,
        country: enrichedCountry,
        channel: rawChannel,
        source: rawSource,
        campaignName: rawCampaign,
        sfdcCampaignId: rawSfdc,
        leadStatus: rawLeadStatus,
        formName: rawFormName,
        formScore: isNaN(formScore as number) ? null : formScore,
        pageUrl: rawPageUrl,
        referrer: rawReferrer,
        uploadBatchId: batchId,
      });
    }

    const uniqueContacts = new Set(processed.map(p => p.contactHash)).size;
    let earliest = Infinity;
    let latest = -Infinity;
    for (const p of processed) {
      if (p.interactionTimestamp) {
        const t = p.interactionTimestamp.getTime();
        if (t < earliest) earliest = t;
        if (t > latest) latest = t;
      }
    }
    const dateRange = earliest !== Infinity ? {
      earliest: new Date(earliest).toISOString(),
      latest: new Date(latest).toISOString(),
    } : null;

    const typeCounts: Record<string, number> = {};
    for (const p of processed) {
      const t = p.interactionType || "unknown";
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }

    return {
      batchId,
      processed,
      totalRawRows: rawRows.length,
      uniqueContacts,
      dateRange,
      duplicatesRemoved,
      emailsHashed,
      dirtyValuesCleaned,
      matchedAssets,
      unmatchedAssets,
      interactionTypes: typeCounts,
    };
  }

  app.post("/api/journey/preview", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { base64, filename, fieldMapping } = req.body as {
        base64: string;
        filename: string;
        fieldMapping: Record<string, string>;
      };

      if (!base64 || !fieldMapping) {
        return res.status(400).json({ message: "Missing file data or field mapping" });
      }

      const result = await processJourneyData(base64, filename, fieldMapping);

      res.json({
        totalProcessed: result.processed.length,
        totalRawRows: result.totalRawRows,
        uniqueContacts: result.uniqueContacts,
        dateRange: result.dateRange,
        duplicatesRemoved: result.duplicatesRemoved,
        emailsHashed: result.emailsHashed,
        dirtyValuesCleaned: result.dirtyValuesCleaned,
        matchedAssets: result.matchedAssets,
        unmatchedAssets: result.unmatchedAssets,
        interactionTypes: result.interactionTypes,
      });
    } catch (err: any) {
      console.error("Journey preview error:", err);
      res.status(500).json({ message: "Failed to preview journey data: " + (err.message || "Unknown error") });
    }
  });

  app.post("/api/journey/process", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { base64, filename, fieldMapping } = req.body as {
        base64: string;
        filename: string;
        fieldMapping: Record<string, string>;
      };

      if (!base64 || !fieldMapping) {
        return res.status(400).json({ message: "Missing file data or field mapping" });
      }

      const result = await processJourneyData(base64, filename, fieldMapping);
      await storage.bulkInsertJourneyInteractions(result.processed);

      journeySummaryCache = null;
      resetJourneyBuildProgress();

      buildJourneySummaries(result.batchId).catch(err => {
        console.error("Background journey summary build failed:", err);
      });

      res.json({
        batchId: result.batchId,
        totalProcessed: result.processed.length,
        totalRawRows: result.totalRawRows,
        uniqueContacts: result.uniqueContacts,
        dateRange: result.dateRange,
        duplicatesRemoved: result.duplicatesRemoved,
        emailsHashed: result.emailsHashed,
        dirtyValuesCleaned: result.dirtyValuesCleaned,
        matchedAssets: result.matchedAssets,
        unmatchedAssets: result.unmatchedAssets,
        interactionTypes: result.interactionTypes,
      });
    } catch (err: any) {
      console.error("Journey process error:", err);
      res.status(500).json({ message: "Failed to process journey data: " + (err.message || "Unknown error") });
    }
  });

  app.get("/api/journey/batches", requireAuth, async (_req: Request, res: Response) => {
    try {
      const batches = await storage.getJourneyUploadBatches();
      const total = await storage.countJourneyInteractions();
      res.json({ batches, totalInteractions: total });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch journey batches" });
    }
  });

  app.delete("/api/journey/batch/:batchId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteJourneyInteractionsByBatch(req.params.batchId as string);
      journeySummaryCache = null;

      const remaining = await storage.countJourneyInteractions();
      if (remaining === 0) {
        await storage.clearContactJourneys();
        await storage.clearJourneyPatterns();
        await storage.clearStageTransitions();
        await storage.clearAssetJourneyStats();
      } else {
        resetJourneyBuildProgress();
        buildJourneySummaries().catch(err => {
          console.error("Journey summary rebuild after delete failed:", err);
        });
      }

      res.json({ deleted });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to delete batch" });
    }
  });

  app.get("/api/journey/build-progress", requireAuth, async (_req: Request, res: Response) => {
    res.json(getJourneyBuildProgress());
  });

  app.post("/api/journey/rebuild-summaries", requireAdmin, async (_req: Request, res: Response) => {
    try {
      resetJourneyBuildProgress();
      journeySummaryCache = null;
      buildJourneySummaries().catch(err => {
        console.error("Journey summary rebuild failed:", err);
      });
      res.json({ message: "Journey summary rebuild started" });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to start rebuild: " + (err.message || "Unknown error") });
    }
  });

  app.get("/api/journey/summaries", requireAuth, async (_req: Request, res: Response) => {
    try {
      if (journeySummaryCache && Date.now() - journeySummaryCacheTime < JOURNEY_CACHE_TTL_MS) {
        return res.json(journeySummaryCache);
      }

      const status = await storage.getJourneySummaryStatus();
      const transitions = await storage.getStageTransitions();
      const { data: topPatterns } = await storage.getJourneyPatterns({ limit: 20, sortBy: "contact_count" });
      const assetStats = await storage.getAssetJourneyStats();
      const totalInteractions = await storage.countJourneyInteractions();

      const summaryData = {
        status,
        transitions,
        topPatterns,
        topAssetStats: assetStats.slice(0, 20),
        totalInteractions,
        buildProgress: getJourneyBuildProgress(),
      };

      journeySummaryCache = summaryData;
      journeySummaryCacheTime = Date.now();

      res.json(summaryData);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch journey summaries" });
    }
  });

  app.get("/api/journey/patterns", requireAuth, async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const sortBy = (req.query.sortBy as string) || "contact_count";
      const result = await storage.getJourneyPatterns({ limit, offset, sortBy });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch journey patterns" });
    }
  });

  app.get("/api/journey/transitions", requireAuth, async (_req: Request, res: Response) => {
    try {
      const transitions = await storage.getStageTransitions();
      res.json(transitions);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch stage transitions" });
    }
  });

  app.get("/api/journey/asset-stats/:assetId", requireAuth, async (req: Request, res: Response) => {
    try {
      const stats = await storage.getAssetJourneyStats(req.params.assetId as string);
      res.json(stats[0] || null);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch asset journey stats" });
    }
  });

  app.get("/api/journey/asset-stats", requireAuth, async (req: Request, res: Response) => {
    try {
      const stats = await storage.getAssetJourneyStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch asset journey stats" });
    }
  });

  app.get("/api/journey/contact-journeys", requireAuth, async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const product = req.query.product as string | undefined;
      const country = req.query.country as string | undefined;
      const outcome = req.query.outcome as string | undefined;
      const result = await storage.getContactJourneys({ product, country, outcome, limit, offset });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch contact journeys" });
    }
  });

  app.post("/api/assets/analyze", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { headers, sampleRows } = req.body as { headers: string[]; sampleRows: Record<string, any>[] };
      if (!headers || !Array.isArray(headers) || headers.length === 0) {
        return res.status(400).json({ message: "No headers provided" });
      }

      const anthropic = new Anthropic({
        apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
      });

      const targetFields = [
        { field: "content", description: "Content ID — the unique identifier for each piece of content (e.g. CL_ACS_US_SMA_PDF_MOFU_...)" },
        { field: "url", description: "URL of the content page" },
        { field: "name", description: "Content asset name or title" },
        { field: "campaign_name", description: "Campaign name (e.g. CAMPAIGN_NAME column)" },
        { field: "utm_channel", description: "Marketing channel (e.g. Organic, Paid, Email, Direct)" },
        { field: "utm_campaign", description: "UTM campaign parameter" },
        { field: "utm_medium", description: "UTM medium parameter (e.g. cpc, email, organic)" },
        { field: "utm_term", description: "UTM term / keyword" },
        { field: "utm_content", description: "UTM content parameter" },
        { field: "product_franchise", description: "Product franchise or product line" },
        { field: "product_category", description: "Product category" },
        { field: "typecampaignmember", description: "Campaign member type or content type" },
        { field: "form_name", description: "Form name used for lead capture" },
        { field: "cta", description: "Call to action type (e.g. PDF, Demo, Trial, Webinar)" },
        { field: "objective", description: "Campaign objective (e.g. NCA, C4L, P4L)" },
        { field: "campaign_id", description: "Campaign ID" },
        { field: "date_stamp", description: "Date of the record" },
        { field: "google_clientid1", description: "Google Client ID for pageview counting" },
        { field: "total_time_on_page_seconds", description: "Time spent on page in seconds" },
        { field: "total_downloads", description: "Number of downloads" },
        { field: "leadorcontactid", description: "Lead or contact ID for unique lead counting" },
        { field: "is_sqo", description: "Sales qualified opportunity flag (1 = SQO, 0 = not)" },
      ];

      const sampleData = sampleRows.slice(0, 3).map((row) => {
        const simplified: Record<string, string> = {};
        for (const [k, v] of Object.entries(row)) {
          simplified[k] = String(v).slice(0, 100);
        }
        return simplified;
      });

      const prompt = `You are a data analyst helping map CSV/Excel column headers to a standardized schema for a marketing funnel analytics tool.

Here are the column headers from the uploaded file:
${JSON.stringify(headers)}

Here are ${sampleData.length} sample rows:
${JSON.stringify(sampleData, null, 2)}

Here are the target fields I need to map to:
${targetFields.map((f) => `- "${f.field}": ${f.description}`).join("\n")}

Please analyze each column header and its sample data, then produce a JSON mapping object where:
- Keys are the EXACT original column headers from the uploaded file
- Values are the target field names from my list above, or null if no match

Also analyze the data to identify:
1. Which column contains the primary content identifier (most important — this determines if rows get processed)
2. Any columns that could provide funnel stage signals
3. Any potential data quality issues

Respond with ONLY valid JSON in this exact format:
{
  "mapping": { "OriginalColumn1": "target_field_or_null", ... },
  "contentIdColumn": "the original column name that maps to content ID",
  "stageSignals": ["list of columns that help determine TOFU/MOFU/BOFU stage"],
  "unmappedColumns": ["columns that don't match any target field"],
  "dataQualityNotes": ["any observations about the data quality"],
  "confidence": "high|medium|low"
}`;

      const message = await anthropic.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      });

      const responseText = message.content[0].type === "text" ? message.content[0].text : "";

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return res.status(500).json({ message: "AI did not return valid JSON", raw: responseText });
      }

      const analysis = JSON.parse(jsonMatch[0]);
      res.json(analysis);
    } catch (err: any) {
      console.error("AI analysis error:", err);
      res.status(500).json({ message: "AI analysis failed: " + (err.message || "Unknown error") });
    }
  });

  app.post("/api/assets/ingest-aggregated", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { assets, totalRows, skippedNoContentId } = req.body as {
        assets: any[];
        totalRows: number;
        skippedNoContentId: number;
      };

      if (!Array.isArray(assets) || assets.length === 0) {
        return res.status(400).json({ message: "No aggregated assets provided" });
      }

      const validatedAssets = assets.map((a) => ({
        contentId: String(a.contentId || ""),
        stage: (a.stage || "UNKNOWN") as "TOFU" | "MOFU" | "BOFU" | "UNKNOWN",
        name: a.name || null,
        url: a.url || null,
        typecampaignmember: a.typecampaignmember || null,
        productFranchise: a.productFranchise || null,
        utmChannel: a.utmChannel || null,
        utmCampaign: a.utmCampaign || null,
        utmMedium: a.utmMedium || null,
        utmTerm: a.utmTerm || null,
        utmContent: a.utmContent || null,
        formName: a.formName || null,
        cta: a.cta || null,
        objective: a.objective || null,
        productCategory: a.productCategory || null,
        campaignId: a.campaignId || null,
        campaignName: a.campaignName || null,
        dateStamp: a.dateStamp || null,
        pageviewsSum: Number(a.pageviewsSum) || 0,
        timeAvg: Number(a.timeAvg) || 0,
        downloadsSum: Number(a.downloadsSum) || 0,
        uniqueLeads: Number(a.uniqueLeads) || 0,
        sqoCount: Number(a.sqoCount) || 0,
      }));

      await storage.clearAssets();
      await storage.bulkInsertAssets(validatedAssets);

      res.json({
        ingested: validatedAssets.length,
        totalRows: totalRows || validatedAssets.length,
        skippedNoContentId: skippedNoContentId || 0,
        uniqueContentIds: validatedAssets.length,
        stageBreakdown: {
          TOFU: validatedAssets.filter((a) => a.stage === "TOFU").length,
          MOFU: validatedAssets.filter((a) => a.stage === "MOFU").length,
          BOFU: validatedAssets.filter((a) => a.stage === "BOFU").length,
          UNKNOWN: validatedAssets.filter((a) => a.stage === "UNKNOWN").length,
        },
      });
    } catch (err: any) {
      console.error("Aggregated ingest error:", err);
      res.status(500).json({ message: err.message || "Ingestion failed" });
    }
  });

  app.post("/api/assets/ingest-mapped", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { rows, mapping } = req.body as {
        rows: Record<string, any>[];
        mapping: Record<string, string | null>;
      };

      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ message: "No rows provided" });
      }
      if (!mapping || typeof mapping !== "object") {
        return res.status(400).json({ message: "No column mapping provided" });
      }

      const reverseMap: Record<string, string> = {};
      for (const [originalCol, targetField] of Object.entries(mapping)) {
        if (targetField) {
          reverseMap[targetField] = originalCol;
        }
      }

      const getMapped = (row: Record<string, any>, targetField: string): string => {
        const col = reverseMap[targetField];
        if (!col) return "";
        const val = row[col];
        if (val === null || val === undefined) return "";
        return String(val).trim();
      };

      const aggMap = new Map<string, any>();
      let skippedNoContentId = 0;

      for (const row of rows) {
        const contentId = getMapped(row, "content");
        if (!contentId) {
          skippedNoContentId++;
          continue;
        }

        const stage = classifyStageServer(contentId, {
          is_sqo: getMapped(row, "is_sqo"),
          leadorcontactid: getMapped(row, "leadorcontactid"),
          google_clientid1: getMapped(row, "google_clientid1"),
          total_pageviews: "",
          total_time_on_page_seconds: getMapped(row, "total_time_on_page_seconds"),
        });

        if (!aggMap.has(contentId)) {
          aggMap.set(contentId, {
            contentId,
            stage,
            name: getMapped(row, "name") || null,
            url: isValidUrl(getMapped(row, "url")) ? getMapped(row, "url") : null,
            typecampaignmember: getMapped(row, "typecampaignmember") || null,
            productFranchise: getMapped(row, "product_franchise") || null,
            utmChannel: getMapped(row, "utm_channel") || null,
            utmCampaign: getMapped(row, "utm_campaign") || null,
            utmMedium: getMapped(row, "utm_medium") || null,
            utmTerm: getMapped(row, "utm_term") || null,
            utmContent: getMapped(row, "utm_content") || null,
            formName: getMapped(row, "form_name") || null,
            cta: getMapped(row, "cta") || null,
            objective: getMapped(row, "objective") || null,
            productCategory: getMapped(row, "product_category") || null,
            campaignId: getMapped(row, "campaign_id") || null,
            campaignName: getMapped(row, "campaign_name") || null,
            dateStamp: getMapped(row, "date_stamp") || null,
            clientIds: new Set<string>(),
            timeTotal: 0,
            timeCount: 0,
            downloadsSum: 0,
            leadIds: new Set<string>(),
            sqoLeadIds: new Set<string>(),
          });
        }

        const agg = aggMap.get(contentId)!;

        const clientId = getMapped(row, "google_clientid1");
        if (clientId) agg.clientIds.add(clientId);

        const timeVal = num(getMapped(row, "total_time_on_page_seconds"));
        if (timeVal) {
          agg.timeTotal += timeVal;
          agg.timeCount += 1;
        }

        const downloads = num(getMapped(row, "total_downloads"));
        agg.downloadsSum += downloads || 0;

        const leadId = getMapped(row, "leadorcontactid");
        if (leadId) agg.leadIds.add(leadId);

        const isSqo = num(getMapped(row, "is_sqo"));
        if (isSqo && isSqo > 0 && leadId) agg.sqoLeadIds.add(leadId);
      }

      const assets = Array.from(aggMap.values()).map((a) => ({
        contentId: a.contentId,
        stage: a.stage as "TOFU" | "MOFU" | "BOFU" | "UNKNOWN",
        name: a.name,
        url: a.url,
        typecampaignmember: a.typecampaignmember,
        productFranchise: a.productFranchise,
        utmChannel: a.utmChannel,
        utmCampaign: a.utmCampaign,
        utmMedium: a.utmMedium,
        utmTerm: a.utmTerm,
        utmContent: a.utmContent,
        formName: a.formName,
        cta: a.cta,
        objective: a.objective,
        productCategory: a.productCategory,
        campaignId: a.campaignId,
        campaignName: a.campaignName,
        dateStamp: a.dateStamp,
        pageviewsSum: a.clientIds.size,
        timeAvg: a.timeCount > 0 ? Math.round(a.timeTotal / a.timeCount) : 0,
        downloadsSum: a.downloadsSum,
        uniqueLeads: a.leadIds.size,
        sqoCount: a.sqoLeadIds.size,
      }));

      await storage.clearAssets();
      await storage.bulkInsertAssets(assets);

      const contentPlaceholders = assets.map(a => ({
        assetId: a.contentId,
        sourceUrl: a.url || null,
      }));
      const newPlaceholders = await storage.createContentPlaceholders(contentPlaceholders);

      res.json({
        ingested: assets.length,
        totalRows: rows.length,
        skippedNoContentId,
        uniqueContentIds: assets.length,
        newContentPlaceholders: newPlaceholders,
        stageBreakdown: {
          TOFU: assets.filter((a) => a.stage === "TOFU").length,
          MOFU: assets.filter((a) => a.stage === "MOFU").length,
          BOFU: assets.filter((a) => a.stage === "BOFU").length,
          UNKNOWN: assets.filter((a) => a.stage === "UNKNOWN").length,
        },
      });
    } catch (err: any) {
      console.error("Mapped ingest error:", err);
      res.status(500).json({ message: err.message || "Ingestion failed" });
    }
  });

  app.get("/api/proxy", requireAuth, async (req: Request, res: Response) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl || !isValidUrl(targetUrl)) {
      return res.status(400).json({ message: "Missing or invalid url parameter" });
    }

    const fullUrl = targetUrl.startsWith("http") ? targetUrl : `https://${targetUrl}`;

    try {
      const parsed = new URL(fullUrl);

      if (!isAllowedProxyHost(parsed.hostname)) {
        return res.status(403).json({ message: "This domain is not allowed for preview" });
      }

      const maxRedirects = 5;
      let currentUrl = fullUrl;

      for (let i = 0; i <= maxRedirects; i++) {
        const result = await proxyFetch(currentUrl);

        if (result.redirect) {
          if (i === maxRedirects) {
            return res.status(502).json({ message: "Too many redirects" });
          }
          currentUrl = result.redirect;
          continue;
        }

        const { contentType, body } = result;
        const isPdf = contentType.includes("application/pdf");
        const isHtml = contentType.includes("text/html");

        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "public, max-age=300");

        if (isPdf) {
          res.setHeader("Content-Disposition", "inline");
          return res.send(body);
        }

        if (!isHtml) {
          return res.send(body);
        }

        let html = body.toString("utf-8");
        const p = new URL(currentUrl);
        const baseUrl = `${p.protocol}//${p.host}`;

        html = html.replace(
          /<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi,
          "",
        );

        html = html.replace(
          /(<head[^>]*>)/i,
          `$1<base href="${baseUrl}/">`,
        );

        html = html.replace(
          /(href|src|action)=(["'])\//g,
          `$1=$2${baseUrl}/`,
        );

        html = html.replace(
          /(href|src|action)=(["'])\/\//g,
          `$1=$2https://`,
        );

        html = html.replace(
          /url\(\s*(['"]?)\//g,
          `url($1${baseUrl}/`,
        );

        return res.send(html);
      }
    } catch (err: any) {
      res.status(500).json({ message: "Proxy error: " + (err.message || "Unknown error") });
    }
  });

  app.post("/api/content-library/upload", requireAuth, async (req: Request, res: Response) => {
    try {
      const { assetName, contentType, product, funnelStage, country, industry, dateCreated, description, contentText, classification, pageCount, wordCount, filename } = req.body as {
        assetName?: string; contentType?: string; product?: string; funnelStage?: string;
        country?: string; industry?: string; dateCreated?: string; description?: string;
        contentText?: string; classification?: any; pageCount?: number; wordCount?: number; filename?: string;
      };
      if (!assetName?.trim() || !contentType?.trim() || !product?.trim() || !funnelStage?.trim()) {
        return res.status(400).json({ message: "Asset name, content type, product, and funnel stage are required." });
      }
      const shortName = assetName.trim().replace(/[^a-zA-Z0-9]+/g, "").slice(0, 30);
      const countryCode = (country || "").trim().replace(/[^a-zA-Z]+/g, "").slice(0, 5).toUpperCase() || "XX";
      const industryCode = (industry || "").trim().replace(/[^a-zA-Z]+/g, "").slice(0, 10) || "General";
      const contentId = `${product.trim().replace(/\s+/g, "")}_${countryCode}_${industryCode}_${contentType.trim()}_${funnelStage.trim()}_${shortName}`;

      const asset = await storage.createUploadedAsset({
        contentId,
        assetName: assetName.trim(),
        contentType: contentType.trim(),
        product: product.trim(),
        funnelStage: funnelStage.trim() as any,
        country: (country || "").trim(),
        industry: (industry || "").trim(),
        dateCreated: dateCreated || new Date().toISOString().split("T")[0],
        source: "uploaded",
        description: (description || "").trim(),
      });

      const uploadUserId = (req as any).userId;
      const uploadUser = uploadUserId ? await storage.getUserById(uploadUserId) : null;
      const uploadUserName = uploadUser?.displayName || "Unknown";

      if (contentText && contentText.length > 20) {
        try {
          const analysis = await analyzeContentWithAI(contentText, undefined);
          await storage.upsertContent({
            assetId: contentId,
            contentText,
            contentSummary: analysis.summary || description || `${contentType} about ${classification?.topic || product} for ${funnelStage} stage`,
            extractedTopics: analysis.topics?.length ? analysis.topics : (classification?.topic ? [classification.topic] : null),
            extractedCta: analysis.cta,
            contentFormat: contentType,
            sourceType: "file_uploaded",
            originalFilename: filename || `${assetName}.pdf`,
            fetchStatus: "success",
            contentStructure: analysis.structure || { wordCount: wordCount || 0, sectionCount: 1, pageCount: pageCount || 0, headings: [] },
            messagingThemes: analysis.messagingThemes,
            keywordTags: analysis.keywordTags,
            dateStored: new Date(),
            storedBy: uploadUserId || "user",
            uploadedByUserId: uploadUserId,
            uploadedByName: uploadUserName,
          });
        } catch (storeErr) {
          console.error("Failed to store content text for uploaded asset:", storeErr);
          try {
            await storage.upsertContent({
              assetId: contentId,
              contentText,
              contentSummary: description || `${contentType} about ${classification?.topic || product} for ${funnelStage} stage`,
              extractedTopics: classification?.topic ? [classification.topic] : null,
              contentFormat: contentType,
              sourceType: "file_uploaded",
              originalFilename: filename || `${assetName}.pdf`,
              fetchStatus: "success",
              contentStructure: { wordCount: wordCount || 0, sectionCount: 1, pageCount: pageCount || 0, headings: [] },
              dateStored: new Date(),
              storedBy: uploadUserId || "user",
              uploadedByUserId: uploadUserId,
              uploadedByName: uploadUserName,
            });
          } catch (fallbackErr) {
            console.error("Fallback content storage also failed:", fallbackErr);
          }
        }
      }

      res.json(asset);
    } catch (err: any) {
      console.error("Upload asset error:", err);
      res.status(500).json({ message: "Failed to upload asset." });
    }
  });

  app.get("/api/content-library", requireAuth, async (req: Request, res: Response) => {
    try {
      const { contentType, product, funnelStage, country, industry, search } = req.query as Record<string, string | undefined>;

      const [datasetAssets, uploadedAssetsList] = await Promise.all([
        storage.getAllAssets(),
        storage.getUploadedAssets({ contentType, product, funnelStage, country, industry, search }),
      ]);

      const datasetItems = datasetAssets
        .filter(a => {
          if (contentType && a.typecampaignmember !== contentType) return false;
          if (product && a.productFranchise !== product) return false;
          if (funnelStage && a.stage !== funnelStage) return false;
          if (search) {
            const s = search.toLowerCase();
            const haystack = [a.contentId, a.name, a.productFranchise, a.typecampaignmember].join(" ").toLowerCase();
            if (!haystack.includes(s)) return false;
          }
          return true;
        })
        .map(a => ({
          id: a.id,
          contentId: a.contentId,
          assetName: a.name || a.contentId,
          contentType: a.typecampaignmember || "Unknown",
          product: a.productFranchise || "",
          funnelStage: a.stage,
          country: "",
          industry: "",
          dateCreated: a.dateStamp || "",
          source: "dataset" as const,
          description: "",
          url: a.url || null,
          pageviewsSum: a.pageviewsSum,
          timeAvg: a.timeAvg,
          downloadsSum: a.downloadsSum,
          uniqueLeads: a.uniqueLeads,
          sqoCount: a.sqoCount,
          createdAt: a.createdAt,
        }));

      const uploadedItems = uploadedAssetsList.map(a => ({
        id: a.id,
        contentId: a.contentId,
        assetName: a.assetName,
        contentType: a.contentType,
        product: a.product,
        funnelStage: a.funnelStage,
        country: a.country,
        industry: a.industry,
        dateCreated: a.dateCreated,
        source: "uploaded" as const,
        description: a.description,
        url: (a as any).fileUrl || null,
        pageviewsSum: a.pageviewsSum,
        timeAvg: a.timeAvg,
        downloadsSum: a.downloadsSum,
        uniqueLeads: a.uniqueLeads,
        sqoCount: a.sqoCount,
        createdAt: a.createdAt,
      }));

      res.json([...uploadedItems, ...datasetItems]);
    } catch (err: any) {
      console.error("Content library error:", err);
      res.status(500).json({ message: "Failed to fetch content library." });
    }
  });

  app.patch("/api/content-library/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const updates = req.body as Partial<{
        assetName: string; contentType: string; product: string;
        funnelStage: string; country: string; industry: string; description: string;
      }>;
      const asset = await storage.updateUploadedAsset(id, updates as any);
      if (!asset) {
        return res.status(404).json({ message: "Asset not found or is a dataset asset." });
      }
      res.json(asset);
    } catch (err: any) {
      console.error("Update asset error:", err);
      res.status(500).json({ message: "Failed to update asset." });
    }
  });

  app.get("/api/content-library/health", requireAuth, async (_req: Request, res: Response) => {
    try {
      const [datasetAssets, uploadedAssetsList] = await Promise.all([
        storage.getAllAssets(),
        storage.getUploadedAssets({}),
      ]);

      const now = Date.now();
      const sixMonths = 180 * 24 * 60 * 60 * 1000;
      const twelveMonths = 365 * 24 * 60 * 60 * 1000;

      let active = 0, aging = 0, stale = 0, newAssets = 0;
      const byStage: Record<string, number> = { TOFU: 0, MOFU: 0, BOFU: 0, UNKNOWN: 0 };

      for (const a of datasetAssets) {
        byStage[a.stage] = (byStage[a.stage] || 0) + 1;
        const date = a.dateStamp ? new Date(a.dateStamp).getTime() : 0;
        const age = now - date;
        if (age < sixMonths) active++;
        else if (age < twelveMonths) aging++;
        else stale++;
      }

      for (const a of uploadedAssetsList) {
        byStage[a.funnelStage] = (byStage[a.funnelStage] || 0) + 1;
        const hasPerf = a.pageviewsSum > 0 || a.uniqueLeads > 0 || a.sqoCount > 0;
        if (!hasPerf) {
          newAssets++;
        } else {
          const date = a.dateCreated ? new Date(a.dateCreated).getTime() : 0;
          const age = now - date;
          if (age < sixMonths) active++;
          else if (age < twelveMonths) aging++;
          else stale++;
        }
      }

      res.json({
        total: datasetAssets.length + uploadedAssetsList.length,
        datasetCount: datasetAssets.length,
        uploadedCount: uploadedAssetsList.length,
        byStage,
        freshness: { active, aging, stale, new: newAssets },
      });
    } catch (err: any) {
      console.error("Library health error:", err);
      res.status(500).json({ message: "Failed to get library health." });
    }
  });

  app.get("/api/greeting-stats", requireAuth, async (_req, res) => {
    try {
      const summary = await buildInsightsSummary();
      if (!summary) {
        return res.json({ hasData: false });
      }
      const stageCounts: Record<string, number> = {};
      let totalSqos = 0;
      let totalAssets = 0;
      for (const s of summary.stage_summary) {
        stageCounts[s.stage] = s.count;
        totalSqos += s.sqos;
        totalAssets += s.count;
      }
      const topPerformer = summary.top_content?.[0] || null;
      const contentCoverage = await storage.getContentCoverage();
      let totalWithContent = 0;
      for (const stage of Object.values(contentCoverage)) {
        totalWithContent += stage.withContent;
      }
      res.json({
        hasData: true,
        totalAssets,
        stageCounts,
        totalSqos,
        totalLeads: summary.metric_totals.leads,
        totalPageviews: summary.metric_totals.pageviews,
        topPerformer: topPerformer ? { contentId: topPerformer.contentId, sqos: topPerformer.sqos, stage: topPerformer.stage } : null,
        contentCoverage,
        totalWithContent,
      });
    } catch (err: any) {
      console.error("Greeting stats error:", err);
      res.json({ hasData: false });
    }
  });

  app.get("/api/insights/summary", requireAuth, async (_req, res) => {
    try {
      const summary = await buildInsightsSummary();
      if (!summary) {
        return res.json({ empty: true, message: "No data uploaded yet." });
      }
      res.json(summary);
    } catch (err: any) {
      console.error("Error building insights summary:", err);
      res.status(500).json({ message: "Failed to build insights summary" });
    }
  });

  return httpServer;
}

function isValidUrl(v: string): boolean {
  if (!v) return false;
  try {
    const url = new URL(v.startsWith("http") ? v : `https://${v}`);
    return url.hostname.includes(".");
  } catch {
    return false;
  }
}

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function num(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function classifyStageServer(contentId: string, row: any): "TOFU" | "MOFU" | "BOFU" | "UNKNOWN" {
  const s = contentId.toUpperCase();
  if (s.includes("BOFU")) return "BOFU";
  if (s.includes("MOFU")) return "MOFU";
  if (s.includes("TOFU")) return "TOFU";

  const sqo = num(row.is_sqo || row.sqo_flag || row.sqo || row.sqos);
  if (sqo && sqo > 0) return "BOFU";

  const leadId = str(row.leadorcontactid) || str(row.leadid) || str(row.contactid);
  if (leadId) return "MOFU";

  const clientId = str(row.google_clientid1) || str(row.google_clientid) || str(row.clientid);
  const pv = num(row.total_pageviews || row.pageviews);
  const time = num(row.total_time_on_page_seconds || row.avg_time_on_page);
  if (clientId || (pv && pv > 0) || (time && time > 0)) return "TOFU";

  return "UNKNOWN";
}

const BLOCKED_IP_PREFIXES = [
  "127.", "0.", "10.", "192.168.", "169.254.", "172.16.", "172.17.",
  "172.18.", "172.19.", "172.20.", "172.21.", "172.22.", "172.23.",
  "172.24.", "172.25.", "172.26.", "172.27.", "172.28.", "172.29.",
  "172.30.", "172.31.", "::1", "fc00:", "fe80:", "fd",
];

function isAllowedProxyHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower === "0.0.0.0") return false;
  for (const prefix of BLOCKED_IP_PREFIXES) {
    if (lower.startsWith(prefix)) return false;
  }
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(lower)) return false;
  return true;
}

const MAX_PROXY_SIZE = 10 * 1024 * 1024;

function proxyFetch(
  url: string,
): Promise<{ redirect?: string; contentType: string; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const fetcher = parsed.protocol === "https:" ? https : http;

    const req = fetcher.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8",
        },
        timeout: 15000,
      },
      (upstream) => {
        if (
          upstream.statusCode &&
          upstream.statusCode >= 300 &&
          upstream.statusCode < 400 &&
          upstream.headers.location
        ) {
          const redirectUrl = new URL(upstream.headers.location, url).toString();
          upstream.resume();
          return resolve({ redirect: redirectUrl, contentType: "", body: Buffer.alloc(0) });
        }

        const contentType = upstream.headers["content-type"] || "text/html";
        const chunks: Buffer[] = [];
        let totalSize = 0;

        upstream.on("data", (chunk: Buffer) => {
          totalSize += chunk.length;
          if (totalSize > MAX_PROXY_SIZE) {
            upstream.destroy();
            reject(new Error("Response too large"));
            return;
          }
          chunks.push(chunk);
        });

        upstream.on("end", () => {
          resolve({ contentType, body: Buffer.concat(chunks) });
        });

        upstream.on("error", (err: Error) => reject(err));
      },
    );

    req.on("error", (err: Error) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });
  });
}

