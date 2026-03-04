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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

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

  const MAX_PDF_SIZE_MB = 20;
  const MAX_PDF_BYTES = MAX_PDF_SIZE_MB * 1024 * 1024;

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
    if (wordCount >= 500) structureScore += 10;

    let ctaScore = 30;
    const avgCtaCount = aggregateBenchmarks?.avgCtaCount || 0;
    if (avgCtaCount >= 2) ctaScore += 15;

    let topicScore = 35;
    if (classification.topic && classification.topic !== "Business Management") topicScore += 15;
    if (classification.product !== "General") topicScore += 10;

    let formatScore = 40;
    if (["Whitepaper", "eBook", "Guide", "Case Study"].includes(classification.contentType)) formatScore += 15;

    structureScore = Math.min(structureScore, 100);
    ctaScore = Math.min(ctaScore, 100);
    topicScore = Math.min(topicScore, 100);
    formatScore = Math.min(formatScore, 100);

    const readinessScore = Math.round(structureScore * 0.3 + ctaScore * 0.2 + topicScore * 0.3 + formatScore * 0.2);

    const primaryMetric = classification.stage === "BOFU" ? "sqos" : classification.stage === "MOFU" ? "leads" : "pageviews";
    const metricStats = aggregateBenchmarks?.[primaryMetric];
    const low = metricStats ? Math.round(metricStats.median * 0.7) : 0;
    const high = metricStats ? Math.round(metricStats.median * 1.3) : 0;

    const recommendations: any[] = [];
    if (benchmarks.length > 0) {
      const topAsset = benchmarks[0];
      recommendations.push({
        priority: 1,
        text: `Study the structure and CTA placement of ${topAsset.contentId}, which leads performance in this category.`,
        contentId: topAsset.contentId,
      });
    }
    if (benchmarks.length > 1) {
      recommendations.push({
        priority: 2,
        text: `Consider the channel strategy used by ${benchmarks[1].contentId} for distribution insights.`,
        contentId: benchmarks[1].contentId,
      });
    }
    if (benchmarks.length > 2) {
      recommendations.push({
        priority: 3,
        text: `Review ${benchmarks[2].contentId} for topic coverage and keyword overlap opportunities.`,
        contentId: benchmarks[2].contentId,
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
        confidence: "low",
      },
      recommendations,
      reusability: benchmarks.slice(0, 3).map((b: any) => ({
        contentId: b.contentId,
        overlap: Math.round(b.relevanceScore * 0.8),
        cannibalizationRisk: b.relevanceScore >= 60 ? "medium" : "low",
        repurposingOpportunity: b.relevanceScore < 40 ? "high" : "medium",
      })),
      topAction: benchmarks.length > 0
        ? `Benchmark against ${benchmarks[0].contentId} and optimize CTAs for ${classification.stage} conversion.`
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

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 500,
      system: `You are a senior content strategist for Sage's content analytics platform. RULES: Every recommendation must cite a specific Content ID from the comparison set. No generic advice. Be concise. Performance forecasts use ranges not point estimates. Return ONLY valid JSON matching this schema:
{"readinessScore":<0-100>,"readinessBreakdown":{"structure":<0-100>,"ctas":<0-100>,"topicDepth":<0-100>,"format":<0-100>},"performanceForecast":{"metric":"<pageviews|leads|sqos>","projectedRange":[<low>,<high>],"confidence":"<low|medium|high>"},"recommendations":[{"priority":<1-5>,"text":"<specific advice citing Content ID>","contentId":"<ID>"}],"reusability":[{"contentId":"<ID>","overlap":<0-100>,"cannibalizationRisk":"<low|medium|high>","repurposingOpportunity":"<low|medium|high>"}],"topAction":"<single sentence>"}`,
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
      const pdfParse = (await import("pdf-parse")).default;
      const buffer = Buffer.from(fileBase64, "base64");
      if (buffer.length > MAX_PDF_BYTES) {
        return res.status(413).json({ error: `PDF exceeds the ${MAX_PDF_SIZE_MB}MB size limit.` });
      }
      let parsed: any;
      try {
        parsed = await pdfParse(buffer);
      } catch (parseErr: any) {
        return res.status(422).json({ error: "Failed to extract text from PDF. The file may be corrupted or image-only." });
      }
      const text = (parsed.text || "").trim();
      const wordCount = text ? text.split(/\s+/).length : 0;
      const pageCount = parsed.numpages || 0;

      const textSnippet = text.slice(0, 2000);
      let classification: any = null;
      let isFallback = false;

      try {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
        const msg = await anthropic.messages.create({
          model: "claude-sonnet-4-5",
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

        const sameStageAndType = allAssets.filter(a => {
          if (a.stage !== classification.stage) return false;
          if (!a.typecampaignmember) return false;
          const aType = a.typecampaignmember.toLowerCase();
          const cType = classification.contentType.toLowerCase();
          return aType.includes(cType.split(" ")[0]) || cType.includes(aType.split(" ")[0]);
        });

        const primaryMetricKey: Record<string, string> = { TOFU: "pageviewsSum", MOFU: "uniqueLeads", BOFU: "sqoCount" };
        const metricKey = primaryMetricKey[classification.stage] || "pageviewsSum";

        const metricValues = sameStageAndType.map(a => (a as any)[metricKey] || 0).sort((x: number, y: number) => x - y);
        const q75Index = Math.floor(metricValues.length * 0.75);
        const q75Threshold = metricValues.length > 0 ? metricValues[q75Index] : 0;
        const topPerformers = sameStageAndType.filter(a => ((a as any)[metricKey] || 0) >= q75Threshold);

        const pool = topPerformers.length >= 3 ? topPerformers : sameStageAndType;

        const classTopicWords: Set<string> = new Set(
          (classification.topic || "").toLowerCase().split(/\s+/).filter((w: string) => w.length > 3)
        );

        const pdfWords: Set<string> = new Set(
          text.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3).slice(0, 500)
        );

        const scored = pool.map(a => {
          let productScore = 0;
          if (classification.product !== "General" && a.productFranchise) {
            const cp = classification.product.toLowerCase();
            const ap = a.productFranchise.toLowerCase();
            if (ap === cp) productScore = 1;
            else if (ap.includes(cp.split(" ").pop()!) || cp.includes(ap.split(" ").pop()!)) productScore = 0.6;
          }

          let topicScore = 0;
          if (classTopicWords.size > 0) {
            const assetWords: Set<string> = new Set(
              [a.name, a.objective, a.cta, a.campaignName]
                .filter(Boolean)
                .join(" ")
                .toLowerCase()
                .split(/\s+/)
                .filter(w => w.length > 3)
            );
            const overlap = Array.from(classTopicWords).filter(w => assetWords.has(w)).length;
            topicScore = classTopicWords.size > 0 ? overlap / classTopicWords.size : 0;
            if (topicScore > 1) topicScore = 1;
          }

          let industryScore = 0;
          if (classification.industry !== "General") {
            const ci = classification.industry.toLowerCase();
            const fields = [a.productCategory, a.campaignName, a.name, a.objective].filter(Boolean).join(" ").toLowerCase();
            if (fields.includes(ci.split(" ")[0])) industryScore = 1;
          }

          let pageSimilarity = 0;
          if (pdfWords.size > 0 && a.name) {
            const assetNameWords: Set<string> = new Set(
              [a.name, a.objective, a.cta].filter(Boolean).join(" ").toLowerCase().split(/\s+/).filter(w => w.length > 3)
            );
            if (assetNameWords.size > 0) {
              const matchCount = Array.from(assetNameWords).filter(w => pdfWords.has(w)).length;
              pageSimilarity = Math.min(matchCount / assetNameWords.size, 1);
            }
          }

          const relevance = productScore * 0.4 + topicScore * 0.3 + industryScore * 0.15 + pageSimilarity * 0.15;

          return {
            asset: a,
            relevance,
          };
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

        const benchmarkPool = topPerformers.length >= 3 ? topPerformers : sameStageAndType;
        if (benchmarkPool.length > 0) {
          const stats = (arr: number[]) => {
            if (arr.length === 0) return { min: 0, max: 0, mean: 0, median: 0 };
            const sorted = [...arr].sort((a, b) => a - b);
            const sum = sorted.reduce((a, b) => a + b, 0);
            const mean = sum / sorted.length;
            const mid = Math.floor(sorted.length / 2);
            const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
            return { min: sorted[0], max: sorted[sorted.length - 1], mean: Math.round(mean * 10) / 10, median };
          };

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
            totalPoolSize: sameStageAndType.length,
            pageviews: stats(pv),
            downloads: stats(dl),
            leads: stats(ld),
            sqos: stats(sq),
            timeOnPage: stats(tm),
            avgCtaCount: ctaCounts.length > 0 ? Math.round(ctaCounts.reduce((a: number, b: number) => a + b, 0) / ctaCounts.length * 10) / 10 : 0,
          };
        }
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
      console.error("PDF extraction error:", error);
      res.status(500).json({ error: "PDF extraction failed.", detail: error?.message });
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
    const limit = Math.min(Number(req.query.limit) || 25, 100);
    const offset = Number(req.query.offset) || 0;

    const result = await storage.getAssets({ stage, search, limit, offset });
    res.json(result);
  });

  app.get("/api/assets/all", requireAuth, async (_req, res) => {
    const assets = await storage.getAllAssets();
    res.json(assets);
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
      const id = parseInt(req.params.id);
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

      res.json({
        ingested: assets.length,
        totalRows: rows.length,
        skippedNoContentId,
        uniqueContentIds: assets.length,
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

