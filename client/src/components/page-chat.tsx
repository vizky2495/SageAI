import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Plus, Trash2, ShieldCheck, Copy, Check, Paperclip, ZoomIn, Upload, Search, BarChart3, Layers, FileText, File, History, Minimize2, Maximize2, GripHorizontal, MessageSquare, ArrowRight, ChevronDown, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { authFetch } from "@/lib/queryClient";

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

interface SearchResult {
  type: "asset" | "action" | "ask";
  label: string;
  sublabel?: string;
  action: () => void;
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

const STARTERS = [
  { label: "Evaluate a content asset", action: "upload" as const, prompt: "I'd like to evaluate a content asset's performance — show me the top performers.", icon: Upload },
  { label: "Find best content for a campaign", action: "prefill" as const, prompt: "Find the best performing content for ", icon: Search },
  { label: "Compare two content pieces", action: "send" as const, prompt: "I want to compare two content assets side-by-side. Can you help me analyze their performance?", icon: BarChart3 },
  { label: "Show content gaps in my library", action: "send" as const, prompt: "Analyze our content library and show me where we have gaps across funnel stages, products, and content types.", icon: Layers },
];

function buildSmartActions(sendFn: (text: string) => void): { pattern: RegExp; results: (q: string) => SearchResult[] }[] {
  return [
    {
      pattern: /^(compare|vs|versus)/i,
      results: () => [{ type: "action", label: "Compare two content assets", sublabel: "Ask AI to run a side-by-side comparison", action: () => sendFn("Compare two content assets side-by-side. Show me the top performers and their key differences.") }],
    },
    {
      pattern: /^(gap|missing|coverage)/i,
      results: () => [{ type: "action", label: "Run content gap analysis", sublabel: "Find missing content across stages and products", action: () => sendFn("Analyze our content library and show me where we have gaps across funnel stages, products, and content types.") }],
    },
    {
      pattern: /^(top|best|highest|winner)/i,
      results: () => [
        { type: "action", label: "Top 5 performers overall", sublabel: "By combined SQOs and engagement", action: () => sendFn("Show me the top 5 best performing content assets by combined SQOs and engagement.") },
        { type: "action", label: "Top 5 by SQO conversion", sublabel: "Highest lead-to-opportunity rate", action: () => sendFn("What are the top 5 content assets by SQO conversion rate?") },
        { type: "action", label: "Top 5 by engagement time", sublabel: "Longest average time on page", action: () => sendFn("What are the top 5 content assets with the longest average time on page?") },
      ],
    },
    {
      pattern: /^(plan|campaign)/i,
      results: () => [{ type: "action", label: "Open Campaign Planner", sublabel: "Build an AI-powered campaign strategy", action: () => { window.location.href = "/campaign-planner"; } }],
    },
    {
      pattern: /^(evaluate|upload)/i,
      results: () => [{ type: "action", label: "Evaluate content performance", sublabel: "Analyze a content asset against your library", action: () => sendFn("I'd like to evaluate a content asset's performance — show me the top performers and how my content compares.") }],
    },
  ];
}

export default function PageChat({
  agent,
  agentName,
  description,
  placeholder,
  fallbackSuggestions,
  pageContext,
}: PageChatProps) {
  type ChatMode = "closed" | "spotlight" | "fullchat";
  const [mode, setMode] = useState<ChatMode>("closed");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [dynamicSuggestions, setDynamicSuggestions] = useState<string[]>([]);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [spotlightAnswerExpanded, setSpotlightAnswerExpanded] = useState(false);
  const [windowHeight, setWindowHeight] = useState(() => {
    const saved = localStorage.getItem('cia-chat-height');
    return saved ? parseFloat(saved) : 45;
  });
  const [hoverChatBtn, setHoverChatBtn] = useState(false);
  const [windowPos, setWindowPos] = useState<{ x: number; y: number } | null>(null);
  const [hoverTrigger, setHoverTrigger] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const spotlightInputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDragging = useRef(false);
  const isResizing = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const { user } = useAuth();

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, []);

