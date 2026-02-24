import { useState, useRef, useEffect, useCallback } from "react";
import { MessageSquare, X, Send, Plus, Trash2, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface Conversation {
  id: number;
  title: string;
  createdAt: string;
  messages?: Message[];
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
          <span className="text-muted-foreground shrink-0">•</span>
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

export default function AIChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [showList, setShowList] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
    }
  }, [isOpen]);

  async function fetchConversations() {
    try {
      const res = await fetch("/api/conversations");
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
        body: JSON.stringify({ title: "New Chat" }),
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

    try {
      const res = await fetch(`/api/conversations/${activeConv.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: userMsg.content }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let full = "";

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
                if (data.content) {
                  full += data.content;
                  setStreamingContent(full);
                }
                if (data.done) {
                  setMsgs((prev) => [
                    ...prev,
                    {
                      id: Date.now() + 1,
                      role: "assistant",
                      content: full,
                      createdAt: new Date().toISOString(),
                    },
                  ]);
                  setStreamingContent("");

                  if (msgs.length === 0 && full.length > 0) {
                    const title = userMsg.content.slice(0, 50) + (userMsg.content.length > 50 ? "..." : "");
                    setActiveConv((prev) => prev ? { ...prev, title } : prev);
                    fetchConversations();
                  }
                }
                if (data.error) {
                  setMsgs((prev) => [
                    ...prev,
                    {
                      id: Date.now() + 1,
                      role: "assistant",
                      content: "Sorry, I encountered an error. Please try again.",
                      createdAt: new Date().toISOString(),
                    },
                  ]);
                  setStreamingContent("");
                }
              } catch {
                // skip parse errors
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("Stream error:", err);
      setMsgs((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
          createdAt: new Date().toISOString(),
        },
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
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-20 right-6 z-50 w-[420px] h-[600px] rounded-2xl border bg-card shadow-2xl flex flex-col overflow-hidden"
            data-testid="chatbot-panel"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b bg-card/90 backdrop-blur shrink-0">
              <div className="flex items-center gap-2">
                {!showList && activeConv && (
                  <button
                    onClick={() => setShowList(true)}
                    className="p-1 rounded-lg hover:bg-muted/50 transition-colors"
                    data-testid="btn-back-to-list"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                )}
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-sm font-semibold">
                    {showList ? "CIA Analyst" : (activeConv?.title || "New Chat")}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={createConversation}
                  className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors"
                  title="New chat"
                  data-testid="btn-new-chat"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors"
                  data-testid="btn-close-chat"
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
                    data-testid="btn-new-conversation"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    New conversation
                  </Button>
                </div>
                {conversations.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    No conversations yet. Start a new chat to ask questions about your marketing data.
                  </div>
                ) : (
                  <div className="space-y-1">
                    {conversations.map((conv) => (
                      <div
                        key={conv.id}
                        onClick={() => openConversation(conv)}
                        className="flex items-center justify-between rounded-xl border bg-card/60 px-3 py-2.5 cursor-pointer hover:bg-card/80 transition group"
                        data-testid={`conv-item-${conv.id}`}
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
                          data-testid={`btn-delete-conv-${conv.id}`}
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
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
                  {msgs.length === 0 && !streamingContent && (
                    <div className="text-center py-8">
                      <div className="text-lg font-semibold mb-1">CIA Marketing Analyst</div>
                      <div className="text-sm text-muted-foreground mb-4">
                        Ask me about your marketing data, funnel performance, channel analysis, or any KPI.
                      </div>
                      <div className="grid gap-2">
                        {[
                          "What are the top performing channels by SQOs?",
                          "Show me the funnel stage breakdown",
                          "Which products have the best lead-to-SQO conversion?",
                          "What CTAs drive the most conversions?",
                        ].map((q) => (
                          <button
                            key={q}
                            onClick={() => {
                              setInput(q);
                              setTimeout(() => inputRef.current?.focus(), 50);
                            }}
                            className="text-left text-xs rounded-xl border bg-card/60 px-3 py-2 hover:bg-card/80 transition text-muted-foreground hover:text-foreground"
                            data-testid={`suggestion-${q.slice(0, 20).replace(/\s+/g, "-").toLowerCase()}`}
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
                      data-testid={`msg-${msg.role}-${msg.id}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/50 border"
                        }`}
                      >
                        {msg.role === "assistant" ? renderMarkdown(msg.content) : msg.content}
                      </div>
                    </div>
                  ))}

                  {streamingContent && (
                    <div className="flex justify-start" data-testid="msg-streaming">
                      <div className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm bg-muted/50 border">
                        {renderMarkdown(streamingContent)}
                        <span className="inline-block w-1.5 h-4 bg-primary/60 animate-pulse ml-0.5 rounded-sm" />
                      </div>
                    </div>
                  )}

                  {isStreaming && !streamingContent && (
                    <div className="flex justify-start" data-testid="msg-thinking">
                      <div className="rounded-2xl px-3.5 py-2.5 text-sm bg-muted/50 border">
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                          <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                          <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-3 border-t shrink-0">
                  <div className="flex items-end gap-2">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Ask about your marketing data..."
                      className="flex-1 resize-none rounded-xl border bg-muted/30 px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary/40 min-h-[40px] max-h-[100px]"
                      rows={1}
                      disabled={isStreaming}
                      data-testid="input-chat-message"
                    />
                    <Button
                      size="icon"
                      className="rounded-xl h-10 w-10 shrink-0"
                      onClick={sendMessage}
                      disabled={!input.trim() || isStreaming}
                      data-testid="btn-send-message"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="text-center mt-1.5">
                    <span className="text-[10px] text-muted-foreground/50">
                      Powered by Claude — answers based on your uploaded data
                    </span>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 ${
          isOpen
            ? "bg-muted border"
            : "bg-primary text-primary-foreground"
        }`}
        data-testid="btn-toggle-chatbot"
      >
        {isOpen ? <X className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
      </button>
    </>
  );
}
