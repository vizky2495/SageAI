import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { requireAuth, requireAdmin } from "./auth";
import Anthropic from "@anthropic-ai/sdk";
import * as cheerio from "cheerio";
import https from "https";
import http from "http";
import { type StructuredKeywordTags, normalizeKeywordTags } from "@shared/schema";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "[::1]") return false;
    if (hostname.startsWith("10.") || hostname.startsWith("192.168.") || hostname.startsWith("172.")) return false;
    if (hostname.endsWith(".internal") || hostname.endsWith(".local")) return false;
    if (hostname === "metadata.google.internal" || hostname === "169.254.169.254") return false;
    return true;
  } catch {
    return false;
  }
}

export async function analyzeContentWithAI(text: string, url?: string): Promise<{
  summary: string;
  topics: string[];
  cta: { text: string; type: string; strength: string; location: string } | null;
  structure: { wordCount: number; sectionCount: number; pageCount: number; headings: string[] };
  messagingThemes: string[];
  keywordTags: StructuredKeywordTags;
}> {
  const truncated = text.slice(0, 15000);
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      messages: [
        {
          role: "user",
          content: `You are a content analyst for a B2B marketing team. Analyze this marketing content and return JSON only (no markdown fences).

{
  "summary": "2-3 sentence summary of key message and value proposition",
  "topics": ["topic1", "topic2", ...],
  "cta": { "text": "CTA text found", "type": "demo_request|free_trial|download|contact|learn_more|subscribe|purchase|none", "strength": "strong|moderate|weak|none", "location": "hero|body|footer|sidebar|popup" } or null if no CTA,
  "headings": ["heading1", "heading2", ...],
  "messagingThemes": ["theme1", "theme2", ...],
  "topic_tags": ["tag1", "tag2", ...],
  "audience_tags": ["tag1", "tag2", ...],
  "intent_tags": ["tag1", "tag2", ...]
}

Tag generation rules:

TOPIC TAGS (5-8 tags): What specific subjects does this content cover?
- Good: "Year-End Payroll Close", "T4 Slip Generation", "CRA Reporting Deadlines", "Human Firm Four-Phase Model"
- Bad: "Payroll", "Tax", "Compliance", "Accounting" (too generic)
- Tags must be specific enough that someone searching would find exactly what they need
- Include proper nouns when discussed: "Will Farnell Methodology", "CPA Canada Standards"
- Include specific metrics/benchmarks if mentioned: "30% YoY Growth", "100% Cloud Adoption"

AUDIENCE TAGS (2-3 tags): Who specifically is this content for?
- Good: "Accounting Firm Owners", "Canadian CPAs", "Growing Practices 10-50 Employees"
- Bad: "Accountants", "Business Owners", "Professionals" (too broad)
- Include seniority, role, or business stage if the content targets a specific segment

INTENT TAGS (2-3 tags): What is the reader trying to do or solve?
- Good: "Modernize Practice Operations", "Shift Compliance to Advisory", "Reduce Year-End Processing Time"
- Bad: "Learn", "Improve", "Grow" (too vague)
- Describe the reader's goal or pain point, not the content format
- Prefer action-oriented: "Automate Month-End Close" not "Month-End Close"

Rules for ALL tags:
- Each tag 1-4 words
- Every tag must come from something actually discussed in the content text
- Never infer from title or metadata alone
- Do not repeat the product name as a standalone tag

Content${url ? ` from ${url}` : ""}:
${truncated}`,
        },
      ],
    });

    const raw = (response.content[0] as any).text;
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const headings: string[] = parsed.headings || [];
    const sectionCount = headings.length || Math.max(1, Math.floor(wordCount / 300));

    const topicTags = Array.isArray(parsed.topic_tags) ? parsed.topic_tags.slice(0, 8) : [];
    const audienceTags = Array.isArray(parsed.audience_tags) ? parsed.audience_tags.slice(0, 3) : [];
    const intentTags = Array.isArray(parsed.intent_tags) ? parsed.intent_tags.slice(0, 3) : [];

    return {
      summary: parsed.summary || "No summary available",
      topics: Array.isArray(parsed.topics) ? parsed.topics.slice(0, 8) : [],
      cta: parsed.cta || null,
      structure: {
        wordCount,
        sectionCount,
        pageCount: 1,
        headings,
      },
      messagingThemes: Array.isArray(parsed.messagingThemes) ? parsed.messagingThemes.slice(0, 5) : [],
      keywordTags: {
        topic_tags: topicTags,
        audience_tags: audienceTags,
        intent_tags: intentTags,
        user_added_tags: [],
      },
    };
  } catch (err) {
    console.error("AI content analysis failed:", err);
    return {
      summary: "AI analysis unavailable",
      topics: [],
      cta: null,
      structure: { wordCount, sectionCount: 1, pageCount: 1, headings: [] },
      messagingThemes: [],
      keywordTags: { topic_tags: [], audience_tags: [], intent_tags: [], user_added_tags: [] },
    };
  }
}

