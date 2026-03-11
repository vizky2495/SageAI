import { Pool } from "pg";

const PRODUCTION_URL = "https://funnel-tracker.replit.app";

async function main() {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    console.error("ADMIN_PASSWORD not set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log("Step 1: Logging into production as admin...");
  const loginRes = await fetch(`${PRODUCTION_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      displayName: "sync@sage.com",
      password: adminPassword,
      role: "admin",
      firstName: "Sync",
      lastName: "Admin",
    }),
  });

  if (!loginRes.ok) {
    const errBody = await loginRes.text();
    console.error("Login failed:", loginRes.status, errBody);
    process.exit(1);
  }

  const { token } = await loginRes.json() as { token: string };
  console.log("  Logged in successfully");

  console.log("\nStep 2: Reading content from dev database...");
  const { rows } = await pool.query(`
    SELECT * FROM content_stored 
    WHERE fetch_status IN ('success', 'partial')
    ORDER BY asset_id
  `);
  console.log(`  Found ${rows.length} content entries to sync`);

  console.log("\nStep 3: Syncing to production one at a time...");
  let synced = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const item = {
        assetId: row.asset_id,
        contentText: row.content_text,
        contentSummary: row.content_summary,
        extractedTopics: row.extracted_topics,
        extractedCta: row.extracted_cta,
        contentStructure: row.content_structure,
        messagingThemes: row.messaging_themes,
        keywordTags: row.keyword_tags,
        contentFormat: row.content_format,
        sourceType: row.source_type,
        sourceUrl: row.source_url,
        storedFileBase64: row.stored_file_base64,
        originalFilename: row.original_filename,
        fileSizeBytes: row.file_size_bytes,
        fetchStatus: row.fetch_status,
        fetchNotes: row.fetch_notes,
        storedBy: row.stored_by,
        dateStored: row.date_stored,
        uploadedByUserId: row.uploaded_by_user_id,
        uploadedByName: row.uploaded_by_name,
      };

      const fileSize = row.stored_file_base64 ? row.stored_file_base64.length : 0;
      console.log(`  Syncing ${row.asset_id} (${row.fetch_status}, file: ${(fileSize / 1024 / 1024).toFixed(1)}MB)...`);

      const res = await fetch(`${PRODUCTION_URL}/api/admin/import-content`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ data: [item] }),
      });

      if (res.ok) {
        const result = await res.json();
        console.log(`    ✓ imported: ${result.imported}`);
        synced++;
      } else {
        const errText = await res.text();
        console.error(`    ✗ ${res.status}: ${errText.substring(0, 200)}`);
        errors++;
      }
    } catch (err: any) {
      console.error(`    ✗ ${row.asset_id}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Sync complete! Synced: ${synced}, Errors: ${errors}, Total: ${rows.length}`);

  console.log("\nStep 4: Verifying production content...");
  const verifyRes = await fetch(`${PRODUCTION_URL}/api/content/coverage`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (verifyRes.ok) {
    const coverage = await verifyRes.json();
    console.log("Production coverage:", JSON.stringify(coverage, null, 2));
  }

  await pool.end();
}

main().catch(console.error);
