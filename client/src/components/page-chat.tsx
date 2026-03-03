import { useState, useRef, useEffect, useCallback } from "react";
import { MessageSquare, X, Send, Plus, Trash2, ChevronLeft, ShieldCheck, Copy, Check, Paperclip, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

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

interface PageChatProps {
  agent: string;
  agentName: string;
  description: string;
  placeholder: string;
  accentColor: string;
  accentBg: string;
  accentRing: string;
  fallbackSuggestions: string[];
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

export default function PageChat({
  agent,
  agentName,
  description,
  placeholder,
  accentColor,
  accentBg,
  accentRing,
  fallbackSuggestions,
}: PageChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [showList, setShowList] = useState(true);
  const [dynamicSuggestions, setDynamicSuggestions] = useState<string[]>([]);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [msgs, streamingContent, scrollToBottom]);

  useEffect(() => {
    if (isOpen) {
      fetchConversations();
      if (agent === "cia") fetchSuggestions();
    }
  }, [isOpen]);

  async function fetchSuggestions() {
    try {
      const res = await fetch("/api/chat/suggestions");
      const data = await res.json();
      if (data.suggestions?.length > 0) {
        setDynamicSuggestions(data.suggestions);
      }
    } catch {
      setDynamicSuggestions([]);
    }
  }

  const suggestions = agent === "cia" && dynamicSuggestions.length > 0
    ? dynamicSuggestions
    : fallbackSuggestions;

  async function fetchConversations() {
    try {
      const res = await fetch(`/api/conversations?agent=${agent}`);
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
        body: JSON.stringify({ title: "New Chat", agent }),
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

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (file.size > 5 * 1024 * 1024) return;
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setPendingImages((prev) => [...prev, result]);
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removePendingImage(index: number) {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  }

  async function sendMessage() {
    if ((!input.trim() && pendingImages.length === 0) || isStreaming || !activeConv) return;

    const attachedImages = [...pendingImages];
    const userMsg: Message = {
      id: Date.now(),
      role: "user",
      content: input.trim(),
      createdAt: new Date().toISOString(),
      images: attachedImages.length > 0 ? attachedImages : undefined,
    };

    setMsgs((prev) => [...prev, userMsg]);
    setInput("");
    setPendingImages([]);
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
        body: JSON.stringify({
          content: userMsg.content || "(shared an image)",
          images: attachedImages.length > 0 ? attachedImages : undefined,
        }),
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

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] md:hidden"
              onClick={() => setIsOpen(false)}
              data-testid={`chat-overlay-${agent}`}
            />

            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 400, damping: 35 }}
              className="fixed top-0 right-0 z-50 h-full w-full sm:w-[420px] border-l border-border/40 bg-card shadow-2xl flex flex-col"
              data-testid={`chat-panel-${agent}`}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b bg-card/90 backdrop-blur shrink-0">
                <div className="flex items-center gap-2">
                  {!showList && activeConv && (
                    <button
                      onClick={() => setShowList(true)}
                      className="p-1 rounded-lg hover:bg-muted/50 transition-colors"
                      data-testid={`btn-back-${agent}`}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                  )}
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full animate-pulse ${accentBg}`} />
                    <span className="text-sm font-semibold">
                      {showList ? agentName : (activeConv?.title || "New Chat")}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={createConversation}
                    className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors"
                    title="New chat"
                    data-testid={`btn-new-chat-${agent}`}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors"
                    data-testid={`btn-close-chat-${agent}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {showList ? (
                <div className="flex-1 overflow-y-auto p-3">
                  <div className="mb-3">
                    <Button
                      onClick={createConversation}
                      className="w-full rounded-xl"
                      variant="outline"
                      data-testid={`btn-new-conv-${agent}`}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      New conversation
                    </Button>
                  </div>
                  {conversations.length === 0 ? (
                    <div className="text-center text-sm text-muted-foreground py-8">
                      No conversations yet. Start a new chat to talk to {agentName}.
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {conversations.map((conv) => (
                        <div
                          key={conv.id}
                          onClick={() => openConversation(conv)}
                          className="flex items-center justify-between rounded-xl border bg-card/60 px-3 py-2.5 cursor-pointer hover:bg-card/80 transition group"
                          data-testid={`conv-item-${agent}-${conv.id}`}
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
                            data-testid={`btn-delete-conv-${agent}-${conv.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                    {msgs.length === 0 && !streamingContent && (
                      <div className="text-center py-8">
                        <div className="text-lg font-semibold mb-1">{agentName}</div>
                        <div className="text-sm text-muted-foreground mb-4">
                          {description}
                        </div>
                        <div className="grid gap-2">
                          {suggestions.map((q) => (
                            <button
                              key={q}
                              onClick={() => {
                                setInput(q);
                                setTimeout(() => inputRef.current?.focus(), 50);
                              }}
                              className="text-left text-xs rounded-xl border bg-card/60 px-3 py-2 hover:bg-card/80 transition text-muted-foreground hover:text-foreground"
                              data-testid={`suggestion-${agent}-${q.slice(0, 20).replace(/\s+/g, "-").toLowerCase()}`}
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {msgs.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                        data-testid={`msg-${agent}-${msg.role}-${msg.id}`}
                      >
                        <div className="max-w-[85%]">
                          <div
                            className={`rounded-2xl px-3.5 py-2.5 text-sm ${
                              msg.role === "user"
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted/50 border"
                            }`}
                          >
                            {msg.role === "assistant" ? renderMarkdown(msg.content) : msg.content}
                            {msg.images && msg.images.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {msg.images.map((img, idx) => (
                                  <button
                                    key={idx}
                                    onClick={() => setLightboxImage(img)}
                                    className="relative group/img rounded-lg overflow-hidden border border-white/20"
                                    data-testid={`msg-image-${msg.id}-${idx}`}
                                  >
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
                                  <ShieldCheck className={`h-3 w-3 ${accentColor}`} />
                                  <span className={`text-[10px] ${accentColor} opacity-80 font-medium`}>Grounded</span>
                                </div>
                              )}
                              <CopyButton text={msg.content} msgId={msg.id} />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                    {streamingContent && (
                      <div className="flex justify-start" data-testid={`msg-streaming-${agent}`}>
                        <div className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm bg-muted/50 border">
                          {renderMarkdown(streamingContent)}
                          <span className={`inline-block w-1.5 h-4 ${accentBg} opacity-60 animate-pulse ml-0.5 rounded-sm`} />
                        </div>
                      </div>
                    )}

                    {isStreaming && !streamingContent && (
                      <div className="flex justify-start" data-testid={`msg-thinking-${agent}`}>
                        <div className="rounded-2xl px-3.5 py-2.5 text-sm bg-muted/50 border">
                          <div className="flex items-center gap-1.5">
                            <div className={`h-1.5 w-1.5 rounded-full ${accentBg} opacity-60 animate-bounce`} style={{ animationDelay: "0ms" }} />
                            <div className={`h-1.5 w-1.5 rounded-full ${accentBg} opacity-60 animate-bounce`} style={{ animationDelay: "150ms" }} />
                            <div className={`h-1.5 w-1.5 rounded-full ${accentBg} opacity-60 animate-bounce`} style={{ animationDelay: "300ms" }} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="p-3 border-t shrink-0">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      multiple
                      className="hidden"
                      onChange={handleFileSelect}
                      data-testid={`input-file-${agent}`}
                    />
                    {pendingImages.length > 0 && (
                      <div className="flex gap-1.5 mb-2 flex-wrap" data-testid={`preview-images-${agent}`}>
                        {pendingImages.map((img, idx) => (
                          <div key={idx} className="relative group/preview">
                            <img src={img} alt="Preview" className="h-12 w-12 rounded-lg object-cover border border-border/40" />
                            <button
                              onClick={() => removePendingImage(idx)}
                              className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover/preview:opacity-100 transition-opacity"
                              data-testid={`btn-remove-image-${agent}-${idx}`}
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex items-end gap-2">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isStreaming}
                        className="p-2.5 rounded-xl border bg-muted/30 hover:bg-muted/50 transition-colors shrink-0 disabled:opacity-50"
                        title="Attach image"
                        data-testid={`btn-attach-${agent}`}
                      >
                        <Paperclip className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder}
                        className={`flex-1 resize-none rounded-xl border bg-muted/30 px-3 py-2.5 text-sm outline-none focus:ring-1 ${accentRing} min-h-[40px] max-h-[100px]`}
                        rows={1}
                        disabled={isStreaming}
                        data-testid={`input-chat-${agent}`}
                      />
                      <Button
                        size="icon"
                        className="rounded-xl h-10 w-10 shrink-0"
                        onClick={sendMessage}
                        disabled={(!input.trim() && pendingImages.length === 0) || isStreaming}
                        data-testid={`btn-send-${agent}`}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            onClick={() => setIsOpen(true)}
            className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full border border-border/50 bg-card/90 backdrop-blur shadow-lg px-4 py-2.5 hover:shadow-xl hover:border-border/80 transition-all group`}
            data-testid={`btn-toggle-chat-${agent}`}
          >
            <div className={`h-7 w-7 rounded-full flex items-center justify-center ring-1 ${accentRing}`} style={{ background: "hsl(var(--muted)/0.5)" }}>
              <MessageSquare className={`h-3.5 w-3.5 ${accentColor}`} />
            </div>
            <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
              Ask {agentName}
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {lightboxImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setLightboxImage(null)}
            data-testid={`lightbox-${agent}`}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="relative max-w-[90vw] max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <img src={lightboxImage} alt="Full size" className="max-w-full max-h-[85vh] rounded-xl object-contain" />
              <button
                onClick={() => setLightboxImage(null)}
                className="absolute -top-3 -right-3 h-8 w-8 rounded-full bg-card border border-border flex items-center justify-center hover:bg-muted transition-colors"
                data-testid={`btn-close-lightbox-${agent}`}
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
