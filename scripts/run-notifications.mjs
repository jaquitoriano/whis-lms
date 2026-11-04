// Runs the scheduled notifications job once against the local app (npm run notify).
// In production a scheduler (e.g. Vercel Cron, see vercel.json) calls the same URL.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split(/=(.*)/s).slice(0, 2)),
);
const base = process.env.BASE_URL ?? env.NEXT_SITE_URL ?? "http://localhost:3000";
const res = await fetch(`${base}/api/cron/notifications`, { headers: { authorization: `Bearer ${env.CRON_SECRET}` } });
console.log(res.status, await res.text());
process.exit(res.ok ? 0 : 1);
