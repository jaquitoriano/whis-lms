import Link from "@/components/Link";

export const metadata = { title: "Page not found" };

// Also shown for pages the viewer isn't allowed to open, so it doesn't reveal that they exist.
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted">This page doesn&apos;t exist, or your account doesn&apos;t have access to it.</p>
      <Link href="/dashboard" className="btn-primary">
        Go to my dashboard
      </Link>
    </main>
  );
}
