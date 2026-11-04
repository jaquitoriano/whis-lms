// The three-part lesson record (LES-01..03). Shared by the editor (client) and the server action.
export const LESSON_SECTIONS = [
  {
    key: "previous",
    title: "1. Previous lesson",
    hint: "Filled in from the student's last completed class. Edit if needed.",
    fields: [
      { name: "previous_summary", label: "Summary" },
      { name: "previous_topics", label: "Topics discussed" },
      { name: "previous_performance", label: "Student's performance" },
      { name: "previous_improve", label: "Areas that need improvement" },
      { name: "previous_unfinished", label: "Unfinished activities or tasks" },
    ],
  },
  {
    key: "today",
    title: "2. Today's lesson",
    hint: "",
    fields: [
      { name: "today_objectives", label: "Lesson objectives" },
      { name: "today_topics", label: "Topics covered" },
      { name: "today_activities", label: "Activities completed" },
      { name: "today_vocab_grammar", label: "Vocabulary and grammar" },
      { name: "today_notes", label: "Additional notes" },
    ],
  },
  {
    key: "feedback",
    title: "3. Teacher's feedback",
    hint: "Shared with the student when you complete the class.",
    fields: [
      { name: "feedback_overall", label: "Overall performance" },
      { name: "feedback_strengths", label: "Strengths" },
      { name: "feedback_improve", label: "Areas for improvement" },
      { name: "feedback_corrections", label: "Grammar and vocabulary corrections" },
      { name: "feedback_pronunciation", label: "Pronunciation and fluency" },
      { name: "feedback_next", label: "Recommendations for the next lesson" },
    ],
  },
] as const;

export const LESSON_FIELDS = LESSON_SECTIONS.flatMap((s) => s.fields.map((f) => f.name));
export type LessonField = (typeof LESSON_SECTIONS)[number]["fields"][number]["name"];
export const SKILLS = ["speaking", "listening", "reading", "writing"] as const;

export type LessonRecord = Record<LessonField, string> & {
  session_id: string;
  previous_session_id: string | null;
  today_skills: string[];
  shared_with_student: boolean;
  updated_at: string;
};
