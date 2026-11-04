"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import type { ActionState } from "@/lib/types";

const AVATAR_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function validTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Fields any logged-in user may change about themselves. Row-level security
// limits the update to their own rows; triggers block role/status/email changes.
export async function updateMyContact(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: "Please log in again." };
  const { supabase, profile } = session;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const timezone = String(formData.get("timezone") ?? "").trim();
  if (!validTimezone(timezone)) return { error: "Unknown time zone. Use a name like Asia/Manila." };
  if (phone && phone.length > 50) return { error: "Phone number is too long." };

  const [p, c] = await Promise.all([
    supabase.from("profiles").update({ timezone }).eq("id", profile.id),
    supabase.from("profile_contacts").update({ phone }).eq("user_id", profile.id),
  ]);
  if (p.error || c.error) return { error: "Could not save your details." };
  revalidatePath(`/${profile.role}`, "layout");
  return { ok: true, message: "Saved." };
}

export async function uploadMyAvatar(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: "Please log in again." };
  const { supabase, profile } = session;
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image first." };
  const ext = AVATAR_TYPES[file.type];
  if (!ext) return { error: "Use a JPG, PNG or WebP image." };
  if (file.size > 2 * 1024 * 1024) return { error: "The image must be smaller than 2 MB." };

  const path = `${profile.id}/avatar-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type, upsert: false });
  if (error) return { error: "Upload failed. Please try again." };
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", profile.id);

  // Remove older avatars so storage doesn't grow.
  const { data: old } = await supabase.storage.from("avatars").list(profile.id);
  const stale = (old ?? []).map((o) => `${profile.id}/${o.name}`).filter((p) => p !== path);
  if (stale.length) await supabase.storage.from("avatars").remove(stale);

  revalidatePath(`/${profile.role}`, "layout");
  return { ok: true, message: "Photo updated." };
}

export async function updateMyTeacherProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session || session.profile.role !== "teacher") return { error: "Not allowed." };
  const { supabase, profile } = session;
  const years = String(formData.get("experience_years") ?? "").trim();
  const { error } = await supabase
    .from("teacher_profiles")
    .update({
      bio: String(formData.get("bio") ?? "").trim(),
      education: String(formData.get("education") ?? "").trim(),
      qualifications: String(formData.get("qualifications") ?? "").trim(),
      experience_years: years === "" ? null : Math.max(0, Math.min(60, Number(years) || 0)),
      specializations: String(formData.get("specializations") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    })
    .eq("user_id", profile.id);
  if (error) return { error: "Could not save your profile." };
  revalidatePath("/teacher/profile");
  revalidatePath("/teachers");
  return { ok: true, message: "Profile saved." };
}
