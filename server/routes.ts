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

