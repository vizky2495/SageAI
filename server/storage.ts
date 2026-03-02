import {
  type AssetAgg,
  type InsertAssetAgg,
  assetsAgg,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, ilike, and, sql, count } from "drizzle-orm";

export interface IStorage {
  clearAssets(): Promise<void>;
  bulkInsertAssets(assets: InsertAssetAgg[]): Promise<void>;
  getAssets(opts: {
    stage: string;
    search?: string;
    limit: number;
    offset: number;
  }): Promise<{ data: AssetAgg[]; total: number }>;
  getAllAssets(): Promise<AssetAgg[]>;
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
    limit: number;
    offset: number;
  }): Promise<{ data: AssetAgg[]; total: number }> {
    const conditions = [eq(assetsAgg.stage, opts.stage as any)];
    if (opts.search) {
      conditions.push(ilike(assetsAgg.contentId, `%${opts.search}%`));
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
  async getAllAssets(): Promise<AssetAgg[]> {
    return db.select().from(assetsAgg).orderBy(desc(assetsAgg.pageviewsSum));
  }
}

export const storage = new DatabaseStorage();
