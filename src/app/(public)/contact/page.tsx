import { site } from "@/config/site";
import { InquiryForm } from "./InquiryForm";

export const metadata = { title: "Contact Us" };

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  const { course } = await searchParams;
  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-4 py-14 md:grid-cols-[1fr_1.4fr]">
      <div>
        <h1 className="text-3xl font-semibold">Contact us</h1>
        <dl className="mt-6 space-y-4 text-sm">
          <div>
            <dt className="text-muted">Email</dt>
            <dd className="font-medium">{site.contact.email}</dd>
          </div>
          <div>
            <dt className="text-muted">Phone</dt>
            <dd className="font-medium">{site.contact.phone}</dd>
          </div>
          <div>
            <dt className="text-muted">Office hours</dt>
            <dd className="font-medium">{site.contact.hours}</dd>
          </div>
          <div>
            <dt className="text-muted">Where</dt>
            <dd className="font-medium">{site.contact.address}</dd>
          </div>
        </dl>
      </div>
      <div id="trial" className="card scroll-mt-24">
        <h2 className="text-xl font-semibold">Book a trial class or ask a question</h2>
        <p className="mb-4 mt-1 text-sm text-muted">We reply within one working day.</p>
        <InquiryForm defaultCourse={course} />
      </div>
    </div>
  );
}
