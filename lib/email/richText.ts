/**
 * Rich text for marketing emails. The composer's editor (Tiptap) saves the message as JSON;
 * this turns it into email-safe HTML: inline styles only (Gmail drops <style>), a table for the
 * quote (Outlook ignores borders on most blocks), escaped text, and only web, mail and phone
 * links. Older campaigns saved plain text ("blank line between paragraphs") and still render
 * the old way. Runs in Convex (the real send) and in the browser (the live preview).
 */
import { EMAIL_COLORS as C, escapeEmailText, paragraph } from "./layout";

export type RichMark = { type: string; attrs?: Record<string, unknown> };
export type RichNode = { type: string; attrs?: Record<string, unknown>; content?: RichNode[]; text?: string; marks?: RichMark[] };

const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

/** True when the message was written in the rich editor (saved as Tiptap JSON). */
export function isRichBody(body: string | undefined | null): boolean {
  return typeof body === "string" && body.trimStart().startsWith('{"type":"doc"');
}

export function parseRichBody(body: string): RichNode | null {
  try {
    const doc = JSON.parse(body) as RichNode;
    return doc && doc.type === "doc" && Array.isArray(doc.content) ? doc : null;
  } catch {
    return null;
  }
}

/** A plain-text message (the old format) as a rich document, so it opens in the editor. */
export function plainTextToDoc(text: string): RichNode {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const lines = p.split("\n");
      const content: RichNode[] = [];
      lines.forEach((line, i) => {
        if (i > 0) content.push({ type: "hardBreak" });
        if (line) content.push({ type: "text", text: line });
      });
      return { type: "paragraph", content };
    });
  return { type: "doc", content: paragraphs.length ? paragraphs : [{ type: "paragraph" }] };
}

function textOf(node: RichNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  const inner = (node.content ?? []).map(textOf);
  // Containers put each child on its own line; a paragraph or heading is one line of inline text
  const container = ["listItem", "blockquote", "bulletList", "orderedList", "doc"].includes(node.type);
  return container ? inner.join("\n") : inner.join("");
}

/** The message as plain text, whichever format it was saved in. */
export function bodyPlainText(body: string): string {
  if (!isRichBody(body)) return body.trim();
  const doc = parseRichBody(body);
  return doc ? textOf(doc).replace(/\n{3,}/g, "\n\n").trim() : "";
}

/** Whether there is any message at all (an empty editor still saves a little JSON). */
export function bodyHasText(body: string | undefined | null): boolean {
  return Boolean(body && bodyPlainText(body).trim());
}

const safeHref = (href: unknown): string | null => {
  if (typeof href !== "string") return null;
  const value = href.trim();
  return /^(https?:\/\/|mailto:|tel:)[^\s"'<>]+$/i.test(value) ? value : null;
};

const LINK_STYLE = `color:${C.brand};text-decoration:underline;font-weight:600;`;

function inline(nodes: RichNode[] | undefined): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === "hardBreak") return "<br />";
      if (node.type !== "text") return inline(node.content);
      let html = escapeEmailText(node.text ?? "");
      let href: string | null = null;
      for (const mark of node.marks ?? []) {
        if (mark.type === "bold") html = `<strong style="font-weight:700;color:${C.ink};">${html}</strong>`;
        else if (mark.type === "italic") html = `<em>${html}</em>`;
        else if (mark.type === "underline") html = `<u>${html}</u>`;
        else if (mark.type === "strike") html = `<s>${html}</s>`;
        else if (mark.type === "link") href = safeHref(mark.attrs?.href);
      }
      return href ? `<a href="${escapeEmailText(href)}" target="_blank" style="${LINK_STYLE}">${html}</a>` : html;
    })
    .join("");
}

/** The text inside a list item or quote: its paragraphs joined by line breaks, no margins. */
function innerBlocks(nodes: RichNode[] | undefined, color: string): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === "paragraph") return inline(node.content);
      if (node.type === "bulletList" || node.type === "orderedList") return list(node, color, true);
      return inline(node.content);
    })
    .filter(Boolean)
    .join("<br />");
}

function list(node: RichNode, color: string = C.text, nested = false): string {
  const tag = node.type === "orderedList" ? "ol" : "ul";
  const start = tag === "ol" && Number(node.attrs?.start) > 1 ? ` start="${Number(node.attrs?.start)}"` : "";
  const items = (node.content ?? [])
    .map((li) => `<li style="margin:0 0 8px;padding-left:2px;">${innerBlocks(li.content, color)}</li>`)
    .join("");
  const margin = nested ? "margin:8px 0 0;" : "margin:0 0 18px;";
  return `<${tag}${start} style="${margin}padding-left:24px;font-family:${FONT};font-size:17px;line-height:1.6;color:${color};">${items}</${tag}>`;
}

function block(node: RichNode): string {
  switch (node.type) {
    case "paragraph": {
      const html = inline(node.content);
      // An empty line in the editor is just spacing; paragraphs already have their own
      return html.replace(/<br \/>/g, "").trim() ? paragraph(html) : "";
    }
    case "heading": {
      const html = inline(node.content);
      if (!html.trim()) return "";
      const level = Number(node.attrs?.level) === 3 ? 3 : 2;
      return level === 2
        ? `<h2 style="margin:28px 0 12px;font-family:${FONT};font-size:21px;line-height:1.3;font-weight:700;color:${C.ink};">${html}</h2>`
        : `<h3 style="margin:22px 0 10px;font-family:${FONT};font-size:18px;line-height:1.35;font-weight:700;color:${C.ink};">${html}</h3>`;
    }
    case "bulletList":
    case "orderedList":
      return list(node);
    case "blockquote": {
      const html = innerBlocks(node.content, C.ink);
      if (!html.trim()) return "";
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr><td style="border-left:4px solid ${C.lime};padding:4px 0 4px 18px;font-family:${FONT};font-size:18px;line-height:1.6;font-style:italic;color:${C.ink};">${html}</td></tr></table>`;
    }
    case "horizontalRule":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 26px;"><tr><td style="border-top:1px solid ${C.line};font-size:1px;line-height:1px;">&nbsp;</td></tr></table>`;
    default:
      // Anything the editor shouldn't produce: keep its words, drop its formatting
      return node.content?.length ? paragraph(inline(node.content)) : "";
  }
}

/** The message as email HTML. Plain-text messages (older campaigns) render exactly as before. */
export function renderEmailBody(body: string): string {
  if (isRichBody(body)) {
    const doc = parseRichBody(body);
    if (doc) return (doc.content ?? []).map(block).join("");
  }
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => paragraph(escapeEmailText(p).replace(/\n/g, "<br />")))
    .join("");
}
