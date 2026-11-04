"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionState } from "@/lib/types";

const ROLES = ["admin", "teacher", "student"] as const;
const STATUSES = ["active", "inactive", "on_hold"] as const;

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const strOrNull = (f: FormData, k: string) => str(f, k) || null;

function validTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ADM-01: create teacher, student or admin accounts. The database trigger creates the profile rows.
export async function createUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole("admin");
  const email = str(formData, "email").toLowerCase();
  const full_name = str(formData, "full_name");
  const role = str(formData, "role") as (typeof ROLES)[number];
  const password = str(formData, "password");

  if (!full_name) return { error: "Enter the person's full name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };
  if (!ROLES.includes(role)) return { error: "Choose a role." };
  if (password.length < 10) return { error: "The temporary password must be at least 10 characters." };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { full_name },
  });
  if (error || !data.user) {
    return { error: error?.message.includes("already") ? "An account with this email already exists." : "Could not create the account." };
  }
  revalidatePath("/admin");
  redirect(`/admin/users/${data.user.id}?created=1`);
}

// ADM-01: edit profile basics. Role and status changes are logged by a database trigger.
export async function updateAccount(userId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireRole("admin");
  const full_name = str(formData, "full_name");
  const status = str(formData, "status") as (typeof STATUSES)[number];
  const timezone = str(formData, "timezone");
  const email = str(formData, "email").toLowerCase();
  const phone = strOrNull(formData, "phone");

  if (!full_name) return { error: "Name is required." };
  if (!STATUSES.includes(status)) return { error: "Choose a valid status." };
  if (!validTimezone(timezone)) return { error: "Unknown time zone. Use a name like Asia/Manila." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };

  const { data: current } = await supabase.from("profile_contacts").select("email").eq("user_id", userId).single();
  if (current && current.email !== email) {
    const { error } = await createAdminClient().auth.admin.updateUserById(userId, { email, email_confirm: true });
    if (error) return { error: "Could not change the email (it may already be in use)." };
  }

  const [p, c] = await Promise.all([
    supabase.from("profiles").update({ full_name, status, timezone }).eq("id", userId),
    supabase.from("profile_contacts").update({ email, phone }).eq("user_id", userId),
  ]);
  if (p.error || c.error) return { error: "Could not save changes." };

  // ADM-03: an inactive account is blocked from logging in or refreshing its session;
  // reactivating lifts the block.
  await createAdminClient().auth.admin.updateUserById(userId, { ban_duration: status === "inactive" ? "876000h" : "none" });

  revalidatePath(`/admin/users/${userId}`);
  return { ok: true, message: "Saved." };
}

export async function updateTeacherDetails(userId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireRole("admin");
  const years = str(formData, "experience_years");
  const { error } = await supabase
    .from("teacher_profiles")
    .update({
      bio: str(formData, "bio"),
      education: str(formData, "education"),
      qualifications: str(formData, "qualifications"),
      experience_years: years === "" ? null : Math.max(0, Math.min(60, Number(years) || 0)),
      specializations: str(formData, "specializations")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      show_on_website: formData.get("show_on_website") === "on",
    })
    .eq("user_id", userId);
  const notes = await supabase.from("teacher_admin_notes").upsert({ user_id: userId, notes: str(formData, "admin_notes") });
  if (error || notes.error) return { error: "Could not save teacher details." };
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/teachers");
  return { ok: true, message: "Saved." };
}

export async function updateStudentDetails(userId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireRole("admin");
  const { error } = await supabase
    .from("student_profiles")
    .update({
      birthday: strOrNull(formData, "birthday"),
      is_minor: formData.get("is_minor") === "on",
      class_level: str(formData, "class_level"),
      enrollment_date: str(formData, "enrollment_date") || new Date().toISOString().slice(0, 10),
      course_id: strOrNull(formData, "course_id"),
    })
    .eq("user_id", userId);
  if (error) return { error: "Could not save student details." };
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true, message: "Saved." };
}

// ADM-02: assign a student to a teacher (re-activates an earlier assignment if there was one).
export async function assignTeacher(studentId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireRole("admin");
  const teacherId = str(formData, "teacher_id");
  if (!teacherId) return { error: "Choose a teacher." };
  const { data: teacher } = await supabase.from("profiles").select("role").eq("id", teacherId).single();
  if (teacher?.role !== "teacher") return { error: "That person is not a teacher." };
  const { error } = await supabase
    .from("teacher_students")
    .upsert({ teacher_id: teacherId, student_id: studentId, active: true, assigned_at: new Date().toISOString(), ended_at: null });
  if (error) return { error: "Could not assign the teacher." };
  revalidatePath(`/admin/users/${studentId}`);
  revalidatePath(`/admin/users/${teacherId}`);
  return { ok: true, message: "Teacher assigned." };
}

export async function endAssignment(teacherId: string, studentId: string) {
  const { supabase } = await requireRole("admin");
  await supabase
    .from("teacher_students")
    .update({ active: false, ended_at: new Date().toISOString() })
    .eq("teacher_id", teacherId)
    .eq("student_id", studentId);
  revalidatePath(`/admin/users/${studentId}`);
  revalidatePath(`/admin/users/${teacherId}`);
}

export async function addGuardian(studentId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireRole("admin");
  const full_name = str(formData, "full_name");
  if (!full_name) return { error: "Enter the guardian's name." };
  const { error } = await supabase.from("guardians").insert({
    student_id: studentId,
    full_name,
    relationship: str(formData, "relationship"),
    email: strOrNull(formData, "email"),
    phone: strOrNull(formData, "phone"),
  });
  if (error) return { error: "Could not add the guardian." };
  revalidatePath(`/admin/users/${studentId}`);
  return { ok: true, message: "Guardian added." };
}

export async function removeGuardian(guardianId: string, studentId: string) {
  const { supabase } = await requireRole("admin");
  await supabase.from("guardians").delete().eq("id", guardianId);
  revalidatePath(`/admin/users/${studentId}`);
}

// ADM-03: set a new temporary password for a user.
export async function setPassword(userId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole("admin");
  const password = str(formData, "password");
  if (password.length < 10) return { error: "Use at least 10 characters." };
  const { error } = await createAdminClient().auth.admin.updateUserById(userId, { password });
  if (error) return { error: "Could not set the password." };
  return { ok: true, message: "Password updated. Share it with the user securely and ask them to change it." };
}
