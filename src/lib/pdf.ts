import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { site } from "@/config/site";
import {
  attendanceLabel,
  formatDateOnly,
  invoiceStatusLabel,
  methodLabel,
  money,
  monthLabel,
  num,
} from "@/lib/billing-shared";
import type { Invoice, InvoiceItem, Payment, Statement } from "@/lib/billing";
import type { Contract, Signature } from "@/lib/contracts";
import { statusLabel } from "@/lib/sessions";
import { formatDateTime, tzLabel } from "@/lib/time";

// Invoices, receipts, monthly statements and signed contracts as real PDF files (PAY-04, CON-03).
// Uses the PDF standard Helvetica font, so nothing needs installing on the server. That font
// covers Western European characters only; anything else (e.g. Korean or Japanese names) is
// printed as "?". Swap in an embedded Unicode font (pdf-lib + fontkit) if that matters.

const A4 = { w: 595.28, h: 841.89 };
const M = 50;
const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.39, 0.45, 0.55);
const LINE = rgb(0.85, 0.87, 0.9);
const BRAND = rgb(0.11, 0.31, 0.85);

type Align = "left" | "right";
type Col = { label: string; width: number; align?: Align };

class Doc {
  pdf!: PDFDocument;
  page!: PDFPage;
  font!: PDFFont;
  bold!: PDFFont;
  y = 0;
  private ok = new Map<string, boolean>();

  static async create(title: string) {
    const d = new Doc();
    d.pdf = await PDFDocument.create();
    d.pdf.setTitle(title);
    d.pdf.setAuthor(site.name);
    d.pdf.setCreator(site.name);
    d.font = await d.pdf.embedFont(StandardFonts.Helvetica);
    d.bold = await d.pdf.embedFont(StandardFonts.HelveticaBold);
    d.addPage();
    return d;
  }

  addPage() {
    this.page = this.pdf.addPage([A4.w, A4.h]);
    this.y = A4.h - M;
  }

  ensure(h: number) {
    if (this.y - h < M + 20) this.addPage();
  }

  // Keep only characters the standard font can draw.
  clean(s: string) {
    const map: Record<string, string> = { "−": "-", "–": "-", "—": "-", "→": "->", "←": "<-", "·": "·", "\t": " " };
    let out = "";
    for (const ch of s.replace(/\r/g, "")) {
      const c = map[ch] ?? ch;
      let good = this.ok.get(c);
      if (good === undefined) {
        try {
          this.font.encodeText(c);
          good = true;
        } catch {
          good = false;
        }
        this.ok.set(c, good);
      }
      out += good ? c : "?";
    }
    return out;
  }

  width(s: string, size: number, bold = false) {
    return (bold ? this.bold : this.font).widthOfTextAtSize(this.clean(s), size);
  }

  wrap(s: string, size: number, maxW: number, bold = false) {
    const lines: string[] = [];
    for (const para of this.clean(s).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (this.width(next, size, bold) <= maxW) line = next;
        else {
          if (line) lines.push(line);
          // A single word wider than the line is cut.
          let w = word;
          while (this.width(w, size, bold) > maxW && w.length > 1) {
            let cut = w.length - 1;
            while (cut > 1 && this.width(w.slice(0, cut), size, bold) > maxW) cut--;
            lines.push(w.slice(0, cut));
            w = w.slice(cut);
          }
          line = w;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  text(s: string, { size = 10, bold = false, color = INK, x = M, align = "left" as Align, w = A4.w - 2 * M } = {}) {
    const t = this.clean(s);
    const tw = this.width(t, size, bold);
    this.page.drawText(t, { x: align === "right" ? x + w - tw : x, y: this.y - size, size, font: bold ? this.bold : this.font, color });
  }

  para(s: string, { size = 10, bold = false, color = INK, x = M, w = A4.w - 2 * M, gap = 4, indent = "" } = {}) {
    const lh = size * 1.4;
    const lines = this.wrap(s, size, w - this.width(indent, size), bold);
    lines.forEach((line, i) => {
      this.ensure(lh);
      if (indent && i === 0) this.page.drawText(this.clean(indent), { x, y: this.y - size, size, font: this.font, color });
      this.page.drawText(line, { x: x + (indent ? this.width(indent, size) : 0), y: this.y - size, size, font: bold ? this.bold : this.font, color });
      this.y -= lh;
    });
    this.y -= gap;
  }

  rule(gapAbove = 6, gapBelow = 10) {
    this.y -= gapAbove;
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: A4.w - M, y: this.y }, thickness: 0.7, color: LINE });
    this.y -= gapBelow;
  }

