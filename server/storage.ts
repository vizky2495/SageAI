import {
  type PromptVersion,
  type InsertPromptVersion,
  type Collaborator,
  type InsertCollaborator,
  promptVersions,
  collaborators,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

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
}

export const storage = new DatabaseStorage();
