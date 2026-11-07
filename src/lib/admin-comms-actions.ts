"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { isDateStr, zonedToUtc } from "@/lib/time";
import type { ActionState } from "@/lib/types";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const AUDIENCES = ["everyone", "all_teachers", "all_students", "specific"];

// ANN-01: send to all teachers, all students, everyone, or specific people; now or later.
export async function createAnnouncement(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, profile } = await requireRole("admin");
  const title = str(formData, "title");
  const body = str(formData, "body");
  const audience = str(formData, "audience");
  const recipients = formData.getAll("recipients").map(String).filter(Boolean);
  if (!title) return { error: "Give the announcement a title." };
  if (!AUDIENCES.includes(audience)) return { error: "Choose who it is for." };
  if (audience === "specific" && recipients.length === 0) return { error: "Choose at least one person." };

  let publishAt = new Date();
  if (formData.get("schedule") === "on") {
    const d = str(formData, "publish_date");
    const t = str(formData, "publish_time") || "08:00";
    if (!isDateStr(d)) return { error: "Choose when to publish it." };
    publishAt = zonedToUtc(d, t, profile.timezone);
  }
  let expiresAt: string | null = null;
  const exp = str(formData, "expires_date");
  if (exp) {
    if (!isDateStr(exp)) return { error: "Invalid end date." };
    expiresAt = zonedToUtc(exp, "23:59", profile.timezone).toISOString();
  }

  const { data, error } = await supabase
    .from("announcements")
    .insert({ title, body, audience, publish_at: publishAt.toISOString(), expires_at: expiresAt, created_by: profile.id })
    .select("id")
    .single();
  if (error || !data) return { error: "Could not save the announcement." };
  if (audience === "specific") {
    const r = await supabase.from("announcement_recipients").insert(recipients.map((user_id) => ({ announcement_id: data.id, user_id })));
    if (r.error) return { error: "Could not save the recipients." };
  }
  // Deliver now if it's due; scheduled ones go out with the next scheduled job run.
  if (publishAt.getTime() <= Date.now()) await supabase.rpc("deliver_announcement", { p_id: data.id });
  revalidatePath("/", "layout");
  redirect("/admin/announcements?sent=1");
}

export async function deleteAnnouncement(id: string) {
  const { supabase } = await requireRole("admin");
  await supabase.from("announcements").delete().eq("id", id);
  revalidatePath("/", "layout");
}

// POL-01..03: only admins publish; each publish is a new, immutable version.
export async function publishPolicies(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, profile } = await requireRole("admin");
  const body = str(formData, "body");
  const summary = str(formData, "summary");
  if (body.length < 20) return { error: "The policies text is too short." };
  const { data: latest } = await supabase.from("policies").select("version, body").order("version", { ascending: false }).limit(1).maybeSingle();
  if (latest && latest.body.trim() === body) return { error: "Nothing has changed since the current version." };
  const { error } = await supabase
    .from("policies")
    .insert({ version: (latest?.version ?? 0) + 1, title: str(formData, "title") || "Class policies", body, summary, published_by: profile.id });
  if (error) return { error: "Could not publish. Someone may have published at the same time; reload and try again." };
  revalidatePath("/", "layout");
  redirect("/admin/policies?published=1");
}
