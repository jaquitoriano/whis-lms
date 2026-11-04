"use client";

import { useActionState, useEffect, useRef } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/ui";
import type { ActionState } from "@/lib/types";

// A form wired to a server action that returns ActionState, with a message area and submit button.
export function ActionForm({
  action,
  submitLabel = "Save",
  pendingText,
  className = "space-y-4",
  resetOnSuccess = false,
  children,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel?: string;
  pendingText?: string;
  className?: string;
  resetOnSuccess?: boolean;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && state.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} className={className}>
      <FormMessage state={state} />
      {children}
      <div>
        <SubmitButton pendingText={pendingText}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
