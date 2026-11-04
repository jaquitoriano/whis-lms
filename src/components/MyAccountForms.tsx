import { ActionForm } from "@/components/ActionForm";
import { Avatar } from "@/components/ui";
import { updateMyContact, uploadMyAvatar } from "@/lib/account-actions";
import type { Contact, Profile } from "@/lib/types";

// Photo, phone and time zone: the parts of a profile every user can edit themselves.
export function MyAccountForms({ profile, contact }: { profile: Profile; contact: Contact | null }) {
  return (
    <>
      <section className="card">
        <h2 className="mb-4 font-semibold">Profile picture</h2>
        <div className="flex items-start gap-4">
          <Avatar profile={profile} size={72} />
          <ActionForm action={uploadMyAvatar} submitLabel="Upload" pendingText="Uploading…" resetOnSuccess className="flex-1 space-y-3">
            <input type="file" name="avatar" accept="image/jpeg,image/png,image/webp" className="block w-full text-sm" aria-label="Profile picture" required />
            <p className="text-xs text-muted">JPG, PNG or WebP, up to 2 MB.</p>
          </ActionForm>
        </div>
      </section>
      <section className="card">
        <h2 className="mb-4 font-semibold">Contact details</h2>
        <ActionForm action={updateMyContact}>
          <div>
            <p className="label">Email</p>
            <p className="text-sm">{contact?.email}</p>
            <p className="mt-1 text-xs text-muted">To change your email, contact the school office.</p>
          </div>
          <div>
            <label className="label" htmlFor="phone">Contact number</label>
            <input className="input" id="phone" name="phone" defaultValue={contact?.phone ?? ""} maxLength={50} />
          </div>
          <div>
            <label className="label" htmlFor="timezone">Your time zone</label>
            <input className="input" id="timezone" name="timezone" defaultValue={profile.timezone} required />
            <p className="mt-1 text-xs text-muted">Class times will be shown in this time zone. Example: Asia/Manila, Asia/Tokyo, Europe/London.</p>
          </div>
        </ActionForm>
      </section>
    </>
  );
}
