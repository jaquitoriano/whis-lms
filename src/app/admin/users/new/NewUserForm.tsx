"use client";

import { useActionState, useState } from "react";
import { createUser } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/ui";

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(14));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export function NewUserForm({ defaultRole }: { defaultRole: string }) {
  const [state, action] = useActionState(createUser, {});
  const [password, setPassword] = useState(generatePassword);
  return (
    <form action={action} className="card max-w-xl space-y-4">
      <FormMessage state={state} />
      <div>
        <label className="label" htmlFor="role">Role</label>
        <select className="input" id="role" name="role" defaultValue={defaultRole}>
          <option value="student">Student</option>
          <option value="teacher">Teacher</option>
          <option value="admin">Administrator</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="full_name">Full name</label>
        <input className="input" id="full_name" name="full_name" required />
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" required />
      </div>
      <div>
        <label className="label" htmlFor="password">Temporary password</label>
        <div className="flex gap-2">
          <input className="input font-mono" id="password" name="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} required />
          <button type="button" className="btn-secondary shrink-0" onClick={() => setPassword(generatePassword())}>
            New
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">Copy this now and share it with the person securely. They can change it after logging in.</p>
      </div>
      <SubmitButton pendingText="Creating…">Create account</SubmitButton>
    </form>
  );
}
