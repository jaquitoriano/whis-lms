import "server-only";
import { createSign } from "node:crypto";
import { call, type MeetingService } from "./types";

// Google Meet, through a Google Workspace service account with domain-wide delegation. Each class
// is an event in its teacher's Google Calendar with a Meet link; the service account acts as the
// teacher. Recordings are found with the Meet API and live in the teacher's Google Drive.
// Delegated scopes needed: calendar.events and meetings.space.readonly.
const SCOPES = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/meetings.space.readonly";
const CAL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

const tokens = new Map<string, { value: string; until: number }>();
const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

async function accessToken(asUser: string) {
  const cached = tokens.get(asUser);
  if (cached && cached.until > Date.now() + 60_000) return cached.value;
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, sub: asUser, scope: SCOPES, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 };
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify(claims))}`;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY!.replace(/\\n/g, "\n");
  const signature = createSign("RSA-SHA256").update(unsigned).sign(key).toString("base64url");
  const res = await call("Google", "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  const body = await res.json();
  tokens.set(asUser, { value: body.access_token, until: Date.now() + (body.expires_in ?? 3600) * 1000 });
  return body.access_token as string;
}

async function google(asUser: string, url: string, init: RequestInit & { okStatuses?: number[] } = {}) {
  return call("Google", url, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken(asUser)}`, "Content-Type": "application/json", ...init.headers },
  });
}

type GEvent = { id: string; hangoutLink?: string; conferenceData?: { conferenceId?: string } };
const fromEvent = (e: GEvent) => ({ externalId: e.id, joinUrl: e.hangoutLink ?? null, meetingCode: e.conferenceData?.conferenceId ?? null });

export const googleMeetService: MeetingService = {
  label: "Google Meet",
  missingConfig() {
    const missing = ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SERVICE_ACCOUNT_KEY"].filter((k) => !process.env[k]);
    return missing.length ? missing.join(", ") : null;
  },
  async create(m) {
    // sendUpdates=none: nobody is invited; the student joins from the class page.
    const res = await google(m.hostEmail, `${CAL}?conferenceDataVersion=1&sendUpdates=none`, {
      method: "POST",
      body: JSON.stringify({
        summary: m.topic,
        start: { dateTime: m.startsAt, timeZone: m.timezone },
        end: { dateTime: m.endsAt, timeZone: m.timezone },
        conferenceData: { createRequest: { requestId: m.requestId, conferenceSolutionKey: { type: "hangoutsMeet" } } },
      }),
    });
    return fromEvent(await res.json());
  },
  async update(ref, m) {
    await google(ref.hostEmail, `${CAL}/${encodeURIComponent(ref.externalId)}?sendUpdates=none`, {
      method: "PATCH",
      body: JSON.stringify({ summary: m.topic, start: { dateTime: m.startsAt, timeZone: m.timezone }, end: { dateTime: m.endsAt, timeZone: m.timezone } }),
    });
  },
  async remove(ref) {
    // Already deleted (404 / 410) counts as done.
    await google(ref.hostEmail, `${CAL}/${encodeURIComponent(ref.externalId)}?sendUpdates=none`, { method: "DELETE", okStatuses: [404, 410] });
  },
  async refresh(ref) {
    const res = await google(ref.hostEmail, `${CAL}/${encodeURIComponent(ref.externalId)}`);
    return fromEvent(await res.json());
  },
  async recordings(ref) {
    if (!ref.meetingCode) return [];
    const filter = encodeURIComponent(`space.meeting_code = "${ref.meetingCode}"`);
    const list = await (await google(ref.hostEmail, `https://meet.googleapis.com/v2/conferenceRecords?filter=${filter}`)).json();
    const found = [];
    for (const conf of list.conferenceRecords ?? []) {
      const recs = await (await google(ref.hostEmail, `https://meet.googleapis.com/v2/${conf.name}/recordings`)).json();
      for (const r of recs.recordings ?? []) {
        const url = r.driveDestination?.exportUri;
        if (r.state === "FILE_GENERATED" && url) found.push({ externalId: `google:${r.name}`, url, passcode: null, title: "Google Meet recording" });
      }
    }
    return found;
  },
};
