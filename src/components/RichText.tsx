import { Fragment } from "react";

// Renders the small formatting set teachers and students use in instructions,
// answers and feedback (HW-S02): paragraphs, line breaks, "- " bullet lists,
// "1. " numbered lists, **bold**, *italic*, and bare https:// links.
// It builds React elements only. No HTML string is ever injected, so typed
// content can't run scripts.

function inline(text: string, keyBase: string) {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|https?:\/\/[^\s)]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${keyBase}-${i++}`;
    if (t.startsWith("**")) out.push(<strong key={k}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("*")) out.push(<em key={k}>{t.slice(1, -1)}</em>);
    else
      out.push(
        <a key={k} href={t} target="_blank" rel="noopener noreferrer nofollow" className="text-brand-700 underline">
          {t}
        </a>,
      );
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function RichText({ text, className = "" }: { text: string; className?: string }) {
  if (!text.trim()) return null;
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className={`space-y-2 text-sm ${className}`}>
      {blocks.map((block, bi) => {
        let lines = block.split("\n");
        // "## Heading" on the first line of a block (used in class policies)
        if (/^#{1,3}\s+/.test(lines[0])) {
          const heading = <h3 className="pt-2 text-base font-semibold">{inline(lines[0].replace(/^#{1,3}\s+/, ""), `h${bi}`)}</h3>;
          lines = lines.slice(1);
          if (lines.length === 0) return <Fragment key={bi}>{heading}</Fragment>;
          return (
            <Fragment key={bi}>
              {heading}
              <RichText text={lines.join("\n")} />
            </Fragment>
          );
        }
        if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
          return (
            <ul key={bi} className="list-disc space-y-1 pl-5">
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*[-*•]\s+/, ""), `${bi}-${li}`)}</li>
              ))}
            </ul>
          );
        }
        if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
          return (
            <ol key={bi} className="list-decimal space-y-1 pl-5">
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*\d+[.)]\s+/, ""), `${bi}-${li}`)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={bi}>
            {lines.map((l, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {inline(l, `${bi}-${li}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

export const FORMAT_HINT = "Formatting: **bold**, *italic*, lines starting with - for bullets or 1. for numbers, ## for a heading. Links work automatically.";
