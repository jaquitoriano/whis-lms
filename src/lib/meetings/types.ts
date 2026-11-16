// What the sync needs from a meeting service (Zoom, Google Meet, or the local fake).

export type MeetingInput = {
  hostEmail: string; // the teacher's Zoom user / Google Workspace address
  topic: string;
  startsAt: string; // ISO, UTC
  endsAt: string;
  timezone: string; // shown inside Zoom / Google Calendar
  autoRecord: boolean;
  requestId: string; // stable per class, so a retried create never makes two meetings in Google
};

export type CreatedMeeting = {
  externalId: string;
  joinUrl: string | null; // Google can take a moment to attach the Meet link: null = ask again later
  meetingCode?: string | null;
};

export type FoundRecording = { externalId: string; url: string; passcode: string | null; title: string };

export type MeetingRef = { hostEmail: string; externalId: string; meetingCode: string | null };

export interface MeetingService {
  label: string;
  missingConfig(): string | null; // which environment variables are missing, or null when ready
  create(m: MeetingInput): Promise<CreatedMeeting>;
  update(ref: MeetingRef, m: MeetingInput): Promise<void>;
  remove(ref: MeetingRef): Promise<void>;
  refresh(ref: MeetingRef): Promise<CreatedMeeting>;
  recordings(ref: MeetingRef): Promise<FoundRecording[]>;
}

export class MeetingError extends Error {}

// fetch with a time limit and a readable error that names the service and status.
export async function call(service: string, url: string, init: RequestInit & { okStatuses?: number[] } = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  if (res.ok || init.okStatuses?.includes(res.status)) return res;
  let detail = "";
  try {
    const body = await res.json();
    detail = body?.message ?? body?.error?.message ?? body?.error_description ?? body?.error ?? "";
  } catch {}
  throw new MeetingError(`${service} answered ${res.status}${detail ? `: ${String(detail).slice(0, 300)}` : ""}`);
}
