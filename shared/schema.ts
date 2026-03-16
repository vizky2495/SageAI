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

export const insertFeedbackSchema = createInsertSchema(feedback).omit(
  { id: true, status: true, createdAt: true } as any
);
export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
export type Feedback = typeof feedback.$inferSelect;

export interface StructuredKeywordTags {
  topic_tags: string[];
  audience_tags: string[];
  intent_tags: string[];
  user_added_tags: string[];
}

export function normalizeKeywordTags(raw: StructuredKeywordTags | string[] | null | undefined): StructuredKeywordTags {
  const empty: StructuredKeywordTags = { topic_tags: [], audience_tags: [], intent_tags: [], user_added_tags: [] };
  if (!raw) return empty;
  if (Array.isArray(raw)) {
    return { ...empty, topic_tags: raw.filter((v): v is string => typeof v === "string").map(s => s.trim()).filter(Boolean) };
  }
  if (typeof raw !== "object") return empty;
  const ensureArr = (val: unknown): string[] => {
    if (!Array.isArray(val)) return [];
    return val.filter((v): v is string => typeof v === "string").map(s => s.trim()).filter(Boolean);
  };
  return {
    topic_tags: ensureArr(raw.topic_tags),
    audience_tags: ensureArr(raw.audience_tags),
    intent_tags: ensureArr(raw.intent_tags),
    user_added_tags: ensureArr(raw.user_added_tags),
  };
}

export function flattenKeywordTags(tags: StructuredKeywordTags): string[] {
  return [...tags.topic_tags, ...tags.audience_tags, ...tags.intent_tags, ...tags.user_added_tags];
}

export const contentStored = pgTable("content_stored", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assetId: text("asset_id").notNull().unique(),
  contentText: text("content_text"),
  contentSummary: text("content_summary"),
  extractedTopics: jsonb("extracted_topics").$type<string[]>(),
  extractedCta: jsonb("extracted_cta").$type<{ text: string; type: string; strength: string; location: string } | null>(),
  contentStructure: jsonb("content_structure").$type<{ wordCount: number; sectionCount: number; pageCount: number; headings: string[] }>(),
  messagingThemes: jsonb("messaging_themes").$type<string[]>(),
  keywordTags: jsonb("keyword_tags").$type<StructuredKeywordTags | string[]>(),
  contentFormat: text("content_format"),
  sourceType: text("source_type").notNull().default("not_stored"),
  sourceUrl: text("source_url"),
  storedFileBase64: text("stored_file_base64"),
  thumbnailBase64: text("thumbnail_base64"),
  thumbnailUrl: text("thumbnail_url"),
  originalFilename: text("original_filename"),
  fileSizeBytes: integer("file_size_bytes"),
  dateStored: timestamp("date_stored"),
  dateLastUpdated: timestamp("date_last_updated"),
  fetchStatus: text("fetch_status").notNull().default("not_stored"),
  fetchNotes: text("fetch_notes"),
  storedBy: text("stored_by").notNull().default("user"),
  uploadedByUserId: text("uploaded_by_user_id"),
  uploadedByName: text("uploaded_by_name"),
});

export const insertContentStoredSchema = createInsertSchema(contentStored).omit({
  id: true,
});
export type InsertContentStored = z.infer<typeof insertContentStoredSchema>;
export type ContentStored = typeof contentStored.$inferSelect;

export const comparisonStatusEnum = pgEnum("comparison_status", ["completed", "in_progress"]);
export const comparisonTypeEnum = pgEnum("comparison_type", ["standard", "multi"]);

export const comparisonHistory = pgTable("comparison_history", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  comparisonType: comparisonTypeEnum("comparison_type").notNull().default("standard"),
  assetIds: jsonb("asset_ids").$type<string[]>().notNull(),
  assetNames: jsonb("asset_names").$type<string[]>().notNull(),
  comparisonDate: timestamp("comparison_date").notNull().defaultNow(),
  performedByUserId: text("performed_by_user_id"),
  performedByName: text("performed_by_name").notNull().default("Unknown"),
  comparisonResults: jsonb("comparison_results").notNull(),
  pdfFilePath: text("pdf_file_path"),
  campaignPlanId: integer("campaign_plan_id"),
  status: comparisonStatusEnum("status").notNull().default("completed"),
  isDuplicate: boolean("is_duplicate").notNull().default(false),
  winnerName: text("winner_name"),
});

