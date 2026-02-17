import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, pgEnum, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const versionStatusEnum = pgEnum("version_status", [
  "draft",
  "released",
  "latest",
]);

export const riskEnum = pgEnum("risk_level", ["low", "medium", "high"]);

export const promptVersions = pgTable("prompt_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tag: text("tag").notNull(),
  author: text("author").notNull(),
  summary: text("summary").notNull(),
  status: versionStatusEnum("status").notNull().default("draft"),
  promptsCount: integer("prompts_count").notNull().default(0),
  compiledSize: text("compiled_size").notNull().default("0 KB"),
  compiledContent: text("compiled_content").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const collaborators = pgTable("collaborators", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  initials: text("initials").notNull(),
  file: text("file").notNull(),
  focus: text("focus").notNull(),
  risk: riskEnum("risk").notNull().default("low"),
  layerContent: text("layer_content").notNull().default(""),
  lastEditedAt: timestamp("last_edited_at").notNull().defaultNow(),
});

export const insertPromptVersionSchema = createInsertSchema(promptVersions).omit({
  id: true,
  createdAt: true,
});
export type InsertPromptVersion = z.infer<typeof insertPromptVersionSchema>;
export type PromptVersion = typeof promptVersions.$inferSelect;

export const insertCollaboratorSchema = createInsertSchema(collaborators).omit({
  id: true,
  lastEditedAt: true,
});
export type InsertCollaborator = z.infer<typeof insertCollaboratorSchema>;
export type Collaborator = typeof collaborators.$inferSelect;

export const funnelStageEnum = pgEnum("funnel_stage", ["TOFU", "MOFU", "BOFU", "UNKNOWN"]);

export const assetsAgg = pgTable("assets_agg", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contentId: text("content_id").notNull(),
  stage: funnelStageEnum("stage").notNull(),
  name: text("name"),
  url: text("url"),
  typecampaignmember: text("typecampaignmember"),
  productFranchise: text("product_franchise"),
  utmChannel: text("utm_channel"),
  utmCampaign: text("utm_campaign"),
  utmMedium: text("utm_medium"),
  utmTerm: text("utm_term"),
  utmContent: text("utm_content"),
  formName: text("form_name"),
  cta: text("cta"),
  objective: text("objective"),
  productCategory: text("product_category"),
  campaignId: text("campaign_id"),
  campaignName: text("campaign_name"),
  dateStamp: text("date_stamp"),
  pageviewsSum: integer("pageviews_sum").notNull().default(0),
  timeAvg: real("time_avg").notNull().default(0),
  downloadsSum: integer("downloads_sum").notNull().default(0),
  uniqueLeads: integer("unique_leads").notNull().default(0),
  sqoCount: integer("sqo_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAssetAggSchema = createInsertSchema(assetsAgg).omit({
  id: true,
  createdAt: true,
});
export type InsertAssetAgg = z.infer<typeof insertAssetAggSchema>;
export type AssetAgg = typeof assetsAgg.$inferSelect;
