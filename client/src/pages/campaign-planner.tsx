import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Plus, Trash2, ChevronLeft, Target, ShieldCheck, Copy, Check, Lightbulb, Users, BarChart3, Layers, Rocket, Eye, CalendarDays, FileDown, CircleCheck, CircleX, FileText, Video, Monitor, Mail, Globe, Pencil, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { authFetch } from "@/lib/queryClient";
import { motion, AnimatePresence } from "framer-motion";
import TopNav from "@/components/top-nav";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  grounded?: boolean;
}

interface Conversation {
  id: number;
  title: string;
  agent: string;
  createdAt: string;
  messages?: Message[];
}

interface BudgetItem {
  name: string;
  pct: number;
}

const VIOLET_SHADES = [
  "hsl(270, 60%, 55%)",
  "hsl(260, 55%, 50%)",
  "hsl(280, 50%, 60%)",
  "hsl(250, 60%, 45%)",
  "hsl(275, 45%, 65%)",
  "hsl(265, 50%, 55%)",
  "hsl(285, 55%, 50%)",
  "hsl(255, 45%, 60%)",
];

function parseBudgetData(text: string): BudgetItem[] | null {
  const match = text.match(/<!-- BUDGET:(.*?) -->/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (parsed.items && Array.isArray(parsed.items) && parsed.items.length > 0) {
      return parsed.items;
    }
  } catch {}
  return null;
}

function parseReadinessScore(text: string): number | null {
  const match = text.match(/<!-- SCORE:(\d+) -->/);
  if (!match) return null;
  const score = parseInt(match[1], 10);
  return score >= 0 && score <= 100 ? score : null;
}

interface ChecklistItem {
  label: string;
  passed: boolean;
  reason: string;
}

function parseChecklist(text: string): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const lines = text.split("\n");
  for (const line of lines) {
    const checkMatch = line.match(/^[-\s]*(✅|❌)\s*(.+?)(?:\s*[—–-]\s*(.+))?$/);
    if (checkMatch) {
      items.push({
        passed: checkMatch[1] === "✅",
        label: checkMatch[2].trim(),
        reason: checkMatch[3]?.trim() || "",
      });
    }
  }
  return items;
}

function stripHiddenMarkers(text: string): string {
  return text.replace(/<!-- BUDGET:.*? -->/g, "").replace(/<!-- SCORE:\d+ -->/g, "");
}

