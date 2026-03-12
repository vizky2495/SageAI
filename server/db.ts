import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set.");
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });

export async function ensureJourneyIndexes() {
  const indexes = [
    "CREATE INDEX IF NOT EXISTS idx_ji_contact_hash ON journey_interactions(contact_hash)",
    "CREATE INDEX IF NOT EXISTS idx_ji_asset_id ON journey_interactions(asset_id)",
    "CREATE INDEX IF NOT EXISTS idx_ji_timestamp ON journey_interactions(interaction_timestamp)",
    "CREATE INDEX IF NOT EXISTS idx_ji_contact_ts ON journey_interactions(contact_hash, interaction_timestamp)",
    "CREATE INDEX IF NOT EXISTS idx_ji_batch ON journey_interactions(upload_batch_id)",
    "CREATE INDEX IF NOT EXISTS idx_cj_pattern ON contact_journeys(journey_pattern)",
    "CREATE INDEX IF NOT EXISTS idx_cj_outcome ON contact_journeys(outcome)",
    "CREATE INDEX IF NOT EXISTS idx_cj_product ON contact_journeys(product)",
    "CREATE INDEX IF NOT EXISTS idx_cj_country ON contact_journeys(country)",
    "CREATE INDEX IF NOT EXISTS idx_jp_conv_rate ON journey_patterns(conversion_rate DESC)",
    "CREATE INDEX IF NOT EXISTS idx_jp_contact_count ON journey_patterns(contact_count DESC)",
    "CREATE INDEX IF NOT EXISTS idx_ajs_asset_id ON asset_journey_stats(asset_id)",
  ];
  for (const idx of indexes) {
    try {
      await db.execute(sql.raw(idx));
    } catch (err) {
      console.warn(`[journey-indexes] Failed to create index: ${idx}`, err instanceof Error ? err.message : err);
    }
  }
}