  space(h: number) {
    this.y -= h;
  }

  header(docTitle: string, number: string, right: [string, string][] = []) {
    this.text(site.name, { size: 16, bold: true, color: BRAND });
    this.text(docTitle.toUpperCase(), { size: 12, bold: true, align: "right" });
    this.y -= 20;
    this.text([site.contact.email, site.contact.phone].filter(Boolean).join("  ·  "), { size: 9, color: MUTED });
    this.text(number, { size: 10, align: "right" });
    this.y -= 14;
    for (const [k, v] of right) {
      this.text(`${k}: ${v}`, { size: 9, color: MUTED, align: "right" });
      this.y -= 12;
    }
    this.rule(4, 14);
  }

  keyValues(rows: [string, string][], { labelW = 120, size = 10 } = {}) {
    for (const [k, v] of rows) {
      const lines = this.wrap(v, size, A4.w - 2 * M - labelW);
      this.ensure(lines.length * size * 1.4);
      this.text(k, { size, color: MUTED });
      for (const line of lines) {
        this.page.drawText(line, { x: M + labelW, y: this.y - size, size, font: this.font, color: INK });
        this.y -= size * 1.4;
      }
      this.y -= 2;
    }
  }

  table(cols: Col[], rows: string[][], { size = 9.5 } = {}) {
    const total = cols.reduce((s, c) => s + c.width, 0);
    const scale = (A4.w - 2 * M) / total;
    const xs: number[] = [];
    cols.reduce((x, c) => (xs.push(x), x + c.width * scale), M);
    const drawRow = (cells: string[], bold: boolean, color = INK) => {
      const wrapped = cells.map((c, i) => this.wrap(c, size, cols[i].width * scale - 6, bold));
      const h = Math.max(...wrapped.map((w) => w.length)) * size * 1.35 + 4;
      this.ensure(h);
      wrapped.forEach((lines, i) => {
        lines.forEach((line, li) => {
          const w = cols[i].width * scale - 6;
          const tw = this.width(line, size, bold);
          const x = cols[i].align === "right" ? xs[i] + w - tw : xs[i];
          this.page.drawText(line, { x, y: this.y - size - li * size * 1.35, size, font: bold ? this.bold : this.font, color });
        });
      });
      this.y -= h;
    };
    drawRow(cols.map((c) => c.label), true, MUTED);
    this.page.drawLine({ start: { x: M, y: this.y + 2 }, end: { x: A4.w - M, y: this.y + 2 }, thickness: 0.5, color: LINE });
    this.y -= 2;
    for (const r of rows) drawRow(r, false);
  }

  totals(rows: [string, string, boolean?][]) {
    for (const [k, v, strong] of rows) {
      this.ensure(16);
      this.text(k, { size: 10, bold: !!strong, x: A4.w - M - 260, w: 150, color: strong ? INK : MUTED });
      this.text(v, { size: 10, bold: !!strong, x: A4.w - M - 110, w: 110, align: "right" });
      this.y -= 16;
    }
  }

  // The small formatting set used in contracts and policies: "## " headings, "- " bullets,
  // "1. " numbers, **bold** and *italic* markers (removed in print).
  markdown(src: string) {
    const strip = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*\s][^*]*)\*/g, "$1");
    for (const block of src.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
      const lines = block.split("\n");
      if (lines[0].startsWith("## ")) {
        this.ensure(30);
        this.space(4);
        this.para(strip(lines[0].slice(3)), { size: 11.5, bold: true, gap: 2 });
        lines.shift();
      }
      let buf: string[] = [];
      const flush = () => {
        if (buf.length) this.para(strip(buf.join(" ")), { gap: 6 });
        buf = [];
      };
      for (const line of lines) {
        const b = line.match(/^\s*[-*]\s+(.*)$/);
        const n = line.match(/^\s*(\d+)\.\s+(.*)$/);
        if (b) {
          flush();
          this.para(strip(b[1]), { indent: "•  ", gap: 2 });
        } else if (n) {
          flush();
          this.para(strip(n[2]), { indent: `${n[1]}.  `, gap: 2 });
        } else buf.push(line);
      }
      flush();
      this.space(2);
    }
  }

  async done(footer: string) {
    const pages = this.pdf.getPages();
    pages.forEach((p, i) => {
      const t = this.clean(`${footer}  ·  Page ${i + 1} of ${pages.length}`);
      p.drawText(t, { x: M, y: 28, size: 8, font: this.font, color: MUTED });
    });
    return this.pdf.save();
  }
}