function fetchUrl(url: string, maxRedirects = 3): Promise<{ contentType: string; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.get(url, { timeout: 15000, headers: { "User-Agent": "Mozilla/5.0 CIA-Bot/1.0" } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (maxRedirects <= 0) return reject(new Error("Too many redirects"));
        return fetchUrl(res.headers.location, maxRedirects - 1).then(resolve, reject);
      }
      if (res.statusCode && res.statusCode >= 400) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks: Buffer[] = [];
      let size = 0;
      const MAX = 50 * 1024 * 1024;
      res.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX) { res.destroy(); reject(new Error("Response too large")); return; }
        chunks.push(chunk);
      });
      res.on("end", () => resolve({ contentType: res.headers["content-type"] || "", body: Buffer.concat(chunks) }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timed out")); });
  });
}

function extractHtmlContent(html: string): { text: string; headings: string[]; isGated: boolean; gateNotes: string } {
  const $ = cheerio.load(html);
  $("script, style, nav, footer, header, aside, .sidebar, .navigation, .cookie-banner, .popup").remove();

  const headings: string[] = [];
  $("h1, h2, h3").each((_, el) => {
    const t = $(el).text().trim();
    if (t) headings.push(t);
  });

  const formBeforeContent = $("form").length > 0 && $("article, main, .content, .post-content").length > 0;
  let isGated = false;
  let gateNotes = "";
  if (formBeforeContent) {
    const formPos = $("form").first().parents().length;
    const contentPos = $("article, main, .content").first().parents().length;
    if (formPos <= contentPos) {
      isGated = true;
      gateNotes = "Content appears gated — form detected before main content";
    }
  }

  const main = $("article, main, .content, .post-content, [role='main']");
  let text: string;
  if (main.length > 0) {
    text = main.first().text().replace(/\s+/g, " ").trim();
  } else {
    text = $("body").text().replace(/\s+/g, " ").trim();
  }

  return { text, headings, isGated, gateNotes };
}

async function extractPdfText(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  const { PDFParse } = await import("pdf-parse");
  const result = await PDFParse(buffer, { max: 20 });
  return { text: result.text || "", pageCount: result.numpages || 1 };
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.default.extractRawText({ buffer });
  return result.value;
}

