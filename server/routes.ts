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
