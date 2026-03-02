import { db } from "./db";
import { assetsAgg } from "@shared/schema";

async function seed() {
  const existing = await db.select().from(assetsAgg).limit(1);
  if (existing.length > 0) {
    console.log("Database already seeded, skipping.");
    return;
  }

  console.log("No seed data to insert. Upload data via the admin panel.");
}

seed()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  });
