import {
  type AssetAgg,
  type InsertAssetAgg,
  assetsAgg,
  type Feedback,
  type InsertFeedback,
  feedback,
  type User,
  type InsertUser,
  users,
  type UploadedAsset,
  type InsertUploadedAsset,
  uploadedAssets,
  type ContentStored,
  type InsertContentStored,
  contentStored,
  type ComparisonHistory,
  type InsertComparisonHistory,
  comparisonHistory,
  type SalesFeedback,
  type InsertSalesFeedback,
  salesFeedback,
  type JourneyInteraction,
  type InsertJourneyInteraction,
  journeyInteractions,
  type ContactJourney,
  type InsertContactJourney,
  contactJourneys,
  type JourneyPattern,
  type InsertJourneyPattern,
  journeyPatterns,
  type StageTransition,
  type InsertStageTransition,
  stageTransitions,
  type AssetJourneyStat,
  type InsertAssetJourneyStat,
  assetJourneyStats,
  POSITIVE_TAGS,
  NEGATIVE_TAGS,
  type StructuredKeywordTags,
  normalizeKeywordTags,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, ilike, and, or, sql, count, inArray, isNull, ne, type SQL } from "drizzle-orm";

export interface IStorage {
  clearAssets(): Promise<void>;
  bulkInsertAssets(assets: InsertAssetAgg[]): Promise<void>;
  getAssets(opts: {
    stage: string;
    search?: string;
    product?: string;
    channel?: string;
    campaign?: string;
    industry?: string;
    contentAvailability?: string;
    limit: number;
    offset: number;
  }): Promise<{ data: AssetAgg[]; total: number }>;
  getAssetFilterOptions(): Promise<{ products: string[]; channels: string[]; campaigns: string[]; industries: string[] }>;
  getAllAssets(): Promise<AssetAgg[]>;
  createFeedback(item: InsertFeedback): Promise<Feedback>;
  getFeedback(opts: { type?: string; status?: string }): Promise<Feedback[]>;
  updateFeedbackStatus(id: number, status: string): Promise<Feedback | null>;
  getUserByDisplayName(displayName: string): Promise<User | null>;
  createUser(data: InsertUser): Promise<User>;
  getUserById(id: string): Promise<User | null>;
  updateUserAdmin(id: string, isAdmin: boolean): Promise<User | null>;
  createUploadedAsset(data: InsertUploadedAsset): Promise<UploadedAsset>;
  getUploadedAssets(opts: {
    contentType?: string;
    product?: string;
    funnelStage?: string;
    country?: string;
    industry?: string;
    search?: string;
  }): Promise<UploadedAsset[]>;
  getUploadedAssetById(id: string): Promise<UploadedAsset | null>;
  updateUploadedAsset(id: string, data: Partial<InsertUploadedAsset>): Promise<UploadedAsset | null>;
  getContentByAssetId(assetId: string): Promise<ContentStored | null>;
  upsertContent(data: InsertContentStored): Promise<ContentStored>;
  getContentStatusMap(): Promise<Record<string, { fetchStatus: string; sourceUrl: string | null; contentSummary: string | null; extractedTopics: string[] | null; extractedCta: { text: string; type: string; strength: string; location: string } | null; keywordTags: import("@shared/schema").StructuredKeywordTags; dateStored: string | null; dateLastUpdated: string | null; uploadedByName: string | null; contentFormat: string | null; hasFile: boolean; originalFilename: string | null; thumbnailUrl: string | null }>>;
  getAllStoredContentAnalysis(): Promise<Array<{ assetId: string; fetchStatus: string; contentSummary: string | null; extractedTopics: string[] | null; extractedCta: { text: string; type: string; strength: string; location: string } | null; messagingThemes: string[] | null; contentStructure: { wordCount: number; sectionCount: number; pageCount: number; headings: string[] } | null; contentFormat: string | null; sourceType: string; originalFilename: string | null; keywordTags: import("@shared/schema").StructuredKeywordTags; dateStored: Date | null; dateLastUpdated: Date | null }>>;
  getTagsSummary(): Promise<{ topic_tags: Record<string, number>; audience_tags: Record<string, number>; intent_tags: Record<string, number>; user_added_tags: Record<string, number>; total_assets_with_tags: number; total_assets: number }>;
  updateAssetTags(assetId: string, tags: import("@shared/schema").StructuredKeywordTags): Promise<void>;
  deleteContent(assetId: string): Promise<void>;
  getContentStats(): Promise<{ totalStored: number; totalSize: number }>;
  createContentPlaceholders(assetIds: { assetId: string; sourceUrl?: string | null }[]): Promise<number>;
  getAllStoredContent(): Promise<ContentStored[]>;
  getUnfetchedWithUrls(): Promise<{ assetId: string; sourceUrl: string }[]>;
  getContentCoverage(): Promise<Record<string, { total: number; withContent: number }>>;
  createComparisonHistory(data: InsertComparisonHistory): Promise<ComparisonHistory>;
  getComparisonHistory(opts?: { assetId?: string; performedBy?: string; limit?: number; offset?: number }): Promise<{ data: ComparisonHistory[]; total: number }>;
  getComparisonHistoryById(id: number): Promise<ComparisonHistory | null>;
  updateComparisonHistory(id: number, data: Partial<{ pdfFilePath: string; campaignPlanId: number; status: string }>): Promise<ComparisonHistory | null>;
  getComparisonCountsForAssets(assetIds: string[]): Promise<Record<string, number>>;
  createSalesFeedback(data: InsertSalesFeedback): Promise<SalesFeedback>;
  getSalesFeedbackByContentId(contentId: string): Promise<SalesFeedback[]>;
  getSalesFeedbackStats(contentId: string): Promise<{ totalCount: number; tagCounts: Record<string, number>; sentimentScore: number }>;
  getSalesFeedbackStatsBatch(contentIds: string[]): Promise<Record<string, { totalCount: number; sentimentScore: number }>>;
  getRecentSalesFeedback(limit?: number): Promise<SalesFeedback[]>;
  bulkInsertJourneyInteractions(interactions: InsertJourneyInteraction[]): Promise<void>;
  getJourneyInteractionsByBatch(batchId: string): Promise<JourneyInteraction[]>;
  getJourneyUploadBatches(): Promise<Array<{ batchId: string; uploadDate: Date; interactionCount: number }>>;
  countJourneyInteractions(): Promise<number>;
  deleteJourneyInteractionsByBatch(batchId: string): Promise<number>;
  getJourneyInteractionsByContacts(contactHashes: string[]): Promise<JourneyInteraction[]>;
  getDistinctContactHashes(): Promise<string[]>;
  clearContactJourneys(): Promise<void>;
  bulkInsertContactJourneys(journeys: InsertContactJourney[]): Promise<void>;
  getContactJourneys(opts?: { product?: string; country?: string; outcome?: string; limit?: number; offset?: number }): Promise<{ data: ContactJourney[]; total: number }>;
  clearJourneyPatterns(): Promise<void>;
  bulkInsertJourneyPatterns(patterns: InsertJourneyPattern[]): Promise<void>;
  getJourneyPatterns(opts?: { limit?: number; offset?: number; sortBy?: string }): Promise<{ data: JourneyPattern[]; total: number }>;
  clearStageTransitions(): Promise<void>;
  bulkInsertStageTransitions(transitions: InsertStageTransition[]): Promise<void>;
  getStageTransitions(): Promise<StageTransition[]>;
  clearAssetJourneyStats(): Promise<void>;
  bulkInsertAssetJourneyStats(stats: InsertAssetJourneyStat[]): Promise<void>;
  getAssetJourneyStats(assetId?: string): Promise<AssetJourneyStat[]>;
  getJourneySummaryStatus(): Promise<{ contactJourneyCount: number; patternCount: number; transitionCount: number; assetStatCount: number }>;
}

