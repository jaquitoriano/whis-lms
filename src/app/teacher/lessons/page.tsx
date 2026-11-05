import { requireRole } from "@/lib/auth";
import { LessonList } from "@/components/class/LessonList";
import { PageHeader, Pager, paginate } from "@/components/ui";
import { getLessonHistory } from "@/lib/lesson-history";

export const metadata = { title: "Lesson Records" };

export default async function TeacherLessonsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { supabase, profile } = await requireRole("teacher");
  const { page } = await searchParams;
  const rows = await getLessonHistory(supabase, { teacherId: profile.id, limit: 300 });
  const list = paginate(rows, page);
  const missing = rows.filter((r) => r.status === "completed" && !(r.lesson?.feedback_overall || r.lesson?.today_topics)).length;
  return (
    <>
      <PageHeader title="Lesson records" description={missing ? `${missing} completed class${missing > 1 ? "es need" : " needs"} lesson notes.` : "All your past classes."} />
      <LessonList rows={list.rows} viewer="teacher" tz={profile.timezone} empty="No past classes yet." />
      <Pager {...list} base="/teacher/lessons" />
    </>
  );
}