export async function invoicePdf(inv: Invoice, items: InvoiceItem[], payments: Payment[], student: { full_name: string; email?: string | null }) {
  const d = await Doc.create(`Invoice ${inv.invoice_number}`);
  d.header("Invoice", inv.invoice_number, [
    ["Issued", formatDateOnly(inv.issue_date)],
    ["Due", formatDateOnly(inv.due_date)],
    ["Status", invoiceStatusLabel[inv.status]],
  ]);
  d.text("Bill to", { size: 9, color: MUTED });
  d.y -= 13;
  d.para(student.full_name, { bold: true, gap: 0 });
  if (student.email) d.para(student.email, { size: 9, color: MUTED });
  d.space(10);
  d.table(
    [
      { label: "Description", width: 6 },
      { label: "Qty", width: 1, align: "right" },
      { label: "Unit price", width: 2, align: "right" },
      { label: "Amount", width: 2, align: "right" },
    ],
    items.map((i) => [i.description, String(num(i.quantity)), money(i.unit_price, inv.currency), money(i.amount, inv.currency)]),
  );
  d.rule(2, 8);
  const live = payments.filter((p) => !p.voided_at);
  d.totals([
    ["Total", money(inv.total, inv.currency), true],
    ["Paid", money(inv.amount_paid, inv.currency)],
    ["Balance due", money(inv.status === "void" ? 0 : num(inv.total) - num(inv.amount_paid), inv.currency), true],
  ]);
  if (live.length) {
    d.space(10);
    d.para("Payments received", { bold: true, gap: 2 });
    d.table(
      [
        { label: "Date", width: 2 },
        { label: "Receipt", width: 2 },
        { label: "Method", width: 2 },
        { label: "Reference", width: 3 },
        { label: "Amount", width: 2, align: "right" },
      ],
      live.map((p) => [formatDateOnly(p.paid_on), p.receipt_number, methodLabel(p.method), p.reference || "—", money(p.amount, inv.currency)]),
    );
  }
  if (inv.notes) {
    d.space(10);
    d.para("Notes", { bold: true, gap: 2 });
    d.para(inv.notes);
  }
  if (inv.status === "void") {
    d.space(10);
    d.para(`This invoice was voided${inv.void_reason ? `: ${inv.void_reason}` : "."}`, { bold: true });
  }
  return d.done(`${site.name} · ${inv.invoice_number}`);
}

export async function receiptPdf(p: Payment, inv: Invoice, student: { full_name: string }) {
  const d = await Doc.create(`Receipt ${p.receipt_number}`);
  d.header("Official receipt", p.receipt_number, [["Date", formatDateOnly(p.paid_on)]]);
  d.keyValues([
    ["Received from", student.full_name],
    ["Amount", money(p.amount, inv.currency)],
    ["Payment method", methodLabel(p.method)],
    ["Reference", p.reference || "—"],
    ["For invoice", `${inv.invoice_number} (issued ${formatDateOnly(inv.issue_date)})`],
    ["Invoice balance", money(inv.status === "void" ? 0 : num(inv.total) - num(inv.amount_paid), inv.currency)],
  ]);
  if (p.voided_at) {
    d.space(12);
    d.para(`VOID. This payment was cancelled${p.void_reason ? `: ${p.void_reason}` : "."}`, { bold: true });
  }
  d.space(24);
  d.para("Thank you for your payment.", { color: MUTED });
  return d.done(`${site.name} · ${p.receipt_number}`);
}

