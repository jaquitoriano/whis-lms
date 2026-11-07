import type { Metadata } from "next";
import { site } from "@/config/site";

export const metadata: Metadata = { title: "Agreement signed", robots: { index: false, follow: false } };

// Shown after a guardian signs from the emailed link (the link itself stops working once used).
export default function SignedPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Thank you. The contract is signed.</h1>
      <p className="mt-3 text-muted">
        A PDF copy has been emailed to you. Please keep it for your records. If you have any questions, contact {site.name} at {site.contact.email}.
      </p>
    </div>
  );
}
