import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { site } from "@/config/site";

// Transactional email over SMTP (NOT-21). Locally this goes to Mailpit
// (http://127.0.0.1:54324); in production set SMTP_* for your provider (e.g. Resend).
let transport: Transporter | null = null;

function getTransport() {
  if (transport) return transport;
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  const port = Number(process.env.SMTP_PORT ?? 587);
  transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transport;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function siteUrl(path = "/") {
  const base = (process.env.NEXT_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return base + (path.startsWith("/") ? path : `/${path}`);
}

export async function sendNotificationEmail(to: string, n: { title: string; body: string; link: string }) {
  const t = getTransport();
  if (!t) throw new Error("SMTP is not configured");
  const url = siteUrl(n.link);
  const settings = siteUrl("/dashboard");
  await t.sendMail({
    from: process.env.EMAIL_FROM ?? `${site.name} <no-reply@localhost>`,
    to,
    subject: n.title,
    text: `${n.title}\n\n${n.body}\n\nOpen: ${url}\n\n— ${site.name}\nYou can change which emails you get in Settings: ${settings}`,
    html: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#0f172a;max-width:560px;margin:0 auto;padding:24px">
<p style="font-size:13px;color:#64748b;margin:0 0 16px">${esc(site.name)}</p>
<h1 style="font-size:18px;margin:0 0 8px">${esc(n.title)}</h1>
<p style="font-size:15px;line-height:1.5;margin:0 0 20px">${esc(n.body)}</p>
<p><a href="${esc(url)}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px">Open</a></p>
<p style="font-size:12px;color:#64748b;margin-top:32px">You can change which emails you receive in Settings after logging in.</p>
</body></html>`,
  });
}

export function emailConfigured() {
  return !!process.env.SMTP_HOST;
}

// One-off emails to people who may not have an account (a guardian signing a contract), with
// optional PDF attachments. Sent straight away rather than through the notification queue,
// because there is no notification row for someone without an account.
export async function sendDirectEmail(opts: {
  to: string;
  subject: string;
  lines: string[];
  link?: { url: string; label: string };
  attachments?: { filename: string; content: Uint8Array }[];
}) {
  const t = getTransport();
  if (!t) throw new Error("SMTP is not configured");
  const textBody = [...opts.lines, ...(opts.link ? [`${opts.link.label}: ${opts.link.url}`] : []), `— ${site.name}`].join("\n\n");
  await t.sendMail({
    from: process.env.EMAIL_FROM ?? `${site.name} <no-reply@localhost>`,
    to: opts.to,
    subject: opts.subject,
    text: textBody,
    html: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#0f172a;max-width:560px;margin:0 auto;padding:24px">
<p style="font-size:13px;color:#64748b;margin:0 0 16px">${esc(site.name)}</p>
<h1 style="font-size:18px;margin:0 0 12px">${esc(opts.subject)}</h1>
${opts.lines.map((l) => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px">${esc(l)}</p>`).join("\n")}
${opts.link ? `<p style="margin-top:20px"><a href="${esc(opts.link.url)}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px">${esc(opts.link.label)}</a></p>` : ""}
</body></html>`,
    attachments: (opts.attachments ?? []).map((a) => ({ filename: a.filename, content: Buffer.from(a.content), contentType: "application/pdf" })),
  });
}
