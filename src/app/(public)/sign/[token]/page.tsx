import type { Metadata } from "next";
import { RichText } from "@/components/RichText";
import { SignForm } from "@/components/contract/SignForm";
import { lookupSignToken } from "@/lib/contract-sign";
import { signWithToken } from "@/lib/contract-actions";
import { formatDateOnly } from "@/lib/billing-shared";
import { site } from "@/config/site";

export const dynamic = "force-dynamic";
// The link is a secret: keep it out of search engines and other sites' logs.
export const metadata: Metadata = { title: "Sign your agreement", robots: { index: false, follow: false }, referrer: "no-referrer" };

// CON-02: a minor's parent or guardian signs here from the emailed one-time link, without an account.
export default async function GuardianSignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await lookupSignToken(token);
  if (!found) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">This link doesn&apos;t work any more</h1>
        <p className="mt-3 text-muted">
          It may have expired, been replaced by a newer link, or the agreement is already signed. Please contact {site.name} at {site.contact.email} for a new link.
        </p>
      </div>
    );
  }
  const c = found.contract;
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-sm text-muted">{site.name}</p>
      <h1 className="mt-1 text-2xl font-semibold">{c.title}</h1>
      <p className="mt-1 text-sm text-muted">
        {c.contract_number} · for {c.student?.full_name} · valid {formatDateOnly(c.valid_from)} – {c.valid_to ? formatDateOnly(c.valid_to) : "until the classes are used"}
      </p>
      <p className="mt-4 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
        Hello {c.signer_name}. Please read the agreement for {c.student?.full_name} and sign it below. This link works until {formatDateOnly(found.expiresAt)}.
      </p>
      <div className="card mt-6">
        <RichText text={c.body} />
      </div>
      <div className="card mt-6">
        <h2 className="font-semibold">Sign as parent or guardian</h2>
        <SignForm action={signWithToken.bind(null, token)} signerLabel="Type your full name to sign" placeholder={c.signer_name} />
      </div>
    </div>
  );
}
