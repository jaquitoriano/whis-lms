"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import type { ActionState } from "@/lib/types";

const TYPES = ["general_english", "ielts", "business_english", "other"];

function parse(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const duration = Number(formData.get("default_duration_min"));
  const sort_order = Number(formData.get("sort_order") ?? 0) || 0;
  if (!name) return { error: "Course name is required." } as const;
  if (!TYPES.includes(type)) return { error: "Choose a course type." } as const;
  if (!Number.isInteger(duration) || duration < 15 || duration > 240) return { error: "Class duration must be 15–240 minutes." } as const;
  return { value: { name, type, description, default_duration_min: duration, sort_order, active: formData.get("active") === "on" } } as const;
}

function refresh() {
  revalidatePath("/admin/courses");
  revalidatePath("/classes");
  revalidatePath("/");
}

export async function createCourse(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireRole("admin");
  const parsed = parse(formData);
  if ("error" in parsed) return { error: parsed.error };
  const { error } = await supabase.from("courses").insert(parsed.value);
  if (error) return { error: "Could not add the course." };
  refresh();
  return { ok: true, message: "Course added." };
}

export async function updateCourse(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireRole("admin");
  const parsed = parse(formData);
  if ("error" in parsed) return { error: parsed.error };
  const { error } = await supabase.from("courses").update(parsed.value).eq("id", id);
  if (error) return { error: "Could not save the course." };
  refresh();
  return { ok: true, message: "Saved." };
}
