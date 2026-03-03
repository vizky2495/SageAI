import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/queryClient";
import {
  Upload,
  FileText,
  X,
  Loader2,
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  Minus,
  Plus,
} from "lucide-react";

interface PdfResult {
  filename: string;
  pageCount: number;
  wordCount: number;
  text: string;
}

interface SlotState {
  file: File | null;
  result: PdfResult | null;
  loading: boolean;
  error: string | null;
}

const EMPTY_SLOT: SlotState = { file: null, result: null, loading: false, error: null };

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function StatBox({ label, valueA, valueB }: { label: string; valueA: number; valueB: number }) {
  const diff = valueA - valueB;
  const pct = valueB > 0 ? ((diff / valueB) * 100).toFixed(0) : diff > 0 ? "+100" : "0";
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl bg-muted/30 border border-border/30 p-3 min-w-[100px]">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="flex items-center gap-3">
        <span className="text-lg font-bold tabular-nums" data-testid={`stat-a-${label.toLowerCase().replace(/\s/g, "-")}`}>
          {valueA.toLocaleString()}
        </span>
        <span className="text-muted-foreground/40">vs</span>
        <span className="text-lg font-bold tabular-nums" data-testid={`stat-b-${label.toLowerCase().replace(/\s/g, "-")}`}>
          {valueB.toLocaleString()}
        </span>
      </div>
      {diff !== 0 && (
        <div className={`flex items-center gap-0.5 text-xs font-medium ${diff > 0 ? "text-emerald-400" : "text-rose-400"}`}>
          {diff > 0 ? <Plus className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
          <span>{Math.abs(diff).toLocaleString()} ({diff > 0 ? "+" : ""}{pct}%)</span>
        </div>
      )}
    </div>
  );
}

