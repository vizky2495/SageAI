import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Plus, Trash2, ShieldCheck, Copy, Check, Paperclip, ZoomIn, Upload, Search, BarChart3, Layers, FileText, File, History, Minimize2, Maximize2, MessageSquare, ArrowRight, GitCompare } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { authFetch } from "@/lib/queryClient";
import type { ComparisonContext } from "@/components/content-comparison";

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  grounded?: boolean;
  images?: string[];
}

interface Conversation {
  id: number;
  title: string;
  agent: string;
  createdAt: string;
  messages?: Message[];
}

interface PendingFile {
  name: string;
  size: number;
  type: string;
  dataUrl: string;
}

interface GreetingStats {
  hasData: boolean;
  totalAssets?: number;
  stageCounts?: Record<string, number>;
  totalSqos?: number;
  totalLeads?: number;
  totalPageviews?: number;
  topPerformer?: { contentId: string; sqos: number; stage: string } | null;
  contentCoverage?: Record<string, { total: number; withContent: number }>;
  totalWithContent?: number;
}

interface PageChatProps {
  agent: string;
  agentName: string;
  description: string;
  placeholder: string;
  accentColor: string;
  accentBg: string;
  accentRing: string;
  fallbackSuggestions: string[];
  variant?: "commandbar" | "floating";
  pageContext?: string;
}

function renderVerdictBadges(text: string): React.ReactNode {
  const parts = text.split(/(\*\*(?:DEPLOY|REFRESH|REPLACE)\*\*)/g);
  return parts.map((part, i) => {
    if (part === "**DEPLOY**") return <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#00D657]/20 text-[#00D657] border border-[#00D657]/30 mx-0.5">DEPLOY</span>;
    if (part === "**REFRESH**") return <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 mx-0.5">REFRESH</span>;
    if (part === "**REPLACE**") return <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 mx-0.5">REPLACE</span>;
    return part;
  });
}

