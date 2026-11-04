"use server";

import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

const COURSE_TYPES = ["general_english", "ielts", "business_english", "other"];

export async function submitInquiry(_prev: ActionState, formData: FormData): Promise<ActionState> {
  // Simple bot trap: real people leave this hidden field empty.
  if (String(formData.get("website") ?? "") !== "") return { ok: true, message: "Thank you! We'll be in touch soon." };

  const full_name = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const courseRaw = String(formData.get("course_type") ?? "");
  const message = String(formData.get("message") ?? "").trim() || null;

  if (!full_name || full_name.length > 200) return { error: "Please enter your name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Please enter a valid email address." };
  if (message && message.length > 4000) return { error: "Your message is too long." };

  const supabase = await createClient();
  const { error } = await supabase.from("inquiries").insert({
    full_name,
    email,
    phone,
    course_type: COURSE_TYPES.includes(courseRaw) ? courseRaw : null,
    message,
    wants_trial: formData.get("wants_trial") === "on",
  });
  if (error) return { error: "Sorry, something went wrong. Please email us instead." };
  return { ok: true, message: "Thank you! We'll contact you within one working day to arrange your trial class." };
}