async function fetchAndStoreUrl(assetId: string, url: string, storedBy = "user") {
  const { contentType, body } = await fetchUrl(url);
  const isPdf = contentType.includes("pdf") || url.toLowerCase().endsWith(".pdf");

  let text: string;
  let fetchStatus = "success";
  let fetchNotes = "";
  let contentFormat = isPdf ? "pdf" : "webpage_snapshot";

  let pdfPageCount = 1;
  if (isPdf) {
    try {
      const pdfResult = await extractPdfText(body);
      text = pdfResult.text;
      pdfPageCount = pdfResult.pageCount;
      if (!text.trim()) {
        fetchStatus = "partial";
        fetchNotes = "PDF text extraction returned empty — may be image-based PDF";
      }
    } catch (e: any) {
      console.error("PDF extraction failed:", e);
      fetchStatus = "partial";
      fetchNotes = "Could not extract text from this PDF";
      text = "";
    }
  } else {
    const extracted = extractHtmlContent(body.toString("utf-8"));
    text = extracted.text;
    if (extracted.isGated) {
      fetchStatus = "gated";
      fetchNotes = extracted.gateNotes;
    }
    if (!text.trim()) {
      fetchStatus = "partial";
      fetchNotes = "No meaningful text extracted from page";
    }
  }

  const analysis = text.trim() ? await analyzeContentWithAI(text, url) : {
    summary: "No text content available for analysis",
    topics: [],
    cta: null,
    structure: { wordCount: 0, sectionCount: 0, pageCount: 1, headings: [] },
    messagingThemes: [],
    keywordTags: { topic_tags: [], audience_tags: [], intent_tags: [], user_added_tags: [] },
  };

  if (isPdf && analysis.structure) {
    analysis.structure.pageCount = pdfPageCount;
  }

  const stored = await storage.upsertContent({
    assetId,
    contentText: text.slice(0, 500000),
    contentSummary: analysis.summary,
    extractedTopics: analysis.topics,
    extractedCta: analysis.cta,
    contentStructure: analysis.structure,
    messagingThemes: analysis.messagingThemes,
    keywordTags: analysis.keywordTags,
    contentFormat,
    sourceType: "url_fetched",
    sourceUrl: url,
    storedFileBase64: isPdf ? body.toString("base64") : null,
    fileSizeBytes: body.length,
    dateStored: new Date(),
    fetchStatus,
    fetchNotes,
    storedBy,
  });

  return {
    id: stored.id,
    assetId: stored.assetId,
    contentSummary: stored.contentSummary,
    extractedTopics: stored.extractedTopics,
    extractedCta: stored.extractedCta,
    contentStructure: stored.contentStructure,
    messagingThemes: stored.messagingThemes,
    contentFormat: stored.contentFormat,
    fetchStatus: stored.fetchStatus,
    fetchNotes: stored.fetchNotes,
    fileSizeBytes: stored.fileSizeBytes,
  };
}

