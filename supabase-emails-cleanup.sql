-- Roost: clear any fake/seeded rows from the `emails` table.
-- Real IMAP-ingested rows have `raw_uid` populated (the Yahoo IMAP UID).
-- Seed/fake rows were inserted without raw_uid, so they're null.
-- Safe to re-run — this is a no-op if no seed rows exist.
--
-- Run once in Supabase SQL Editor after the backfill has populated real data.

delete from emails where raw_uid is null;
