import { requireRole } from "@/lib/auth";
import { LessonList } from "@/components/class/LessonList";
import { PageHeader } from "@/components/ui";
import { getLessonHistory } from "@/lib/lesson-history";

export const metadata = { title: "Lesson History" };

export default async function StudentLessonsPage() {
  const { supabase, profile } = await requireRole("student");
  const rows = await getLessonHistory(supabase, { studentId: profile.id });
  return (
    <>
      <PageHeader title="Lesson history" description="Open a class to see its notes, materials and your teacher's feedback." />
      <LessonList rows={rows} viewer="student" tz={profile.timezone} empty="Your past classes will appear here." />
    </>
  );
}