export class DatabaseStorage implements IStorage {
  async clearAssets(): Promise<void> {
    await db.delete(assetsAgg);
  }

  async bulkInsertAssets(assets: InsertAssetAgg[]): Promise<void> {
    if (assets.length === 0) return;
    const batchSize = 100;
    for (let i = 0; i < assets.length; i += batchSize) {
      await db.insert(assetsAgg).values(assets.slice(i, i + batchSize));
    }
  }

  async getAssets(opts: {
    stage: string;
    search?: string;
    product?: string;
    channel?: string;
    campaign?: string;
    industry?: string;
    contentAvailability?: string;
    tagFilter?: string[];
    limit: number;
    offset: number;
  }): Promise<{ data: AssetAgg[]; total: number }> {
    const conditions = [eq(assetsAgg.stage, opts.stage as any)];
    if (opts.search) {
      conditions.push(
        sql`(${ilike(assetsAgg.contentId, `%${opts.search}%`)} OR ${assetsAgg.contentId} IN (
          SELECT ${contentStored.assetId} FROM ${contentStored}
          WHERE ${contentStored.keywordTags}::text ILIKE ${'%' + opts.search + '%'}
          OR ${contentStored.originalFilename} ILIKE ${'%' + opts.search + '%'}
        ))`
      );
    }
    if (opts.tagFilter && opts.tagFilter.length > 0) {
      const tagConditions = opts.tagFilter.map(tag =>
        sql`${contentStored.keywordTags}::text ILIKE ${'%' + tag + '%'}`
      );
      conditions.push(
        sql`${assetsAgg.contentId} IN (
          SELECT ${contentStored.assetId} FROM ${contentStored}
          WHERE ${and(...tagConditions)}
        )`
      );
    }
    if (opts.product) {
      conditions.push(eq(assetsAgg.productFranchise, opts.product));
    }
    if (opts.channel) {
      conditions.push(eq(assetsAgg.utmChannel, opts.channel));
    }
    if (opts.campaign) {
      conditions.push(eq(assetsAgg.campaignName, opts.campaign));
    }
    if (opts.industry) {
      conditions.push(eq(assetsAgg.productCategory, opts.industry));
    }

    if (opts.contentAvailability === "with_content") {
      conditions.push(
        sql`${assetsAgg.contentId} IN (SELECT ${contentStored.assetId} FROM ${contentStored} WHERE ${contentStored.fetchStatus} IN ('success', 'partial'))`
      );
    } else if (opts.contentAvailability === "without_content") {
      conditions.push(
        sql`${assetsAgg.contentId} NOT IN (SELECT ${contentStored.assetId} FROM ${contentStored} WHERE ${contentStored.fetchStatus} IN ('success', 'partial'))`
      );
    }

    const where = conditions.length === 1 ? conditions[0] : and(...conditions);

    let orderCol;
    if (opts.stage === "TOFU" || opts.stage === "UNKNOWN") {
      orderCol = desc(assetsAgg.pageviewsSum);
    } else if (opts.stage === "MOFU") {
      orderCol = desc(assetsAgg.uniqueLeads);
    } else {
      orderCol = desc(assetsAgg.sqoCount);
    }

    const [data, [{ total }]] = await Promise.all([
      db
        .select()
        .from(assetsAgg)
        .where(where)
        .orderBy(orderCol)
        .limit(opts.limit)
        .offset(opts.offset),
      db
        .select({ total: count() })
        .from(assetsAgg)
        .where(where),
    ]);

    return { data, total };
  }

