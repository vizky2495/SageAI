import { db } from "./db";
import { assetsAgg } from "@shared/schema";
import { sql } from "drizzle-orm";

export interface InsightsSummary {
  dataset_info: {
    total_rows: number;
    unique_content_ids: number;
  };
  metric_availability: {
    pageviews: boolean;
    downloads: boolean;
    time_on_page: boolean;
    leads: boolean;
    sqos: boolean;
  };
  metric_totals: {
    pageviews: number;
    downloads: number;
    avg_time: number;
    leads: number;
    sqos: number;
  };
  stage_summary: Array<{
    stage: string;
    count: number;
    pageviews: number;
    downloads: number;
    leads: number;
    sqos: number;
    avg_time: number;
  }>;
  cta_table: Array<{
    cta: string;
    count: number;
    pageviews: number;
    leads: number;
    sqos: number;
  }>;
  channel_mix: Array<{
    channel: string;
    count: number;
    pageviews: number;
    leads: number;
    sqos: number;
  }>;
  product_mix: Array<{
    product: string;
    count: number;
    pageviews: number;
    leads: number;
    sqos: number;
  }>;
  top_content: Array<{
    contentId: string;
    stage: string;
    product: string;
    channel: string;
    cta: string;
    pageviews: number;
    leads: number;
    sqos: number;
  }>;
}

export async function buildInsightsSummary(): Promise<InsightsSummary | null> {
  const totalResult = await db
    .select({
      count: sql<number>`count(*)`,
      uniqueIds: sql<number>`count(distinct ${assetsAgg.contentId})`,
      totalViews: sql<number>`coalesce(sum(${assetsAgg.pageviewsSum}), 0)`,
      totalDownloads: sql<number>`coalesce(sum(${assetsAgg.downloadsSum}), 0)`,
      totalLeads: sql<number>`coalesce(sum(${assetsAgg.uniqueLeads}), 0)`,
      totalSqos: sql<number>`coalesce(sum(${assetsAgg.sqoCount}), 0)`,
      avgTime: sql<number>`coalesce(round(avg(${assetsAgg.timeAvg})::numeric, 1), 0)`,
    })
    .from(assetsAgg);

  const totals = totalResult[0];
  if (!totals || totals.count === 0) return null;

  const stageSummary = await db
    .select({
      stage: assetsAgg.stage,
      count: sql<number>`count(*)`,
      pageviews: sql<number>`coalesce(sum(${assetsAgg.pageviewsSum}), 0)`,
      downloads: sql<number>`coalesce(sum(${assetsAgg.downloadsSum}), 0)`,
      leads: sql<number>`coalesce(sum(${assetsAgg.uniqueLeads}), 0)`,
      sqos: sql<number>`coalesce(sum(${assetsAgg.sqoCount}), 0)`,
      avg_time: sql<number>`coalesce(round(avg(${assetsAgg.timeAvg})::numeric, 1), 0)`,
    })
    .from(assetsAgg)
    .groupBy(assetsAgg.stage);

  const ctaTable = await db
    .select({
      cta: assetsAgg.cta,
      count: sql<number>`count(*)`,
      pageviews: sql<number>`coalesce(sum(${assetsAgg.pageviewsSum}), 0)`,
      leads: sql<number>`coalesce(sum(${assetsAgg.uniqueLeads}), 0)`,
      sqos: sql<number>`coalesce(sum(${assetsAgg.sqoCount}), 0)`,
    })
    .from(assetsAgg)
    .groupBy(assetsAgg.cta)
    .orderBy(sql`count(*) desc`)
    .limit(20);

  const channelMix = await db
    .select({
      channel: assetsAgg.utmChannel,
      count: sql<number>`count(*)`,
      pageviews: sql<number>`coalesce(sum(${assetsAgg.pageviewsSum}), 0)`,
      leads: sql<number>`coalesce(sum(${assetsAgg.uniqueLeads}), 0)`,
      sqos: sql<number>`coalesce(sum(${assetsAgg.sqoCount}), 0)`,
    })
    .from(assetsAgg)
    .groupBy(assetsAgg.utmChannel)
    .orderBy(sql`count(*) desc`)
    .limit(15);

  const productMix = await db
    .select({
      product: assetsAgg.productFranchise,
      count: sql<number>`count(*)`,
      pageviews: sql<number>`coalesce(sum(${assetsAgg.pageviewsSum}), 0)`,
      leads: sql<number>`coalesce(sum(${assetsAgg.uniqueLeads}), 0)`,
      sqos: sql<number>`coalesce(sum(${assetsAgg.sqoCount}), 0)`,
    })
    .from(assetsAgg)
    .groupBy(assetsAgg.productFranchise)
    .orderBy(sql`count(*) desc`)
    .limit(15);

  const topContent = await db
    .select({
      contentId: assetsAgg.contentId,
      stage: assetsAgg.stage,
      product: assetsAgg.productFranchise,
      channel: assetsAgg.utmChannel,
      cta: assetsAgg.cta,
      pageviews: assetsAgg.pageviewsSum,
      leads: assetsAgg.uniqueLeads,
      sqos: assetsAgg.sqoCount,
    })
    .from(assetsAgg)
    .orderBy(sql`${assetsAgg.sqoCount} desc, ${assetsAgg.pageviewsSum} desc`)
    .limit(25);

  return {
    dataset_info: {
      total_rows: Number(totals.count),
      unique_content_ids: Number(totals.uniqueIds),
    },
    metric_availability: {
      pageviews: Number(totals.totalViews) > 0,
      downloads: Number(totals.totalDownloads) > 0,
      time_on_page: Number(totals.avgTime) > 0,
      leads: Number(totals.totalLeads) > 0,
      sqos: Number(totals.totalSqos) > 0,
    },
    metric_totals: {
      pageviews: Number(totals.totalViews),
      downloads: Number(totals.totalDownloads),
      avg_time: Number(totals.avgTime),
      leads: Number(totals.totalLeads),
      sqos: Number(totals.totalSqos),
    },
    stage_summary: stageSummary.map((s) => ({
      stage: s.stage ?? "UNKNOWN",
      count: Number(s.count),
      pageviews: Number(s.pageviews),
      downloads: Number(s.downloads),
      leads: Number(s.leads),
      sqos: Number(s.sqos),
      avg_time: Number(s.avg_time),
    })),
    cta_table: ctaTable.map((c) => ({
      cta: c.cta || "(no CTA)",
      count: Number(c.count),
      pageviews: Number(c.pageviews),
      leads: Number(c.leads),
      sqos: Number(c.sqos),
    })),
    channel_mix: channelMix.map((c) => ({
      channel: c.channel || "(unattributed)",
      count: Number(c.count),
      pageviews: Number(c.pageviews),
      leads: Number(c.leads),
      sqos: Number(c.sqos),
    })),
    product_mix: productMix.map((p) => ({
      product: p.product || "(unattributed)",
      count: Number(p.count),
      pageviews: Number(p.pageviews),
      leads: Number(p.leads),
      sqos: Number(p.sqos),
    })),
    top_content: topContent.map((t) => ({
      contentId: t.contentId ?? "N/A",
      stage: t.stage ?? "UNKNOWN",
      product: t.product || "N/A",
      channel: t.channel || "N/A",
      cta: t.cta || "N/A",
      pageviews: Number(t.pageviews ?? 0),
      leads: Number(t.leads ?? 0),
      sqos: Number(t.sqos ?? 0),
    })),
  };
}
