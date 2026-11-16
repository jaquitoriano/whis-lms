// The lesson record (change request T4): four large text boxes per lesson (Previous Lesson,
// Today's Lesson, Next Lesson, Teacher's Feedback). Shared by the editor
// (client), the class page, the lesson lists and the server action.

export const LESSON_BOXES = [
  {
    name: "previous_note",
    title: "Previous Lesson",
    hint: "Filled in from the Next Lesson box of the student's last completed class. Edit if needed.",
    template: "Material/book: \nUnit/chapter: \nPages: \nTopics: \nUnfinished activities or tasks: \n",
  },
  {
    name: "today_note",
    title: "Today's Lesson",
    template: "Material/book: \nUnit/chapter: \nPages: \nTopics covered: \nActivities completed: \nNotes: \n",
  },
  {
    name: "next_note",
    title: "Next Lesson",
    hint: "Carried into the Previous Lesson box of the student's next class.",
    template: "Material/book: \nUnit/chapter: \nPages: \nTopics to discuss: \nActivities or preparation: \n",
  },
  {
    name: "feedback_note",
    title: "Teacher's Feedback",
    template:
      "Overall performance: \nStrengths: \nAreas for improvement: \nNew vocabulary: \nGrammar corrections: \nPronunciation corrections: \n",
  },
] as const;

export type LessonBox = (typeof LESSON_BOXES)[number]["name"];
export const LESSON_BOX_NAMES = LESSON_BOXES.map((b) => b.name) as LessonBox[];
export const LESSON_NOTE_MAX = 10000;

// "Label:" lines with nothing after them. Same rule as the database's lesson_note_is_blank().
const TEMPLATE_LINE = /^[ \t]*[^:\n]{1,40}:[ \t]*$/;

// True when a box holds nothing but its template.
export function isBlankNote(note: string | null | undefined) {
  return (note ?? "").split("\n").every((l) => !l.trim() || TEMPLATE_LINE.test(l));
}

// A one-line summary for lesson lists: the topics covered, else the first line with real text.
export function noteSummary(note: string | null | undefined) {
  const text = note ?? "";
  const topics = text.match(/^[ \t]*Topics covered:[ \t]*(\S.*)$/m);
  if (topics) return topics[1].trim();
  return text.split("\n").find((l) => l.trim() && !TEMPLATE_LINE.test(l))?.trim() ?? "";
}

// A record "has notes" once Today's Lesson or Teacher's Feedback is written (Previous Lesson fills itself in).
export function hasLessonNotes(r: Partial<Record<LessonBox, string>> | null | undefined) {
  return !!r && (!isBlankNote(r.today_note) || !isBlankNote(r.feedback_note));
}

export type LessonRecord = Record<LessonBox, string> & {
  session_id: string;
  previous_session_id: string | null;
  shared_with_student: boolean;
  updated_at: string;
};