export const insertComparisonHistorySchema = createInsertSchema(comparisonHistory).omit(
  { id: true, comparisonDate: true } as any
);
export type InsertComparisonHistory = z.infer<typeof insertComparisonHistorySchema>;
export type ComparisonHistory = typeof comparisonHistory.$inferSelect;

export const journeyInteractions = pgTable("journey_interactions", {
  interactionId: varchar("interaction_id").primaryKey().default(sql`gen_random_uuid()`),
  contactHash: text("contact_hash").notNull(),
  assetId: text("asset_id"),
  interactionType: text("interaction_type"),
  interactionTimestamp: timestamp("interaction_timestamp"),
  funnelStage: text("funnel_stage"),
  product: text("product"),
  country: text("country"),
  channel: text("channel"),
  source: text("source"),
  campaignName: text("campaign_name"),
  sfdcCampaignId: text("sfdc_campaign_id"),
  leadStatus: text("lead_status"),
  formName: text("form_name"),
  formScore: real("form_score"),
  pageUrl: text("page_url"),
  referrer: text("referrer"),
  uploadBatchId: text("upload_batch_id").notNull(),
  uploadDate: timestamp("upload_date").notNull().defaultNow(),
});

export const insertJourneyInteractionSchema = createInsertSchema(journeyInteractions).omit({
  interactionId: true,
  uploadDate: true,
});
export type InsertJourneyInteraction = z.infer<typeof insertJourneyInteractionSchema>;
export type JourneyInteraction = typeof journeyInteractions.$inferSelect;

export const contactJourneys = pgTable("contact_journeys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactHash: text("contact_hash").notNull().unique(),
  journeySequence: jsonb("journey_sequence").$type<string[]>().notNull(),
  journeyStages: jsonb("journey_stages").$type<string[]>().notNull(),
  journeyPattern: text("journey_pattern").notNull(),
  firstTouchDate: timestamp("first_touch_date"),
  lastTouchDate: timestamp("last_touch_date"),
  journeyDurationDays: integer("journey_duration_days"),
  totalInteractions: integer("total_interactions").notNull().default(0),
  uniqueAssetsTouched: integer("unique_assets_touched").notNull().default(0),
  channelsUsed: jsonb("channels_used").$type<string[]>(),
  outcome: text("outcome").default("unknown"),
  outcomeDate: timestamp("outcome_date"),
  product: text("product"),
  country: text("country"),
  industry: text("industry"),
  uploadBatchId: text("upload_batch_id"),
});

export const insertContactJourneySchema = createInsertSchema(contactJourneys).omit({ id: true });
export type InsertContactJourney = z.infer<typeof insertContactJourneySchema>;
export type ContactJourney = typeof contactJourneys.$inferSelect;

export const journeyPatterns = pgTable("journey_patterns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patternString: text("pattern_string").notNull(),
  patternStages: text("pattern_stages").notNull(),
  contactCount: integer("contact_count").notNull().default(0),
  sqoCount: integer("sqo_count").notNull().default(0),
  conversionRate: real("conversion_rate").notNull().default(0),
  avgDurationDays: real("avg_duration_days"),
  topEntryAsset: text("top_entry_asset"),
  topExitAsset: text("top_exit_asset"),
  channels: jsonb("channels").$type<string[]>(),
});

export const insertJourneyPatternSchema = createInsertSchema(journeyPatterns).omit({ id: true });
export type InsertJourneyPattern = z.infer<typeof insertJourneyPatternSchema>;
export type JourneyPattern = typeof journeyPatterns.$inferSelect;