  useEffect(() => { scrollToBottom(); }, [msgs, streamingContent, scrollToBottom]);
  useEffect(() => { fetchConversations(); if (agent === "cia") fetchSuggestions(); }, []);
  useEffect(() => { localStorage.setItem('cia-chat-height', String(windowHeight)); }, [windowHeight]);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (isDragging.current) {
        const x = Math.max(0, Math.min(window.innerWidth - 200, e.clientX - dragOffset.current.x));
        const y = Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragOffset.current.y));
        setWindowPos({ x, y });
      }
      if (isResizing.current) {
        const h = (window.innerHeight - e.clientY) / window.innerHeight * 100;
        const minVh = Math.max(15, (200 / window.innerHeight) * 100);
        setWindowHeight(Math.max(minVh, Math.min(80, h)));
      }
    }
    function onMouseUp() {
      isDragging.current = false;
      isResizing.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => { window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseup", onMouseUp); };
  }, []);

  const smartActions = buildSmartActions((text: string) => {
    setShowSearchResults(false);
    setInput("");
    setSpotlightAnswerExpanded(true);
    ensureConversationAndSend(text);
  });

  useEffect(() => {
    if (input.trim().length < 2) { setSearchResults([]); setShowSearchResults(false); return; }
    const q = input.trim().toLowerCase();
    const isQuestion = /^(what|why|how|which|show|find|list|where|when|who|tell|give|analyze|compare)\b/i.test(q);
    const results: SearchResult[] = [];

    for (const sa of smartActions) {
      if (sa.pattern.test(q)) {
        results.push(...sa.results(q));
      }
    }

    if (isQuestion || q.length > 5) {
      results.unshift({ type: "ask", label: `Ask AI: "${input.trim()}"`, sublabel: "Get an instant answer", action: () => handleSpotlightSend() });
    }

    setSearchResults(results);
    setShowSearchResults(results.length > 0);
  }, [input]);

  async function fetchSuggestions() {
    try {
      const res = await authFetch("/api/chat/suggestions");
      const data = await res.json();
      if (data.suggestions?.length > 0) setDynamicSuggestions(data.suggestions);
    } catch { setDynamicSuggestions([]); }
  }

  const allSuggestions = [...new Set([
    ...fallbackSuggestions,
    ...(agent === "cia" ? dynamicSuggestions : []),
    "Which content has the highest SQO conversion?",
    "Show me aging content that needs a refresh",
    "What are the top performers this quarter?",
  ])].slice(0, 6);

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
      setMode("fullchat");
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
      const res = await authFetch(`/api/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: fullContent || "(shared an image)", images: attachedImages.length > 0 ? attachedImages : undefined }),
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

  function handleSpotlightSend() {
    if (!input.trim() || isStreaming) return;
    setSpotlightAnswerExpanded(true);
    setShowSearchResults(false);
    ensureConversationAndSend(input.trim());
  }

  function handleSpotlightKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (showSearchResults && searchResults.length > 0 && searchResults[0].type === "ask") {
        searchResults[0].action();
      } else if (input.trim()) {
        handleSpotlightSend();
      }
    }
    if (e.key === "Escape") {
      closeAll();
    }
  }

  function handleChatKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if ((!input.trim() && pendingImages.length === 0 && pendingFiles.length === 0) || isStreaming) return;
      ensureConversationAndSend(input.trim());
    }
  }

  function escalateToFullChat() {
    setMode("fullchat");
    setSpotlightAnswerExpanded(false);
    setShowSearchResults(false);
    setTimeout(() => chatInputRef.current?.focus(), 200);
  }

  function closeAll() {
    setMode("closed");
    setIsFullscreen(false);
    setShowHistory(false);
    setSpotlightAnswerExpanded(false);
    setShowSearchResults(false);
    setWindowPos(null);
    setInput("");
  }

  function openSpotlight() {
    setMode("spotlight");
    setTimeout(() => spotlightInputRef.current?.focus(), 150);
  }

  function openFullChat() {
    setMode("fullchat");
    setSpotlightAnswerExpanded(false);
    setShowSearchResults(false);
    setTimeout(() => chatInputRef.current?.focus(), 200);
  }

  function handleStarterClick(s: typeof STARTERS[0]) {
    if (s.action === "upload") {
      setInput(s.prompt);
      setTimeout(() => fileInputRef.current?.click(), 200);
    } else if (s.action === "prefill") {
      setInput(s.prompt);
      if (mode === "spotlight") setTimeout(() => spotlightInputRef.current?.focus(), 100);
      else setTimeout(() => chatInputRef.current?.focus(), 100);
    } else {
      ensureConversationAndSend(s.prompt);
    }
  }

  function handleDragStart(e: React.MouseEvent) {
    if (isFullscreen) return;
    const el = (e.currentTarget as HTMLElement).closest("[data-chat-window]") as HTMLElement;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    isDragging.current = true;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    if (!windowPos) setWindowPos({ x: rect.left, y: rect.top });
  }

  function handleResizeStart(e: React.MouseEvent) {
    if (isFullscreen) return;
    e.preventDefault();
    e.stopPropagation();
    isResizing.current = true;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ns-resize";
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (mode !== "closed") closeAll();
        else openSpotlight();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        if (mode === "fullchat") closeAll();
        else openFullChat();
      }
      if (e.key === "Escape" && mode !== "closed") closeAll();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  useEffect(() => {
    function handleOpenFullChat(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.asset) {
        const context = `Asking about: ${detail.asset.contentId} — ${detail.stage || "Unknown"} — ${detail.asset.productFranchise || "N/A"}`;
        setInput("");
        setMode("fullchat");
        if (detail.messages?.length > 0) {
          const existing = detail.messages.map((m: { id: number; role: string; content: string }) => ({
            ...m,
            createdAt: new Date().toISOString(),
          }));
          setMsgs(existing);
        }
        setTimeout(() => chatInputRef.current?.focus(), 200);
      }
    }
    window.addEventListener("open-full-chat", handleOpenFullChat);
    return () => window.removeEventListener("open-full-chat", handleOpenFullChat);
  }, []);

  const totalMsgCount = msgs.length + (streamingContent ? 1 : 0);
  const shouldSuggestFullChat = mode === "spotlight" && totalMsgCount >= 3 && !isStreaming;

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
            <div className={`rounded-2xl px-3.5 py-2.5 text-sm ${msg.role === "user" ? "bg-[#004D4D] text-white" : "dark:bg-[#1A1A1A] bg-muted/50 border border-border/20"}`}>
              {msg.role === "assistant" ? renderMarkdown(msg.content) : msg.content}
              {msg.images && msg.images.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {msg.images.map((img, imgIdx) => (
                    <button key={imgIdx} onClick={() => setLightboxImage(img)} className="relative group/img rounded-lg overflow-hidden border border-white/20" data-testid={`msg-image-${msg.id}-${imgIdx}`}>
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
        <div className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm dark:bg-[#1A1A1A] bg-muted/50 border border-border/20">
          {renderMarkdown(streamingContent)}
          <span className="inline-block w-1.5 h-4 bg-[#00D657] opacity-60 animate-pulse ml-0.5 rounded-sm" />
        </div>
      </div>
    </div>
  ) : isStreaming ? (
    <div className="flex justify-start" data-testid={`msg-thinking-${agent}`}>
      <div className="flex items-center gap-1.5">
        <div className="h-5 w-5 rounded-full bg-[#00D657] flex items-center justify-center shrink-0"><span className="text-[7px] font-bold text-black">CIA</span></div>
        <div className="rounded-2xl px-3.5 py-2.5 text-sm dark:bg-[#1A1A1A] bg-muted/50 border border-border/20">
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
          className="flex-1 resize-none rounded-xl border border-border/30 dark:bg-[#1A1A1A] bg-muted/30 px-3 py-2.5 text-sm outline-none focus:border-[#00D657]/50 focus:ring-1 focus:ring-[#00D657]/20 min-h-[40px] max-h-[120px] transition-colors"
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
    </div>
  );

  const fullChatWindowStyle = isFullscreen ? {} : windowPos ? { left: windowPos.x, top: windowPos.y, transform: "none", height: `${windowHeight}vh` } : { height: `${windowHeight}vh` };
  const fullChatWindowClass = isFullscreen
    ? "fixed z-50 flex flex-col overflow-hidden border border-[#00D657]/20 shadow-2xl inset-0"
    : windowPos
      ? "fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-[#00D657]/20 shadow-2xl w-[95vw] sm:w-[700px]"
      : "fixed z-50 flex flex-col overflow-hidden rounded-t-2xl border border-[#00D657]/20 shadow-2xl bottom-0 left-0 right-0";

  return (
    <>
      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,.pdf,.docx,.pptx,.csv" multiple className="hidden" onChange={handleFileSelect} data-testid={`input-file-global-${agent}`} />

      {!(mode === "fullchat" && isFullscreen) && (
        <div className="fixed bottom-6 right-6 z-[55] flex flex-col items-center gap-3" data-testid={`floating-buttons-${agent}`}>
          {mode === "closed" && (
            <div
              className="group relative"
              onMouseEnter={() => setHoverTrigger(true)}
              onMouseLeave={() => setHoverTrigger(false)}
              data-testid={`ai-trigger-${agent}`}
            >
              <motion.button
                onClick={openSpotlight}
                className="relative h-12 w-12 rounded-full flex items-center justify-center border border-[#00D657]/30 shadow-lg"
                style={{ background: "rgba(10, 20, 15, 0.85)", backdropFilter: "blur(24px)" }}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                data-testid={`btn-ai-trigger-${agent}`}
              >
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-[#00D657]/30"
                  animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                />
                <span className="text-sm font-bold text-[#00D657]">AI</span>
              </motion.button>
              <AnimatePresence>
                {hoverTrigger && (
                  <motion.div
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="absolute right-14 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border border-[#00D657]/20"
                    style={{ background: "rgba(10, 20, 15, 0.9)", backdropFilter: "blur(16px)" }}
                  >
                    <span className="text-white/70">Spotlight </span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-[#00D657] text-[10px] font-mono ml-0.5">⌘K</kbd>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          <div
            className="group/chat relative"
            onMouseEnter={() => setHoverChatBtn(true)}
            onMouseLeave={() => setHoverChatBtn(false)}
          >
            <motion.button
              onClick={mode === "fullchat" ? closeAll : openFullChat}
              className="relative h-12 w-12 rounded-full flex items-center justify-center border border-[#00D657]/30 shadow-lg"
              style={{ background: "rgba(10, 20, 15, 0.85)", backdropFilter: "blur(24px)" }}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.95 }}
              data-testid={`btn-chat-trigger-${agent}`}
            >
              {mode === "fullchat" ? (
                <Minimize2 className="h-4.5 w-4.5 text-[#00D657]" />
              ) : (
                <MessageSquare className="h-4.5 w-4.5 text-[#00D657]" />
              )}
            </motion.button>
            <AnimatePresence>
              {hoverChatBtn && (
                <motion.div
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="absolute right-14 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border border-[#00D657]/20"
                  style={{ background: "rgba(10, 20, 15, 0.9)", backdropFilter: "blur(16px)" }}
                >
                  <span className="text-white/70">{mode === "fullchat" ? "Close chat" : "Open chat"} </span>
                  <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-[#00D657] text-[10px] font-mono ml-0.5">⌘J</kbd>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      <AnimatePresence>
        {mode === "spotlight" && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-40"
              style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
              onClick={closeAll}
              data-testid={`spotlight-overlay-${agent}`}
            />

            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 500, damping: 35 }}
              className="fixed z-50 left-1/2 -translate-x-1/2 w-[90vw] sm:w-[640px]"
              style={{ top: "20%" }}
              onClick={(e) => e.stopPropagation()}
              data-testid={`spotlight-${agent}`}
            >
              <div className="rounded-2xl border border-[#00D657]/20 shadow-2xl overflow-hidden" style={{ background: "rgba(10, 20, 15, 0.92)", backdropFilter: "blur(30px)" }}>
                <div className="flex items-center gap-3 px-4 h-14 border-b border-[#00D657]/10">
                  <button
                    onClick={openFullChat}
                    className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity"
                    title="Open full chat"
                    data-testid={`btn-spotlight-agent-${agent}`}
                  >
                    <div className="h-7 w-7 rounded-full bg-[#00D657] flex items-center justify-center shrink-0">
                      <Sparkles className="h-3.5 w-3.5 text-black" />
                    </div>
                    <span className="text-xs font-medium text-white/50 hidden sm:inline">{agentName}</span>
                  </button>
                  <input
                    ref={spotlightInputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleSpotlightKeyDown}
                    placeholder={placeholder}
                    className="flex-1 bg-transparent border-none outline-none text-base text-white placeholder:text-white/30"
                    data-testid={`input-spotlight-${agent}`}
                    autoFocus
                  />
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={openFullChat} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors" title="Open full chat" data-testid={`btn-spotlight-openchat-${agent}`}>
                      <MessageSquare className="h-4 w-4 text-white/40" />
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors" data-testid={`btn-spotlight-attach-${agent}`}>
                      <Paperclip className="h-4 w-4 text-white/40" />
                    </button>
                    <button
                      onClick={handleSpotlightSend}
                      disabled={!input.trim() || isStreaming}
                      className="h-8 w-8 rounded-full bg-[#00D657] hover:bg-[#00C04E] text-black flex items-center justify-center disabled:opacity-40 transition-colors"
                      data-testid={`btn-spotlight-send-${agent}`}
                    >
                      <Send className="h-3.5 w-3.5" />
                    </button>
                    <kbd className="text-[10px] text-white/20 font-mono hidden sm:inline">ESC</kbd>
                  </div>
                </div>

                <AnimatePresence>
                  {showSearchResults && searchResults.length > 0 && !spotlightAnswerExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="p-2 max-h-[300px] overflow-y-auto">
                        {searchResults.map((r, i) => (
                          <button
                            key={i}
                            onClick={r.action}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-white/5 transition-colors group"
                            data-testid={`search-result-${i}`}
                          >
                            <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${r.type === "ask" ? "bg-[#00D657]/15" : r.type === "asset" ? "bg-blue-500/15" : "bg-white/5"}`}>
                              {r.type === "ask" ? <Sparkles className="h-4 w-4 text-[#00D657]" /> : r.type === "asset" ? <FileText className="h-4 w-4 text-blue-400" /> : <Search className="h-4 w-4 text-white/40" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm text-white truncate">{r.label}</div>
                              {r.sublabel && <div className="text-xs text-white/40 truncate">{r.sublabel}</div>}
                            </div>
                            <ArrowRight className="h-3.5 w-3.5 text-white/20 group-hover:text-[#00D657] transition-colors shrink-0" />
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {spotlightAnswerExpanded && (msgs.length > 0 || streamingContent || isStreaming) && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div ref={scrollRef} className="max-h-[50vh] overflow-y-auto p-4 space-y-3 scrollbar-thin">
                        {msgs.map(renderMessage)}
                        {renderStreaming}
                      </div>

                      {shouldSuggestFullChat && (
                        <div className="px-4 py-2 border-t border-[#00D657]/10">
                          <button
                            onClick={escalateToFullChat}
                            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium text-[#00D657] hover:bg-[#00D657]/10 transition-colors"
                            data-testid={`btn-escalate-${agent}`}
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            This looks like a deeper conversation. Continue in full chat?
                          </button>
                        </div>
                      )}

                      <div className="flex items-center gap-2 px-4 py-2 border-t border-[#00D657]/10">
                        <button
                          onClick={escalateToFullChat}
                          className="flex items-center gap-1.5 text-xs text-white/50 hover:text-[#00D657] transition-colors"
                          data-testid={`btn-open-fullchat-${agent}`}
                        >
                          <Maximize2 className="h-3 w-3" />
                          Open in full chat
                        </button>
                        <div className="flex-1" />
                        <button
                          onClick={createConversation}
                          className="flex items-center gap-1 text-xs text-white/40 hover:text-white transition-colors"
                          data-testid={`btn-spotlight-new-${agent}`}
                        >
                          <Plus className="h-3 w-3" />
                          New
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {!spotlightAnswerExpanded && !showSearchResults && msgs.length === 0 && (
                  <div className="p-4">
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {STARTERS.map((s) => {
                        const Icon = s.icon;
                        return (
                          <button key={s.label} onClick={() => handleStarterClick(s)} className="flex items-center gap-2.5 rounded-xl border border-white/5 bg-white/[0.03] p-2.5 text-left hover:bg-white/[0.06] hover:border-[#00D657]/20 transition-all group" data-testid={`starter-${s.label.slice(0, 15).replace(/\s+/g, "-").toLowerCase()}`}>
                            <div className="h-7 w-7 rounded-lg bg-[#00D657]/10 flex items-center justify-center group-hover:bg-[#00D657]/20 transition-colors shrink-0">
                              <Icon className="h-3.5 w-3.5 text-[#00D657]" />
                            </div>
                            <span className="text-xs font-medium text-white/70 leading-tight">{s.label}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="space-y-1">
                      {allSuggestions.map((q) => (
                        <button
                          key={q}
                          onClick={() => { setInput(q); setTimeout(() => spotlightInputRef.current?.focus(), 50); }}
                          className="w-full text-left text-xs rounded-lg px-3 py-1.5 hover:bg-white/5 transition text-white/40 hover:text-white/70"
                          data-testid={`suggestion-${agent}-${q.slice(0, 20).replace(/\s+/g, "-").toLowerCase()}`}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mode === "fullchat" && (
          <>
            <motion.div
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 60 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className={fullChatWindowClass}
              style={{ ...fullChatWindowStyle, background: "rgba(10, 12, 10, 0.95)", boxShadow: "0 -4px 20px rgba(0, 0, 0, 0.5)" }}
              data-chat-window
              data-testid={`fullchat-window-${agent}`}
            >
              {!isFullscreen && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-16 h-5 cursor-ns-resize z-10 flex items-center justify-center group" onMouseDown={handleResizeStart} data-testid={`resize-handle-${agent}`}>
                  <div className="w-10 h-1 rounded-full bg-white/20 group-hover:bg-[#00D657]/50 transition-colors" />
                </div>
              )}

              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/20 shrink-0 cursor-grab active:cursor-grabbing select-none" onMouseDown={handleDragStart}>
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-[#00D657] flex items-center justify-center"><span className="text-[8px] font-bold text-black">CIA</span></div>
                  <span className="text-sm font-semibold text-white truncate max-w-[200px]">
                    {activeConv?.title && activeConv.title !== "New Chat" ? activeConv.title : agentName}
                  </span>
                  <GripHorizontal className="h-3.5 w-3.5 text-white/20 ml-1" />
                </div>
                <div className="flex items-center gap-1" onMouseDown={(e) => e.stopPropagation()}>
                  <button onClick={createConversation} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white" title="New conversation" data-testid={`btn-new-chat-${agent}`}><Plus className="h-4 w-4" /></button>
                  <button onClick={() => setShowHistory(!showHistory)} className={`p-1.5 rounded-lg transition-colors ${showHistory ? "bg-white/10 text-white" : "text-white/60 hover:text-white hover:bg-white/10"}`} title="History" data-testid={`btn-history-${agent}`}><History className="h-4 w-4" /></button>
                  <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white" title={isFullscreen ? "Exit fullscreen" : "Fullscreen"} data-testid={`btn-fullscreen-${agent}`}>{isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
                  <button onClick={closeAll} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white" data-testid={`btn-close-chat-${agent}`}><X className="h-4 w-4" /></button>
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
                              <div key={conv.id} onClick={() => openConversation(conv)} className={`flex items-center justify-between rounded-lg px-2 py-1.5 cursor-pointer transition group text-xs ${activeConv?.id === conv.id ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"}`} data-testid={`conv-item-${agent}-${conv.id}`}>
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
                      <div className="py-8">
                        <div className="text-center mb-6">
                          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#00D657] mb-3"><span className="text-sm font-bold text-black">CIA</span></div>
                          <div className="text-base font-semibold mb-1">{agentName}</div>
                          <div className="text-xs text-muted-foreground max-w-[280px] mx-auto">{description}</div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mb-4 max-w-[500px] mx-auto">
                          {STARTERS.map((s) => {
                            const Icon = s.icon;
                            return (
                              <button key={s.label} onClick={() => handleStarterClick(s)} className="flex flex-col items-start gap-2 rounded-xl border border-border/30 bg-muted/10 p-3 text-left hover:bg-muted/20 hover:border-[#00D657]/30 transition-all group" data-testid={`starter-fc-${s.label.slice(0, 15).replace(/\s+/g, "-").toLowerCase()}`}>
                                <div className="h-7 w-7 rounded-lg bg-[#00D657]/10 flex items-center justify-center group-hover:bg-[#00D657]/20 transition-colors"><Icon className="h-3.5 w-3.5 text-[#00D657]" /></div>
                                <span className="text-xs font-medium leading-tight">{s.label}</span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="space-y-1.5 max-w-[500px] mx-auto">
                          {allSuggestions.map((q) => (
                            <button key={q} onClick={() => { setInput(q); setTimeout(() => chatInputRef.current?.focus(), 50); }} className="w-full text-left text-xs rounded-xl border border-border/30 bg-muted/10 px-3 py-2 hover:bg-muted/20 hover:border-[#00D657]/30 transition text-muted-foreground hover:text-foreground" data-testid={`suggestion-fc-${agent}-${q.slice(0, 20).replace(/\s+/g, "-").toLowerCase()}`}>
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
          </>
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
