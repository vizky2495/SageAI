import {
  type PromptVersion,
  type InsertPromptVersion,
  type Collaborator,
  type InsertCollaborator,
  type AssetAgg,
  type InsertAssetAgg,
  promptVersions,
  collaborators,
  assetsAgg,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, ilike, and, sql, count } from "drizzle-orm";

export interface IStorage {
  getPromptVersions(): Promise<PromptVersion[]>;
  getPromptVersion(id: string): Promise<PromptVersion | undefined>;
  createPromptVersion(v: InsertPromptVersion): Promise<PromptVersion>;
  updatePromptVersion(id: string, v: Partial<InsertPromptVersion>): Promise<PromptVersion | undefined>;
  deletePromptVersion(id: string): Promise<boolean>;

  getCollaborators(): Promise<Collaborator[]>;
  getCollaborator(id: string): Promise<Collaborator | undefined>;
  createCollaborator(c: InsertCollaborator): Promise<Collaborator>;
  updateCollaborator(id: string, c: Partial<InsertCollaborator>): Promise<Collaborator | undefined>;
  deleteCollaborator(id: string): Promise<boolean>;

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
  async getPromptVersions(): Promise<PromptVersion[]> {
    return db.select().from(promptVersions).orderBy(desc(promptVersions.createdAt));
  }

  async getPromptVersion(id: string): Promise<PromptVersion | undefined> {
    const [row] = await db.select().from(promptVersions).where(eq(promptVersions.id, id));
    return row;
  }

  async createPromptVersion(v: InsertPromptVersion): Promise<PromptVersion> {
    const [row] = await db.insert(promptVersions).values(v).returning();
    return row;
  }

  async updatePromptVersion(id: string, v: Partial<InsertPromptVersion>): Promise<PromptVersion | undefined> {
    const [row] = await db.update(promptVersions).set(v).where(eq(promptVersions.id, id)).returning();
    return row;
  }

  async deletePromptVersion(id: string): Promise<boolean> {
    const result = await db.delete(promptVersions).where(eq(promptVersions.id, id)).returning();
    return result.length > 0;
  }

  async getCollaborators(): Promise<Collaborator[]> {
    return db.select().from(collaborators).orderBy(collaborators.name);
  }

  async getCollaborator(id: string): Promise<Collaborator | undefined> {
    const [row] = await db.select().from(collaborators).where(eq(collaborators.id, id));
    return row;
  }

  async createCollaborator(c: InsertCollaborator): Promise<Collaborator> {
    const [row] = await db.insert(collaborators).values(c).returning();
    return row;
  }

  async updateCollaborator(id: string, c: Partial<InsertCollaborator>): Promise<Collaborator | undefined> {
    const [row] = await db
      .update(collaborators)
      .set({ ...c, lastEditedAt: new Date() })
      .where(eq(collaborators.id, id))
      .returning();
    return row;
  }

  async deleteCollaborator(id: string): Promise<boolean> {
    const result = await db.delete(collaborators).where(eq(collaborators.id, id)).returning();
    return result.length > 0;
  }

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
