import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/time";

export const metadata = { title: "Lesson Materials" };

type Row = {
  id: string;
  title: string;
  unit_chapter: string;
  pages: string;
  kind: "file" | "link";
  storage_path: string | null;
  url: string | null;
  session: { id: string; starts_at: string; status: string } | null;
};
type VideoRow = { id: string; youtube_id: string; title: string; session: { id: string; starts_at: string } | null };

// Every material and video from the student's classes in one place (VID-04).
export default async function StudentMaterialsPage() {
  const { supabase, profile } = await requireRole("student");
  const [{ data: mats }, { data: vids }] = await Promise.all([
    supabase.from("materials").select("*, session:class_sessions!inner(id, starts_at, status, student_id)").eq("session.student_id", profile.id).order("created_at", { ascending: false }).limit(200),
    supabase.from("videos").select("id, youtube_id, title, session:class_sessions!inner(id, starts_at, student_id)").eq("session.student_id", profile.id).order("created_at", { ascending: false }).limit(100),
  ]);
  const rows = (mats ?? []) as unknown as Row[];
  const videos = (vids ?? []) as unknown as VideoRow[];
  const paths = rows.filter((r) => r.kind === "file" && r.storage_path).map((r) => r.storage_path!);
  const signed = paths.length ? (await supabase.storage.from("materials").createSignedUrls(paths, 3600)).data ?? [] : [];

  return (
    <>
      <PageHeader title="Lesson materials" />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="card">
          <h2 className="mb-3 font-semibold">Files and links</h2>
          {rows.length === 0 ? (
            <EmptyState>Materials your teacher adds to your classes will appear here.</EmptyState>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {rows.map((m) => (
                <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span>
                    <a
                      href={m.kind === "file" ? signed.find((s) => s.path === m.storage_path)?.signedUrl : m.url!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {m.title}
                    </a>
                    <span className="text-muted"> {[m.unit_chapter, m.pages].filter(Boolean).join(" · ")}</span>
                  </span>
                  {m.session && (
                    <Link href={`/student/classes/${m.session.id}`} className="text-xs text-muted hover:text-foreground">
                      {formatDateTime(m.session.starts_at, profile.timezone, { hour: undefined, minute: undefined })}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <h2 className="mb-3 font-semibold">Videos</h2>
          {videos.length === 0 ? (
            <p className="text-sm text-muted">No videos yet.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {videos.map((v) => (
                <li key={v.id} className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`https://i.ytimg.com/vi/${v.youtube_id}/mqdefault.jpg`} alt="" width={96} height={54} className="rounded" />
                  <Link href={`/student/classes/${v.session?.id}`} className="font-medium hover:text-brand-700">
                    {v.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
