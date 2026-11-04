import { site } from "@/config/site";

export const metadata = { title: "Terms of use" };

// Placeholder: replace with reviewed terms of use before launch (NFR-26).
export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-3xl font-semibold">Terms of use</h1>
      <p className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
        Draft placeholder. {site.name} will publish its full terms of use before launch.
      </p>
    </div>
  );
}
