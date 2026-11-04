"use client";

import { useActionState } from "react";
import { updatePassword } from "../actions";
import { AuthCard } from "../AuthCard";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/ui";

export default function ResetPasswordPage() {
  const [state, action] = useActionState(updatePassword, {});
  return (
    <AuthCard title="Choose a new password">
      <form action={action} className="space-y-4">
        <FormMessage state={state} />
        <div>
          <label className="label" htmlFor="password">New password</label>
          <input className="input" id="password" name="password" type="password" minLength={10} required autoComplete="new-password" />
        </div>
        <div>
          <label className="label" htmlFor="confirm">Confirm new password</label>
          <input className="input" id="confirm" name="confirm" type="password" minLength={10} required autoComplete="new-password" />
        </div>
        <SubmitButton className="btn-primary w-full">Save password</SubmitButton>
      </form>
    </AuthCard>
  );
}
