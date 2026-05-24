#!/usr/bin/env node
/**
 * backfill_owner.js
 *
 * Safely backfill `owner` column on `public.notes` using the Supabase service_role key.
 * Usage examples:
 *  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ADMIN_UID=admin-uid node scripts/backfill_owner.js --dry-run
 *  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ADMIN_UID=admin-uid node scripts/backfill_owner.js --yes --set-not-null
 */

import { createClient } from "@supabase/supabase-js";

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes("--dry-run"),
    setNotNull: args.includes("--set-not-null"),
    yes: args.includes("--yes") || args.includes("-y"),
  };
}

async function main() {
  const { dryRun, setNotNull, yes } = parseArgs();
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const adminUid = process.env.ADMIN_UID || process.env.BACKFILL_ADMIN_UID;

  if (!url || !serviceKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
    process.exit(2);
  }
  if (!adminUid && !dryRun) {
    console.error("Missing ADMIN_UID environment variable (the UID to assign to existing rows). Provide ADMIN_UID or run with --dry-run.");
    process.exit(2);
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Count rows without owner
  const { data: countRes, error: countError } = await supabase
    .from(process.env.SUPABASE_NOTES_TABLE ?? "notes")
    .select("id", { count: "exact", head: false })
    .is("owner", null);

  if (countError) {
    console.error("Failed to count rows:", countError.message || countError);
    process.exit(2);
  }

  const nullCount = Array.isArray(countRes) ? countRes.length : 0;
  console.log(`Rows with owner IS NULL: ${nullCount}`);

  if (nullCount === 0) {
    console.log("No rows to backfill.");
  }

  if (dryRun) {
    console.log("Dry run complete. No changes were made.");
    process.exit(0);
  }

  if (!yes) {
    console.log("To proceed with backfill, re-run with --yes and ensure environment variables are set.");
    process.exit(0);
  }

  // Perform backfill
  console.log(`Updating ${nullCount} rows to owner='${adminUid}'...`);
  const { data: updateData, error: updateError } = await supabase
    .from(process.env.SUPABASE_NOTES_TABLE ?? "notes")
    .update({ owner: adminUid })
    .is("owner", null);

  if (updateError) {
    console.error("Backfill failed:", updateError.message || updateError);
    process.exit(2);
  }

  console.log(`Backfill completed. Updated rows: ${Array.isArray(updateData) ? updateData.length : 0}`);

  if (setNotNull) {
    if (!yes) {
      console.log("--set-not-null requires --yes to be supplied to run in non-interactive mode.");
      process.exit(0);
    }

    console.log("Altering column to set NOT NULL (this is irreversible unless rolled back)...");
    const sql = `alter table public.${process.env.SUPABASE_NOTES_TABLE ?? "notes"} alter column owner set not null;`;
    const { error: alterError } = await supabase.rpc("sql", { q: sql }).catch(() => ({ error: { message: "rpc sql not available" } }));

    if (alterError) {
      // Fallback: use query via from().select() to execute raw SQL not available; instruct operator
      console.error("Could not alter column via RPC. Please run the following SQL in Supabase SQL editor:");
      console.error(sql);
      process.exit(0);
    }

    console.log("Column altered to NOT NULL.");
  }

  console.log("All done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
