import NextLink from "next/link";
import type { ComponentProps } from "react";

// Portal link. Next.js normally loads every visible link in the background, and each of those
// requests repeats the login and access checks: one calendar page caused over 50 extra backend
// calls. Portal pages are personal and change often, so links load only when tapped.
// NavProgress gives instant feedback on the tap.
export default function Link(props: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={false} {...props} />;
}
