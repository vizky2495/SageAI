import { db } from "./db";
import { promptVersions, collaborators } from "@shared/schema";
import { sql } from "drizzle-orm";

async function seed() {
  const existingVersions = await db.select().from(promptVersions).limit(1);
  if (existingVersions.length > 0) {
    console.log("Database already seeded, skipping.");
    return;
  }

  const versionData = [
    {
      tag: "v8",
      author: "Pavan",
      summary: "Introduces collaborators folder + staging compiled prompt.",
      status: "released" as const,
      promptsCount: 4,
      compiledSize: "14.8 KB",
      compiledContent: `# Content Intelligence Analyst — Compiled Prompt (v8)\n\nBuild: v8\nAuthors: Pavan\n\n---\n\n## 1. Role\nYou are a marketing-analytics assistant.\n\n## 2. Collaborator folder\nIntroduced a collaborators/ directory for modular prompt layers.\n\n## 3. Staging\nCompiled prompt is now staged before release.\n\n---\n\n_Build footer — compiled deterministically._`,
      createdAt: new Date("2026-02-08T08:15:00Z"),
    },
    {
      tag: "v9",
      author: "Rashmita",
      summary: "Adds safety rules + conflict resolution guidance.",
      status: "released" as const,
      promptsCount: 4,
      compiledSize: "15.6 KB",
      compiledContent: `# Content Intelligence Analyst — Compiled Prompt (v9)\n\nBuild: v9\nAuthors: Rashmita\n\n---\n\n## 1. Role\nYou are a marketing-analytics assistant.\n\n## 2. Collaborator folder\nIntroduced a collaborators/ directory for modular prompt layers.\n\n## 3. Safety rules\n- Never fabricate metrics.\n- Cite source CSV column names.\n- Flag data quality issues explicitly.\n\n## 4. Conflict resolution\nWhen collaborator layers conflict, prefer the most recent edit.\n\n---\n\n_Build footer — compiled deterministically._`,
      createdAt: new Date("2026-02-09T10:28:00Z"),
    },
    {
      tag: "v10",
      author: "Petar",
      summary: "Adds changelog + build manifest metadata fields.",
      status: "released" as const,
      promptsCount: 5,
      compiledSize: "17.1 KB",
      compiledContent: `# Content Intelligence Analyst — Compiled Prompt (v10)\n\nBuild: v10\nAuthors: Petar\n\n---\n\n## 1. Role\nYou are a marketing-analytics assistant.\n\n## 2. Collaborator folder\nIntroduced a collaborators/ directory for modular prompt layers.\n\n## 3. Safety rules\n- Never fabricate metrics.\n- Cite source CSV column names.\n- Flag data quality issues explicitly.\n\n## 4. Conflict resolution\nWhen collaborator layers conflict, prefer the most recent edit.\n\n## 5. Build manifest\n- build_id, authors, layers, created_at, compiled_size.\n- Changelog is auto-generated from version summaries.\n\n---\n\n_Build footer — compiled deterministically._`,
      createdAt: new Date("2026-02-10T13:06:00Z"),
    },
    {
      tag: "v11",
      author: "Vishal",
      summary: "Refines funnel stage tie-breakers + schema mapping notes.",
      status: "released" as const,
      promptsCount: 5,
      compiledSize: "17.9 KB",
      compiledContent: `# Content Intelligence Analyst — Compiled Prompt (v11)\n\nBuild: v11\nAuthors: Vishal\n\n---\n\n## 1. Role\nYou are a marketing-analytics assistant.\n\n## 2. Schema mapping\n- Flexible field normalization handles multiple CSV column name variations.\n- Stage classification: BOFU > MOFU > TOFU > UNKNOWN (priority order).\n\n## 3. Safety rules\n- Never fabricate metrics.\n- Cite source CSV column names.\n\n## 4. Conflict resolution\nWhen collaborator layers conflict, prefer the most recent edit.\n\n## 5. Build manifest\n- build_id, authors, layers, created_at, compiled_size.\n\n---\n\n_Build footer — compiled deterministically._`,
      createdAt: new Date("2026-02-11T17:42:00Z"),
    },
    {
      tag: "v12",
      author: "Release Bot",
      summary: "Adds content-type filters + deterministic compilation footer.",
      status: "latest" as const,
      promptsCount: 6,
      compiledSize: "18.4 KB",
      compiledContent: `# Content Intelligence Analyst — Compiled Prompt (v12)\n\nBuild: v12\nAuthors: Release Bot\n\n---\n\n## 1. Role\nYou are a marketing-analytics assistant.\n\n## 2. Schema mapping\n- Flexible field normalization handles multiple CSV column name variations.\n- Stage classification: BOFU > MOFU > TOFU > UNKNOWN (priority order).\n\n## 3. Content-type filters\n- Add content search + content type filters to drilldowns.\n- Merge collaborator prompts in deterministic alphabetical order.\n- Append build footer (build #, timestamp, authors).\n\n## 4. Safety rules\n- Never fabricate metrics.\n- Cite source CSV column names.\n- Flag data quality issues explicitly.\n\n## 5. Conflict resolution\nWhen collaborator layers conflict, prefer the most recent edit.\n\n## 6. Build manifest\n- build_id, authors, layers, created_at, compiled_size.\n- Changelog auto-generated from version summaries.\n\n---\n\n_Build footer — compiled deterministically (alphabetical by filename)._`,
      createdAt: new Date("2026-02-12T09:18:00Z"),
    },
  ];

  await db.insert(promptVersions).values(versionData);

  const collabData = [
    {
      name: "Pavan",
      initials: "PA",
      file: "prompts/collaborators/pavankumar.md",
      focus: "Collab workflow + review",
      risk: "low" as const,
      layerContent: "## Collaboration Workflow\n\n- Each collaborator owns a markdown file.\n- Changes are reviewed before merging into the compiled prompt.\n- Use deterministic alphabetical compilation order.\n",
      lastEditedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
    },
    {
      name: "Petar",
      initials: "PE",
      file: "prompts/collaborators/petar.md",
      focus: "Build manifests + changelog",
      risk: "low" as const,
      layerContent: "## Build Manifest\n\n- Include build_id, authors, layers, created_at, and compiled_size.\n- Auto-generate changelog from version summaries.\n- Track compilation metadata for audit trail.\n",
      lastEditedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    },
    {
      name: "Rashmita",
      initials: "RA",
      file: "prompts/collaborators/rashmita.md",
      focus: "Safety + guardrails",
      risk: "medium" as const,
      layerContent: "## Safety Rules\n\n- Never fabricate metrics or data points.\n- Always cite the source CSV column names when referencing data.\n- Flag data quality issues explicitly rather than silently handling them.\n- When unsure, state uncertainty rather than guessing.\n",
      lastEditedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    },
    {
      name: "Vishal",
      initials: "VI",
      file: "prompts/collaborators/vishal.md",
      focus: "Schema mapping + metrics",
      risk: "low" as const,
      layerContent: "## Schema Mapping\n\n- Flexible normalization handles multiple column name variations.\n- Stage classification uses priority order: BOFU > MOFU > TOFU > UNKNOWN.\n- TOFU hero metric: New Users (preferred) or New Contacts (fallback).\n- MOFU hero metric: MQLs; rate = MQLs / (form submissions or new contacts).\n- BOFU: Shows QDC → SQO rate when QDC data exists.\n",
      lastEditedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    },
  ];

  await db.insert(collaborators).values(collabData);

  console.log("Seeded prompt versions and collaborators.");
}

seed()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  });
