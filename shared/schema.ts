import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, pgEnum, real, boolean, jsonb } from "drizzle-orm/pg-core";
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

export const conversations = pgTable("conversations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  title: text("title").notNull().default("New Chat"),
  agent: text("agent").notNull().default("cia"),
  userId: text("user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  conversationId: integer("conversation_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  displayName: text("display_name").notNull().unique(),
  firstName: text("first_name").notNull().default(""),
  lastName: text("last_name").notNull().default(""),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const uploadedAssets = pgTable("uploaded_assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contentId: text("content_id").notNull(),
  assetName: text("asset_name").notNull(),
  contentType: text("content_type").notNull(),
  product: text("product").notNull(),
  funnelStage: funnelStageEnum("funnel_stage").notNull(),
  country: text("country").notNull().default(""),
  industry: text("industry").notNull().default(""),
  dateCreated: text("date_created").notNull(),
  source: text("source").notNull().default("uploaded"),
  description: text("description").notNull().default(""),
  fileUrl: text("file_url"),
  pageviewsSum: integer("pageviews_sum").notNull().default(0),
  timeAvg: real("time_avg").notNull().default(0),
  downloadsSum: integer("downloads_sum").notNull().default(0),
  uniqueLeads: integer("unique_leads").notNull().default(0),
  sqoCount: integer("sqo_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUploadedAssetSchema = createInsertSchema(uploadedAssets).omit({
  id: true,
  createdAt: true,
});
export type InsertUploadedAsset = z.infer<typeof insertUploadedAssetSchema>;
export type UploadedAsset = typeof uploadedAssets.$inferSelect;

export const feedbackTypeEnum = pgEnum("feedback_type", ["suggestion", "bug"]);
export const feedbackStatusEnum = pgEnum("feedback_status", ["open", "in_progress", "resolved", "closed"]);

export const feedback = pgTable("feedback", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  type: feedbackTypeEnum("type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  page: text("page"),
  status: feedbackStatusEnum("status").notNull().default("open"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertFeedbackSchema = createInsertSchema(feedback).omit({
  id: true,
  status: true,
  createdAt: true,
});
export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
export type Feedback = typeof feedback.$inferSelect;

export const contentStored = pgTable("content_stored", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assetId: text("asset_id").notNull().unique(),
  contentText: text("content_text"),
  contentSummary: text("content_summary"),
  extractedTopics: jsonb("extracted_topics").$type<string[]>(),
  extractedCta: jsonb("extracted_cta").$type<{ text: string; type: string; strength: string; location: string } | null>(),
  contentStructure: jsonb("content_structure").$type<{ wordCount: number; sectionCount: number; pageCount: number; headings: string[] }>(),
  messagingThemes: jsonb("messaging_themes").$type<string[]>(),
  keywordTags: jsonb("keyword_tags").$type<string[]>(),
  contentFormat: text("content_format"),
  sourceType: text("source_type").notNull().default("not_stored"),
  sourceUrl: text("source_url"),
  storedFileBase64: text("stored_file_base64"),
  thumbnailBase64: text("thumbnail_base64"),
  originalFilename: text("original_filename"),
  fileSizeBytes: integer("file_size_bytes"),
  dateStored: timestamp("date_stored"),
  dateLastUpdated: timestamp("date_last_updated"),
  fetchStatus: text("fetch_status").notNull().default("not_stored"),
  fetchNotes: text("fetch_notes"),
  storedBy: text("stored_by").notNull().default("user"),
});

export const insertContentStoredSchema = createInsertSchema(contentStored).omit({
  id: true,
});
export type InsertContentStored = z.infer<typeof insertContentStoredSchema>;
export type ContentStored = typeof contentStored.$inferSelect;
