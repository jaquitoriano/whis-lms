import { site } from "@/config/site";

export const metadata = { title: "Privacy policy" };

// Placeholder: the school must replace this with a reviewed privacy policy
// (e.g. compliant with the Philippines Data Privacy Act) before real student data is entered (NFR-26).
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-3xl font-semibold">Privacy policy</h1>
      <p className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
        Draft placeholder. {site.name} will publish its full privacy policy before student accounts are opened.
      </p>
      <div className="mt-6 space-y-3 text-sm text-muted">
        <p>We collect the information needed to run your classes: your name, contact details, course, lesson records and homework.</p>
        <p>Only you, your assigned teacher and school administrators can see your records. We never sell your data.</p>
        <p>To ask about or correct your data, contact {site.contact.email}.</p>
      </div>
    </div>
  );
}
