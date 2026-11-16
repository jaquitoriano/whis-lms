import "server-only";
import { call, MeetingError, type MeetingService } from "./types";

// Zoom, through a Server-to-Server OAuth app in the school's Zoom account. Each class is created
// under its teacher's licensed Zoom user, so classes at the same time never clash.
// App scopes needed: meeting write/update/delete and cloud recording read (admin level).
const API = "https://api.zoom.us/v2";

let token: { value: string; until: number } | null = null;

async function accessToken() {
  if (token && token.until > Date.now() + 60_000) return token.value;
  const { ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET } = process.env;
  const res = await call("Zoom", `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(ZOOM_ACCOUNT_ID!)}`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString("base64")}` },
  });
  const body = await res.json();
  token = { value: body.access_token, until: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return token.value;
}

async function zoom(path: string, init: RequestInit & { okStatuses?: number[] } = {}) {
  return call("Zoom", `${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", ...init.headers },
  });
}

const minutes = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 60000);
// Zoom wants UTC as yyyy-MM-ddTHH:mm:ssZ (no milliseconds).
const zoomTime = (iso: string) => new Date(iso).toISOString().replace(/\.\d{3}Z$/, "Z");

export const zoomService: MeetingService = {
  label: "Zoom",
  missingConfig() {
    const missing = ["ZOOM_ACCOUNT_ID", "ZOOM_CLIENT_ID", "ZOOM_CLIENT_SECRET"].filter((k) => !process.env[k]);
    return missing.length ? missing.join(", ") : null;
  },
  async create(m) {
    const res = await zoom(`/users/${encodeURIComponent(m.hostEmail)}/meetings`, {
      method: "POST",
      body: JSON.stringify({
        topic: m.topic,
        type: 2, // one scheduled meeting per class
        start_time: zoomTime(m.startsAt),
        duration: minutes(m.startsAt, m.endsAt),
        timezone: m.timezone,
        settings: { join_before_host: false, waiting_room: true, auto_recording: m.autoRecord ? "cloud" : "none" },
      }),
    });
    const body = await res.json();
    if (!body.id || !body.join_url) throw new MeetingError("Zoom did not return a meeting link");
    return { externalId: String(body.id), joinUrl: body.join_url };
  },
  async update(ref, m) {
    await zoom(`/meetings/${encodeURIComponent(ref.externalId)}`, {
      method: "PATCH",
      body: JSON.stringify({ topic: m.topic, start_time: zoomTime(m.startsAt), duration: minutes(m.startsAt, m.endsAt), timezone: m.timezone }),
    });
  },
  async remove(ref) {
    // Already gone (404) counts as done.
    await zoom(`/meetings/${encodeURIComponent(ref.externalId)}?schedule_for_reminder=false`, { method: "DELETE", okStatuses: [404] });
  },
  async refresh(ref) {
    const body = await (await zoom(`/meetings/${encodeURIComponent(ref.externalId)}`)).json();
    return { externalId: ref.externalId, joinUrl: body.join_url ?? null };
  },
  async recordings(ref) {
    const res = await zoom(`/meetings/${encodeURIComponent(ref.externalId)}/recordings`, { okStatuses: [404] });
    if (res.status === 404) return []; // not recorded, or not processed yet
    const body = await res.json();
    if (!body.share_url) return [];
    return [{ externalId: `zoom:${body.uuid ?? ref.externalId}`, url: body.share_url, passcode: body.password || body.recording_play_passcode || null, title: "Zoom recording" }];
  },
};
