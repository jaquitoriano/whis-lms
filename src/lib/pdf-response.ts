import "server-only";
import { NextResponse } from "next/server";

// Personal documents: never cached by the browser's shared caches or a CDN.
export function pdfResponse(bytes: Uint8Array, filename: string) {
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const notFound = () => new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