export function registerContentRoutes(app: Express): void {
  app.post("/api/content/fetch-url", requireAuth, async (req: Request, res: Response) => {
    try {
      const { assetId, url } = req.body as { assetId?: string; url?: string };
      if (!assetId || !url) {
        return res.status(400).json({ message: "assetId and url are required" });
      }
      if (!isAllowedUrl(url)) {
        return res.status(400).json({ message: "URL not allowed. Only public HTTP/HTTPS URLs are supported." });
      }

      const content = await fetchAndStoreUrl(assetId, url);
      res.json({ success: true, content });
    } catch (err: any) {
      console.error("URL fetch error:", err);
      if (req.body?.assetId) {
        await storage.upsertContent({
          assetId: req.body.assetId,
          fetchStatus: "failed",
          fetchNotes: err.message || "Unknown error",
          sourceType: "url_fetched",
          sourceUrl: req.body.url,
          dateStored: new Date(),
          storedBy: "user",
        });
      }
      res.status(500).json({ message: `Failed to fetch URL: ${err.message}` });
    }
  });

  app.post("/api/content/upload-file", requireAuth, async (req: Request, res: Response) => {
    try {
      const { assetId, fileBase64, filename } = req.body as {
        assetId?: string;
        fileBase64?: string;
        filename?: string;
      };
      if (!assetId || !fileBase64 || !filename) {
        return res.status(400).json({ message: "assetId, fileBase64, and filename are required" });
      }

      const buffer = Buffer.from(fileBase64, "base64");
      const ext = filename.toLowerCase().split(".").pop() || "";
      let text = "";
      let contentFormat = "unknown";
      let fetchNotes = "";

      if (ext === "pdf") {
        contentFormat = "pdf";
        try {
          const pdfResult = await extractPdfText(buffer);
          text = pdfResult.text;
          if (!text.trim()) fetchNotes = "PDF text extraction returned empty — may be image-based";
        } catch (e: any) {
          console.error("PDF extraction error:", e);
          fetchNotes = "Could not extract text from this PDF. Try uploading a different file or enter details manually.";
        }
      } else if (ext === "docx") {
        contentFormat = "docx";
        try {
          text = await extractDocxText(buffer);
        } catch (e: any) {
          fetchNotes = `DOCX extraction error: ${e.message}`;
        }
      } else if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) {
        contentFormat = "image";
        fetchNotes = "Image stored; text content not extracted (OCR not available)";
      } else if (ext === "pptx") {
        contentFormat = "pptx";
        fetchNotes = "PPTX stored; limited text extraction";
        try {
          const raw = buffer.toString("utf-8");
          text = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 5000);
        } catch {
          text = "";
        }
      } else {
        contentFormat = ext;
        try {
          text = buffer.toString("utf-8").slice(0, 100000);
        } catch {
          text = "";
        }
      }

      const analysis = text.trim()
        ? await analyzeContentWithAI(text, filename)
        : {
            summary: contentFormat === "image" ? "Image file — visual content" : "No text content available for analysis",
            topics: [],
            cta: null,
            structure: { wordCount: 0, sectionCount: 0, pageCount: 1, headings: [] },
            messagingThemes: [],
            keywordTags: { topic_tags: [], audience_tags: [], intent_tags: [], user_added_tags: [] },
          };

      const stored = await storage.upsertContent({
        assetId,
        contentText: text.slice(0, 500000),
        contentSummary: analysis.summary,
        extractedTopics: analysis.topics,
        extractedCta: analysis.cta,
        contentStructure: analysis.structure,
        messagingThemes: analysis.messagingThemes,
        keywordTags: analysis.keywordTags,
        contentFormat,
        sourceType: "file_uploaded",
        storedFileBase64: fileBase64,
        originalFilename: filename,
        fileSizeBytes: buffer.length,
        dateStored: new Date(),
        fetchStatus: text.trim() ? "success" : "partial",
        fetchNotes,
        storedBy: "user",
      });

      res.json({
        success: true,
        content: {
          id: stored.id,
          assetId: stored.assetId,
          contentSummary: stored.contentSummary,
          extractedTopics: stored.extractedTopics,
          extractedCta: stored.extractedCta,
          contentStructure: stored.contentStructure,
          messagingThemes: stored.messagingThemes,
          contentFormat: stored.contentFormat,
          fetchStatus: stored.fetchStatus,
          fetchNotes: stored.fetchNotes,
          fileSizeBytes: stored.fileSizeBytes,
          originalFilename: stored.originalFilename,
        },
      });
    } catch (err: any) {
      console.error("File upload error:", err);
      res.status(500).json({ message: `Failed to process file: ${err.message}` });
    }
  });

  app.get("/api/content/coverage", requireAuth, async (_req: Request, res: Response) => {
    try {
      const coverage = await storage.getContentCoverage();
      res.json(coverage);
    } catch (err: any) {
      console.error("Content coverage error:", err);
      res.status(500).json({ message: "Failed to fetch content coverage" });
    }
  });

  app.get("/api/content/status", requireAuth, async (_req: Request, res: Response) => {
    try {
      const statusMap = await storage.getContentStatusMap();
      res.json(statusMap);
    } catch (err: any) {
      console.error("Content status error:", err);
      res.status(500).json({ message: "Failed to fetch content status" });
    }
  });

  app.get("/api/content/stats", requireAuth, async (_req: Request, res: Response) => {
    try {
      const stats = await storage.getContentStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to get content stats" });
    }
  });

  app.get("/api/content/:assetId", requireAuth, async (req: Request, res: Response) => {
    try {
      const content = await storage.getContentByAssetId(req.params.assetId);
      if (!content) {
        return res.status(404).json({ message: "No stored content for this asset" });
      }
      const { storedFileBase64, ...rest } = content;
      res.json({ ...rest, hasFile: !!storedFileBase64 });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch content" });
    }
  });

  app.get("/api/content/:assetId/download", requireAuth, async (req: Request, res: Response) => {
    try {
      const content = await storage.getContentByAssetId(req.params.assetId);
      if (!content || !content.storedFileBase64) {
        return res.status(404).json({ message: "No file stored for this asset" });
      }
      const buffer = Buffer.from(content.storedFileBase64, "base64");
      const filename = content.originalFilename || `${content.assetId}.${content.contentFormat || "bin"}`;
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", "application/octet-stream");
      res.send(buffer);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to download file" });
    }
  });

  app.delete("/api/content/:assetId", requireAuth, async (req: Request, res: Response) => {
    try {
      await storage.deleteContent(req.params.assetId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to delete content" });
    }
  });

  app.post("/api/content/refresh", requireAuth, async (req: Request, res: Response) => {
    try {
      const { assetId } = req.body as { assetId?: string };
      if (!assetId) return res.status(400).json({ message: "assetId is required" });
      const existing = await storage.getContentByAssetId(assetId);
      if (!existing || !existing.sourceUrl) {
        return res.status(400).json({ message: "No URL available for this asset to refresh" });
      }
      const result = await fetchAndStoreUrl(assetId, existing.sourceUrl);
      res.json({ success: true, content: result });
    } catch (err: any) {
      res.status(500).json({ message: `Refresh failed: ${err.message}` });
    }
  });

  app.get("/api/content/unfetched-urls", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const unfetched = await storage.getUnfetchedWithUrls();
      res.json(unfetched);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to get unfetched URLs" });
    }
  });

  app.post("/api/content/bulk-fetch", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { assets } = req.body as { assets?: { assetId: string; url: string }[] };
      if (!assets || !Array.isArray(assets) || assets.length === 0) {
        return res.status(400).json({ message: "assets array is required" });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      let completed = 0;
      let failed = 0;

      for (const asset of assets) {
        if (!isAllowedUrl(asset.url)) {
          failed++;
          res.write(`data: ${JSON.stringify({ completed, failed, total: assets.length, current: asset.assetId, error: "URL not allowed" })}\n\n`);
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        try {
          await fetchAndStoreUrl(asset.assetId, asset.url, "system");
          completed++;
        } catch (err: any) {
          failed++;
          await storage.upsertContent({
            assetId: asset.assetId,
            fetchStatus: "failed",
            fetchNotes: err.message,
            sourceType: "url_fetched",
            sourceUrl: asset.url,
            dateStored: new Date(),
            storedBy: "system",
          });
        }

        res.write(`data: ${JSON.stringify({ completed, failed, total: assets.length, current: asset.assetId })}\n\n`);

        await new Promise((r) => setTimeout(r, 2000));
      }

      res.write(`data: ${JSON.stringify({ done: true, completed, failed, total: assets.length })}\n\n`);
      res.end();
    } catch (err: any) {
      console.error("Bulk fetch error:", err);
      if (!res.headersSent) {
        res.status(500).json({ message: "Bulk fetch failed" });
      }
    }
  });

  app.get("/api/tags/summary", requireAuth, async (_req: Request, res: Response) => {
    try {
      const summary = await storage.getTagsSummary();
      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to get tags summary" });
    }
  });

  app.put("/api/content/:assetId/tags", requireAuth, async (req: Request, res: Response) => {
    try {
      const { assetId } = req.params;
      const tags = req.body;
      if (!tags || typeof tags !== "object") {
        return res.status(400).json({ message: "Invalid tags structure" });
      }
      const ensureStringArray = (val: unknown): string[] => {
        if (!Array.isArray(val)) return [];
        return val.filter((v): v is string => typeof v === "string").map(s => s.trim()).filter(Boolean);
      };
      await storage.updateAssetTags(assetId, {
        topic_tags: ensureStringArray(tags.topic_tags),
        audience_tags: ensureStringArray(tags.audience_tags),
        intent_tags: ensureStringArray(tags.intent_tags),
        user_added_tags: ensureStringArray(tags.user_added_tags),
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to update tags" });
    }
  });

  app.post("/api/content/:assetId/regenerate-tags", requireAuth, async (req: Request, res: Response) => {
    try {
      const { assetId } = req.params;
      const content = await storage.getContentByAssetId(assetId);
      if (!content || !content.contentText || content.contentText.length < 50) {
        return res.status(400).json({ message: "No readable content to regenerate tags from" });
      }
      const existingTags = normalizeKeywordTags(content.keywordTags as any);
      const analysis = await analyzeContentWithAI(content.contentText, content.sourceUrl || undefined);
      const newTags: StructuredKeywordTags = {
        ...analysis.keywordTags,
        user_added_tags: existingTags.user_added_tags,
      };
      await storage.updateAssetTags(assetId, newTags);
      res.json({ success: true, tags: newTags });
    } catch (err: any) {
      console.error("Regenerate tags error:", err);
      res.status(500).json({ message: "Failed to regenerate tags" });
    }
  });

  app.post("/api/content/:assetId/reanalyze", requireAuth, async (req: Request, res: Response) => {
    try {
      const { assetId } = req.params;
      const content = await storage.getContentByAssetId(assetId);
      if (!content || !content.contentText || content.contentText.length < 50) {
        return res.status(400).json({ message: "No readable content to re-analyze" });
      }
      const existingTags = normalizeKeywordTags(content.keywordTags as any);
      const analysis = await analyzeContentWithAI(content.contentText, content.sourceUrl || undefined);
      const newTags: StructuredKeywordTags = {
        ...analysis.keywordTags,
        user_added_tags: existingTags.user_added_tags,
      };
      await storage.upsertContent({
        assetId,
        contentText: content.contentText,
        contentSummary: analysis.summary,
        extractedTopics: analysis.topics,
        extractedCta: analysis.cta,
        contentStructure: analysis.structure,
        messagingThemes: analysis.messagingThemes,
        keywordTags: newTags,
        contentFormat: content.contentFormat,
        sourceType: content.sourceType,
        sourceUrl: content.sourceUrl,
        storedFileBase64: content.storedFileBase64,
        originalFilename: content.originalFilename,
        fileSizeBytes: content.fileSizeBytes,
        dateStored: content.dateStored || new Date(),
        fetchStatus: "success",
        fetchNotes: null,
        storedBy: content.storedBy,
      });
      res.json({ success: true });
    } catch (err: any) {
      console.error("Re-analyze error:", err);
      res.status(500).json({ message: "Failed to re-analyze content" });
    }
  });

  app.post("/api/content/regenerate-all-tags", requireAdmin, async (req: Request, res: Response) => {
    try {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      const allContent = await storage.getAllStoredContent();
      const eligible = allContent.filter(c => c.contentText && c.contentText.length >= 50);
      let completed = 0;
      let failed = 0;

      for (const content of eligible) {
        try {
          const existingTags = normalizeKeywordTags(content.keywordTags as any);
          const analysis = await analyzeContentWithAI(content.contentText!, content.sourceUrl || undefined);
          const newTags: StructuredKeywordTags = {
            ...analysis.keywordTags,
            user_added_tags: existingTags.user_added_tags,
          };
          await storage.updateAssetTags(content.assetId, newTags);
          completed++;
        } catch {
          failed++;
        }
        res.write(`data: ${JSON.stringify({ completed, failed, total: eligible.length, current: content.assetId })}\n\n`);
        await new Promise((r) => setTimeout(r, 1500));
      }

      res.write(`data: ${JSON.stringify({ done: true, completed, failed, total: eligible.length })}\n\n`);
      res.end();
    } catch (err: any) {
      console.error("Regenerate all tags error:", err);
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to regenerate tags" });
      }
    }
  });
}
