import { db } from "./db";
import { assetsAgg } from "@shared/schema";
import { sql } from "drizzle-orm";

async function seed() {
  const existing = await db.select().from(assetsAgg).limit(1);
  if (existing.length === 0) {
    console.log("No seed data to insert. Upload data via the admin panel.");
    return;
  }

  const metricsCheck = await db.execute(sql`
    SELECT SUM(pageviews_sum) as total_pv FROM assets_agg
  `);
  const totalPv = Number(metricsCheck.rows?.[0]?.total_pv || 0);
  if (totalPv > 0) {
    console.log("Performance metrics already populated, skipping.");
    return;
  }

  console.log("Populating sample performance metrics...");

  await db.execute(sql`
    UPDATE assets_agg SET
      pageviews_sum = CASE stage
        WHEN 'TOFU' THEN (50 + (abs(hashtext(id::text)) % 950))
        WHEN 'MOFU' THEN (20 + (abs(hashtext(id::text)) % 480))
        WHEN 'BOFU' THEN (10 + (abs(hashtext(id::text)) % 240))
        ELSE (5 + (abs(hashtext(id::text)) % 195))
      END
      + CASE utm_channel
        WHEN 'Organic' THEN (abs(hashtext(id::text || 'org')) % 200)
        WHEN 'Email' THEN (abs(hashtext(id::text || 'eml')) % 150)
        WHEN 'Brand Search' THEN (abs(hashtext(id::text || 'bs')) % 300)
        WHEN 'Generic Search' THEN (abs(hashtext(id::text || 'gs')) % 250)
        WHEN 'Paid Social - LinkedIn' THEN (abs(hashtext(id::text || 'li')) % 180)
        WHEN 'Content Syndication' THEN (abs(hashtext(id::text || 'cs')) % 120)
        ELSE (abs(hashtext(id::text || 'oth')) % 80)
      END,

      time_avg = CASE stage
        WHEN 'TOFU' THEN (15 + (abs(hashtext(id::text || 'time')) % 85))
        WHEN 'MOFU' THEN (30 + (abs(hashtext(id::text || 'time')) % 170))
        WHEN 'BOFU' THEN (45 + (abs(hashtext(id::text || 'time')) % 255))
        ELSE (10 + (abs(hashtext(id::text || 'time')) % 90))
      END,

      downloads_sum = CASE
        WHEN cta = 'PDF' THEN (5 + (abs(hashtext(id::text || 'dl')) % 95))
        WHEN cta = 'Video' THEN (2 + (abs(hashtext(id::text || 'dl')) % 48))
        WHEN cta IN ('Request a Trial', 'Subscription') THEN (1 + (abs(hashtext(id::text || 'dl')) % 29))
        ELSE (abs(hashtext(id::text || 'dl')) % 20)
      END
      + CASE stage
        WHEN 'TOFU' THEN (abs(hashtext(id::text || 'dls')) % 30)
        WHEN 'MOFU' THEN (abs(hashtext(id::text || 'dls')) % 50)
        WHEN 'BOFU' THEN (abs(hashtext(id::text || 'dls')) % 20)
        ELSE (abs(hashtext(id::text || 'dls')) % 10)
      END,

      unique_leads = CASE stage
        WHEN 'TOFU' THEN (abs(hashtext(id::text || 'lead')) % 25)
        WHEN 'MOFU' THEN (3 + (abs(hashtext(id::text || 'lead')) % 47))
        WHEN 'BOFU' THEN (8 + (abs(hashtext(id::text || 'lead')) % 92))
        ELSE (abs(hashtext(id::text || 'lead')) % 15)
      END
      + CASE
        WHEN cta = 'Request a Demo' THEN (abs(hashtext(id::text || 'ldm')) % 20)
        WHEN cta = 'Request a Call' THEN (abs(hashtext(id::text || 'ldc')) % 15)
        WHEN cta = 'Request a Trial' THEN (abs(hashtext(id::text || 'ldt')) % 25)
        WHEN cta = 'Purchase' THEN (abs(hashtext(id::text || 'ldp')) % 10)
        ELSE 0
      END,

      sqo_count = CASE stage
        WHEN 'TOFU' THEN (abs(hashtext(id::text || 'sqo')) % 5)
        WHEN 'MOFU' THEN (abs(hashtext(id::text || 'sqo')) % 12)
        WHEN 'BOFU' THEN (2 + (abs(hashtext(id::text || 'sqo')) % 23))
        ELSE (abs(hashtext(id::text || 'sqo')) % 4)
      END
      + CASE
        WHEN cta = 'Request a Demo' THEN (abs(hashtext(id::text || 'sqd')) % 8)
        WHEN cta = 'Request a Trial' THEN (abs(hashtext(id::text || 'sqt')) % 6)
        WHEN cta = 'Purchase' THEN (abs(hashtext(id::text || 'sqp')) % 10)
        WHEN cta = 'Request a Quote' THEN (abs(hashtext(id::text || 'sqq')) % 7)
        ELSE 0
      END
  `);

  const result = await db.execute(sql`
    SELECT stage, COUNT(*) as assets,
      ROUND(AVG(pageviews_sum)) as avg_pv,
      ROUND(AVG(unique_leads)::numeric, 1) as avg_leads,
      ROUND(AVG(sqo_count)::numeric, 1) as avg_sqo
    FROM assets_agg GROUP BY stage ORDER BY stage
  `);

  console.log("Performance metrics populated successfully:");
  for (const row of result.rows) {
    console.log(`  ${row.stage}: ${row.assets} assets | avg PV: ${row.avg_pv} | avg leads: ${row.avg_leads} | avg SQOs: ${row.avg_sqo}`);
  }
}

seed()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  });