function BudgetChart({ items }: { items: BudgetItem[] }) {
  return (
    <div className="my-3 rounded-xl border border-violet-500/20 bg-card/60 p-4" data-testid="chart-budget-allocation">
      <div className="text-xs font-semibold mb-3 text-violet-300">Budget Allocation</div>
      <ResponsiveContainer width="100%" height={items.length * 40 + 20}>
        <BarChart data={items} layout="vertical" margin={{ left: 10, right: 30, top: 0, bottom: 0 }}>
          <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={100} tick={{ fill: "hsl(var(--foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(value: number) => [`${value}%`, "Allocation"]} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
          <Bar dataKey="pct" radius={[0, 6, 6, 0]} barSize={20}>
            {items.map((_, i) => (
              <Cell key={i} fill={VIOLET_SHADES[i % VIOLET_SHADES.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ReadinessScore({ score, checklist }: { score: number; checklist: ChecklistItem[] }) {
  const circumference = 2 * Math.PI * 42;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 75 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-red-400";
  const strokeColor = score >= 75 ? "stroke-emerald-400" : score >= 50 ? "stroke-amber-400" : "stroke-red-400";

  return (
    <div className="my-3 rounded-xl border border-violet-500/20 bg-card/60 p-4" data-testid="card-readiness-score">
      <div className="text-xs font-semibold mb-3 text-violet-300">Campaign Readiness Score</div>
      <div className="flex items-start gap-5">
        <div className="relative shrink-0">
          <svg width="100" height="100" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" opacity="0.3" />
            <circle cx="50" cy="50" r="42" fill="none" className={strokeColor} strokeWidth="6" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} transform="rotate(-90 50 50)" style={{ transition: "stroke-dashoffset 1s ease-out" }} />
          </svg>
          <div className={`absolute inset-0 flex items-center justify-center ${color}`}>
            <span className="text-2xl font-bold">{score}</span>
          </div>
        </div>
        {checklist.length > 0 && (
          <div className="flex-1 space-y-1.5 pt-1">
            {checklist.map((item, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                {item.passed ? (
                  <CircleCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <CircleX className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <span className="font-medium">{item.label}</span>
                  {item.reason && <span className="text-muted-foreground ml-1">— {item.reason}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function renderMarkdown(text: string) {
  const cleaned = stripHiddenMarkers(text);
  const lines = cleaned.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("### ")) {
      elements.push(<h3 key={i} className="text-sm font-bold mt-3 mb-1">{line.slice(4)}</h3>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={i} className="text-sm font-bold mt-3 mb-1">{line.slice(3)}</h2>);
    } else if (line.startsWith("# ")) {
      elements.push(<h2 key={i} className="text-sm font-bold mt-3 mb-1">{line.slice(2)}</h2>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <div key={i} className="flex gap-1.5 ml-2">
          <span className="text-muted-foreground shrink-0">&bull;</span>
          <span>{renderInline(line.slice(2))}</span>
        </div>
      );
    } else if (/^\d+\.\s/.test(line)) {
      const match = line.match(/^(\d+)\.\s(.*)$/);
      if (match) {
        elements.push(
          <div key={i} className="flex gap-1.5 ml-2">
            <span className="text-muted-foreground shrink-0">{match[1]}.</span>
            <span>{renderInline(match[2])}</span>
          </div>
        );
      }
    } else if (line.startsWith("|") && line.endsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("|") && lines[i].endsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      i--;
      const headerCells = tableLines[0].split("|").filter(Boolean).map(c => c.trim());
      const dataRows = tableLines.slice(2);
      elements.push(
        <div key={i} className="overflow-x-auto my-2">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                {headerCells.map((cell, ci) => (
                  <th key={ci} className="border border-border/40 bg-muted/30 px-2 py-1 text-left font-semibold">{cell}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataRows.map((row, ri) => {
                const cells = row.split("|").filter(Boolean).map(c => c.trim());
                return (
                  <tr key={ri}>
                    {cells.map((cell, ci) => (
                      <td key={ci} className="border border-border/40 px-2 py-1">{cell}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    } else if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={i} className="bg-muted/40 rounded-lg p-2 my-1 text-xs overflow-x-auto">
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(<p key={i} className="leading-relaxed">{renderInline(line)}</p>);
    }
    i++;
  }

  return <>{elements}</>;
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i} className="bg-muted/40 px-1 rounded text-xs">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

function CopyButton({ text, msgId }: { text: string; msgId: number }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground/60 hover:text-muted-foreground"
      title={copied ? "Copied!" : "Copy response"}
      data-testid={`btn-copy-msg-${msgId}`}
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function sanitizePdfText(text: string): string {
  return text
    .replace(/[\u2700-\u27BF\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}]/gu, "")
    .replace(/[^\x00-\x7F\xA0-\xFF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g, "")
    .replace(/\u2013/g, "-").replace(/\u2014/g, " - ")
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2022/g, " ").replace(/\u2026/g, "...")
    .trim();
}

function reformatForPdf(raw: string): string {
  let text = stripHiddenMarkers(raw);
  text = text.replace(/^#+\s*STEP\s+\d+\s*[:—-]?\s*/gim, "## ");
  const chatbotPhrases = [
    /\b(Let me explain|Here's the thing|I recommend|I can also|Would you like me to|Here's what I found|I don't have data for this but|Let me break this down|I'll help you|Great question)[^.]*[.!?]?\s*/gi,
    /\bDATA GAP IDENTIFIED\b[^.]*\.\s*/gi,
    /\bWould you like me to[^?]*\?\s*/gi,
  ];
  for (const pat of chatbotPhrases) {
    text = text.replace(pat, "");
  }
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/^---+$/gm, "");
  text = text.replace(/^#{4,}\s*/gm, "### ");
  text = text.replace(/\n{3,}/g, "\n\n");
  return sanitizePdfText(text);
}

function parseMarkdownTables(text: string): { before: string; table: string[][]; after: string }[] {
  const sections: { before: string; table: string[][]; after: string }[] = [];
  const lines = text.split("\n");
  let i = 0;
  let buffer: string[] = [];

  while (i < lines.length) {
    if (lines[i].startsWith("|") && lines[i].endsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("|") && lines[i].endsWith("|")) {
        if (!/^\|[\s-:|]+\|$/.test(lines[i])) {
          tableLines.push(lines[i]);
        }
        i++;
      }
      if (tableLines.length > 0) {
        const table = tableLines.map(l => l.split("|").filter(Boolean).map(c => sanitizePdfText(c.trim())));
        sections.push({ before: buffer.join("\n"), table, after: "" });
        buffer = [];
      }
    } else {
      buffer.push(lines[i]);
      i++;
    }
  }
  if (buffer.length > 0) {
    sections.push({ before: buffer.join("\n"), table: [], after: "" });
  }
  return sections;
}

const SAGE = {
  black: [0, 0, 0] as [number, number, number],
  green: [0, 214, 87] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  teal: [0, 77, 77] as [number, number, number],
  darkRow: [26, 26, 26] as [number, number, number],
  callout: [10, 61, 31] as [number, number, number],
  dimGreen: [0, 166, 92] as [number, number, number],
  gray: [51, 51, 51] as [number, number, number],
  amber: [233, 139, 91] as [number, number, number],
  cherry: [161, 56, 41] as [number, number, number],
};

function ExportPDFButton({ text, msgId }: { text: string; msgId: number }) {
  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 18;
      const contentWidth = pageWidth - margin * 2;
      const footerY = pageHeight - 10;

      const addBlackPage = () => {
        doc.setFillColor(...SAGE.black);
        doc.rect(0, 0, pageWidth, pageHeight, "F");
      };

      const addFooter = (pageNum: number) => {
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...SAGE.dimGreen);
        doc.text("Sage", margin, footerY);
        doc.setTextColor(...SAGE.green);
        doc.text("CONFIDENTIAL: INTERNAL USE ONLY", pageWidth / 2, footerY, { align: "center" });
        doc.setTextColor(...SAGE.dimGreen);
        doc.text(`${pageNum}`, pageWidth - margin, footerY, { align: "right" });
        doc.setFontSize(5.5);
        doc.text("(c) 2026 The Sage Group plc, or its licensors. All rights reserved.", pageWidth / 2, footerY + 3, { align: "center" });
      };

      const checkPage = (y: number, needed: number, pageNum: { val: number }): number => {
        if (y + needed > footerY - 8) {
          pageNum.val++;
          doc.addPage();
          addBlackPage();
          addFooter(pageNum.val);
          return 18;
        }
        return y;
      };

      const drawTableHeader = (headers: string[], colWidth: number, colCount: number, cellPadX: number, rowHeight: number, yPos: number) => {
        doc.setFillColor(...SAGE.green);
        doc.rect(margin, yPos, contentWidth, rowHeight, "F");
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...SAGE.black);
        headers.forEach((h, i) => {
          const cellX = margin + i * colWidth + cellPadX;
          const truncated = h.length > 25 ? h.slice(0, 24) + "..." : h;
          doc.text(truncated, cellX, yPos + 5);
        });
      };

      const drawTable = (headers: string[], rows: string[][], y: number, pageNum: { val: number }): number => {
        const colCount = headers.length;
        const colWidth = contentWidth / colCount;
        const cellPadX = 2;
        const rowHeight = 7;

        y = checkPage(y, rowHeight * 2, pageNum);
        drawTableHeader(headers, colWidth, colCount, cellPadX, rowHeight, y);
        y += rowHeight;

        for (let ri = 0; ri < rows.length; ri++) {
          if (y + rowHeight > footerY - 8) {
            pageNum.val++;
            doc.addPage();
            addBlackPage();
            addFooter(pageNum.val);
            y = 18;
            drawTableHeader(headers, colWidth, colCount, cellPadX, rowHeight, y);
            y += rowHeight;
          }
          const fillColor = ri % 2 === 0 ? SAGE.teal : SAGE.darkRow;
          doc.setFillColor(...fillColor);
          doc.rect(margin, y, contentWidth, rowHeight, "F");
          doc.setFontSize(8);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...SAGE.white);
          const row = rows[ri];
          for (let ci = 0; ci < colCount; ci++) {
            const cellX = margin + ci * colWidth + cellPadX;
            const val = (row[ci] || "").slice(0, 30);
            doc.text(val, cellX, y + 5);
          }
          y += rowHeight;
        }
        return y + 4;
      };

      const drawCalloutBox = (content: string, y: number, pageNum: { val: number }): number => {
        const lines = doc.splitTextToSize(content, contentWidth - 12);
        const boxHeight = lines.length * 4.5 + 8;
        y = checkPage(y, boxHeight, pageNum);
        doc.setFillColor(...SAGE.callout);
        doc.roundedRect(margin, y, contentWidth, boxHeight, 2, 2, "F");
        doc.setFillColor(...SAGE.green);
        doc.rect(margin, y, 1.5, boxHeight, "F");
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...SAGE.white);
        doc.text(lines, margin + 6, y + 6);
        return y + boxHeight + 4;
      };

      let pageNum = { val: 1 };

      addBlackPage();
      doc.setFontSize(34);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...SAGE.white);
      const titleLines = doc.splitTextToSize("Campaign Plan", contentWidth);
      doc.text(titleLines, margin, 60);
      let titleBottomY = 60 + titleLines.length * 14;

      doc.setFontSize(16);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...SAGE.white);
      doc.text("Content Intelligence Analyst", margin, titleBottomY + 5);
      titleBottomY += 16;

      doc.setFontSize(11);
      doc.setTextColor(...SAGE.green);
      const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      doc.text(dateStr, margin, titleBottomY);
      doc.text("Prepared by Content Intelligence Analyst", margin, titleBottomY + 6);

      doc.setFontSize(12);
      doc.setTextColor(...SAGE.green);
      doc.text("Sage", margin, footerY);
      doc.setFontSize(5.5);
      doc.text("(c) 2026 The Sage Group plc, or its licensors. All rights reserved.", pageWidth / 2, footerY + 3, { align: "center" });

      const reformatted = reformatForPdf(text);
      const sections = parseMarkdownTables(reformatted);
      const hasContent = sections.some(s => s.before.trim() || s.table.length > 1);

      if (!hasContent) {
        doc.save(`campaign-plan-${Date.now()}.pdf`);
        return;
      }

      pageNum.val++;
      doc.addPage();
      addBlackPage();
      addFooter(pageNum.val);
      let y = 20;

      for (const section of sections) {
        if (section.before.trim()) {
          const lines = section.before.split("\n");
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
              y += 3;
              continue;
            }

            if (trimmed.startsWith("### ")) {
              doc.setFontSize(12);
              doc.setFont("helvetica", "bold");
              const wrapped = doc.splitTextToSize(sanitizePdfText(trimmed.slice(4)), contentWidth);
              const needed = 3 + wrapped.length * 5 + 3;
              y = checkPage(y, needed, pageNum);
              y += 3;
              doc.setTextColor(...SAGE.white);
              doc.text(wrapped, margin, y);
              y += wrapped.length * 5 + 3;
            } else if (trimmed.startsWith("## ")) {
              doc.setFontSize(16);
              doc.setFont("helvetica", "bold");
              const wrapped = doc.splitTextToSize(sanitizePdfText(trimmed.slice(3)), contentWidth);
              const needed = 6 + wrapped.length * 7 + 6;
              y = checkPage(y, needed, pageNum);
              y += 6;
              doc.setTextColor(...SAGE.white);
              doc.text(wrapped, margin, y);
              y += wrapped.length * 7 + 2;
              doc.setDrawColor(...SAGE.green);
              doc.setLineWidth(0.4);
              doc.line(margin, y, margin + 60, y);
              y += 4;
            } else if (trimmed.startsWith("# ")) {
              doc.setFontSize(20);
              doc.setFont("helvetica", "bold");
              const wrapped = doc.splitTextToSize(sanitizePdfText(trimmed.slice(2)), contentWidth);
              const needed = 8 + wrapped.length * 8 + 8;
              y = checkPage(y, needed, pageNum);
              y += 8;
              doc.setTextColor(...SAGE.white);
              doc.text(wrapped, margin, y);
              y += wrapped.length * 8 + 3;
              doc.setDrawColor(...SAGE.green);
              doc.setLineWidth(0.5);
              doc.line(margin, y, margin + 80, y);
              y += 5;
            } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
              doc.setFontSize(9.5);
              doc.setFont("helvetica", "normal");
              const bulletText = sanitizePdfText(trimmed.slice(2));
              const wrapped = doc.splitTextToSize(bulletText, contentWidth - 8);
              const needed = wrapped.length * 4.2 + 1.5;
              y = checkPage(y, needed, pageNum);
              doc.setTextColor(...SAGE.white);
              doc.setFillColor(...SAGE.green);
              doc.circle(margin + 2, y - 1, 0.8, "F");
              doc.text(wrapped, margin + 6, y);
              y += needed;
            } else if (/^\d+\.\s/.test(trimmed)) {
              doc.setFontSize(9.5);
              doc.setFont("helvetica", "normal");
              const cleanLine = sanitizePdfText(trimmed);
              const numMatch = cleanLine.match(/^(\d+)\.\s(.*)$/);
              if (numMatch) {
                const wrapped = doc.splitTextToSize(numMatch[2], contentWidth - 12);
                const needed = wrapped.length * 4.2 + 1.5;
                y = checkPage(y, needed, pageNum);
                doc.setFont("helvetica", "bold");
                doc.setTextColor(...SAGE.green);
                doc.text(`${numMatch[1]}.`, margin + 2, y);
                doc.setFont("helvetica", "normal");
                doc.setTextColor(...SAGE.white);
                doc.text(wrapped, margin + 8, y);
                y += needed;
              }
            } else if (trimmed.toLowerCase().startsWith("note:") || trimmed.toLowerCase().startsWith("key insight:") || trimmed.toLowerCase().startsWith("important:")) {
              y = drawCalloutBox(sanitizePdfText(trimmed), y, pageNum);
            } else {
              doc.setFontSize(9.5);
              doc.setFont("helvetica", "normal");
              const wrapped = doc.splitTextToSize(sanitizePdfText(trimmed), contentWidth);
              const needed = wrapped.length * 4.2 + 1.5;
              y = checkPage(y, needed, pageNum);
              doc.setTextColor(...SAGE.white);
              doc.text(wrapped, margin, y);
              y += needed;
            }
          }
        }

        if (section.table.length > 1) {
          const headers = section.table[0];
          const rows = section.table.slice(1);
          y = checkPage(y, 20, pageNum);
          y = drawTable(headers, rows, y, pageNum);
        }
      }

      doc.save(`campaign-plan-${Date.now()}.pdf`);
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setExporting(false);
    }
  }, [text]);

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      className="p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground/60 hover:text-muted-foreground disabled:opacity-40"
      title={exporting ? "Exporting..." : "Download as PDF"}
      data-testid={`btn-export-pdf-${msgId}`}
    >
      <FileDown className={`h-3 w-3 ${exporting ? "animate-pulse" : ""}`} />
    </button>
  );
}

const CONTENT_TYPE_ICONS: Record<string, typeof FileText> = {
  PDF: FileText,
  Webinar: Video,
  Display: Monitor,
  Email: Mail,
  Video: Video,
  Other: Globe,
};

const OBJECTIVES = ["Awareness", "Lead Generation", "Conversion", "Retention"] as const;
const FUNNEL_STAGES = ["TOFU", "MOFU", "BOFU"] as const;
const CONTENT_TYPES = ["PDF", "Webinar", "Display", "Email", "Video", "Other"] as const;
const CONTENT_APPROACHES = [
  { value: "existing", label: "Use existing content from library" },
  { value: "new", label: "Create new content" },
  { value: "recommend", label: "Not sure — recommend based on data" },
] as const;
const TIMELINES = ["4 weeks", "8 weeks", "12 weeks", "Custom"] as const;

interface IntakeFormData {
  objective: string;
  product: string;
  market: string;
  industry: string;
  funnelStage: string;
  contentType: string;
  contentApproach: string;
  budget: string;
  timeline: string;
  additionalContext: string;
}

function buildIntakePrompt(data: IntakeFormData): string {
  const parts: string[] = [];
  parts.push(`Campaign brief:`);
  parts.push(`- Objective: ${data.objective}`);
  parts.push(`- Product: ${data.product}`);
  parts.push(`- Target Market: ${data.market}`);
  if (data.industry) parts.push(`- Industry: ${data.industry}`);
  parts.push(`- Funnel Stage: ${data.funnelStage}`);
  parts.push(`- Content Type: ${data.contentType}`);
  parts.push(`- Content Approach: ${CONTENT_APPROACHES.find(a => a.value === data.contentApproach)?.label || data.contentApproach}`);
  if (data.budget) parts.push(`- Budget Range: ${data.budget}`);
  if (data.timeline) parts.push(`- Timeline: ${data.timeline}`);
  if (data.additionalContext) parts.push(`- Additional Context: ${data.additionalContext}`);
  parts.push("");
  parts.push("Skip the Q&A phase. You have all required inputs. Proceed directly to analysis and build a complete campaign plan following the 10-section document structure.");
  return parts.join("\n");
}

function buildConvTitle(data: IntakeFormData): string {
  const parts = [data.product, data.market, `${data.funnelStage} ${data.contentType}`].filter(Boolean);
  return parts.join(" — ") || "New Campaign";
}

function getCampaignStatus(msgs: Message[] | undefined): "Draft" | "Complete" | "Exported" {
  if (!msgs || msgs.length === 0) return "Draft";
  const lastAssistant = [...(msgs || [])].reverse().find(m => m.role === "assistant");
  if (!lastAssistant) return "Draft";
  if (parseReadinessScore(lastAssistant.content) !== null) return "Complete";
  return "Draft";
}

function extractSummaryLine(msgs: Message[] | undefined): string {
  if (!msgs || msgs.length === 0) return "";
  const lastAssistant = [...(msgs || [])].reverse().find(m => m.role === "assistant");
  if (!lastAssistant) return "";
  const budget = parseBudgetData(lastAssistant.content);
  const score = parseReadinessScore(lastAssistant.content);
  const parts: string[] = [];
  if (budget && budget.length > 0) {
    const channels = budget.slice(0, 3).map(b => b.name).join(" + ");
    parts.push(channels);
  }
  if (score !== null) {
    parts.push(`Score: ${score}/100`);
  }
  return parts.join(" | ");
}

function getContentTypeFromTitle(title: string): string {
  for (const ct of CONTENT_TYPES) {
    if (title.toLowerCase().includes(ct.toLowerCase())) return ct;
  }
  return "Other";
}

function IntakeForm({ products, onSubmit, onCancel }: { products: string[]; onSubmit: (data: IntakeFormData) => void; onCancel: () => void }) {
  const [form, setForm] = useState<IntakeFormData>({
    objective: "",
    product: "",
    market: "",
    industry: "",
    funnelStage: "",
    contentType: "",
    contentApproach: "recommend",
    budget: "",
    timeline: "",
    additionalContext: "",
  });

  const update = (field: keyof IntakeFormData, value: string) => setForm(prev => ({ ...prev, [field]: value }));
  const canSubmit = form.objective && form.product && form.market && form.funnelStage && form.contentType;

  const selectClass = "w-full h-9 px-3 rounded-lg bg-muted/30 border border-border/40 text-sm focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all appearance-none";
  const labelClass = "text-xs font-medium text-muted-foreground mb-1 block";

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-primary/30 bg-card/70 backdrop-blur p-5" data-testid="form-campaign-intake">
      <div className="flex items-center gap-2 mb-4">
        <Target className="h-5 w-5 text-primary" />
        <h3 className="text-base font-semibold">Campaign Brief</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Campaign Objective *</label>
          <select value={form.objective} onChange={e => update("objective", e.target.value)} className={selectClass} data-testid="select-objective">
            <option value="">Select...</option>
            {OBJECTIVES.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Product *</label>
          {products.length > 0 ? (
            <select value={form.product} onChange={e => update("product", e.target.value)} className={selectClass} data-testid="select-product">
              <option value="">Select...</option>
              {products.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          ) : (
            <input type="text" value={form.product} onChange={e => update("product", e.target.value)} placeholder="e.g., Sage 50, Sage Intacct" className={selectClass} data-testid="select-product" />
          )}
        </div>
        <div>
          <label className={labelClass}>Target Market *</label>
          <input type="text" value={form.market} onChange={e => update("market", e.target.value)} placeholder="e.g., UK, US, Germany" className={selectClass} data-testid="input-market" />
        </div>
        <div>
          <label className={labelClass}>Target Industry</label>
          <input type="text" value={form.industry} onChange={e => update("industry", e.target.value)} placeholder="e.g., Hospitality, Manufacturing" className={selectClass} data-testid="input-industry" />
        </div>
        <div>
          <label className={labelClass}>Funnel Stage *</label>
          <select value={form.funnelStage} onChange={e => update("funnelStage", e.target.value)} className={selectClass} data-testid="select-funnel-stage">
            <option value="">Select...</option>
            {FUNNEL_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Content Type *</label>
          <select value={form.contentType} onChange={e => update("contentType", e.target.value)} className={selectClass} data-testid="select-content-type">
            <option value="">Select...</option>
            {CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-3">
        <label className={labelClass}>Content Approach</label>
        <div className="flex flex-wrap gap-2">
          {CONTENT_APPROACHES.map(a => (
            <button key={a.value} type="button" onClick={() => update("contentApproach", a.value)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${form.contentApproach === a.value ? "bg-primary text-primary-foreground border-primary" : "bg-muted/30 border-border/40 text-muted-foreground hover:border-primary/40"}`} data-testid={`radio-approach-${a.value}`}>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 mt-3">
        <div>
          <label className={labelClass}>Budget Range (optional)</label>
          <input type="text" value={form.budget} onChange={e => update("budget", e.target.value)} placeholder="e.g., $10,000 - $25,000" className={selectClass} data-testid="input-budget" />
        </div>
        <div>
          <label className={labelClass}>Timeline (optional)</label>
          <select value={form.timeline} onChange={e => update("timeline", e.target.value)} className={selectClass} data-testid="select-timeline">
            <option value="">Select...</option>
            {TIMELINES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-3">
        <label className={labelClass}>Additional Context (optional)</label>
        <textarea value={form.additionalContext} onChange={e => update("additionalContext", e.target.value)} placeholder="Any specific requirements, constraints, or context..." rows={2} className="w-full px-3 py-2 rounded-lg bg-muted/30 border border-border/40 text-sm focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all resize-none" data-testid="textarea-context" />
      </div>

      <div className="flex gap-2 mt-4">
        <Button onClick={onCancel} variant="outline" className="rounded-xl" data-testid="btn-cancel-intake">Cancel</Button>
        <Button onClick={() => canSubmit && onSubmit(form)} disabled={!canSubmit} className="flex-1 rounded-xl bg-[#00D657] hover:bg-[#00C04E] text-black font-medium" data-testid="btn-submit-intake">
          <Rocket className="h-4 w-4 mr-2" />
          Build Campaign Plan
        </Button>
      </div>
    </motion.div>
  );
}

function extractPlanMeta(msgs: Message[], convTitle: string) {
  const firstUser = msgs.find(m => m.role === "user");
  const briefText = firstUser?.content || "";
  const extract = (label: string) => {
    const match = briefText.match(new RegExp(`- ${label}:\\s*(.+)`, "i"));
    return match ? match[1].trim() : "";
  };
  return {
    objective: extract("Objective"),
    product: extract("Product"),
    market: extract("Target Market"),
    funnelStage: extract("Funnel Stage"),
    title: convTitle,
  };
}

function CompletedPlanSummary({ msgs, convTitle, onExportPdf, onEditPlan }: { msgs: Message[]; convTitle: string; onExportPdf: () => void; onEditPlan: () => void }) {
  const lastAssistant = [...msgs].reverse().find(m => m.role === "assistant");
  if (!lastAssistant) return null;

  const score = parseReadinessScore(lastAssistant.content);
  const budget = parseBudgetData(lastAssistant.content);
  if (score === null) return null;

  const channels = budget?.map(b => b.name) || [];
  const meta = extractPlanMeta(msgs, convTitle);

  return (
    <div className="rounded-2xl border border-primary/30 bg-card/70 backdrop-blur p-4 mb-4" data-testid="card-plan-summary">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground mb-1">Campaign Plan Summary</div>
          <div className="text-sm font-semibold mb-1">{meta.title}</div>
          {(meta.objective || meta.product || meta.market) && (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
              {meta.objective && <span>Objective: {meta.objective}</span>}
              {meta.product && <span>Product: {meta.product}</span>}
              {meta.market && <span>Market: {meta.market}</span>}
              {meta.funnelStage && <span>Stage: {meta.funnelStage}</span>}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className={`text-lg font-bold ${score >= 75 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-red-400"}`}>{score}<span className="text-xs font-normal text-muted-foreground">/100</span></div>
        </div>
      </div>
      {channels.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {channels.map(ch => (
            <span key={ch} className="px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary font-medium">{ch}</span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Button onClick={onExportPdf} className="rounded-xl bg-[#00D657] hover:bg-[#00C04E] text-black text-xs font-medium h-8 px-3" data-testid="btn-summary-export-pdf">
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Download PDF
        </Button>
        <Button onClick={onEditPlan} variant="outline" className="rounded-xl text-xs h-8 px-3" data-testid="btn-summary-edit-plan">
          <Pencil className="h-3.5 w-3.5 mr-1.5" />
          Continue
        </Button>
      </div>
    </div>
  );
}

export default function CampaignPlannerPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [convMessages, setConvMessages] = useState<Record<number, Message[]>>({});
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [showList, setShowList] = useState(true);
  const [showIntakeForm, setShowIntakeForm] = useState(false);
  const [showSummaryView, setShowSummaryView] = useState(false);
  const [products, setProducts] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { user } = useAuth();

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [msgs, streamingContent, scrollToBottom]);

  useEffect(() => {
    fetchConversations();
    fetchProducts();
  }, []);

  async function fetchProducts() {
    try {
      const res = await authFetch("/api/insights/summary");
      const data = await res.json();
      if (data?.product_mix) {
        const prods = data.product_mix
          .map((p: { product: string }) => p.product)
          .filter((p: string) => p && p !== "(unattributed)");
        setProducts(prods);
      }
    } catch {}
  }

  async function fetchConversations() {
    try {
      const res = await authFetch(`/api/conversations?agent=planner`);
      const data = await res.json();
      setConversations(data);
      for (const conv of data) {
        try {
          const cRes = await authFetch(`/api/conversations/${conv.id}`);
          const cData = await cRes.json();
          setConvMessages(prev => ({ ...prev, [conv.id]: cData.messages || [] }));
        } catch {}
      }
    } catch (e) {
      console.error("Failed to fetch conversations", e);
    }
  }

  async function openConversation(conv: Conversation) {
    try {
      const res = await authFetch(`/api/conversations/${conv.id}`);
      const data = await res.json();
      setActiveConv(data);
      const messages = data.messages || [];
      setMsgs(messages);
      setShowList(false);
      setShowIntakeForm(false);
      const status = getCampaignStatus(messages);
      setShowSummaryView(status === "Complete");
    } catch (e) {
      console.error("Failed to open conversation", e);
    }
  }

  async function createConversationFromIntake(formData: IntakeFormData) {
    try {
      const title = buildConvTitle(formData);
      const res = await authFetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, agent: "planner" }),
      });
      const conv = await res.json();
      setActiveConv(conv);
      setMsgs([]);
      setShowList(false);
      setShowIntakeForm(false);
      setShowSummaryView(false);
      setInput(buildIntakePrompt(formData));
      fetchConversations();
      setTimeout(() => {
        sendMessageDirect(conv.id, buildIntakePrompt(formData));
      }, 100);
    } catch (e) {
      console.error("Failed to create conversation", e);
    }
  }

  async function deleteConversation(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await authFetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (activeConv?.id === id) {
        setActiveConv(null);
        setMsgs([]);
        setShowList(true);
      }
      setConvMessages(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      fetchConversations();
    } catch (err) {
      console.error("Failed to delete conversation", err);
    }
  }

  async function sendMessageDirect(convId: number, content: string) {
    const userMsg: Message = {
      id: Date.now(),
      role: "user",
      content: content.trim(),
      createdAt: new Date().toISOString(),
    };

    setMsgs((prev) => [...prev, userMsg]);
    setInput("");
    setIsStreaming(true);
    setStreamingContent("");

    try {
      const res = await authFetch(`/api/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: userMsg.content }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let full = "";
      let isGrounded = false;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.grounded) isGrounded = true;
                if (data.content) {
                  full += data.content;
                  setStreamingContent(full);
                }
                if (data.title) {
                  setActiveConv((prev) => prev ? { ...prev, title: data.title } : prev);
                  fetchConversations();
                }
                if (data.done) {
                  setMsgs((prev) => [
                    ...prev,
                    { id: Date.now() + 1, role: "assistant", content: full, createdAt: new Date().toISOString(), grounded: isGrounded },
                  ]);
                  setStreamingContent("");
                }
                if (data.error) {
                  setMsgs((prev) => [
                    ...prev,
                    { id: Date.now() + 1, role: "assistant", content: "Sorry, I encountered an error. Please try again.", createdAt: new Date().toISOString() },
                  ]);
                  setStreamingContent("");
                }
              } catch {}
            }
          }
        }
      }
    } catch (err) {
      console.error("Stream error:", err);
      setMsgs((prev) => [
        ...prev,
        { id: Date.now() + 1, role: "assistant", content: "Sorry, something went wrong. Please try again.", createdAt: new Date().toISOString() },
      ]);
      setStreamingContent("");
    } finally {
      setIsStreaming(false);
    }
  }

  async function sendMessage() {
    if (!input.trim() || isStreaming || !activeConv) return;
    sendMessageDirect(activeConv.id, input.trim());
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function renderMessageWithVisuals(content: string, msgId: number) {
    const budgetData = parseBudgetData(content);
    const score = parseReadinessScore(content);
    const checklist = score !== null ? parseChecklist(content) : [];

    return (
      <>
        {renderMarkdown(content)}
        {budgetData && <BudgetChart items={budgetData} />}
        {score !== null && <ReadinessScore score={score} checklist={checklist} />}
      </>
    );
  }

  function handleSummaryExportPdf() {
    const lastAssistant = [...msgs].reverse().find(m => m.role === "assistant");
    if (!lastAssistant) return;
    const btn = document.querySelector(`[data-testid="btn-export-pdf-${lastAssistant.id}"]`) as HTMLButtonElement | null;
    if (btn) btn.click();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav />
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_circle_at_50%_0%,hsl(145_100%_42%/0.08),transparent_55%),radial-gradient(800px_circle_at_80%_80%,hsl(200_80%_50%/0.06),transparent_55%)]" />
        <div className="absolute inset-0 grain" />
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6">
        {showList ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-1 flex-col"
          >
            <div className="mb-6 flex items-center gap-3">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/30">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-[650] tracking-tight" data-testid="text-planner-title">Campaign Planner</h1>
                <p className="text-sm text-muted-foreground">Data-driven campaign strategy & content planning</p>
              </div>
            </div>

            <div className="mb-5 rounded-2xl border border-primary/20 bg-card/60 p-5 backdrop-blur" data-testid="card-planner-summary">
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                Analyzes your content against historically top-performing assets matched by content type, funnel stage, industry, product, and country. Builds a channel and content strategy with data-backed KPIs and budget allocation.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Lightbulb className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold">What it does</div>
                    <div className="text-xs text-muted-foreground leading-relaxed">Analyzes your content against historically top-performing assets matched by content type, funnel stage, industry, product, and country. Builds a channel and content strategy with data-backed KPIs and budget allocation.</div>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Users className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold">Who it's for</div>
                    <div className="text-xs text-muted-foreground leading-relaxed">Marketing managers and campaign leads who want to know which content will perform best before they launch — and how to optimize it if it won't.</div>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <BarChart3 className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold">How it works</div>
                    <div className="text-xs text-muted-foreground leading-relaxed">You provide the campaign brief (product, market, funnel stage, content type). The planner queries your performance data, finds the best-matching historical content, compares it against your planned asset, and builds a full campaign plan with channel mix, timeline, and success metrics.</div>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Layers className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold">When to use it</div>
                    <div className="text-xs text-muted-foreground leading-relaxed">Before launching any campaign. Start here to validate your content choice, find the best channel mix, and set realistic targets based on what's actually worked before.</div>
                  </div>
                </div>
              </div>
            </div>

            {showIntakeForm ? (
              <IntakeForm products={products} onSubmit={createConversationFromIntake} onCancel={() => setShowIntakeForm(false)} />
            ) : (
              <Button
                onClick={() => setShowIntakeForm(true)}
                className="mb-4 w-full rounded-xl bg-[#00D657] hover:bg-[#00C04E] text-black font-medium"
                data-testid="btn-new-campaign"
              >
                <Plus className="h-4 w-4 mr-2" />
                New campaign plan
              </Button>
            )}

            {!showIntakeForm && (
              conversations.length === 0 ? (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground" data-testid="text-no-campaigns">
                  No campaign plans yet. Click above to create your first one.
                </div>
              ) : (
                <div className="space-y-2 mt-2">
                  {conversations.map((conv) => {
                    const cMsgs = convMessages[conv.id];
                    const status = getCampaignStatus(cMsgs);
                    const summary = extractSummaryLine(cMsgs);
                    const ct = getContentTypeFromTitle(conv.title);
                    const IconComp = CONTENT_TYPE_ICONS[ct] || Globe;
                    const borderColor = status === "Complete" ? "border-l-[#00D657]" : status === "Draft" ? "border-l-amber-500" : "border-l-primary";

                    return (
                      <div
                        key={conv.id}
                        onClick={() => openConversation(conv)}
                        className={`flex items-center justify-between rounded-xl border bg-card/60 px-4 py-3 cursor-pointer hover:bg-card/80 transition group border-l-[3px] ${borderColor}`}
                        data-testid={`planner-conv-${conv.id}`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="shrink-0 h-8 w-8 rounded-lg bg-muted/40 flex items-center justify-center">
                            <IconComp className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">{conv.title}</span>
                              <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${status === "Complete" ? "bg-emerald-500/15 text-emerald-400" : status === "Draft" ? "bg-amber-500/15 text-amber-400" : "bg-primary/15 text-primary"}`}>{status}</span>
                            </div>
                            {summary && <div className="text-[11px] text-muted-foreground truncate mt-0.5">{summary}</div>}
                            <div className="text-[10px] text-muted-foreground/60 mt-0.5">{new Date(conv.createdAt).toLocaleDateString()}</div>
                          </div>
                        </div>
                        <button
                          onClick={(e) => deleteConversation(conv.id, e)}
                          className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-destructive/20 transition-all"
                          data-testid={`btn-delete-campaign-${conv.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-1 flex-col min-h-0"
          >
            <div className="flex items-center gap-2 mb-4 shrink-0">
              <button
                onClick={() => { setShowList(true); setShowSummaryView(false); }}
                className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors"
                data-testid="btn-back-to-campaigns"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                <span className="text-sm font-semibold truncate">{activeConv?.title || "New Campaign"}</span>
              </div>
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => { setShowList(true); setShowIntakeForm(true); }}
                  className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors"
                  title="New campaign"
                  data-testid="btn-new-chat-inline"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            {showSummaryView && msgs.length > 0 && (
              <CompletedPlanSummary msgs={msgs} convTitle={activeConv?.title || "Campaign Plan"} onExportPdf={handleSummaryExportPdf} onEditPlan={() => setShowSummaryView(false)} />
            )}

            <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pb-4">
              {msgs.length === 0 && !streamingContent && (
                <div className="text-center py-8">
                  <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/30 mb-4">
                    <Target className="h-7 w-7 text-primary" />
                  </div>
                  <div className="text-lg font-semibold mb-1">Campaign Planner</div>
                  <div className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
                    Describe your campaign below or use the intake form to get started with a structured brief.
                  </div>
                </div>
              )}

              {msgs.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  data-testid={`planner-msg-${msg.role}-${msg.id}`}
                >
                  <div className="max-w-[85%]">
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/50 border"
                      }`}
                    >
                      {msg.role === "assistant" ? renderMessageWithVisuals(msg.content, msg.id) : msg.content}
                    </div>
                    {msg.role === "assistant" && (
                      <div className="flex items-center gap-2 mt-1 ml-1">
                        {msg.grounded && (
                          <div className="flex items-center gap-1">
                            <ShieldCheck className="h-3 w-3 text-primary" />
                            <span className="text-[10px] text-primary/80 font-medium">Grounded</span>
                          </div>
                        )}
                        <CopyButton text={msg.content} msgId={msg.id} />
                        <ExportPDFButton text={msg.content} msgId={msg.id} />
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {streamingContent && (
                <div className="flex justify-start" data-testid="planner-msg-streaming">
                  <div className="max-w-[85%] rounded-2xl px-4 py-3 text-sm bg-muted/50 border">
                    {renderMarkdown(streamingContent)}
                    <span className="inline-block w-1.5 h-4 bg-primary/60 animate-pulse ml-0.5 rounded-sm" />
                  </div>
                </div>
              )}

              {isStreaming && !streamingContent && (
                <div className="flex justify-start" data-testid="planner-msg-thinking">
                  <div className="rounded-2xl px-4 py-3 text-sm bg-muted/50 border">
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="shrink-0 border-t pt-3">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Describe your content and campaign goals..."
                  rows={1}
                  className="flex-1 resize-none rounded-xl border bg-card/60 px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/60"
                  data-testid="input-planner-message"
                />
                <Button
                  onClick={sendMessage}
                  disabled={!input.trim() || isStreaming || !activeConv}
                  size="icon"
                  className="h-[44px] w-[44px] rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
                  data-testid="btn-planner-send"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
