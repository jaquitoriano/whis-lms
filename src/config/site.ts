// Branding placeholders. Change the school name, contact details and FAQ here;
// change colours in src/app/globals.css (--brand-* variables).
export const site = {
  name: "Bright Path English",
  shortName: "Bright Path",
  tagline: "Online English and IELTS classes with teachers who know you by name.",
  contact: {
    email: "hello@brightpath.example",
    phone: "+63 900 000 0000",
    hours: "Mon–Sat, 9:00–21:00 (Philippine time)",
    address: "Online — students in any time zone",
  },
  about: [
    "We teach one-to-one online English classes for learners at every level, from first conversations to IELTS band 8.",
    "Every student has an assigned teacher who keeps a record of each lesson, sets homework, and gives detailed feedback, so you always know what you learned and what to work on next.",
  ],
  testimonials: [
    { quote: "My Writing band went from 6.0 to 7.5 in three months. The feedback on every essay made the difference.", name: "IELTS student, Tokyo" },
    { quote: "I finally feel confident running meetings in English.", name: "Business English student, Manila" },
    { quote: "The lesson notes help my son review before every class.", name: "Parent of a young learner, Seoul" },
  ],
  faq: [
    { q: "How are classes held?", a: "Classes are live, one-to-one video lessons on Zoom or Google Meet. The link appears in your class calendar." },
    { q: "Can I try a class first?", a: "Yes. Use the trial-class form on the Contact page and we will arrange a free trial lesson." },
    { q: "How long is each class?", a: "Most classes are 50 minutes. Your exact class duration is in your course details." },
    { q: "Can I reschedule a class?", a: "Yes, within the rules in our class policies. Contact your teacher or the school office." },
    { q: "Do you prepare students for IELTS Academic and General Training?", a: "Yes. Our IELTS course covers both, with mock tests and band-score feedback for all four skills." },
  ],
} as const;

export const courseTypeLabel: Record<string, string> = {
  general_english: "General English",
  ielts: "IELTS",
  business_english: "Business English",
  other: "Other",
};
