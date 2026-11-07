import { formatDateOnly, money, type ContractStatus } from "@/lib/billing-shared";

// Contract merge fields (CON-01). Templates use {{field}}; values are filled in when the admin
// creates the contract, and the admin can still edit the text while it is a draft.
export const MERGE_FIELDS: { key: string; label: string }[] = [
  { key: "school_name", label: "School name" },
  { key: "student_name", label: "Student's full name" },
  { key: "signer_name", label: "Who signs (student or guardian)" },
  { key: "course_name", label: "Course" },
  { key: "package_name", label: "Package" },
  { key: "classes_total", label: "Number of classes" },
  { key: "class_minutes", label: "Class length in minutes" },
  { key: "classes_per_week", label: "Classes per week" },
  { key: "tuition", label: "Tuition with currency" },
  { key: "payment_terms", label: "Payment terms" },
  { key: "valid_from", label: "Start date" },
  { key: "valid_to", label: "End date" },
  { key: "late_cancel_hours", label: "Late-cancellation cutoff (hours)" },
  { key: "today", label: "Today's date" },
];

export function renderTemplate(body: string, values: Record<string, string>) {
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, key: string) => (key in values ? values[key] : m));
}

export function mergeValues(v: {
  schoolName: string;
  studentName: string;
  signerName: string;
  courseName: string | null;
  packageName: string | null;
  classesTotal: number | null;
  classMinutes: number | null;
  classesPerWeek: number | null;
  tuition: number | null;
  currency: string;
  paymentTerms: string;
  validFrom: string;
  validTo: string | null;
  lateCancelHours: number;
  today: string;
}): Record<string, string> {
  return {
    school_name: v.schoolName,
    student_name: v.studentName,
    signer_name: v.signerName,
    course_name: v.courseName ?? "As agreed with the School",
    package_name: v.packageName ?? "As agreed with the School",
    classes_total: v.classesTotal != null ? String(v.classesTotal) : "—",
    class_minutes: v.classMinutes != null ? String(v.classMinutes) : "—",
    classes_per_week: v.classesPerWeek ? `${v.classesPerWeek} class${v.classesPerWeek > 1 ? "es" : ""} per week` : "As agreed with the School",
    tuition: v.tuition != null ? money(v.tuition, v.currency) : "As invoiced",
    payment_terms: v.paymentTerms || "As stated on each invoice",
    valid_from: formatDateOnly(v.validFrom),
    valid_to: v.validTo ? formatDateOnly(v.validTo) : "all classes in the package are used",
    late_cancel_hours: String(v.lateCancelHours),
    today: formatDateOnly(v.today),
  };
}

export type Contract = {
  id: string;
  contract_number: string;
  student_id: string;
  enrollment_id: string | null;
  template_version: number | null;
  title: string;
  body: string;
  tuition: number | null;
  currency: string;
  payment_terms: string;
  valid_from: string;
  valid_to: string | null;
  signer_kind: "self" | "guardian";
  guardian_id: string | null;
  signer_name: string;
  signer_email: string | null;
  status: ContractStatus;
  document_hash: string | null;
  sent_at: string | null;
  signed_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
  student?: { id: string; full_name: string } | null;
};

export type Signature = {
  id: string;
  contract_id: string;
  signer_name: string;
  signer_relationship: "self" | "guardian";
  signed_by_user: string | null;
  signed_at: string;
  ip: string | null;
  user_agent: string | null;
  document_hash: string;
};

export const CONTRACT_SELECT = "*, student:profiles!contracts_student_id_fkey(id, full_name)";
