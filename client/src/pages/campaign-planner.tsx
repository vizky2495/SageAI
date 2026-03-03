import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Send, Plus, Trash2, ChevronLeft, Target, ShieldCheck, Copy, Check, Lightbulb, Users, BarChart3, Layers, Rocket, Eye, CalendarDays, FileDown, CircleCheck, CircleX } from "lucide-react";

function getUserId(): string {
  const key = "cia_user_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}
import { Button } from "@/components/ui/button";
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

function ExportPDFButton({ text, msgId }: { text: string; msgId: number }) {
  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 15;
      const contentWidth = pageWidth - margin * 2;
      let y = 20;

      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(88, 28, 135);
      doc.text("Content Intelligence Analyst", margin, y);
      y += 8;
      doc.setFontSize(12);
      doc.setTextColor(107, 114, 128);
      doc.text("Campaign Plan Report", margin, y);
      y += 6;
      doc.setFontSize(9);
      doc.text(`Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, margin, y);
      y += 8;

      doc.setDrawColor(139, 92, 246);
      doc.setLineWidth(0.5);
      doc.line(margin, y, pageWidth - margin, y);
      y += 8;

      const cleaned = stripHiddenMarkers(text);
      const lines = cleaned.split("\n");

      for (const line of lines) {
        if (y > doc.internal.pageSize.getHeight() - 20) {
          doc.addPage();
          y = 20;
        }

        if (line.startsWith("### ")) {
          doc.setFontSize(11);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(30, 30, 30);
          y += 3;
          const wrappedLines = doc.splitTextToSize(line.slice(4), contentWidth);
          doc.text(wrappedLines, margin, y);
          y += wrappedLines.length * 5 + 2;
        } else if (line.startsWith("## ")) {
          doc.setFontSize(13);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(88, 28, 135);
          y += 4;
          const wrappedLines = doc.splitTextToSize(line.slice(3), contentWidth);
          doc.text(wrappedLines, margin, y);
          y += wrappedLines.length * 6 + 3;
        } else if (line.startsWith("# ")) {
          doc.setFontSize(14);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(88, 28, 135);
          y += 5;
          const wrappedLines = doc.splitTextToSize(line.slice(2), contentWidth);
          doc.text(wrappedLines, margin, y);
          y += wrappedLines.length * 6 + 3;
        } else if (line.startsWith("- ") || line.startsWith("* ")) {
          doc.setFontSize(10);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(50, 50, 50);
          const bulletText = `• ${line.slice(2).replace(/\*\*/g, "")}`;
          const wrappedLines = doc.splitTextToSize(bulletText, contentWidth - 5);
          doc.text(wrappedLines, margin + 3, y);
          y += wrappedLines.length * 4.5 + 1;
        } else if (/^\d+\.\s/.test(line)) {
          doc.setFontSize(10);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(50, 50, 50);
          const cleanLine = line.replace(/\*\*/g, "");
          const wrappedLines = doc.splitTextToSize(cleanLine, contentWidth - 5);
          doc.text(wrappedLines, margin + 3, y);
          y += wrappedLines.length * 4.5 + 1;
        } else if (line.trim() === "") {
          y += 3;
        } else if (line.startsWith("|")) {
          doc.setFontSize(8);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(50, 50, 50);
          const cleanLine = line.replace(/\*\*/g, "");
          const wrappedLines = doc.splitTextToSize(cleanLine, contentWidth);
          doc.text(wrappedLines, margin, y);
          y += wrappedLines.length * 3.5 + 1;
        } else {
          doc.setFontSize(10);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(50, 50, 50);
          const cleanLine = line.replace(/\*\*/g, "");
          const wrappedLines = doc.splitTextToSize(cleanLine, contentWidth);
          doc.text(wrappedLines, margin, y);
          y += wrappedLines.length * 4.5 + 1;
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

const TEMPLATES = [
  {
    id: "product-launch",
    title: "Product Launch",
    description: "Assess content effectiveness for a new product campaign",
    icon: Rocket,
    prompt: "I'm launching a new campaign for [product name] in [industry]. I plan to use a [content type — e.g., PDF, Webinar, Video] targeting the [TOFU/MOFU/BOFU] stage. Help me assess how similar content has performed in our data and build a campaign plan.",
  },
  {
    id: "lead-generation",
    title: "Lead Generation",
    description: "Compare your content against top lead-gen performers",
    icon: Users,
    prompt: "I need to generate leads for [product name] using [content type — e.g., PDF, Demo, Webinar]. Compare it against our best-performing lead gen content in the same funnel stage and recommend a data-backed plan.",
  },
  {
    id: "brand-awareness",
    title: "Brand Awareness",
    description: "Evaluate TOFU content performance for awareness campaigns",
    icon: Eye,
    prompt: "I want to increase brand awareness for [product name] with [content type — e.g., Blog, Video, SMA] at the TOFU stage. How has similar content performed in our data? What channels work best?",
  },
  {
    id: "event-promotion",
    title: "Event / Webinar",
    description: "Plan an event promotion using data-backed content insights",
    icon: CalendarDays,
    prompt: "I'm promoting an event/webinar for [product name]. Based on our data, what content format works best at each funnel stage for event promotion? Build me a promotion plan.",
  },
];

export default function CampaignPlannerPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [showList, setShowList] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const userId = useMemo(() => getUserId(), []);

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
  }, []);

  async function fetchConversations() {
    try {
      const res = await fetch(`/api/conversations?agent=planner&userId=${userId}`);
      const data = await res.json();
      setConversations(data);
    } catch (e) {
      console.error("Failed to fetch conversations", e);
    }
  }

  async function openConversation(conv: Conversation) {
    try {
      const res = await fetch(`/api/conversations/${conv.id}`);
      const data = await res.json();
      setActiveConv(data);
      setMsgs(data.messages || []);
      setShowList(false);
    } catch (e) {
      console.error("Failed to open conversation", e);
    }
  }

  async function createConversation() {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Campaign", agent: "planner", userId }),
      });
      const conv = await res.json();
      setActiveConv(conv);
      setMsgs([]);
      setShowList(false);
      fetchConversations();
    } catch (e) {
      console.error("Failed to create conversation", e);
    }
  }

  async function createConversationWithTemplate(prompt: string) {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Campaign", agent: "planner", userId }),
      });
      const conv = await res.json();
      setActiveConv(conv);
      setMsgs([]);
      setShowList(false);
      setInput(prompt);
      fetchConversations();
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (e) {
      console.error("Failed to create conversation", e);
    }
  }

  async function deleteConversation(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (activeConv?.id === id) {
        setActiveConv(null);
        setMsgs([]);
        setShowList(true);
      }
      fetchConversations();
    } catch (err) {
      console.error("Failed to delete conversation", err);
    }
  }

  async function sendMessage() {
    if (!input.trim() || isStreaming || !activeConv) return;

    const userMsg: Message = {
      id: Date.now(),
      role: "user",
      content: input.trim(),
      createdAt: new Date().toISOString(),
    };

    setMsgs((prev) => [...prev, userMsg]);
    setInput("");
    setIsStreaming(true);
    setStreamingContent("");

    if (msgs.length === 0) {
      const fallbackTitle = userMsg.content.slice(0, 60) + (userMsg.content.length > 60 ? "..." : "");
      setActiveConv((prev) => prev ? { ...prev, title: fallbackTitle } : prev);
    }

    try {
      const res = await fetch(`/api/conversations/${activeConv.id}/messages`, {
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

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav />
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_circle_at_50%_0%,hsl(270_60%_50%/0.08),transparent_55%),radial-gradient(800px_circle_at_80%_80%,hsl(200_80%_50%/0.06),transparent_55%)]" />
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
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 ring-1 ring-violet-500/30">
                <Target className="h-5 w-5 text-violet-400" />
              </div>
              <div>
                <h1 className="text-xl font-[650] tracking-tight" data-testid="text-planner-title">Campaign Planner</h1>
                <p className="text-sm text-muted-foreground">Content-effectiveness assessment & campaign strategy</p>
              </div>
            </div>

            <div className="mb-5 rounded-2xl border border-violet-500/20 bg-card/60 p-5 backdrop-blur" data-testid="card-planner-summary">
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                Evaluate how your content will perform by comparing it against similar content already in your database. The planner matches by content type (PDF vs PDF, Webinar vs Webinar), funnel stage, industry, and product to give you data-backed benchmarks before you launch.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
                    <Lightbulb className="h-3.5 w-3.5 text-violet-400" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold">What it does</div>
                    <div className="text-xs text-muted-foreground leading-relaxed">Compares your content piece against similar assets in the database, then builds a data-backed campaign plan with budget allocation and readiness scoring.</div>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
                    <Users className="h-3.5 w-3.5 text-violet-400" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold">Who it's for</div>
                    <div className="text-xs text-muted-foreground leading-relaxed">Marketing managers and campaign leads who want to predict content effectiveness before launching.</div>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
                    <BarChart3 className="h-3.5 w-3.5 text-violet-400" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold">How it works</div>
                    <div className="text-xs text-muted-foreground leading-relaxed">Asks about your content type, product, funnel stage, and goal. Then compares like-for-like content (PDF vs PDF) from your data and benchmarks performance.</div>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
                    <Layers className="h-3.5 w-3.5 text-violet-400" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold">When to use it</div>
                    <div className="text-xs text-muted-foreground leading-relaxed">Before launching any campaign. Upload your content data first, then start a plan to assess how your content will perform based on historical data.</div>
                  </div>
                </div>
              </div>
            </div>

            <Button
              onClick={createConversation}
              className="mb-4 w-full rounded-xl"
              variant="outline"
              data-testid="btn-new-campaign"
            >
              <Plus className="h-4 w-4 mr-2" />
              New campaign plan
            </Button>

            {conversations.length === 0 ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground" data-testid="text-no-campaigns">
                No campaign plans yet. Start a new one or pick a template below.
              </div>
            ) : (
              <div className="space-y-2">
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => openConversation(conv)}
                    className="flex items-center justify-between rounded-xl border bg-card/60 px-4 py-3 cursor-pointer hover:bg-card/80 transition group"
                    data-testid={`planner-conv-${conv.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{conv.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(conv.createdAt).toLocaleDateString()}
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
                ))}
              </div>
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
                onClick={() => setShowList(true)}
                className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors"
                data-testid="btn-back-to-campaigns"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-2 w-2 rounded-full bg-violet-400 animate-pulse" />
                <span className="text-sm font-semibold truncate">{activeConv?.title || "New Campaign"}</span>
              </div>
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={createConversation}
                  className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors"
                  title="New campaign"
                  data-testid="btn-new-chat-inline"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pb-4">
              {msgs.length === 0 && !streamingContent && (
                <div className="text-center py-8">
                  <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 ring-1 ring-violet-500/30 mb-4">
                    <Target className="h-7 w-7 text-violet-400" />
                  </div>
                  <div className="text-lg font-semibold mb-1">Campaign Planner</div>
                  <div className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                    Choose a template below or describe your campaign to get started. I'll compare your content against our database and build a data-backed plan.
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 max-w-lg mx-auto">
                    {TEMPLATES.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => createConversationWithTemplate(t.prompt)}
                        className="text-left rounded-xl border border-violet-500/20 bg-card/60 px-4 py-3 hover:bg-card/80 hover:border-violet-500/40 transition group"
                        data-testid={`template-${t.id}`}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <t.icon className="h-4 w-4 text-violet-400" />
                          <span className="text-sm font-semibold">{t.title}</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{t.description}</p>
                      </button>
                    ))}
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
                            <ShieldCheck className="h-3 w-3 text-violet-400" />
                            <span className="text-[10px] text-violet-400/80 font-medium">Grounded</span>
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
                    <span className="inline-block w-1.5 h-4 bg-violet-400/60 animate-pulse ml-0.5 rounded-sm" />
                  </div>
                </div>
              )}

              {isStreaming && !streamingContent && (
                <div className="flex justify-start" data-testid="planner-msg-thinking">
                  <div className="rounded-2xl px-4 py-3 text-sm bg-muted/50 border">
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-violet-400/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="h-1.5 w-1.5 rounded-full bg-violet-400/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="h-1.5 w-1.5 rounded-full bg-violet-400/60 animate-bounce" style={{ animationDelay: "300ms" }} />
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
                  className="flex-1 resize-none rounded-xl border bg-card/60 px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-violet-400/50 placeholder:text-muted-foreground/60"
                  data-testid="input-planner-message"
                />
                <Button
                  onClick={sendMessage}
                  disabled={!input.trim() || isStreaming || !activeConv}
                  size="icon"
                  className="h-[44px] w-[44px] rounded-xl bg-violet-500 hover:bg-violet-600 text-white shrink-0"
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