export async function statementPdf(s: Statement, viewerTz: string) {
  const name = s.student?.full_name ?? "";
  const d = await Doc.create(`Statement ${s.key} ${name}`);
  d.header("Monthly statement", monthLabel(s.key), [["Student", name]]);
  d.totals([
    ["Opening balance", money(s.opening, s.currency)],
    ["Invoiced this month", money(s.invoiced, s.currency)],
    ["Paid this month", money(-s.paid, s.currency)],
    ["Closing balance", money(s.closing, s.currency), true],
  ]);
  d.space(10);
  d.para("Invoices", { bold: true, gap: 2 });
  if (s.invoices.length)
    d.table(
      [
        { label: "Date", width: 2 },
        { label: "Invoice", width: 3 },
        { label: "Due", width: 2 },
        { label: "Status", width: 2 },
        { label: "Amount", width: 2, align: "right" },
      ],
      s.invoices.map((i) => [formatDateOnly(i.issue_date), i.invoice_number, formatDateOnly(i.due_date), invoiceStatusLabel[i.status], money(i.total, i.currency)]),
    );
  else d.para("No invoices this month.", { color: MUTED });
  d.space(8);
  d.para("Payments", { bold: true, gap: 2 });
  if (s.payments.length)
    d.table(
      [
        { label: "Date", width: 2 },
        { label: "Receipt", width: 3 },
        { label: "Invoice", width: 3 },
        { label: "Method", width: 2 },
        { label: "Amount", width: 2, align: "right" },
      ],
      s.payments.map((p) => [formatDateOnly(p.paid_on), p.receipt_number, s.invoiceNumberOf.get(p.invoice_id) ?? "", methodLabel(p.method), money(p.amount, s.currency)]),
    );
  else d.para("No payments this month.", { color: MUTED });
  d.space(8);
  d.para(`Classes (${tzLabel(viewerTz)})`, { bold: true, gap: 2 });
  if (s.classes.length)
    d.table(
      [
        { label: "Date and time", width: 4 },
        { label: "Teacher", width: 3 },
        { label: "Class", width: 3 },
        { label: "Attendance", width: 2 },
        { label: "Used a class", width: 2, align: "right" },
      ],
      s.classes.map((c) => [
        formatDateTime(c.starts_at, viewerTz),
        c.teacher?.full_name ?? "",
        statusLabel[c.status] + (c.late_cancel ? " (late)" : ""),
        c.attendance ? attendanceLabel[c.attendance.mark] + (c.attendance.minutes_late ? ` ${c.attendance.minutes_late} min` : "") : "—",
        c.counts_as_used ? "Yes" : "No",
      ]),
    );
  else d.para("No classes this month.", { color: MUTED });
  return d.done(`${site.name} · Statement ${monthLabel(s.key)} · ${name}`);
}

export async function contractPdf(c: Contract, studentName: string, sig: Signature | null, viewerTz: string) {
  const d = await Doc.create(`${c.contract_number} ${c.title}`);
  d.header("Agreement", c.contract_number, [
    ["Student", studentName],
    ["Valid from", formatDateOnly(c.valid_from)],
    ...(c.valid_to ? ([["Valid to", formatDateOnly(c.valid_to)]] as [string, string][]) : []),
  ]);
  d.para(c.title, { size: 14, bold: true, gap: 8 });
  d.markdown(c.body);
  d.rule(8, 12);
  d.ensure(120);
  d.para("Signature", { bold: true, size: 11.5, gap: 4 });
  if (sig) {
    d.keyValues([
      ["Signed by", `${sig.signer_name} (${sig.signer_relationship === "self" ? "student" : "parent or guardian"})`],
      ["Signed on", `${formatDateTime(sig.signed_at, viewerTz, { year: "numeric" })} (${tzLabel(viewerTz)})`],
      ["Method", "Typed name and consent, signed online"],
      ["IP address", sig.ip ?? "—"],
      ["Document fingerprint", `SHA-256 ${sig.document_hash}`],
    ]);
  } else {
    d.para(c.status === "void" ? `Void${c.void_reason ? `: ${c.void_reason}` : ""}` : "Not signed yet.", { color: MUTED });
  }
  return d.done(`${site.name} · ${c.contract_number}`);
}
