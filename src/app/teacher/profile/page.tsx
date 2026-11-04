import { requireRole } from "@/lib/auth";
import { ActionForm } from "@/components/ActionForm";
import { MyAccountForms } from "@/components/MyAccountForms";
import { PageHeader } from "@/components/ui";
import { updateMyTeacherProfile } from "@/lib/account-actions";
import type { Contact, TeacherProfile } from "@/lib/types";

export const metadata = { title: "My Profile" };

export default async function TeacherProfilePage() {
  const { supabase, profile } = await requireRole("teacher");
  const [{ data: t }, { data: contact }] = await Promise.all([
    supabase.from("teacher_profiles").select("*").eq("user_id", profile.id).maybeSingle<TeacherProfile>(),
    supabase.from("profile_contacts").select("*").eq("user_id", profile.id).maybeSingle<Contact>(),
  ]);

  return (
    <>
      <PageHeader title="My profile" description={t?.show_on_website ? "Your profile is shown on the public Teachers page." : "Your profile is visible to your students and the school office."} />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card lg:row-span-2">
          <h2 className="mb-4 font-semibold">About me</h2>
          <ActionForm action={updateMyTeacherProfile}>
            <div>
              <p className="label">Full name</p>
              <p className="text-sm">{profile.full_name}</p>
            </div>
            <div>
              <label className="label" htmlFor="bio">Short biography</label>
              <textarea className="input min-h-28" id="bio" name="bio" defaultValue={t?.bio} maxLength={2000} />
            </div>
            <div>
              <label className="label" htmlFor="education">Education</label>
              <input className="input" id="education" name="education" defaultValue={t?.education} />
            </div>
            <div>
              <label className="label" htmlFor="qualifications">Qualifications</label>
              <input className="input" id="qualifications" name="qualifications" defaultValue={t?.qualifications} placeholder="e.g. CELTA, TESOL" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="experience_years">Years teaching</label>
                <input className="input" id="experience_years" name="experience_years" type="number" min={0} max={60} defaultValue={t?.experience_years ?? ""} />
              </div>
              <div>
                <label className="label" htmlFor="specializations">Specializations</label>
                <input className="input" id="specializations" name="specializations" defaultValue={t?.specializations.join(", ")} placeholder="IELTS, Business English" />
              </div>
            </div>
          </ActionForm>
        </section>
        <MyAccountForms profile={profile} contact={contact} />
      </div>
    </>
  );
}