export const stageTransitions = pgTable("stage_transitions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fromStage: text("from_stage").notNull(),
  toStage: text("to_stage").notNull(),
  fromAssetId: text("from_asset_id"),
  toAssetId: text("to_asset_id"),
  contactCount: integer("contact_count").notNull().default(0),
  avgDaysBetween: real("avg_days_between"),
  conversionRateAtNextStage: real("conversion_rate_at_next_stage"),
});

export const insertStageTransitionSchema = createInsertSchema(stageTransitions).omit({ id: true });
export type InsertStageTransition = z.infer<typeof insertStageTransitionSchema>;
export type StageTransition = typeof stageTransitions.$inferSelect;

export const assetJourneyStats = pgTable("asset_journey_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assetId: text("asset_id").notNull().unique(),
  totalJourneyAppearances: integer("total_journey_appearances").notNull().default(0),
  avgPositionInJourney: real("avg_position_in_journey"),
  mostCommonNextAsset: text("most_common_next_asset"),
  mostCommonPrevAsset: text("most_common_prev_asset"),
  journeyConversionRate: real("journey_conversion_rate"),
  avgJourneyLengthWhenIncluded: real("avg_journey_length_when_included"),
  dropOffRate: real("drop_off_rate"),
  funnelStage: text("funnel_stage"),
  uniqueContacts: integer("unique_contacts"),
  entryCount: integer("entry_count"),
  exitCount: integer("exit_count"),
  passThroughCount: integer("pass_through_count"),
});

export const insertAssetJourneyStatSchema = createInsertSchema(assetJourneyStats).omit({ id: true });
export type InsertAssetJourneyStat = z.infer<typeof insertAssetJourneyStatSchema>;
export type AssetJourneyStat = typeof assetJourneyStats.$inferSelect;

export const journeyStageFlows = pgTable("journey_stage_flows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fromAssetId: text("from_asset_id").notNull(),
  fromStage: text("from_stage").notNull(),
  toAssetId: text("to_asset_id").notNull(),
  toStage: text("to_stage").notNull(),
  contactCount: integer("contact_count").notNull().default(0),
  avgDaysBetween: real("avg_days_between"),
});

export const insertJourneyStageFlowSchema = createInsertSchema(journeyStageFlows).omit({ id: true });
export type InsertJourneyStageFlow = z.infer<typeof insertJourneyStageFlowSchema>;
export type JourneyStageFlow = typeof journeyStageFlows.$inferSelect;

export const SALES_FEEDBACK_TAGS = {
  prospect_reaction: [
    "Prospect engaged",
    "Prospect shared internally",
    "Opened conversation",
    "No reaction",
    "Negative reaction",
  ],
  content_quality: [
    "Strong hook",
    "Outdated",
    "Too long",
    "Too technical",
    "Good objection handler",
    "Missing competitor context",
  ],
} as const;

export const POSITIVE_TAGS = new Set([
  "Prospect engaged",
  "Prospect shared internally",
  "Opened conversation",
  "Strong hook",
  "Good objection handler",
]);

export const NEGATIVE_TAGS = new Set([
  "No reaction",
  "Negative reaction",
  "Outdated",
  "Too long",
  "Too technical",
  "Missing competitor context",
]);

export const ALL_FEEDBACK_TAGS = [
  ...SALES_FEEDBACK_TAGS.prospect_reaction,
  ...SALES_FEEDBACK_TAGS.content_quality,
] as const;

export const salesFeedback = pgTable("sales_feedback", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  contentId: text("content_id").notNull(),
  author: text("author").notNull(),
  tags: jsonb("tags").$type<string[]>().notNull(),
  note: text("note"),
  salesforceRef: text("salesforce_ref"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSalesFeedbackSchema = createInsertSchema(salesFeedback).omit(
  { id: true, createdAt: true } as any
);
export type InsertSalesFeedback = z.infer<typeof insertSalesFeedbackSchema>;
export type SalesFeedback = typeof salesFeedback.$inferSelect;
