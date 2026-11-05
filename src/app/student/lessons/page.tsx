import { requireRole } from "@/lib/auth";
import { LessonList } from "@/components/class/LessonList";
import { PageHeader, Pager, paginate } from "@/components/ui";
import { getLessonHistory } from "@/lib/lesson-history";

export const metadata = { title: "Lesson History" };

export default async function StudentLessonsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { supabase, profile } = await requireRole("student");
  const { page } = await searchParams;
  const list = paginate(await getLessonHistory(supabase, { studentId: profile.id, limit: 300 }), page);
  return (
    <>
      <PageHeader title="Lesson history" description="Open a class to see its notes, materials and your teacher's feedback." />
      <LessonList rows={list.rows} viewer="student" tz={profile.timezone} empty="Your past classes will appear here." />
      <Pager {...list} base="/student/lessons" />
    </>
  );
}
