// src/app/api/keepalive/route.ts
//
// Pings the database to keep Supabase's free tier from pausing the
// project after 7 days of inactivity. Writes one row to keepalive_log
// per call, then prunes anything older than 30 days so the table stays
// tiny.
//
// Triggered by the daily Vercel cron in vercel.json. Also reachable
// manually for sanity checks (GET in a browser).
//
// Optional secret: if CRON_SECRET is set in env, requests must carry
// `Authorization: Bearer <CRON_SECRET>` — Vercel cron sends this
// automatically. If CRON_SECRET is unset, no auth check (handy for
// pre-launch debugging).

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  return runKeepalive(request);
}

export async function GET(request: Request) {
  return runKeepalive(request);
}

async function runKeepalive(request: Request) {
  // Optional shared-secret gate.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
  }

  const url = new URL(request.url);
  const source = url.searchParams.get("source") || "cron";

  try {
    const { data: insertData, error: insertError } = await supabaseAdmin
      .from("keepalive_log")
      .insert({ source })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        {
          ok: false,
          stage: "insert",
          error: String(insertError),
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      );
    }

    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();
    const { error: cleanupError } = await supabaseAdmin
      .from("keepalive_log")
      .delete()
      .lt("pinged_at", thirtyDaysAgo);

    const { data: recent } = await supabaseAdmin
      .from("keepalive_log")
      .select("pinged_at, source")
      .order("pinged_at", { ascending: false })
      .limit(5);

    return NextResponse.json({
      ok: true,
      pinged_at: insertData.pinged_at,
      source,
      cleanup_error: cleanupError ? String(cleanupError) : null,
      recent_pings: recent || [],
      message: "Database is awake.",
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        stage: "exception",
        error: String(err),
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