function renderMarkdown(text: string) {
  const lines = text.split("\n");
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
        <div key={i} className="overflow-x-auto my-2 rounded-lg border border-border/40">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-[#00D657]/10">
                {headerCells.map((cell, ci) => (
                  <th key={ci} className="border-b border-border/30 px-2.5 py-1.5 text-left font-semibold text-[#00D657]">{cell}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataRows.map((row, ri) => {
                const cells = row.split("|").filter(Boolean).map(c => c.trim());
                return (
                  <tr key={ri} className={ri % 2 === 1 ? "bg-muted/20" : ""}>
                    {cells.map((cell, ci) => (
                      <td key={ci} className="border-b border-border/20 px-2.5 py-1.5">{renderVerdictBadges(cell)}</td>
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
      const inner = part.slice(2, -2);
      if (inner === "DEPLOY" || inner === "REFRESH" || inner === "REPLACE") {
        return renderVerdictBadges(part);
      }
      return <strong key={i} className="font-semibold">{inner}</strong>;
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
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);
  return (
    <button onClick={handleCopy} className="p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground/60 hover:text-muted-foreground" title={copied ? "Copied!" : "Copy"} data-testid={`btn-copy-msg-${msgId}`}>
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type: string) {
  if (type.includes("pdf")) return <FileText className="h-3.5 w-3.5 text-red-400" />;
  if (type.includes("image")) return <File className="h-3.5 w-3.5 text-blue-400" />;
  return <File className="h-3.5 w-3.5 text-muted-foreground" />;
}

function formatNum(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

const STARTERS = [
  { label: "Top performers", action: "send" as const, prompt: "Show me the top performing content assets across all funnel stages.", icon: BarChart3 },
  { label: "Content gaps", action: "send" as const, prompt: "Analyze our content library and show me where we have gaps across funnel stages, products, and content types.", icon: Layers },
  { label: "Compare assets", action: "send" as const, prompt: "I want to compare two content assets side-by-side. Can you help me analyze their performance?", icon: Search },
  { label: "Evaluate content", action: "upload" as const, prompt: "I'd like to evaluate a content asset's performance — show me the top performers.", icon: Upload },
];

function getGreetingMessage(agent: string, stats: GreetingStats | null): { title: string; message: string; actions: { label: string; prompt: string }[] } {
  if (!stats?.hasData) {
    if (agent === "librarian") {
      return {
        title: "Content Librarian",
        message: "Welcome! Upload your marketing data and I'll analyze every asset in your library.",
        actions: [{ label: "Get started", prompt: "How do I get started with content analysis?" }, { label: "Open chat", prompt: "" }],
      };
    }
    if (agent === "planner") {
      return {
        title: "Campaign Strategist",
        message: "Ready to plan your next campaign? I'll help you build a data-driven strategy.",
        actions: [{ label: "Start planning", prompt: "Help me plan a new campaign." }, { label: "Open chat", prompt: "" }],
      };
    }
    return {
      title: "Performance Analyst",
      message: "Upload your content data and I'll surface the insights you're missing.",
      actions: [{ label: "Show insights", prompt: "What insights can you provide?" }, { label: "Open chat", prompt: "" }],
    };
  }

  const tofu = stats.stageCounts?.["TOFU"] || 0;
  const mofu = stats.stageCounts?.["MOFU"] || 0;
  const bofu = stats.stageCounts?.["BOFU"] || 0;
  const sqos = stats.totalSqos || 0;
  const total = stats.totalAssets || 0;

  if (agent === "librarian") {
    const withContent = stats.totalWithContent || 0;
    const coverageNote = withContent > 0 && total > 0
      ? ` ${formatNum(withContent)} of ${formatNum(total)} have content uploaded for deeper analysis.`
      : total > 0
        ? ` Upload content for your top performers so I can give you deeper analysis.`
        : "";
    return {
      title: "Content Librarian",
      message: `I've analyzed your ${formatNum(tofu)} TOFU and ${formatNum(mofu)} MOFU assets.${coverageNote} Want to know which ones are actually performing?`,
      actions: [{ label: "Show top performers", prompt: "Show me the top performing content assets by SQO conversion." }, { label: "Open chat", prompt: "" }],
    };
  }

  if (agent === "planner") {
    return {
      title: "Campaign Strategist",
      message: `Ready to plan your next campaign? With ${formatNum(total)} assets generating ${formatNum(sqos)} SQOs, I'll find the best content and tell you exactly how to use it.`,
      actions: [{ label: "Start planning", prompt: "Help me plan a new campaign using our best performing content." }, { label: "Open chat", prompt: "" }],
    };
  }

  return {
    title: "Performance Analyst",
    message: `Your content generated ${formatNum(sqos)} SQOs across ${formatNum(total)} assets. I can spot the trends you're missing.`,
    actions: [{ label: "Show insights", prompt: "Show me the key performance trends and insights across my content." }, { label: "Open chat", prompt: "" }],
  };
}

export default function PageChat({
  agent,
  agentName,
  description,
  placeholder,
  fallbackSuggestions,
  pageContext,
}: PageChatProps) {
  type ChatMode = "closed" | "banner" | "chat";
  const [mode, setMode] = useState<ChatMode>("closed");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [greetingStats, setGreetingStats] = useState<GreetingStats | null>(null);
  const [pillPulse, setPillPulse] = useState(false);
  const [comparisonContext, setComparisonContext] = useState<ComparisonContext | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  const bannerSessionKey = `cia-banner-shown-${agent}`;

  useEffect(() => {
    if (agent !== "librarian") return;
    function handleComparisonCtx(e: Event) {
      const ctx = (e as CustomEvent).detail as ComparisonContext | null;
      setComparisonContext(ctx);
    }
    window.addEventListener("comparison-context-update", handleComparisonCtx);
    return () => window.removeEventListener("comparison-context-update", handleComparisonCtx);
  }, [agent]);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, []);

  useEffect(() => { scrollToBottom(); }, [msgs, streamingContent, scrollToBottom]);
  useEffect(() => { fetchConversations(); }, []);

  useEffect(() => {
    authFetch("/api/greeting-stats")
      .then(r => r.json())
      .then(d => setGreetingStats(d))
      .catch(() => setGreetingStats({ hasData: false }));
  }, []);

  useEffect(() => {
    const alreadyShown = sessionStorage.getItem(bannerSessionKey);
    if (alreadyShown) {
      setBannerDismissed(true);
      return;
    }

    const timer = setTimeout(() => {
      if (!sessionStorage.getItem(bannerSessionKey)) {
        setMode("banner");
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [bannerSessionKey]);

  useEffect(() => {
    if (mode !== "banner") return;
    const autoHide = setTimeout(() => {
      dismissBanner();
    }, 10000);
    return () => clearTimeout(autoHide);
  }, [mode]);

  useEffect(() => {
    if (mode !== "closed" || !bannerDismissed) return;
    const interval = setInterval(() => {
      setPillPulse(true);
      setTimeout(() => setPillPulse(false), 1500);
    }, 60000);
    return () => clearInterval(interval);
  }, [mode, bannerDismissed]);

  function dismissBanner() {
    setMode("closed");
    setBannerDismissed(true);
    sessionStorage.setItem(bannerSessionKey, "true");
  }

  function openChat() {
    dismissBanner();
    setMode("chat");
    setTimeout(() => chatInputRef.current?.focus(), 200);
  }

  function closeChat() {
    setMode("closed");
    setIsFullscreen(false);
    setShowHistory(false);
    setInput("");
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        if (mode === "chat") closeChat();
        else openChat();
      }
      if (e.key === "Escape" && mode === "chat") closeChat();
      if (e.key === "Escape" && mode === "banner") dismissBanner();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  useEffect(() => {
    function handleOpenFullChat(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.prompt) {
        openChat();
        setInput(detail.prompt);
        return;
      }
      if (detail?.asset) {
        const context = `Asking about: ${detail.asset.contentId} — ${detail.stage || "Unknown"} — ${detail.asset.productFranchise || "N/A"}`;
        openChat();
        if (detail.messages?.length > 0) {
          const existing = detail.messages.map((m: { id: number; role: string; content: string }) => ({
            ...m,
            createdAt: new Date().toISOString(),
          }));
          setMsgs(existing);
          setInput("");
        } else {
          setInput(context);
        }
      }
    }
    window.addEventListener("open-full-chat", handleOpenFullChat);
    return () => window.removeEventListener("open-full-chat", handleOpenFullChat);
  }, []);

  async function fetchConversations() {
    try {
      const res = await authFetch(`/api/conversations?agent=${agent}`);
      const data = await res.json();
      setConversations(data);
    } catch (e) { console.error("Failed to fetch conversations", e); }
  }

  async function openConversation(conv: Conversation) {
    try {
      const res = await authFetch(`/api/conversations/${conv.id}`);
      const data = await res.json();
      setActiveConv(data);
      setMsgs(data.messages || []);
      setShowHistory(false);
      setMode("chat");
    } catch (e) { console.error("Failed to open conversation", e); }
  }

  async function createConversation() {
    try {
      const res = await authFetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "New Chat", agent }) });
      const conv = await res.json();
      setActiveConv(conv);
      setMsgs([]);
      setShowHistory(false);
      fetchConversations();
    } catch (e) { console.error("Failed to create conversation", e); }
  }

  async function deleteConversation(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await authFetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (activeConv?.id === id) { setActiveConv(null); setMsgs([]); }
      fetchConversations();
    } catch (err) { console.error("Failed to delete conversation", err); }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (file.size > 10 * 1024 * 1024) return;
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        if (file.type.startsWith("image/")) setPendingImages(p => [...p, result]);
        else setPendingFiles(p => [...p, { name: file.name, size: file.size, type: file.type, dataUrl: result }]);
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removePendingImage(i: number) { setPendingImages(p => p.filter((_, idx) => idx !== i)); }
  function removePendingFile(i: number) { setPendingFiles(p => p.filter((_, idx) => idx !== i)); }

  async function ensureConversationAndSend(text: string) {
    if (!activeConv) {
      try {
        const res = await authFetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "New Chat", agent }) });
        const conv = await res.json();
        setActiveConv(conv);
        setMsgs([]);
        fetchConversations();
        setTimeout(() => sendWithConv(conv.id, text), 100);
      } catch (e) { console.error("Failed to create conversation", e); }
      return;
    }
    sendWithConv(activeConv.id, text);
  }

  async function sendWithConv(convId: number, text: string) {
    const attachedImages = [...pendingImages];
    const attachedFiles = [...pendingFiles];
    const fileContext = attachedFiles.length > 0 ? `\n\n[Attached files: ${attachedFiles.map(f => f.name).join(", ")}]` : "";
    const ctxSuffix = pageContext ? `\n\n[Page context: ${pageContext}]` : "";
    const fullContent = (text + fileContext + ctxSuffix).trim();

    const userMsg: Message = { id: Date.now(), role: "user", content: text, createdAt: new Date().toISOString(), images: attachedImages.length > 0 ? attachedImages : undefined };
    setMsgs(p => [...p, userMsg]);
    setInput("");
    setPendingImages([]);
    setPendingFiles([]);
    setIsStreaming(true);
    setStreamingContent("");

    if (msgs.length === 0) {
      const fallbackTitle = text.slice(0, 60) + (text.length > 60 ? "..." : "");
      setActiveConv(p => p ? { ...p, title: fallbackTitle } : p);
    }

    try {
      const msgBody: any = { content: fullContent || "(shared an image)", images: attachedImages.length > 0 ? attachedImages : undefined };
      if (comparisonContext && agent === "librarian") {
        msgBody.comparisonContext = comparisonContext;
      }
      const res = await authFetch(`/api/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(msgBody),
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
          for (const line of chunk.split("\n")) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.grounded) isGrounded = true;
                if (data.content) { full += data.content; setStreamingContent(full); }
                if (data.title) { setActiveConv(p => p ? { ...p, title: data.title } : p); fetchConversations(); }
                if (data.done) {
                  setMsgs(p => [...p, { id: Date.now() + 1, role: "assistant", content: full, createdAt: new Date().toISOString(), grounded: isGrounded }]);
                  setStreamingContent("");
                }
                if (data.error) {
                  setMsgs(p => [...p, { id: Date.now() + 1, role: "assistant", content: "Sorry, I encountered an error. Please try again.", createdAt: new Date().toISOString() }]);
                  setStreamingContent("");
                }
              } catch {}
            }
          }
        }
      }
    } catch (err) {
      console.error("Stream error:", err);
      setMsgs(p => [...p, { id: Date.now() + 1, role: "assistant", content: "Sorry, something went wrong. Please try again.", createdAt: new Date().toISOString() }]);
      setStreamingContent("");
    } finally {
      setIsStreaming(false);
    }
  }

  function handleChatKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if ((!input.trim() && pendingImages.length === 0 && pendingFiles.length === 0) || isStreaming) return;
      ensureConversationAndSend(input.trim());
    }
  }

  function handleStarterClick(s: typeof STARTERS[0]) {
    if (s.action === "upload") {
      setInput(s.prompt);
      setTimeout(() => fileInputRef.current?.click(), 200);
    } else if (s.action === "prefill") {
      setInput(s.prompt);
      setTimeout(() => chatInputRef.current?.focus(), 100);
    } else {
      ensureConversationAndSend(s.prompt);
    }
  }

  function handleBannerAction(prompt: string) {
    if (!prompt) {
      openChat();
      return;
    }
    openChat();
    setTimeout(() => ensureConversationAndSend(prompt), 300);
  }

  const greeting = getGreetingMessage(agent, greetingStats);

  const comparisonNames = comparisonContext?.type === "two-way"
    ? { a: comparisonContext.contentA?.name || "Content A", b: comparisonContext.contentB?.name || "Content B" }
    : null;

  const comparisonSuggestions = comparisonContext ? (
    comparisonContext.type === "two-way" ? [
      `Deep dive into ${comparisonNames?.a}`,
      `Deep dive into ${comparisonNames?.b}`,
      "Find similar content in our library",
      "Plan campaign with the winner",
    ] : [
      "Which content should I prioritise for campaigns?",
      "Find similar content in our library",
      "What gaps exist across these pieces?",
      "Plan campaign with the top-ranked content",
    ]
  ) : null;

  const allSuggestions = comparisonSuggestions || [...new Set([
    ...fallbackSuggestions,
    "Which content has the highest SQO conversion?",
    "Show me aging content that needs a refresh",
    "What are the top performers this quarter?",
  ])].slice(0, 4);

  const renderMessage = (msg: Message, idx: number) => {
    const prevMsg = idx > 0 ? msgs[idx - 1] : null;
    const showAvatar = msg.role === "assistant" && (!prevMsg || prevMsg.role !== "assistant");
    return (
      <div key={msg.id}>
        {showAvatar && (
          <div className="flex items-center gap-1.5 mb-1">
            <div className="h-5 w-5 rounded-full bg-[#00D657] flex items-center justify-center shrink-0">
              <span className="text-[7px] font-bold text-black">CIA</span>
            </div>
            <span className="text-[10px] text-muted-foreground/50">{agentName}</span>
          </div>
        )}
        <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`} data-testid={`msg-${agent}-${msg.role}-${msg.id}`}>
          <div className={`max-w-[85%] ${msg.role === "assistant" ? "ml-6" : ""}`}>
            <div className={`rounded-2xl px-3.5 py-2.5 text-sm ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted/50 border border-border/30"}`}>
              {msg.role === "assistant" ? renderMarkdown(msg.content) : msg.content}
              {msg.images && msg.images.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {msg.images.map((img, imgIdx) => (
                    <button key={imgIdx} onClick={() => setLightboxImage(img)} className="relative group/img rounded-lg overflow-hidden border border-border/40" data-testid={`msg-image-${msg.id}-${imgIdx}`}>
                      <img src={img} alt="Attachment" className="h-16 w-16 object-cover" />
                      <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/30 transition-colors flex items-center justify-center">
                        <ZoomIn className="h-4 w-4 text-white opacity-0 group-hover/img:opacity-100 transition-opacity" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {msg.role === "assistant" && (
              <div className="flex items-center gap-2 mt-1 ml-1">
                {msg.grounded && (
                  <div className="flex items-center gap-1" data-testid={`badge-grounded-${agent}-${msg.id}`}>
                    <ShieldCheck className="h-3 w-3 text-[#00D657]" />
                    <span className="text-[10px] text-[#00D657] opacity-80 font-medium">Grounded</span>
                  </div>
                )}
                <CopyButton text={msg.content} msgId={msg.id} />
                <span className="text-[9px] text-muted-foreground/40">{new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            )}
          </div>
        </div>
        {msg.role === "user" && (
          <div className="flex justify-end mt-0.5 mr-1">
            <span className="text-[9px] text-muted-foreground/40">{new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        )}
      </div>
    );
  };

  const renderStreaming = streamingContent ? (
    <div className="flex justify-start" data-testid={`msg-streaming-${agent}`}>
      <div className="flex items-start gap-1.5">
        <div className="h-5 w-5 rounded-full bg-[#00D657] flex items-center justify-center shrink-0 mt-1"><span className="text-[7px] font-bold text-black">CIA</span></div>
        <div className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm bg-muted/50 border border-border/30">
          {renderMarkdown(streamingContent)}
          <span className="inline-block w-1.5 h-4 bg-[#00D657] opacity-60 animate-pulse ml-0.5 rounded-sm" />
        </div>
      </div>
    </div>
  ) : isStreaming ? (
    <div className="flex justify-start" data-testid={`msg-thinking-${agent}`}>
      <div className="flex items-center gap-1.5">
        <div className="h-5 w-5 rounded-full bg-[#00D657] flex items-center justify-center shrink-0"><span className="text-[7px] font-bold text-black">CIA</span></div>
        <div className="rounded-2xl px-3.5 py-2.5 text-sm bg-muted/50 border border-border/30">
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-[#00D657] opacity-60 animate-bounce" style={{ animationDelay: "0ms" }} />
            <div className="h-1.5 w-1.5 rounded-full bg-[#00D657] opacity-60 animate-bounce" style={{ animationDelay: "150ms" }} />
            <div className="h-1.5 w-1.5 rounded-full bg-[#00D657] opacity-60 animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
        </div>
      </div>
    </div>
  ) : null;

  const chatInputArea = (
    <div className="p-3 border-t border-border/30 shrink-0">
      {pendingFiles.length > 0 && (
        <div className="flex gap-1.5 mb-2 flex-wrap" data-testid={`preview-files-${agent}`}>
          {pendingFiles.map((file, idx) => (
            <div key={idx} className="flex items-center gap-1.5 rounded-lg border border-[#00D657]/30 bg-muted/20 px-2 py-1 text-xs group/file">
              {getFileIcon(file.type)}
              <span className="max-w-[100px] truncate">{file.name}</span>
              <span className="text-muted-foreground/50">{formatFileSize(file.size)}</span>
              <button onClick={() => removePendingFile(idx)} className="ml-0.5 opacity-0 group-hover/file:opacity-100 transition-opacity"><X className="h-3 w-3 text-muted-foreground hover:text-foreground" /></button>
            </div>
          ))}
        </div>
      )}
      {pendingImages.length > 0 && (
        <div className="flex gap-1.5 mb-2 flex-wrap" data-testid={`preview-images-${agent}`}>
          {pendingImages.map((img, idx) => (
            <div key={idx} className="relative group/preview">
              <img src={img} alt="Preview" className="h-12 w-12 rounded-lg object-cover border border-border/40" />
              <button onClick={() => removePendingImage(idx)} className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover/preview:opacity-100 transition-opacity" data-testid={`btn-remove-image-${agent}-${idx}`}><X className="h-2.5 w-2.5" /></button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <button onClick={() => fileInputRef.current?.click()} disabled={isStreaming} className="p-2.5 rounded-xl border border-border/30 bg-muted/20 hover:bg-muted/40 hover:border-[#00D657]/30 transition-colors shrink-0 disabled:opacity-50" title="Attach file" data-testid={`btn-attach-${agent}`}>
          <Paperclip className="h-4 w-4 text-muted-foreground" />
        </button>
        <textarea
          ref={chatInputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleChatKeyDown}
          placeholder={placeholder}
          className="flex-1 resize-none rounded-xl border border-border/30 bg-muted/30 px-3 py-2.5 text-sm outline-none focus:border-[#00D657]/50 focus:ring-1 focus:ring-[#00D657]/20 min-h-[40px] max-h-[120px] transition-colors text-foreground placeholder:text-muted-foreground"
          rows={1}
          disabled={isStreaming}
          data-testid={`input-chat-${agent}`}
        />
        <button
          onClick={() => { if ((!input.trim() && pendingImages.length === 0 && pendingFiles.length === 0) || isStreaming) return; ensureConversationAndSend(input.trim()); }}
          disabled={(!input.trim() && pendingImages.length === 0 && pendingFiles.length === 0) || isStreaming}
          className="h-10 w-10 rounded-full bg-[#00D657] hover:bg-[#00C04E] text-black flex items-center justify-center shrink-0 disabled:opacity-40 transition-colors"
          data-testid={`btn-send-${agent}`}
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center justify-between mt-1.5 px-1">
        <span className="text-[10px] text-muted-foreground/30">Drop a file to evaluate it against your library</span>
        <kbd className="text-[10px] text-muted-foreground/20 font-mono">⌘J</kbd>
      </div>
    </div>
  );

  return (
    <>
      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,.pdf,.docx,.pptx,.xlsx,.csv" multiple className="hidden" onChange={handleFileSelect} data-testid={`input-file-global-${agent}`} />

      <AnimatePresence>
        {mode === "banner" && !bannerDismissed && (
          <>
          <div className="fixed inset-0 z-[54]" onClick={dismissBanner} data-testid={`banner-backdrop-${agent}`} />
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="fixed bottom-6 right-6 z-[55] w-[320px]"
            data-testid={`welcome-banner-${agent}`}
          >
            <div
              className="rounded-2xl border border-[#00D657]/20 p-4 shadow-2xl bg-card/95 backdrop-blur-xl"
            >
              <button
                onClick={dismissBanner}
                className="absolute top-3 right-3 p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground/60 hover:text-foreground"
                data-testid={`btn-dismiss-banner-${agent}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>

              <div className="flex items-center gap-2.5 mb-3">
                <div className="relative shrink-0">
                  <div className="h-8 w-8 rounded-full bg-[#00D657] flex items-center justify-center">
                    <span className="text-[9px] font-bold text-black">CIA</span>
                  </div>
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-[#00D657]/40"
                    animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  />
                </div>
                <span className="text-sm font-semibold text-foreground">{greeting.title}</span>
              </div>

              <p className="text-sm text-muted-foreground leading-relaxed mb-4">{greeting.message}</p>

              <div className="flex gap-2">
                {greeting.actions.map((action, i) => (
                  <button
                    key={i}
                    onClick={() => handleBannerAction(action.prompt)}
                    className={`flex-1 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                      i === 0
                        ? "bg-[#00D657] text-black hover:bg-[#00C04E]"
                        : "border border-[#00D657]/30 text-[#00D657] hover:bg-[#00D657]/10"
                    }`}
                    data-testid={`btn-banner-action-${agent}-${i}`}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
          </>
        )}
      </AnimatePresence>

      {mode === "closed" && bannerDismissed && (
        <motion.button
          onClick={openChat}
          className="fixed bottom-6 right-6 z-[55] flex items-center gap-2.5 rounded-full border border-[#00D657]/30 px-4 py-2.5 shadow-lg cursor-pointer group bg-card/95 backdrop-blur-xl"
          whileHover={{ boxShadow: "0 0 20px rgba(0, 214, 87, 0.15)" }}
          animate={pillPulse ? { scale: [1, 1.04, 1], borderColor: ["rgba(0,214,87,0.3)", "rgba(0,214,87,0.6)", "rgba(0,214,87,0.3)"] } : {}}
          transition={pillPulse ? { duration: 1.5, ease: "easeInOut" } : { type: "spring", stiffness: 300 }}
          data-testid={`chat-pill-${agent}`}
        >
          <div className="relative shrink-0">
            <div className="h-6 w-6 rounded-full bg-[#00D657] flex items-center justify-center">
              <span className="text-[7px] font-bold text-black">CIA</span>
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-[#00D657] border border-background/50" />
          </div>
          <span className="text-xs font-medium text-foreground/80 whitespace-nowrap group-hover:text-foreground transition-colors">
            {comparisonContext ? "Comparison active — ask me" : greeting.title}
          </span>
          {comparisonContext && (
            <GitCompare className="h-3.5 w-3.5 text-[#00D657] shrink-0" />
          )}
        </motion.button>
      )}

      <AnimatePresence>
        {mode === "chat" && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className={
              isFullscreen
                ? "fixed inset-0 z-[55] flex flex-col overflow-hidden bg-background"
                : "fixed bottom-6 right-6 z-[55] flex flex-col overflow-hidden rounded-2xl border border-[#00D657]/20 shadow-2xl w-[420px] bg-card/[0.97] backdrop-blur-xl"
            }
            style={{
              boxShadow: isFullscreen ? undefined : "-4px 0 20px rgba(0, 0, 0, 0.15)",
              height: isFullscreen ? undefined : "65vh",
              maxHeight: isFullscreen ? undefined : "calc(100vh - 48px)",
            }}
            data-testid={`chat-panel-${agent}`}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30 shrink-0">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-[#00D657] flex items-center justify-center"><span className="text-[8px] font-bold text-black">CIA</span></div>
                <span className="text-sm font-semibold text-foreground truncate max-w-[200px]">
                  {activeConv?.title && activeConv.title !== "New Chat" ? activeConv.title : agentName}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={createConversation} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title="New conversation" data-testid={`btn-new-chat-${agent}`}><Plus className="h-4 w-4" /></button>
                <button onClick={() => setShowHistory(!showHistory)} className={`p-1.5 rounded-lg transition-colors ${showHistory ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`} title="History" data-testid={`btn-history-${agent}`}><History className="h-4 w-4" /></button>
                <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title={isFullscreen ? "Exit fullscreen" : "Fullscreen"} data-testid={`btn-fullscreen-${agent}`}>{isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
                <button onClick={closeChat} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" data-testid={`btn-close-chat-${agent}`}><X className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="flex flex-1 min-h-0">
              <AnimatePresence>
                {showHistory && (
                  <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 240, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="border-r border-border/20 overflow-hidden shrink-0">
                    <div className="w-[240px] h-full overflow-y-auto p-2 scrollbar-thin">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-semibold px-2 py-1 mb-1">History</div>
                      {conversations.length === 0 ? (
                        <div className="text-xs text-muted-foreground/40 text-center py-4">No conversations yet</div>
                      ) : (
                        <div className="space-y-0.5">
                          {conversations.map((conv) => (
                            <div key={conv.id} onClick={() => openConversation(conv)} className={`flex items-center justify-between rounded-lg px-2 py-1.5 cursor-pointer transition group text-xs ${activeConv?.id === conv.id ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`} data-testid={`conv-item-${agent}-${conv.id}`}>
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-medium">{conv.title}</div>
                                <div className="text-[10px] text-muted-foreground/40">{new Date(conv.createdAt).toLocaleDateString()}</div>
                              </div>
                              <button onClick={(e) => deleteConversation(conv.id, e)} className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/20 transition-all shrink-0" data-testid={`btn-delete-conv-${agent}-${conv.id}`}><Trash2 className="h-3 w-3 text-destructive" /></button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex-1 flex flex-col min-w-0">
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
                  {msgs.length === 0 && !streamingContent && (
                    <div className="py-6">
                      <div className="text-center mb-5">
                        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#00D657] mb-3"><span className="text-sm font-bold text-black">CIA</span></div>
                        <div className="text-base font-semibold mb-1">{agentName}</div>
                        <div className="text-xs text-muted-foreground max-w-[280px] mx-auto leading-relaxed">
                          {greeting.message}
                        </div>
                      </div>
                      {comparisonContext && (
                        <div className="mx-auto max-w-[380px] mb-4 rounded-xl border border-[#00D657]/30 bg-[#00D657]/5 px-3.5 py-2.5" data-testid="comparison-context-note">
                          <div className="flex items-center gap-2 mb-1">
                            <GitCompare className="h-3.5 w-3.5 text-[#00D657] shrink-0" />
                            <span className="text-xs font-semibold text-[#00D657]">Comparison Active</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            {comparisonContext.type === "two-way"
                              ? `I have access to both content pieces: ${comparisonNames?.a} vs ${comparisonNames?.b}. Ask me anything about them — specific sections, engagement data, or strategic recommendations.`
                              : `I have access to ${comparisonContext.multiContents?.length || 0} content pieces from your comparison. Ask me anything about them.`
                            }
                          </p>
                        </div>
                      )}
                      {!comparisonContext && <div className="grid grid-cols-2 gap-2 mb-4 max-w-[380px] mx-auto">
                        {STARTERS.map((s) => {
                          const Icon = s.icon;
                          return (
                            <button key={s.label} onClick={() => handleStarterClick(s)} className="flex items-center gap-2 rounded-xl border border-border/30 bg-muted/10 p-2.5 text-left hover:bg-muted/20 hover:border-[#00D657]/30 transition-all group" data-testid={`starter-${s.label.slice(0, 15).replace(/\s+/g, "-").toLowerCase()}`}>
                              <div className="h-7 w-7 rounded-lg bg-[#00D657]/10 flex items-center justify-center group-hover:bg-[#00D657]/20 transition-colors shrink-0"><Icon className="h-3.5 w-3.5 text-[#00D657]" /></div>
                              <span className="text-xs font-medium leading-tight">{s.label}</span>
                            </button>
                          );
                        })}
                      </div>}
                      <div className="space-y-1 max-w-[380px] mx-auto">
                        {allSuggestions.map((q) => (
                          <button key={q} onClick={() => { setInput(q); setTimeout(() => chatInputRef.current?.focus(), 50); }} className="w-full text-left text-xs rounded-xl border border-border/30 bg-muted/10 px-3 py-2 hover:bg-muted/20 hover:border-[#00D657]/30 transition text-muted-foreground hover:text-foreground" data-testid={`suggestion-${agent}-${q.slice(0, 20).replace(/\s+/g, "-").toLowerCase()}`}>
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {msgs.map(renderMessage)}
                  {renderStreaming}
                </div>
                {chatInputArea}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {lightboxImage && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setLightboxImage(null)} data-testid={`lightbox-${agent}`}>
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
              <img src={lightboxImage} alt="Full size" className="max-w-full max-h-[85vh] rounded-xl object-contain" />
              <button onClick={() => setLightboxImage(null)} className="absolute -top-3 -right-3 h-8 w-8 rounded-full bg-card border border-border flex items-center justify-center hover:bg-muted transition-colors" data-testid={`btn-close-lightbox-${agent}`}><X className="h-4 w-4" /></button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
