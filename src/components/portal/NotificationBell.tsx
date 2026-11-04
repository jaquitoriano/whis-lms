import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";

// Header bell with unread count (NOT-20).
export async function NotificationBell({ role }: { role: Role }) {
  if (role === "admin") return null;
  const supabase = await createClient();
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  const n = count ?? 0;
  return (
    <Link
      href={`/${role}/notifications`}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100"
      aria-label={n ? `Notifications, ${n} unread` : "Notifications"}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {n > 0 && (
        <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] font-semibold leading-5 text-white">
          {n > 99 ? "99+" : n}
        </span>
      )}
    </Link>
  );
}
