import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { ActionForm } from "@/components/ActionForm";
import { PageHeader } from "@/components/ui";
import type { ActionState } from "@/lib/types";

export const metadata = { title: "Website settings" };

async function saveSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  "use server";
  const { supabase } = await requireRole("admin");
  const { error } = await supabase
    .from("settings")
    .upsert({ key: "students_can_view_teacher_contact", value: formData.get("students_can_view_teacher_contact") === "on" });
  if (error) return { error: "Could not save settings." };
  revalidatePath("/admin/settings");
  return { ok: true, message: "Settings saved." };
}

export default async function SettingsPage() {
  const { supabase } = await requireRole("admin");
  const { data } = await supabase.from("settings").select("key, value");
  const map = Object.fromEntries((data ?? []).map((s) => [s.key, s.value]));
  return (
    <>
      <PageHeader title="Website settings" description="School name, colours, FAQ and contact details are set in src/config/site.ts for now." />
      <section className="card max-w-xl">
        <h2 className="mb-4 font-semibold">Privacy</h2>
        <ActionForm action={saveSettings}>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="students_can_view_teacher_contact" defaultChecked={map.students_can_view_teacher_contact === true} className="mt-1" />
            <span>
              <span className="font-medium">Students can see their teacher&apos;s email and phone</span>
              <span className="block text-muted">When off, students see their teacher&apos;s name, photo and profile only.</span>
            </span>
          </label>
        </ActionForm>
      </section>
    </>
  );
}