  async getAssetFilterOptions(): Promise<{ products: string[]; channels: string[]; campaigns: string[]; industries: string[] }> {
    const [products, channels, campaigns, industries] = await Promise.all([
      db.selectDistinct({ value: assetsAgg.productFranchise }).from(assetsAgg).then(rows => rows.map(r => r.value).filter(Boolean).sort() as string[]),
      db.selectDistinct({ value: assetsAgg.utmChannel }).from(assetsAgg).then(rows => rows.map(r => r.value).filter(Boolean).sort() as string[]),
      db.selectDistinct({ value: assetsAgg.campaignName }).from(assetsAgg).then(rows => rows.map(r => r.value).filter(Boolean).sort() as string[]),
      db.selectDistinct({ value: assetsAgg.productCategory }).from(assetsAgg).then(rows => rows.map(r => r.value).filter(Boolean).sort() as string[]),
    ]);
    return { products, channels, campaigns, industries };
  }
  async getAllAssets(): Promise<AssetAgg[]> {
    return db.select().from(assetsAgg).orderBy(desc(assetsAgg.pageviewsSum));
  }

  async createFeedback(item: InsertFeedback): Promise<Feedback> {
    const [row] = await db.insert(feedback).values(item as any).returning();
    return row;
  }

  async getFeedback(opts: { type?: string; status?: string }): Promise<Feedback[]> {
    const conditions = [];
    if (opts.type) conditions.push(eq(feedback.type, opts.type as any));
    if (opts.status) conditions.push(eq(feedback.status, opts.status as any));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return db.select().from(feedback).where(where).orderBy(desc(feedback.createdAt));
  }

  async updateFeedbackStatus(id: number, status: string): Promise<Feedback | null> {
    const [row] = await db.update(feedback).set({ status: status as any }).where(eq(feedback.id, id)).returning();
    return row ?? null;
  }

  async getUserByDisplayName(displayName: string): Promise<User | null> {
    const [row] = await db.select().from(users).where(eq(users.displayName, displayName));
    return row ?? null;
  }

  async createUser(data: InsertUser): Promise<User> {
    const [row] = await db.insert(users).values(data).returning();
    return row;
  }

  async getUserById(id: string): Promise<User | null> {
    const [row] = await db.select().from(users).where(eq(users.id, id));
    return row ?? null;
  }

  async updateUserAdmin(id: string, isAdmin: boolean): Promise<User | null> {
    const [row] = await db.update(users).set({ isAdmin }).where(eq(users.id, id)).returning();
    return row ?? null;
  }

  async createUploadedAsset(data: InsertUploadedAsset): Promise<UploadedAsset> {
    const [row] = await db.insert(uploadedAssets).values(data).returning();
    return row;
  }

