import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotificationEmail } from "@/lib/email";

// Scheduled job (every ~15 minutes): creates time-based notifications (class reminders,
// homework due soon, review backlog, scheduled announcements), then emails everything
// pending. Call with:  Authorization: Bearer <CRON_SECRET>
export const dynamic = "force-dynamic";

const BATCH = 100;

async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = createAdminClient();

  const gen = await db.rpc("generate_scheduled_notifications");
  if (gen.error) return NextResponse.json({ error: gen.error.message }, { status: 500 });

  const { data: pending, error } = await db
    .from("notifications")
    .select("id, user_id, title, body, link")
    .eq("email_status", "pending")
    .order("created_at")
    .limit(BATCH);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = [...new Set((pending ?? []).map((p) => p.user_id))];
  const { data: contacts } = ids.length ? await db.from("profile_contacts").select("user_id, email").in("user_id", ids) : { data: [] };
  const emailOf = new Map((contacts ?? []).map((c) => [c.user_id, c.email]));

  let sent = 0;
  let failed = 0;
  for (const n of pending ?? []) {
    const to = emailOf.get(n.user_id);
    if (!to) {
      await db.from("notifications").update({ email_status: "skipped", email_error: "no email address" }).eq("id", n.id);
      continue;
    }
    try {
      await sendNotificationEmail(to, n);
      await db.from("notifications").update({ email_status: "sent", emailed_at: new Date().toISOString(), email_error: null }).eq("id", n.id);
      sent++;
    } catch (e) {
      failed++;
      await db
        .from("notifications")
        .update({ email_status: "failed", email_error: String((e as Error).message).slice(0, 500) })
        .eq("id", n.id);
    }
  }
  return NextResponse.json({ generated: gen.data, sent, failed, more: (pending ?? []).length === BATCH });
}

export const GET = run;
export const POST = run;
