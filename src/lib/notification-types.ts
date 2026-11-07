import type { Role } from "@/lib/types";

// Notification types each role can receive (NOT-01..16), with the label shown in Settings.
export const NOTIFICATION_TYPES: Record<Role, { type: string; label: string }[]> = {
  // Phase 5: admins hear about signatures and overdue payments only.
  admin: [
    { type: "contract_signed", label: "A student or guardian signed a contract" },
    { type: "payment_overdue", label: "Daily summary of overdue invoices" },
  ],
  teacher: [
    { type: "class_scheduled", label: "New class assigned to me" },
    { type: "class_reminder", label: "Upcoming class reminders (24 h and 1 h before)" },
    { type: "class_rescheduled", label: "A class was moved" },
    { type: "class_cancelled", label: "A class was cancelled" },
    { type: "homework_submitted", label: "A student submitted homework" },
    { type: "review_backlog", label: "Daily reminder of homework waiting more than 48 h" },
    { type: "announcement", label: "School announcements" },
    { type: "policy_updated", label: "Class policies updated" },
  ],
  student: [
    { type: "class_scheduled", label: "New class scheduled" },
    { type: "class_reminder", label: "Class reminders (24 h and 1 h before)" },
    { type: "class_rescheduled", label: "A class was moved" },
    { type: "class_cancelled", label: "A class was cancelled" },
    { type: "homework_assigned", label: "New homework" },
    { type: "homework_due_soon", label: "Homework due within 24 hours" },
    { type: "homework_reviewed", label: "Homework checked by my teacher" },
    { type: "lesson_notes", label: "Lesson notes and feedback available" },
    { type: "materials_added", label: "New learning materials" },
    { type: "announcement", label: "School announcements" },
    { type: "policy_updated", label: "Class policies updated" },
    { type: "contract_sent", label: "Enrollment agreement ready to sign" },
    { type: "contract_signed", label: "Enrollment agreement signed" },
    { type: "invoice_issued", label: "New invoice" },
    { type: "payment_reminder", label: "Payment due soon or overdue" },
    { type: "payment_received", label: "Payment received (receipt)" },
    { type: "statement_ready", label: "Monthly statement ready" },
  ],
};