function UploadSlot({
  label,
  slot,
  onFileSelect,
  onClear,
  accentColor,
}: {
  label: string;
  slot: SlotState;
  onFileSelect: (file: File) => void;
  onClear: () => void;
  accentColor: string;
}) {
  const [textExpanded, setTextExpanded] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) onFileSelect(file);
    },
    [onFileSelect]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFileSelect(file);
      e.target.value = "";
    },
    [onFileSelect]
  );

  if (slot.result) {
    const previewText = slot.result.text.slice(0, 500);
    const hasMore = slot.result.text.length > 500;
    return (
      <div className="flex flex-col gap-3 flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className={`h-4 w-4 shrink-0 ${accentColor}`} />
            <span className="text-sm font-medium truncate" data-testid={`text-filename-${label.toLowerCase()}`}>
              {slot.result.filename}
            </span>
          </div>
          <button
            onClick={onClear}
            className="h-6 w-6 rounded-full flex items-center justify-center hover:bg-muted/50 transition-colors shrink-0"
            data-testid={`btn-clear-${label.toLowerCase()}`}
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex gap-2">
          <Badge variant="secondary" className="border bg-card/70" data-testid={`badge-pages-${label.toLowerCase()}`}>
            {slot.result.pageCount} {slot.result.pageCount === 1 ? "page" : "pages"}
          </Badge>
          <Badge variant="secondary" className="border bg-card/70" data-testid={`badge-words-${label.toLowerCase()}`}>
            {slot.result.wordCount.toLocaleString()} words
          </Badge>
        </div>

        <div className="rounded-xl bg-muted/20 border border-border/30 p-3">
          <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap break-words" data-testid={`text-preview-${label.toLowerCase()}`}>
            {textExpanded ? slot.result.text : previewText}
            {!textExpanded && hasMore && "..."}
          </p>
          {hasMore && (
            <button
              onClick={() => setTextExpanded(!textExpanded)}
              className="flex items-center gap-1 mt-2 text-[11px] font-medium text-primary hover:underline"
              data-testid={`btn-expand-${label.toLowerCase()}`}
            >
              {textExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {textExpanded ? "Show less" : "Show full text"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0">
      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border/40 bg-muted/10 p-8 cursor-pointer hover:border-primary/40 hover:bg-muted/20 transition-all ${
          slot.loading ? "pointer-events-none opacity-60" : ""
        }`}
        data-testid={`dropzone-${label.toLowerCase()}`}
      >
        {slot.loading ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/50" />
            <span className="text-xs text-muted-foreground">Extracting text...</span>
          </>
        ) : (
          <>
            <Upload className={`h-8 w-8 ${accentColor} opacity-60`} />
            <div className="text-center">
              <span className="text-sm font-medium">{label}</span>
              <p className="text-[11px] text-muted-foreground mt-0.5">Drop a PDF or click to browse</p>
            </div>
            <input type="file" accept=".pdf" className="hidden" onChange={handleFileInput} />
          </>
        )}
      </label>
      {slot.error && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-1.5 mt-2 text-xs text-destructive"
          data-testid={`text-error-${label.toLowerCase()}`}
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {slot.error}
        </motion.div>
      )}
    </div>
  );
}

function ComparisonSummary({ a, b }: { a: PdfResult; b: PdfResult }) {
  const wordsA = new Set(a.text.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(b.text.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const shared = [...wordsA].filter(w => wordsB.has(w));
  const overlapPct = wordsA.size > 0 || wordsB.size > 0
    ? ((shared.length * 2) / (wordsA.size + wordsB.size) * 100).toFixed(1)
    : "0";

  const sentencesA = a.text.split(/[.!?]+/).filter(s => s.trim().length > 10).length;
  const sentencesB = b.text.split(/[.!?]+/).filter(s => s.trim().length > 10).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <Card className="rounded-2xl border bg-card/80 p-5 backdrop-blur" data-testid="comparison-summary">
        <div className="flex items-center gap-2 mb-4">
          <ArrowLeftRight className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Comparison Results</h3>
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          <StatBox label="Pages" valueA={a.pageCount} valueB={b.pageCount} />
          <StatBox label="Words" valueA={a.wordCount} valueB={b.wordCount} />
          <StatBox label="Sentences" valueA={sentencesA} valueB={sentencesB} />
        </div>

        <div className="rounded-xl bg-muted/20 border border-border/30 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vocabulary Overlap</span>
            <span className="text-sm font-bold" data-testid="text-overlap-pct">{overlapPct}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${overlapPct}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-400"
            />
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
            <span>{wordsA.size.toLocaleString()} unique words in A</span>
            <span>{shared.length.toLocaleString()} shared</span>
            <span>{wordsB.size.toLocaleString()} unique words in B</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="rounded-xl bg-muted/20 border border-border/30 p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Only in A</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed" data-testid="text-unique-a">
              {[...wordsA].filter(w => !wordsB.has(w)).slice(0, 20).join(", ") || "None"}
              {[...wordsA].filter(w => !wordsB.has(w)).length > 20 && ` (+${[...wordsA].filter(w => !wordsB.has(w)).length - 20} more)`}
            </p>
          </div>
          <div className="rounded-xl bg-muted/20 border border-border/30 p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-sky-400" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Only in B</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed" data-testid="text-unique-b">
              {[...wordsB].filter(w => !wordsA.has(w)).slice(0, 20).join(", ") || "None"}
              {[...wordsB].filter(w => !wordsA.has(w)).length > 20 && ` (+${[...wordsB].filter(w => !wordsA.has(w)).length - 20} more)`}
            </p>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

export default function ContentComparison() {
  const [slotA, setSlotA] = useState<SlotState>(EMPTY_SLOT);
  const [slotB, setSlotB] = useState<SlotState>(EMPTY_SLOT);
  const [expanded, setExpanded] = useState(false);

  const MAX_FILE_SIZE_MB = 20;

  const extractPdf = useCallback(async (file: File, setSlot: (s: SlotState) => void) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setSlot({ file, result: null, loading: false, error: "Only PDF files are supported." });
      return;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setSlot({ file, result: null, loading: false, error: `File exceeds the ${MAX_FILE_SIZE_MB}MB size limit.` });
      return;
    }
    setSlot({ file, result: null, loading: true, error: null });
    try {
      const base64 = await fileToBase64(file);
      const res = await authFetch("/api/assets/extract-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64: base64, filename: file.name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSlot({ file, result: null, loading: false, error: data.error || "Extraction failed." });
        return;
      }
      setSlot({ file, result: data, loading: false, error: null });
    } catch {
      setSlot({ file, result: null, loading: false, error: "Something went wrong." });
    }
  }, []);

  const bothReady = slotA.result && slotB.result;

  return (
    <Card className="rounded-2xl border bg-card/80 backdrop-blur shadow-sm" data-testid="content-comparison-tool">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/10 transition-colors rounded-2xl"
        data-testid="btn-toggle-comparison"
      >
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 ring-1 ring-primary/30">
            <ArrowLeftRight className="h-4 w-4 text-primary" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold">Content Comparison</h3>
            <p className="text-[11px] text-muted-foreground">Upload two PDFs to compare content side by side</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {bothReady && (
            <Badge variant="secondary" className="border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
              Ready
            </Badge>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4">
              <div className="flex gap-4 flex-col sm:flex-row">
                <UploadSlot
                  label="Document A"
                  slot={slotA}
                  onFileSelect={(f) => extractPdf(f, setSlotA)}
                  onClear={() => setSlotA(EMPTY_SLOT)}
                  accentColor="text-emerald-400"
                />
                <div className="hidden sm:flex items-center justify-center">
                  <div className="h-10 w-10 rounded-full bg-muted/30 border border-border/30 flex items-center justify-center">
                    <ArrowLeftRight className="h-4 w-4 text-muted-foreground/50" />
                  </div>
                </div>
                <UploadSlot
                  label="Document B"
                  slot={slotB}
                  onFileSelect={(f) => extractPdf(f, setSlotB)}
                  onClear={() => setSlotB(EMPTY_SLOT)}
                  accentColor="text-sky-400"
                />
              </div>

              {bothReady && (
                <ComparisonSummary a={slotA.result!} b={slotB.result!} />
              )}

              {(slotA.result || slotB.result) && (
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setSlotA(EMPTY_SLOT); setSlotB(EMPTY_SLOT); }}
                    className="text-xs"
                    data-testid="btn-reset-comparison"
                  >
                    Reset Both
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
