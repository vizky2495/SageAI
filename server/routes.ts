import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertPromptVersionSchema, insertCollaboratorSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/versions", async (_req, res) => {
    const versions = await storage.getPromptVersions();
    res.json(versions);
  });

  app.get("/api/versions/:id", async (req, res) => {
    const version = await storage.getPromptVersion(req.params.id);
    if (!version) return res.status(404).json({ message: "Version not found" });
    res.json(version);
  });

  app.post("/api/versions", async (req, res) => {
    const parsed = insertPromptVersionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const version = await storage.createPromptVersion(parsed.data);
    res.status(201).json(version);
  });

  app.patch("/api/versions/:id", async (req, res) => {
    const partial = insertPromptVersionSchema.partial().safeParse(req.body);
    if (!partial.success) return res.status(400).json({ message: partial.error.message });
    const version = await storage.updatePromptVersion(req.params.id, partial.data);
    if (!version) return res.status(404).json({ message: "Version not found" });
    res.json(version);
  });

  app.delete("/api/versions/:id", async (req, res) => {
    const ok = await storage.deletePromptVersion(req.params.id);
    if (!ok) return res.status(404).json({ message: "Version not found" });
    res.status(204).end();
  });

  app.get("/api/collaborators", async (_req, res) => {
    const collabs = await storage.getCollaborators();
    res.json(collabs);
  });

  app.get("/api/collaborators/:id", async (req, res) => {
    const collab = await storage.getCollaborator(req.params.id);
    if (!collab) return res.status(404).json({ message: "Collaborator not found" });
    res.json(collab);
  });

  app.post("/api/collaborators", async (req, res) => {
    const parsed = insertCollaboratorSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const collab = await storage.createCollaborator(parsed.data);
    res.status(201).json(collab);
  });

  app.patch("/api/collaborators/:id", async (req, res) => {
    const partial = insertCollaboratorSchema.partial().safeParse(req.body);
    if (!partial.success) return res.status(400).json({ message: partial.error.message });
    const collab = await storage.updateCollaborator(req.params.id, partial.data);
    if (!collab) return res.status(404).json({ message: "Collaborator not found" });
    res.json(collab);
  });

  app.delete("/api/collaborators/:id", async (req, res) => {
    const ok = await storage.deleteCollaborator(req.params.id);
    if (!ok) return res.status(404).json({ message: "Collaborator not found" });
    res.status(204).end();
  });

  app.post("/api/compile", async (_req, res) => {
    const collabs = await storage.getCollaborators();
    const sorted = [...collabs].sort((a, b) => a.file.localeCompare(b.file));
    const layers = sorted
      .filter((c) => c.layerContent.trim())
      .map((c) => `<!-- layer: ${c.name} (${c.file}) -->\n${c.layerContent}`);

    const compiled = `# Content Intelligence Analyst — Compiled Prompt\n\nBuild: compiled-${Date.now()}\nLayers: ${layers.length}\nAuthors: ${sorted.map((c) => c.name).join(", ")}\n\n---\n\n${layers.join("\n\n---\n\n")}\n\n---\n\n_Build footer — compiled deterministically (alphabetical by filename)._`;

    const size = `${(new TextEncoder().encode(compiled).length / 1024).toFixed(1)} KB`;
    res.json({ compiled, size, layerCount: layers.length });
  });

  app.post("/api/assets/ingest", async (req, res) => {
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
        const contentId = str(r.content || r.utm_content || r.name || r.url_path_only || r.url || "");
        if (!contentId) continue;

        const stage = classifyStageServer(contentId, r);
        const key = contentId;

        if (!aggMap.has(key)) {
          const rawUrl = str(r.url) || (str(r.url_prefix) && str(r.url_path_only) ? `${str(r.url_prefix)}${str(r.url_path_only)}` : "");
          aggMap.set(key, {
            contentId,
            stage,
            name: str(r.name) || str(r.form_name) || null,
            url: rawUrl || null,
            typecampaignmember: str(r.typecampaignmember__c) || str(r.typecampaignmember) || str(r.content_type) || null,
            productFranchise: str(r.product_franchise__c) || str(r.product_franchise) || str(r.product) || null,
            utmChannel: str(r.utm_channel) || str(r.channel) || null,
            pageviewsSum: 0,
            timeTotal: 0,
            timeCount: 0,
            downloadsSum: 0,
            leadIds: new Set<string>(),
            sqoCount: 0,
            formName: str(r.form_name) || null,
          });
        }

        const agg = aggMap.get(key)!;
        agg.pageviewsSum += num(r.total_pageviews || r.pageviews || r.page_views) || 0;
        const timeVal = num(r.total_time_on_page_seconds || r.avg_time_on_page || r.time_on_page || r.time_spent_seconds);
        if (timeVal) {
          agg.timeTotal += timeVal;
          agg.timeCount += 1;
        }
        agg.downloadsSum += num(r.total_downloads || r.downloads) || 0;

        const leadId = str(r.leadorcontactid) || str(r.leadid) || str(r.contactid) || str(r.lead_or_contact_id);
        if (leadId) agg.leadIds.add(leadId);

        const sqo = num(r.is_sqo || r.sqo_flag || r.sqo || r.sqos);
        if (sqo && sqo > 0) agg.sqoCount += 1;
      }

      const assets = Array.from(aggMap.values()).map((a) => ({
        contentId: a.contentId,
        stage: a.stage as "TOFU" | "MOFU" | "BOFU" | "UNKNOWN",
        name: a.name,
        url: a.url,
        typecampaignmember: a.typecampaignmember,
        productFranchise: a.productFranchise,
        utmChannel: a.utmChannel,
        pageviewsSum: a.pageviewsSum,
        timeAvg: a.timeCount > 0 ? a.timeTotal / a.timeCount : 0,
        downloadsSum: a.downloadsSum,
        uniqueLeads: a.leadIds.size,
        sqoCount: a.sqoCount,
        formName: a.formName,
      }));

      await storage.clearAssets();
      await storage.bulkInsertAssets(assets);

      res.json({ ingested: assets.length });
    } catch (err: any) {
      console.error("Ingest error:", err);
      res.status(500).json({ message: err.message || "Ingestion failed" });
    }
  });

  app.get("/api/assets", async (req, res) => {
    const stage = String(req.query.stage || "TOFU");
    const search = req.query.search ? String(req.query.search) : undefined;
    const limit = Math.min(Number(req.query.limit) || 25, 100);
    const offset = Number(req.query.offset) || 0;

    const result = await storage.getAssets({ stage, search, limit, offset });
    res.json(result);
  });

  app.get("/api/diff/:versionId/:compareId", async (req, res) => {
    const [current, previous] = await Promise.all([
      storage.getPromptVersion(req.params.versionId),
      storage.getPromptVersion(req.params.compareId),
    ]);
    if (!current || !previous) return res.status(404).json({ message: "Version not found" });

    const currentLines = current.compiledContent.split("\n");
    const previousLines = previous.compiledContent.split("\n");
    const diff = simpleDiff(previousLines, currentLines);
    res.json({ diff, from: previous.tag, to: current.tag });
  });

  return httpServer;
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

  const pv = num(row.total_pageviews || row.pageviews);
  const time = num(row.total_time_on_page_seconds || row.avg_time_on_page);
  if ((pv && pv > 0) || (time && time > 0)) return "TOFU";

  return "UNKNOWN";
}

type DiffLine = { type: "add" | "del" | "ctx"; text: string };

function simpleDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const result: DiffLine[] = [];
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  const allLines = new Map<string, "old" | "new" | "both">();
  for (const l of oldLines) allLines.set(l, "old");
  for (const l of newLines) {
    if (allLines.has(l)) allLines.set(l, "both");
    else allLines.set(l, "new");
  }

  for (const l of newLines) {
    if (!oldSet.has(l)) result.push({ type: "add", text: l });
    else result.push({ type: "ctx", text: l });
  }
  for (const l of oldLines) {
    if (!newSet.has(l)) result.push({ type: "del", text: l });
  }

  return result;
}