  async getUploadedAssets(opts: {
    contentType?: string;
    product?: string;
    funnelStage?: string;
    country?: string;
    industry?: string;
    search?: string;
  }): Promise<UploadedAsset[]> {
    const conditions = [];
    if (opts.contentType) conditions.push(eq(uploadedAssets.contentType, opts.contentType));
    if (opts.product) conditions.push(eq(uploadedAssets.product, opts.product));
    if (opts.funnelStage) conditions.push(eq(uploadedAssets.funnelStage, opts.funnelStage as any));
    if (opts.country) conditions.push(ilike(uploadedAssets.country, `%${opts.country}%`));
    if (opts.industry) conditions.push(ilike(uploadedAssets.industry, `%${opts.industry}%`));
    if (opts.search) {
      conditions.push(
        or(
          ilike(uploadedAssets.assetName, `%${opts.search}%`),
          ilike(uploadedAssets.contentId, `%${opts.search}%`),
          ilike(uploadedAssets.product, `%${opts.search}%`),
        )!
      );
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return db.select().from(uploadedAssets).where(where).orderBy(desc(uploadedAssets.createdAt));
  }

  async getUploadedAssetById(id: string): Promise<UploadedAsset | null> {
    const [row] = await db.select().from(uploadedAssets).where(eq(uploadedAssets.id, id));
    return row ?? null;
  }

  async updateUploadedAsset(id: string, data: Partial<InsertUploadedAsset>): Promise<UploadedAsset | null> {
    const [row] = await db.update(uploadedAssets).set(data as any).where(eq(uploadedAssets.id, id)).returning();
    return row ?? null;
  }

  async getContentByAssetId(assetId: string): Promise<ContentStored | null> {
    const [row] = await db.select().from(contentStored).where(eq(contentStored.assetId, assetId));
    return row ?? null;
  }

  async upsertContent(data: InsertContentStored): Promise<ContentStored> {
    const existing = await this.getContentByAssetId(data.assetId);
    if (existing) {
      const { dateStored: _ds, ...updateData } = data;
      const [row] = await db
        .update(contentStored)
        .set({ ...updateData, dateLastUpdated: new Date() } as any)
        .where(eq(contentStored.assetId, data.assetId))
        .returning();
      return row;
    }
    const [row] = await db.insert(contentStored).values({ ...data, dateStored: data.dateStored || new Date() } as any).returning();
    return row;
  }

  async getContentStatusMap(): Promise<Record<string, { fetchStatus: string; sourceUrl: string | null; contentSummary: string | null; extractedTopics: string[] | null; extractedCta: { text: string; type: string; strength: string; location: string } | null; keywordTags: StructuredKeywordTags; dateStored: string | null; dateLastUpdated: string | null; uploadedByName: string | null; contentFormat: string | null; hasFile: boolean; originalFilename: string | null; thumbnailUrl: string | null }>> {
    const rows = await db
      .select({
        assetId: contentStored.assetId,
        fetchStatus: contentStored.fetchStatus,
        sourceUrl: contentStored.sourceUrl,
        contentSummary: contentStored.contentSummary,
        extractedTopics: contentStored.extractedTopics,
        extractedCta: contentStored.extractedCta,
        keywordTags: contentStored.keywordTags,
        dateStored: contentStored.dateStored,
        dateLastUpdated: contentStored.dateLastUpdated,
        uploadedByName: contentStored.uploadedByName,
        contentFormat: contentStored.contentFormat,
        originalFilename: contentStored.originalFilename,
        thumbnailUrl: contentStored.thumbnailUrl,
        hasFile: sql<boolean>`${contentStored.storedFileBase64} IS NOT NULL`.as("has_file"),
      })
      .from(contentStored);
    const map: Record<string, { fetchStatus: string; sourceUrl: string | null; contentSummary: string | null; extractedTopics: string[] | null; extractedCta: { text: string; type: string; strength: string; location: string } | null; keywordTags: StructuredKeywordTags; dateStored: string | null; dateLastUpdated: string | null; uploadedByName: string | null; contentFormat: string | null; hasFile: boolean; originalFilename: string | null; thumbnailUrl: string | null }> = {};
    for (const r of rows) {
      map[r.assetId] = {
        fetchStatus: r.fetchStatus,
        sourceUrl: r.sourceUrl,
        contentSummary: r.contentSummary,
        extractedTopics: r.extractedTopics as string[] | null,
        extractedCta: r.extractedCta as { text: string; type: string; strength: string; location: string } | null,
        keywordTags: normalizeKeywordTags(r.keywordTags as any),
        dateStored: r.dateStored ? r.dateStored.toISOString() : null,
        dateLastUpdated: r.dateLastUpdated ? r.dateLastUpdated.toISOString() : null,
        uploadedByName: r.uploadedByName,
        contentFormat: r.contentFormat,
        hasFile: !!r.hasFile,
        originalFilename: r.originalFilename,
        thumbnailUrl: r.thumbnailUrl,
      };
    }
    return map;
  }

  async getAllStoredContentAnalysis(): Promise<Array<{ assetId: string; fetchStatus: string; contentSummary: string | null; extractedTopics: string[] | null; extractedCta: { text: string; type: string; strength: string; location: string } | null; messagingThemes: string[] | null; contentStructure: { wordCount: number; sectionCount: number; pageCount: number; headings: string[] } | null; contentFormat: string | null; sourceType: string; originalFilename: string | null; keywordTags: StructuredKeywordTags; dateStored: Date | null; dateLastUpdated: Date | null }>> {
    const rows = await db
      .select({
        assetId: contentStored.assetId,
        fetchStatus: contentStored.fetchStatus,
        contentSummary: contentStored.contentSummary,
        extractedTopics: contentStored.extractedTopics,
        extractedCta: contentStored.extractedCta,
        messagingThemes: contentStored.messagingThemes,
        contentStructure: contentStored.contentStructure,
        contentFormat: contentStored.contentFormat,
        sourceType: contentStored.sourceType,
        originalFilename: contentStored.originalFilename,
        keywordTags: contentStored.keywordTags,
        dateStored: contentStored.dateStored,
        dateLastUpdated: contentStored.dateLastUpdated,
      })
      .from(contentStored)
      .where(sql`${contentStored.fetchStatus} != 'not_stored'`);
    return rows.map(r => ({
      assetId: r.assetId,
      fetchStatus: r.fetchStatus,
      contentSummary: r.contentSummary,
      extractedTopics: r.extractedTopics as string[] | null,
      extractedCta: r.extractedCta as { text: string; type: string; strength: string; location: string } | null,
      messagingThemes: r.messagingThemes as string[] | null,
      contentStructure: r.contentStructure as { wordCount: number; sectionCount: number; pageCount: number; headings: string[] } | null,
      contentFormat: r.contentFormat,
      sourceType: r.sourceType,
      originalFilename: r.originalFilename,
      keywordTags: normalizeKeywordTags(r.keywordTags as any),
      dateStored: r.dateStored,
      dateLastUpdated: r.dateLastUpdated,
    }));
  }

  async getTagsSummary(): Promise<{ topic_tags: Record<string, number>; audience_tags: Record<string, number>; intent_tags: Record<string, number>; user_added_tags: Record<string, number>; total_assets_with_tags: number; total_assets: number }> {
    const rows = await db.select({ keywordTags: contentStored.keywordTags }).from(contentStored);
    const result = {
      topic_tags: {} as Record<string, number>,
      audience_tags: {} as Record<string, number>,
      intent_tags: {} as Record<string, number>,
      user_added_tags: {} as Record<string, number>,
      total_assets_with_tags: 0,
      total_assets: rows.length,
    };
    for (const r of rows) {
      const tags = normalizeKeywordTags(r.keywordTags as any);
      const hasAny = tags.topic_tags.length + tags.audience_tags.length + tags.intent_tags.length + tags.user_added_tags.length > 0;
      if (hasAny) result.total_assets_with_tags++;
      for (const type of ["topic_tags", "audience_tags", "intent_tags", "user_added_tags"] as const) {
        for (const tag of tags[type]) {
          result[type][tag] = (result[type][tag] || 0) + 1;
        }
      }
    }
    return result;
  }

  async updateAssetTags(assetId: string, tags: StructuredKeywordTags): Promise<void> {
    await db.update(contentStored).set({ keywordTags: tags, dateLastUpdated: new Date() }).where(eq(contentStored.assetId, assetId));
  }

  async deleteContent(assetId: string): Promise<void> {
    await db.delete(contentStored).where(eq(contentStored.assetId, assetId));
  }

  async getContentStats(): Promise<{ totalStored: number; totalSize: number }> {
    const [result] = await db
      .select({
        totalStored: count(),
        totalSize: sql<number>`COALESCE(SUM(${contentStored.fileSizeBytes}), 0)`,
      })
      .from(contentStored)
      .where(ne(contentStored.fetchStatus, "not_stored"));
    return { totalStored: result.totalStored, totalSize: Number(result.totalSize) };
  }

  async createContentPlaceholders(assetIds: { assetId: string; sourceUrl?: string | null }[]): Promise<number> {
    if (assetIds.length === 0) return 0;
    const existing = await db
      .select({ assetId: contentStored.assetId })
      .from(contentStored)
      .where(inArray(contentStored.assetId, assetIds.map(a => a.assetId)));
    const existingSet = new Set(existing.map(e => e.assetId));
    const newEntries = assetIds.filter(a => !existingSet.has(a.assetId));
    if (newEntries.length === 0) return 0;
    const batchSize = 100;
    for (let i = 0; i < newEntries.length; i += batchSize) {
      const batch = newEntries.slice(i, i + batchSize).map(a => ({
        assetId: a.assetId,
        fetchStatus: "not_stored",
        sourceType: "not_stored",
        sourceUrl: a.sourceUrl || null,
        storedBy: "system",
      }));
      await db.insert(contentStored).values(batch);
    }
    return newEntries.length;
  }

  async getAllStoredContent(): Promise<ContentStored[]> {
    return db.select().from(contentStored).where(ne(contentStored.fetchStatus, "not_stored")).orderBy(desc(contentStored.dateStored));
  }

  async getUnfetchedWithUrls(): Promise<{ assetId: string; sourceUrl: string }[]> {
    const rows = await db
      .select({
        assetId: contentStored.assetId,
        sourceUrl: contentStored.sourceUrl,
      })
      .from(contentStored)
      .where(and(eq(contentStored.fetchStatus, "not_stored"), sql`${contentStored.sourceUrl} IS NOT NULL AND ${contentStored.sourceUrl} != ''`));
    return rows.map(r => ({ assetId: r.assetId, sourceUrl: r.sourceUrl! }));
  }

  async getContentCoverage(): Promise<Record<string, { total: number; withContent: number }>> {
    const stages = ["TOFU", "MOFU", "BOFU"] as const;
    const result: Record<string, { total: number; withContent: number }> = {};

    const [totals, withContentRows] = await Promise.all([
      db
        .select({
          stage: assetsAgg.stage,
          total: count(),
        })
        .from(assetsAgg)
        .where(inArray(assetsAgg.stage, [...stages]))
        .groupBy(assetsAgg.stage),
      db
        .select({
          stage: assetsAgg.stage,
          withContent: count(),
        })
        .from(assetsAgg)
        .innerJoin(contentStored, eq(assetsAgg.contentId, contentStored.assetId))
        .where(
          and(
            inArray(assetsAgg.stage, [...stages]),
            sql`${contentStored.fetchStatus} IN ('success', 'partial')`
          )
        )
        .groupBy(assetsAgg.stage),
    ]);

    for (const stage of stages) {
      result[stage] = { total: 0, withContent: 0 };
    }
    for (const row of totals) {
      if (result[row.stage]) {
        result[row.stage].total = row.total;
      }
    }
    for (const row of withContentRows) {
      if (result[row.stage]) {
        result[row.stage].withContent = row.withContent;
      }
    }

    return result;
  }

  async createComparisonHistory(data: InsertComparisonHistory): Promise<ComparisonHistory> {
    const [row] = await db.insert(comparisonHistory).values(data as any).returning();
    return row;
  }

  async getComparisonHistory(opts?: { assetId?: string; performedBy?: string; limit?: number; offset?: number }): Promise<{ data: ComparisonHistory[]; total: number }> {
    const conditions: any[] = [];
    if (opts?.assetId) {
      conditions.push(sql`${comparisonHistory.assetIds}::jsonb @> ${JSON.stringify([opts.assetId])}::jsonb`);
    }
    if (opts?.performedBy) {
      conditions.push(eq(comparisonHistory.performedByName, opts.performedBy));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await db
      .select({ count: count() })
      .from(comparisonHistory)
      .where(whereClause);

    const rows = await db
      .select()
      .from(comparisonHistory)
      .where(whereClause)
      .orderBy(desc(comparisonHistory.comparisonDate))
      .limit(opts?.limit ?? 50)
      .offset(opts?.offset ?? 0);

    return { data: rows, total: totalResult.count };
  }

  async getComparisonHistoryById(id: number): Promise<ComparisonHistory | null> {
    const [row] = await db.select().from(comparisonHistory).where(eq(comparisonHistory.id, id));
    return row ?? null;
  }

  async updateComparisonHistory(id: number, data: Partial<{ pdfFilePath: string; campaignPlanId: number; status: string }>): Promise<ComparisonHistory | null> {
    const [row] = await db
      .update(comparisonHistory)
      .set(data as any)
      .where(eq(comparisonHistory.id, id))
      .returning();
    return row ?? null;
  }

  async getComparisonCountsForAssets(assetIds: string[]): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    if (assetIds.length === 0) return result;
    const rows = await db.select().from(comparisonHistory);
    for (const aid of assetIds) result[aid] = 0;
    for (const row of rows) {
      const ids = row.assetIds as string[];
      for (const aid of ids) {
        if (result[aid] !== undefined) result[aid]++;
      }
    }
    return result;
  }
  async createSalesFeedback(data: InsertSalesFeedback): Promise<SalesFeedback> {
    const [row] = await db.insert(salesFeedback).values(data as any).returning();
    return row;
  }

  async getSalesFeedbackByContentId(contentId: string): Promise<SalesFeedback[]> {
    return db
      .select()
      .from(salesFeedback)
      .where(eq(salesFeedback.contentId, contentId))
      .orderBy(desc(salesFeedback.createdAt));
  }

  async getSalesFeedbackStats(contentId: string): Promise<{ totalCount: number; tagCounts: Record<string, number>; sentimentScore: number }> {
    const rows = await db
      .select()
      .from(salesFeedback)
      .where(eq(salesFeedback.contentId, contentId));

    const tagCounts: Record<string, number> = {};
    let positiveCount = 0;
    let negativeCount = 0;

    for (const row of rows) {
      const tags = row.tags as string[];
      for (const tag of tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        if (POSITIVE_TAGS.has(tag)) positiveCount++;
        if (NEGATIVE_TAGS.has(tag)) negativeCount++;
      }
    }

    const totalTagged = positiveCount + negativeCount;
    const sentimentScore = totalTagged > 0
      ? Math.round(((positiveCount - negativeCount) / totalTagged) * 100) / 100
      : 0;

    return { totalCount: rows.length, tagCounts, sentimentScore };
  }

  async getSalesFeedbackStatsBatch(contentIds: string[]): Promise<Record<string, { totalCount: number; sentimentScore: number }>> {
    if (contentIds.length === 0) return {};
    const rows = await db
      .select()
      .from(salesFeedback)
      .where(inArray(salesFeedback.contentId, contentIds));

    const grouped: Record<string, typeof rows> = {};
    for (const row of rows) {
      if (!grouped[row.contentId]) grouped[row.contentId] = [];
      grouped[row.contentId].push(row);
    }

    const result: Record<string, { totalCount: number; sentimentScore: number }> = {};
    for (const [cid, entries] of Object.entries(grouped)) {
      let pos = 0, neg = 0;
      for (const entry of entries) {
        for (const tag of (entry.tags as string[])) {
          if (POSITIVE_TAGS.has(tag)) pos++;
          if (NEGATIVE_TAGS.has(tag)) neg++;
        }
      }
      const total = pos + neg;
      result[cid] = {
        totalCount: entries.length,
        sentimentScore: total > 0 ? Math.round(((pos - neg) / total) * 100) / 100 : 0,
      };
    }
    return result;
  }

  async getRecentSalesFeedback(limit = 5): Promise<SalesFeedback[]> {
    return await db
      .select()
      .from(salesFeedback)
      .orderBy(desc(salesFeedback.createdAt))
      .limit(limit);
  }

  async bulkInsertJourneyInteractions(interactions: InsertJourneyInteraction[]): Promise<void> {
    if (interactions.length === 0) return;
    const batchSize = 2000;
    for (let i = 0; i < interactions.length; i += batchSize) {
      await db.insert(journeyInteractions).values(interactions.slice(i, i + batchSize));
    }
  }

  async getJourneyInteractionsByBatch(batchId: string): Promise<JourneyInteraction[]> {
    return db.select().from(journeyInteractions).where(eq(journeyInteractions.uploadBatchId, batchId)).orderBy(desc(journeyInteractions.interactionTimestamp));
  }

  async getJourneyUploadBatches(): Promise<Array<{ batchId: string; uploadDate: Date; interactionCount: number }>> {
    const rows = await db
      .select({
        batchId: journeyInteractions.uploadBatchId,
        uploadDate: sql<Date>`MIN(${journeyInteractions.uploadDate})`,
        interactionCount: count(),
      })
      .from(journeyInteractions)
      .groupBy(journeyInteractions.uploadBatchId)
      .orderBy(desc(sql`MIN(${journeyInteractions.uploadDate})`));
    return rows.map(r => ({
      batchId: r.batchId,
      uploadDate: r.uploadDate,
      interactionCount: r.interactionCount,
    }));
  }

  async countJourneyInteractions(): Promise<number> {
    const [result] = await db.select({ total: count() }).from(journeyInteractions);
    return result.total;
  }

  async deleteJourneyInteractionsByBatch(batchId: string): Promise<number> {
    const rows = await db.delete(journeyInteractions).where(eq(journeyInteractions.uploadBatchId, batchId)).returning({ id: journeyInteractions.interactionId });
    return rows.length;
  }

  async getJourneyInteractionsByContacts(contactHashes: string[]): Promise<JourneyInteraction[]> {
    if (contactHashes.length === 0) return [];
    return db.select().from(journeyInteractions)
      .where(inArray(journeyInteractions.contactHash, contactHashes))
      .orderBy(journeyInteractions.contactHash, journeyInteractions.interactionTimestamp);
  }

  async getDistinctContactHashes(): Promise<string[]> {
    const rows = await db.selectDistinct({ contactHash: journeyInteractions.contactHash }).from(journeyInteractions);
    return rows.map(r => r.contactHash);
  }

  async clearContactJourneys(): Promise<void> {
    await db.delete(contactJourneys);
  }

  async bulkInsertContactJourneys(journeys: InsertContactJourney[]): Promise<void> {
    if (journeys.length === 0) return;
    const batchSize = 500;
    for (let i = 0; i < journeys.length; i += batchSize) {
      await db.insert(contactJourneys).values(journeys.slice(i, i + batchSize));
    }
  }

  async getContactJourneys(opts?: { product?: string; country?: string; outcome?: string; limit?: number; offset?: number }): Promise<{ data: ContactJourney[]; total: number }> {
    const conditions: SQL[] = [];
    if (opts?.product) conditions.push(eq(contactJourneys.product, opts.product));
    if (opts?.country) conditions.push(eq(contactJourneys.country, opts.country));
    if (opts?.outcome) conditions.push(eq(contactJourneys.outcome, opts.outcome));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [{ total }] = await db.select({ total: count() }).from(contactJourneys).where(where);
    const data = await db.select().from(contactJourneys).where(where)
      .orderBy(desc(contactJourneys.totalInteractions))
      .limit(opts?.limit ?? 50).offset(opts?.offset ?? 0);
    return { data, total };
  }

  async clearJourneyPatterns(): Promise<void> {
    await db.delete(journeyPatterns);
  }

  async bulkInsertJourneyPatterns(patterns: InsertJourneyPattern[]): Promise<void> {
    if (patterns.length === 0) return;
    const batchSize = 500;
    for (let i = 0; i < patterns.length; i += batchSize) {
      await db.insert(journeyPatterns).values(patterns.slice(i, i + batchSize));
    }
  }

  async getJourneyPatterns(opts?: { limit?: number; offset?: number; sortBy?: string }): Promise<{ data: JourneyPattern[]; total: number }> {
    const [{ total }] = await db.select({ total: count() }).from(journeyPatterns);
    const orderCol = opts?.sortBy === "conversion_rate" ? desc(journeyPatterns.conversionRate) : desc(journeyPatterns.contactCount);
    const data = await db.select().from(journeyPatterns)
      .orderBy(orderCol)
      .limit(opts?.limit ?? 50).offset(opts?.offset ?? 0);
    return { data, total };
  }

  async clearStageTransitions(): Promise<void> {
    await db.delete(stageTransitions);
  }

  async bulkInsertStageTransitions(transitions: InsertStageTransition[]): Promise<void> {
    if (transitions.length === 0) return;
    await db.insert(stageTransitions).values(transitions);
  }

  async getStageTransitions(): Promise<StageTransition[]> {
    return db.select().from(stageTransitions).orderBy(desc(stageTransitions.contactCount));
  }

  async clearAssetJourneyStats(): Promise<void> {
    await db.delete(assetJourneyStats);
  }

  async bulkInsertAssetJourneyStats(stats: InsertAssetJourneyStat[]): Promise<void> {
    if (stats.length === 0) return;
    const batchSize = 500;
    for (let i = 0; i < stats.length; i += batchSize) {
      await db.insert(assetJourneyStats).values(stats.slice(i, i + batchSize));
    }
  }

  async getAssetJourneyStats(assetId?: string): Promise<AssetJourneyStat[]> {
    if (assetId) {
      return db.select().from(assetJourneyStats).where(eq(assetJourneyStats.assetId, assetId));
    }
    return db.select().from(assetJourneyStats).orderBy(desc(assetJourneyStats.totalJourneyAppearances)).limit(100);
  }

  async getJourneySummaryStatus(): Promise<{ contactJourneyCount: number; patternCount: number; transitionCount: number; assetStatCount: number }> {
    const [[cj], [jp], [st], [aj]] = await Promise.all([
      db.select({ total: count() }).from(contactJourneys),
      db.select({ total: count() }).from(journeyPatterns),
      db.select({ total: count() }).from(stageTransitions),
      db.select({ total: count() }).from(assetJourneyStats),
    ]);
    return { contactJourneyCount: cj.total, patternCount: jp.total, transitionCount: st.total, assetStatCount: aj.total };
  }
}

export const storage = new DatabaseStorage();
