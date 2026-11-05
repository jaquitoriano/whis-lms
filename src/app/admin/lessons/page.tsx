import { requireRole } from "@/lib/auth";
import { LessonList } from "@/components/class/LessonList";
import { PageHeader, Pager, paginate } from "@/components/ui";
import { getLessonHistory } from "@/lib/lesson-history";

export const metadata = { title: "Lesson records" };

export default async function AdminLessonsPage({ searchParams }: { searchParams: Promise<{ missing?: string; page?: string }> }) {
  const { supabase, profile } = await requireRole("admin");
  const { missing, page } = await searchParams;
  let rows = await getLessonHistory(supabase, { limit: 300 });
  const missingCount = rows.filter((r) => r.status === "completed" && !(r.lesson?.feedback_overall || r.lesson?.today_topics)).length;
  if (missing) rows = rows.filter((r) => r.status === "completed" && !(r.lesson?.feedback_overall || r.lesson?.today_topics));
  const list = paginate(rows, page);
  return (
    <>
      <PageHeader
        title="Lesson records"
        description={`${missingCount} completed class${missingCount === 1 ? "" : "es"} without lesson notes.`}
        action={
          <a href={missing ? "/admin/lessons" : "/admin/lessons?missing=1"} className="btn-secondary">
            {missing ? "Show all" : "Show missing only"}
          </a>
        }
      />
      <LessonList rows={list.rows} viewer="admin" tz={profile.timezone} empty="No past classes yet." />
      <Pager {...list} base="/admin/lessons" params={{ missing }} />
    </>
  );
}
