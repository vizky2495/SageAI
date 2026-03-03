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
  createFeedback(item: InsertFeedback): Promise<Feedback>;
  getFeedback(opts: { type?: string; status?: string }): Promise<Feedback[]>;
  updateFeedbackStatus(id: number, status: string): Promise<Feedback | null>;
  getUserByDisplayName(displayName: string): Promise<User | null>;
  createUser(data: InsertUser): Promise<User>;
  getUserById(id: string): Promise<User | null>;
  updateUserAdmin(id: string, isAdmin: boolean): Promise<User | null>;
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

  async createFeedback(item: InsertFeedback): Promise<Feedback> {
    const [row] = await db.insert(feedback).values(item).returning();
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
}

export const storage = new DatabaseStorage();
