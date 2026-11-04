import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ActionForm } from "@/components/ActionForm";
import { PageHeader } from "@/components/ui";
import { changePassword, saveEmailPreferences } from "@/lib/portal-actions";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";
import { tzLabel } from "@/lib/time";
import type { Profile } from "@/lib/types";

export async function SettingsPage({ supabase, viewer }: { supabase: SupabaseClient; viewer: Profile }) {
  const types = viewer.role === "admin" ? [] : NOTIFICATION_TYPES[viewer.role];
  const { data } = await supabase.from("notification_preferences").select("type, email");
  const off = new Set((data ?? []).filter((p) => !p.email).map((p) => p.type));

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6 lg:grid-cols-2">
        {types.length > 0 && (
          <section className="card">
            <h2 className="mb-1 font-semibold">Email notifications</h2>
            <p className="mb-4 text-sm text-muted">Everything always appears under Notifications in the site. Choose which ones are also emailed to you.</p>
            <ActionForm action={saveEmailPreferences} submitLabel="Save preferences">
              <div className="space-y-2">
                {types.map((t) => (
                  <label key={t.type} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name={`email_${t.type}`} defaultChecked={!off.has(t.type)} /> {t.label}
                  </label>
                ))}
              </div>
            </ActionForm>
          </section>
        )}
        <section className="card">
          <h2 className="mb-4 font-semibold">Change password</h2>
          <ActionForm action={changePassword} submitLabel="Change password" resetOnSuccess>
            <div>
              <label className="label" htmlFor="current">Current password</label>
              <input className="input" id="current" name="current" type="password" autoComplete="current-password" required />
            </div>
            <div>
              <label className="label" htmlFor="password">New password</label>
              <input className="input" id="password" name="password" type="password" minLength={10} autoComplete="new-password" required />
            </div>
            <div>
              <label className="label" htmlFor="confirm">Confirm new password</label>
              <input className="input" id="confirm" name="confirm" type="password" minLength={10} autoComplete="new-password" required />
            </div>
          </ActionForm>
        </section>
        {viewer.role !== "admin" && (
          <section className="card">
            <h2 className="mb-1 font-semibold">Time zone</h2>
            <p className="text-sm text-muted">
              Times are shown in {tzLabel(viewer.timezone)}.{" "}
              <Link href={`/${viewer.role}/profile`} className="text-brand-700 hover:underline">
                Change it in My Profile
              </Link>
              .
            </p>
          </section>
        )}
      </div>
    </>
  );
}
