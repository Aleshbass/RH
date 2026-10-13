"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Check, Copy, Info, AlertTriangle, Lightbulb, ArrowUpRight } from "lucide-react";

// Card & Cards
export function Cards({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-6">{children}</div>;
}

export function Card({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: React.ReactNode;
}) {
  const content = (
    <div className="h-full p-5 rounded-2xl bg-white/80 hover:bg-white border border-[#002e2c]/10 hover:border-[#005b57]/30 shadow-xs hover:shadow-md transition-all group flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h4 className="text-sm font-semibold text-[#002e2c] group-hover:text-[#005b57] transition-colors">
            {title}
          </h4>
          {href && (
            <ArrowUpRight className="w-4 h-4 text-[#52706e] group-hover:text-[#005b57] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          )}
        </div>
        <div className="text-xs text-[#4a6866] leading-relaxed">{children}</div>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block no-underline">
        {content}
      </Link>
    );
  }
  return content;
}

// Callout
export function Callout({
  type = "info",
  title,
  children,
}: {
  type?: "info" | "tip" | "warn" | "warning" | "error" | "important";
  title?: string;
  children: React.ReactNode;
}) {
  let icon = <Info className="w-4 h-4 text-[#005b57] flex-shrink-0 mt-0.5" />;
  let borderClass = "border-[#005b57]/25 bg-white/70";

  if (type === "tip") {
    icon = <Lightbulb className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />;
    borderClass = "border-emerald-500/30 bg-emerald-50/50";
  } else if (type === "warn" || type === "warning" || type === "important") {
    icon = <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />;
    borderClass = "border-amber-500/30 bg-amber-50/50";
  } else if (type === "error") {
    icon = <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />;
    borderClass = "border-rose-500/30 bg-rose-50/50";
  }

  return (
    <div className={`p-4 rounded-2xl border ${borderClass} my-4 shadow-xs flex items-start gap-3`}>
      {icon}
      <div className="text-xs leading-relaxed text-[#1b3a38] flex-1">
        {title && <div className="font-semibold text-[#002e2c] mb-1">{title}</div>}
        <div>{children}</div>
      </div>
    </div>
  );
}

// Blockquote with support for GitHub-style alerts ("> [!NOTE]", "> [!TIP]", "> [!IMPORTANT]",
// "> [!WARNING]", "> [!CAUTION]"), which would otherwise render the marker literally.
const ALERT_MARKER = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i;
const ALERT_TYPES: Record<string, "info" | "tip" | "important" | "warning" | "error"> = {
  NOTE: "info",
  TIP: "tip",
  IMPORTANT: "important",
  WARNING: "warning",
  CAUTION: "error",
};

export function Blockquote({ children, className, ...props }: React.HTMLAttributes<HTMLQuoteElement>) {
  const items = React.Children.toArray(children);
  const firstIndex = items.findIndex((child) => React.isValidElement(child));
  const first = firstIndex >= 0 ? (items[firstIndex] as React.ReactElement<{ children?: React.ReactNode }>) : null;
  const firstChildren = first ? React.Children.toArray(first.props.children) : [];
  const lead = firstChildren[0];

  if (first && typeof lead === "string") {
    const match = lead.match(ALERT_MARKER);
    if (match) {
      const kind = match[1].toUpperCase();
      const rest = lead.slice(match[0].length);
      const strippedFirst = React.cloneElement(first, undefined, ...(rest ? [rest] : []), ...firstChildren.slice(1));
      return (
        <Callout type={ALERT_TYPES[kind]}>
          {[...items.slice(0, firstIndex), strippedFirst, ...items.slice(firstIndex + 1)]}
        </Callout>
      );
    }
  }

  return (
    <blockquote
      className={`border-l-4 border-[#005b57] pl-4 italic text-[#4a6866] my-4 bg-white/40 py-2 rounded-r-xl ${className || ""}`}
      {...props}
    >
      {children}
    </blockquote>
  );
}

// Steps & Step
export function Steps({ children }: { children: React.ReactNode }) {
  return <div className="space-y-6 my-6 border-l-2 border-[#005b57]/20 ml-3 pl-6">{children}</div>;
}

export function Step({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <div className="absolute -left-[31px] top-0 w-4 h-4 rounded-full bg-[#005b57] border-2 border-[#FAF6E7]" />
      {title && <h4 className="text-sm font-semibold text-[#002e2c] mb-2">{title}</h4>}
      <div className="text-xs text-[#2d4d4b] leading-relaxed">{children}</div>
    </div>
  );
}

// Tabs & Tab
export function Tabs({
  items,
  children,
}: {
  items: string[];
  children: React.ReactNode;
}) {
  const [activeIdx, setActiveIdx] = useState(0);

  return (
    <div className="my-6 rounded-2xl border border-[#002e2c]/15 overflow-hidden bg-white/60 shadow-xs">
      {/* Tab bar */}
      <div className="flex items-center gap-1 p-1.5 bg-[#FAF6E7] border-b border-[#002e2c]/10 overflow-x-auto">
        {items.map((label, idx) => (
          <button
            key={label}
            onClick={() => setActiveIdx(idx)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              activeIdx === idx
                ? "bg-white text-[#002e2c] font-semibold shadow-xs"
                : "text-[#52706e] hover:text-[#002e2c]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="p-4">{React.Children.toArray(children)[activeIdx]}</div>
    </div>
  );
}

export function Tab({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

function extractText(node: any): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (!node) return "";
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (node.props?.children) return extractText(node.props.children);
  return "";
}

// Pre / CodeBlock with Copy Button
export function PreCode({
  children,
  className,
  title,
  ...rest
}: React.HTMLAttributes<HTMLPreElement>) {
  const [copied, setCopied] = useState(false);
  const textContent = extractText(children);

  // fumadocs' rehype-code passes an `icon` SVG string through to <pre>; it is not a valid DOM attribute.
  const props: Record<string, unknown> = { ...rest };
  delete props.icon;

  const dataLang = (props as any)["data-language"];
  let detectedLang = dataLang;
  if (!detectedLang && className) {
    const match = className.match(/language-(\w+)/);
    if (match) detectedLang = match[1];
  }
  if (!detectedLang && React.isValidElement(children)) {
    const childProps = (children as any).props || {};
    detectedLang =
      childProps["data-language"] ||
      (childProps.className && childProps.className.match(/language-(\w+)/)?.[1]);
  }
  // Prefer an explicit ```lang title="..." label; fall back to the language when it is known.
  const displayLabel = title || (detectedLang ? String(detectedLang).toUpperCase() : "");

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="relative group my-5 rounded-2xl overflow-hidden border border-[#002e2c]/15 bg-[#12141A] text-zinc-100 shadow-md">
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-950/80 border-b border-white/5 text-[11px] font-mono text-zinc-400">
        <span className="font-semibold text-teal-400 tracking-wider text-[10px] truncate pr-2">{displayLabel}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-zinc-400 hover:text-white px-2 py-0.5 rounded-md hover:bg-white/10 transition cursor-pointer"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre
        className={`p-4 overflow-x-auto text-xs font-mono leading-relaxed shiki ${className || ""}`}
        {...(props as React.HTMLAttributes<HTMLPreElement>)}
      >
        {children}
      </pre>
    </div>
  );
}

// Clean Apple-styled Table wrapper
export function TableWrapper({ children, ...props }: { children?: React.ReactNode; [key: string]: any }) {
  return (
    <div className="my-6 rounded-2xl border border-[#002e2c]/15 overflow-hidden bg-white/70 shadow-xs" {...props}>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs text-[#1b3a38]">
          {children}
        </table>
      </div>
    </div>
  );
}

// Accordions & Accordion
export function Accordions({ children }: { children: React.ReactNode }) {
  return <div className="space-y-2 my-4">{children}</div>;
}

export function Accordion({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-[#002e2c]/15 rounded-2xl overflow-hidden bg-white/70">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left px-4 py-3 text-xs font-semibold text-[#002e2c] flex items-center justify-between hover:bg-white transition"
      >
        <span>{title}</span>
        <span className="text-[#52706e]">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="p-4 pt-1 text-xs text-[#2d4d4b] leading-relaxed border-t border-[#002e2c]/10">{children}</div>}
    </div>
  );
}

// TypeTable placeholder
export function TypeTable({ type }: { type: any }) {
  return null;
}

// Fumadocs MDX CodeBlockTab family
export function CodeBlock({ children, ...props }: any) {
  return <div {...props}>{children}</div>;
}

export function CodeBlockTab({ children, ...props }: any) {
  return <div {...props}>{children}</div>;
}

export function CodeBlockTabs({ children, ...props }: any) {
  return (
    <div className="my-6 rounded-2xl border border-[#002e2c]/15 overflow-hidden bg-[#12141A] shadow-md" {...props}>
      {children}
    </div>
  );
}

export function CodeBlockTabsList({ children, ...props }: any) {
  return (
    <div className="flex items-center gap-1 p-2 bg-zinc-950/80 border-b border-white/5 overflow-x-auto text-xs" {...props}>
      {children}
    </div>
  );
}

export function CodeBlockTabsTrigger({ children, ...props }: any) {
  return (
    <button
      type="button"
      className="px-3 py-1 rounded-lg text-xs font-mono font-medium text-zinc-400 hover:text-white data-[state=active]:bg-white/10 data-[state=active]:text-white transition-all"
      {...props}
    >
      {children}
    </button>
  );
}

export const Pre = PreCode;
