import Link from "next/link";
import { site } from "@/config/site";

export const metadata = { title: "About Us" };

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-3xl font-semibold">About {site.name}</h1>
      <div className="mt-6 space-y-4 text-muted">
        {site.about.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {[
          ["One-to-one", "Every lesson is with your own teacher, at a time that suits you."],
          ["Every lesson recorded", "Notes, materials and feedback from each class stay in your account."],
          ["Feedback on homework", "Teachers correct your work and explain how to improve."],
        ].map(([t, d]) => (
          <div key={t} className="card">
            <p className="font-semibold">{t}</p>
            <p className="mt-1 text-sm text-muted">{d}</p>
          </div>
        ))}
      </div>
      <Link href="/contact#trial" className="btn-primary mt-10">
        Book a free trial class
      </Link>
    </div>
  );
}
