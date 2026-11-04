"use client";

import { useActionState } from "react";
import { submitInquiry } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/ui";

export function InquiryForm({ defaultCourse }: { defaultCourse?: string }) {
  const [state, action] = useActionState(submitInquiry, {});
  if (state.ok) return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="full_name">Full name</label>
          <input className="input" id="full_name" name="full_name" required maxLength={200} autoComplete="name" />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="phone">Phone (optional)</label>
          <input className="input" id="phone" name="phone" maxLength={50} autoComplete="tel" />
        </div>
        <div>
          <label className="label" htmlFor="course_type">Interested in</label>
          <select className="input" id="course_type" name="course_type" defaultValue={defaultCourse ?? ""}>
            <option value="">Not sure yet</option>
            <option value="general_english">General English</option>
            <option value="ielts">IELTS Preparation</option>
            <option value="business_english">Business English</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="message">Message (optional)</label>
        <textarea className="input min-h-28" id="message" name="message" maxLength={4000} placeholder="Your goals, level, preferred class times…" />
      </div>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="wants_trial" defaultChecked /> I&apos;d like a free trial class
      </label>
      <SubmitButton pendingText="Sending…">Send</SubmitButton>
    </form>
  );
}
