// Progress reports (PRG-01..02) and IELTS results (PRG-03): types, scales and labels shared by
// server and client code.

// Skill levels use the CEFR scale with "+" half steps, stored as 1.0–6.0: 1 = A1, 1.5 = A1+, 2 = A2 … 6 = C2.
export const CEFR_STEPS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6] as const;
const CEFR_NAMES = ["A1", "A2", "B1", "B2", "C1", "C2"];

export function cefrLabel(x: number | string | null | undefined) {
  if (x === null || x === undefined || x === "") return "—";
  const n = Number(x);
  const base = CEFR_NAMES[Math.floor(n) - 1];
  if (!base) return "—";
  return n % 1 ? `${base}+` : base;
}

// Plain-language names, for students and parents who don't know the CEFR codes.
const CEFR_DESCRIPTIONS: Record<string, string> = {
  A1: "Beginner",
  A2: "Elementary",
  B1: "Intermediate",
  B2: "Upper intermediate",
  C1: "Advanced",
  C2: "Proficient",
};
export function cefrDescription(x: number | string | null | undefined) {
  return CEFR_DESCRIPTIONS[cefrLabel(x).replace("+", "")] ?? "";
}

export const SKILLS = [
  { key: "speaking", label: "Speaking" },
  { key: "listening", label: "Listening" },
  { key: "reading", label: "Reading" },
  { key: "writing", label: "Writing" },
  { key: "grammar", label: "Grammar" },
  { key: "vocabulary", label: "Vocabulary" },
  { key: "pronunciation", label: "Pronunciation" },
  { key: "fluency", label: "Fluency" },
] as const;
export type SkillKey = (typeof SKILLS)[number]["key"];

export type ProgressReport = {
  id: string;
  student_id: string;
  author_id: string | null;
  period_start: string;
  period_end: string;
  overall: number | null;
  summary: string;
  strengths: string;
  next_goals: string;
  status: "draft" | "published";
  published_at: string | null;
  updated_at: string;
  author?: { full_name: string } | null;
} & Record<SkillKey, number | null>;

// IELTS bands: 0–9 in 0.5 steps.
export const BAND_STEPS = Array.from({ length: 19 }, (_, i) => i / 2);
export const IELTS_SKILLS = [
  { key: "listening", label: "Listening", short: "L" },
  { key: "reading", label: "Reading", short: "R" },
  { key: "writing", label: "Writing", short: "W" },
  { key: "speaking", label: "Speaking", short: "S" },
] as const;
export type IeltsSkill = (typeof IELTS_SKILLS)[number]["key"];

export type IeltsKind = "diagnostic" | "mock" | "official";
export const IELTS_KIND_LABEL: Record<IeltsKind, string> = { diagnostic: "Diagnostic", mock: "Mock test", official: "Official test" };
export const IELTS_MODULE_LABEL = { academic: "Academic", general_training: "General Training" } as const;

export type IeltsResult = {
  id: string;
  student_id: string;
  kind: IeltsKind;
  module: keyof typeof IELTS_MODULE_LABEL;
  test_date: string;
  overall: number | null;
  notes: string;
  recorded_by: string | null;
  recorder?: { full_name: string } | null;
} & Record<IeltsSkill, number | null>;

export type IeltsGoal = { student_id: string; target_overall: number | null; exam_date: string | null };

export function fmtBand(x: number | string | null | undefined) {
  if (x === null || x === undefined || x === "") return "—";
  return Number(x).toFixed(1);
}

// The IELTS overall band: the mean of the four skills, rounded to the nearest 0.5, where .25 rounds
// up to .5 and .75 up to the next whole band. The database works this out too (the stored value
// is the one that counts); this copy lets the form show it while the teacher types.
export function overallBand(bands: (number | null | undefined)[]) {
  if (bands.length !== 4 || bands.some((b) => b === null || b === undefined || Number.isNaN(b))) return null;
  const sum = (bands as number[]).reduce((a, b) => a + b, 0);
  return Math.floor(sum / 2 + 0.5) / 2;
}

// "1 Oct – 31 Oct 2026" (period dates are plain dates, so no time zone applies).
export function formatPeriod(start: string, end: string) {
  const f = (d: string, year: boolean) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: year ? "numeric" : undefined, timeZone: "UTC" });
  return `${f(start, start.slice(0, 4) !== end.slice(0, 4))} – ${f(end, true)}`;
}

export function formatPlainDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
