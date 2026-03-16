import { useState, useCallback, useRef, useEffect } from "react";
import { Upload, FileUp, Check, AlertCircle, Loader2, ArrowRight, ArrowLeft, X, CheckCircle2, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { authFetch } from "@/lib/queryClient";

interface UploadResponse {
  headers: string[];
  rowCount: number;
  sampleRows: Record<string, any>[];
  filename: string;
  suggestedMapping: Record<string, string>;
  targetFields: { field: string; description: string }[];
}

interface ProcessResponse {
  batchId: string;
  totalProcessed: number;
  totalRawRows: number;
  uniqueContacts: number;
  dateRange: { earliest: string; latest: string } | null;
  duplicatesRemoved: number;
  emailsHashed: number;
  dirtyValuesCleaned: number;
  matchedAssets: number;
  unmatchedAssets: number;
  interactionTypes: Record<string, number>;
}

interface PreviewResponse {
  totalProcessed: number;
  totalRawRows: number;
  uniqueContacts: number;
  dateRange: { earliest: string; latest: string } | null;
  duplicatesRemoved: number;
  emailsHashed: number;
  dirtyValuesCleaned: number;
  matchedAssets: number;
  unmatchedAssets: number;
  interactionTypes: Record<string, number>;
}

interface BuildProgress {
  status: "idle" | "building" | "complete" | "error";
  phase: string;
  currentStep: number;
  totalSteps: number;
  message: string;
  error: string | null;
  result: {
    contactsProcessed: number;
    patternsFound: number;
    transitionsFound: number;
    assetStatsComputed: number;
  } | null;
}

type Step = 1 | 2 | 3 | 4;

const FIELD_LABELS: Record<string, string> = {
  email_address: "Email Address",
  contact_id: "Contact ID",
  asset_id: "Asset ID",
  activity_type: "Activity Type",
  activity_date: "Activity Date",
  campaign_name: "Campaign Name",
  sfdc_campaign_id: "SFDC Campaign ID",
  lead_status: "Lead Status",
  form_name: "Form Name",
  form_score: "Form Score",
  page_url: "Page URL",
  referrer: "Referrer",
  channel: "Channel",
  source: "Source",
  country: "Country",
  product: "Product",
};

const REQUIRED_FIELDS = ["email_address", "contact_id"];

export default function JourneyUpload({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadData, setUploadData] = useState<UploadResponse | null>(null);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [processResult, setProcessResult] = useState<ProcessResponse | null>(null);
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [buildProgress, setBuildProgress] = useState<BuildProgress | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    if (step !== 4 || !processResult) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await authFetch("/api/journey/build-progress");
        if (!res.ok || cancelled) return;
        const data: BuildProgress = await res.json();
        setBuildProgress(data);
        if (data.status === "building") {
          setTimeout(poll, 2000);
        }
      } catch (_) {}
    };
    poll();
    return () => { cancelled = true; };
  }, [step, processResult]);

  const handleFile = useCallback(async (f: File) => {
    setFile(f);
    setError(null);
    setFileBase64("ready");
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleUpload = async () => {
    if (!file || !fileBase64) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await authFetch("/api/journey/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Upload failed");
      }
      const data: UploadResponse = await res.json();
      setUploadData(data);
      setFieldMapping(data.suggestedMapping || {});
      setStep(2);
    } catch (err: any) {
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handlePreview = async () => {
    if (!fileBase64 || !file) return;
    setPreviewing(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("fieldMapping", JSON.stringify(fieldMapping));
      const res = await authFetch("/api/journey/preview", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Preview failed");
      }
      const data: PreviewResponse = await res.json();
      setPreviewData(data);
      setStep(3);
    } catch (err: any) {
      setError(err.message || "Preview failed");
    } finally {
      setPreviewing(false);
    }
  };

  const handleProcess = async () => {
    if (!fileBase64 || !file) return;
    setProcessing(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("fieldMapping", JSON.stringify(fieldMapping));
      const res = await authFetch("/api/journey/process", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Processing failed");
      }
      const data: ProcessResponse = await res.json();
      setProcessResult(data);
      setStep(4);
    } catch (err: any) {
      setError(err.message || "Processing failed");
    } finally {
      setProcessing(false);
    }
  };

  const hasMappedContact = fieldMapping.email_address || fieldMapping.contact_id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="modal-journey-upload">
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border/40 bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold" data-testid="text-upload-title">Upload Eloqua Activity Data</h2>
            <p className="text-sm text-muted-foreground mt-1">Import interaction data for content journey mapping</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-upload">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                step >= s ? "bg-[#00D657] text-black" : "bg-muted text-muted-foreground"
              }`} data-testid={`step-indicator-${s}`}>
                {step > s ? <Check className="h-4 w-4" /> : s}
              </div>
              <span className={`text-xs hidden sm:inline ${step >= s ? "text-foreground" : "text-muted-foreground"}`}>
                {s === 1 ? "Upload" : s === 2 ? "Map Fields" : s === 3 ? "Preview" : "Complete"}
              </span>
              {s < 4 && <div className={`flex-1 h-px ${step > s ? "bg-[#00D657]" : "bg-border"}`} />}
            </div>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm" data-testid="text-upload-error">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                dragActive ? "border-[#00D657] bg-[#00D657]/5" : "border-border/50 hover:border-[#00D657]/50"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              data-testid="dropzone-file"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".tsv,.csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
                data-testid="input-file"
              />
              <FileUp className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium">Drop your Eloqua export file here</p>
              <p className="text-xs text-muted-foreground mt-1">Supports TSV, CSV, and XLSX formats</p>
            </div>

            {file && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 border border-border/30" data-testid="text-selected-file">
                <Upload className="h-4 w-4 text-[#00D657]" />
                <span className="text-sm font-medium flex-1 truncate">{file.name}</span>
                <span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</span>
                <Button variant="ghost" size="sm" onClick={() => { setFile(null); setFileBase64(""); }} data-testid="button-remove-file">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                onClick={handleUpload}
                disabled={!file || !fileBase64 || uploading}
                className="bg-[#00D657] hover:bg-[#00D657]/90 text-black"
                data-testid="button-upload-file"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                Parse & Continue
              </Button>
            </div>
          </div>
        )}

        {step === 2 && uploadData && (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/10 border border-border/30 p-3">
              <p className="text-sm">
                <span className="font-medium">{uploadData.rowCount.toLocaleString()}</span> rows detected in{" "}
                <span className="font-medium">{uploadData.filename}</span> with{" "}
                <span className="font-medium">{uploadData.headers.length}</span> columns
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Field Mapping</h3>
              <p className="text-xs text-muted-foreground">Map your file columns to journey data fields. At least one contact identifier (Email or Contact ID) is required.</p>
            </div>

            <div className="grid gap-2 max-h-[40vh] overflow-y-auto pr-1">
              {uploadData.targetFields.map((tf) => (
                <div key={tf.field} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/10" data-testid={`mapping-row-${tf.field}`}>
                  <div className="w-36 shrink-0">
                    <span className="text-xs font-medium">{FIELD_LABELS[tf.field] || tf.field}</span>
                    {REQUIRED_FIELDS.includes(tf.field) && (
                      <span className="text-[10px] text-amber-400 ml-1">*</span>
                    )}
                  </div>
                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  <Select
                    value={fieldMapping[tf.field] || "__none__"}
                    onValueChange={(val) => {
                      setFieldMapping(prev => {
                        const next = { ...prev };
                        if (val === "__none__") {
                          delete next[tf.field];
                        } else {
                          next[tf.field] = val;
                        }
                        return next;
                      });
                    }}
                  >
                    <SelectTrigger className="flex-1 h-8 text-xs" data-testid={`select-mapping-${tf.field}`}>
                      <SelectValue placeholder="Not mapped" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Not mapped</SelectItem>
                      {uploadData.headers.map((h) => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="flex justify-between">
              <Button variant="outline" size="sm" onClick={() => setStep(1)} data-testid="button-back-to-upload">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button
                onClick={handlePreview}
                disabled={!hasMappedContact || previewing}
                className="bg-[#00D657] hover:bg-[#00D657]/90 text-black"
                data-testid="button-continue-to-preview"
              >
                {previewing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {previewing ? "Analyzing..." : "Preview"} <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {step === 3 && previewData && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Validation Preview</h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border border-border/30 bg-muted/10 p-3">
                <p className="text-xs text-muted-foreground">Interactions</p>
                <p className="text-lg font-semibold" data-testid="text-preview-interactions">{previewData.totalProcessed.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-border/30 bg-muted/10 p-3">
                <p className="text-xs text-muted-foreground">Unique Contacts</p>
                <p className="text-lg font-semibold" data-testid="text-preview-contacts">{previewData.uniqueContacts.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-border/30 bg-muted/10 p-3">
                <p className="text-xs text-muted-foreground">Duplicates Removed</p>
                <p className="text-lg font-semibold" data-testid="text-preview-duplicates">{previewData.duplicatesRemoved.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-border/30 bg-muted/10 p-3">
                <p className="text-xs text-muted-foreground">Matched Assets</p>
                <p className="text-lg font-semibold text-[#00D657]" data-testid="text-preview-matched">{previewData.matchedAssets.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-border/30 bg-muted/10 p-3">
                <p className="text-xs text-muted-foreground">Unmatched Assets</p>
                <p className="text-lg font-semibold text-amber-400" data-testid="text-preview-unmatched">{previewData.unmatchedAssets.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-border/30 bg-muted/10 p-3">
                <p className="text-xs text-muted-foreground">Emails Hashed</p>
                <p className="text-lg font-semibold" data-testid="text-preview-hashed">{previewData.emailsHashed.toLocaleString()}</p>
              </div>
            </div>

            {previewData.dateRange && (
              <div className="rounded-lg border border-border/30 bg-muted/10 p-3">
                <p className="text-xs text-muted-foreground mb-1">Date Range</p>
                <p className="text-sm" data-testid="text-preview-daterange">
                  {new Date(previewData.dateRange.earliest).toLocaleDateString()} —{" "}
                  {new Date(previewData.dateRange.latest).toLocaleDateString()}
                </p>
              </div>
            )}

            {Object.keys(previewData.interactionTypes).length > 0 && (
              <div className="rounded-lg border border-border/30 bg-muted/10 p-3">
                <p className="text-xs font-semibold mb-2">Interaction Types</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(previewData.interactionTypes)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, count]) => (
                      <Badge key={type} variant="outline" className="text-[10px]" data-testid={`badge-preview-type-${type}`}>
                        {type}: {count.toLocaleString()}
                      </Badge>
                    ))}
                </div>
              </div>
            )}

            <div className="rounded-lg border border-border/30 bg-muted/10 p-3">
              <p className="text-xs font-semibold mb-2">Data Quality Summary</p>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Raw rows</span>
                  <span>{previewData.totalRawRows.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">After cleaning</span>
                  <span>{previewData.totalProcessed.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Dirty values cleaned</span>
                  <span>{previewData.dirtyValuesCleaned.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Skipped (no contact)</span>
                  <span>{(previewData.totalRawRows - previewData.totalProcessed - previewData.duplicatesRemoved).toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" size="sm" onClick={() => setStep(2)} data-testid="button-back-to-mapping">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button
                onClick={handleProcess}
                disabled={processing}
                className="bg-[#00D657] hover:bg-[#00D657]/90 text-black"
                data-testid="button-process-data"
              >
                {processing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Confirm & Process
                  </>
                )}
              </Button>
            </div>

            {processing && (
              <div className="space-y-2">
                <Progress value={50} className="h-1.5" />
                <p className="text-xs text-muted-foreground text-center">Inserting records into database...</p>
              </div>
            )}
          </div>
        )}

        {step === 4 && processResult && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-[#00D657]/10 border border-[#00D657]/20">
              <CheckCircle2 className="h-6 w-6 text-[#00D657]" />
              <div>
                <p className="font-semibold text-[#00D657]" data-testid="text-upload-success">Upload Complete!</p>
                <p className="text-xs text-muted-foreground">
                  {processResult.totalProcessed.toLocaleString()} interactions processed from{" "}
                  {processResult.totalRawRows.toLocaleString()} raw rows
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border border-border/30 bg-muted/10 p-3">
                <p className="text-xs text-muted-foreground">Interactions</p>
                <p className="text-lg font-semibold" data-testid="text-result-interactions">{processResult.totalProcessed.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-border/30 bg-muted/10 p-3">
                <p className="text-xs text-muted-foreground">Unique Contacts</p>
                <p className="text-lg font-semibold" data-testid="text-result-contacts">{processResult.uniqueContacts.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-border/30 bg-muted/10 p-3">
                <p className="text-xs text-muted-foreground">Duplicates Removed</p>
                <p className="text-lg font-semibold" data-testid="text-result-duplicates">{processResult.duplicatesRemoved.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-border/30 bg-muted/10 p-3">
                <p className="text-xs text-muted-foreground">Emails Hashed</p>
                <p className="text-lg font-semibold" data-testid="text-result-hashed">{processResult.emailsHashed.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-border/30 bg-muted/10 p-3">
                <p className="text-xs text-muted-foreground">Matched Assets</p>
                <p className="text-lg font-semibold text-[#00D657]" data-testid="text-result-matched">{processResult.matchedAssets.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-border/30 bg-muted/10 p-3">
                <p className="text-xs text-muted-foreground">Unmatched Assets</p>
                <p className="text-lg font-semibold text-amber-400" data-testid="text-result-unmatched">{processResult.unmatchedAssets.toLocaleString()}</p>
              </div>
            </div>

            {processResult.dateRange && (
              <div className="rounded-lg border border-border/30 bg-muted/10 p-3">
                <p className="text-xs text-muted-foreground mb-1">Date Range</p>
                <p className="text-sm" data-testid="text-result-daterange">
                  {new Date(processResult.dateRange.earliest).toLocaleDateString()} —{" "}
                  {new Date(processResult.dateRange.latest).toLocaleDateString()}
                </p>
              </div>
            )}

            {Object.keys(processResult.interactionTypes).length > 0 && (
              <div className="rounded-lg border border-border/30 bg-muted/10 p-3">
                <p className="text-xs font-semibold mb-2">Interaction Types</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(processResult.interactionTypes)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, count]) => (
                      <Badge key={type} variant="outline" className="text-[10px]" data-testid={`badge-type-${type}`}>
                        {type}: {count.toLocaleString()}
                      </Badge>
                    ))}
                </div>
              </div>
            )}

            <div className="rounded-lg border border-border/30 bg-muted/10 p-3">
              <p className="text-xs font-semibold mb-2">Data Quality Summary</p>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Dirty values cleaned</span>
                  <span>{processResult.dirtyValuesCleaned.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Batch ID</span>
                  <span className="font-mono text-[10px]">{processResult.batchId.slice(0, 8)}...</span>
                </div>
              </div>
            </div>

            {buildProgress && (
              <div className="rounded-lg border border-border/30 bg-muted/10 p-3" data-testid="section-build-progress">
                <p className="text-xs font-semibold mb-2">Journey Summary Builder</p>
                {buildProgress.status === "building" && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="h-3 w-3 animate-spin text-[#00D657]" />
                      <span className="text-xs">{buildProgress.phase}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        Step {buildProgress.currentStep}/{buildProgress.totalSteps}
                      </span>
                    </div>
                    <Progress value={(buildProgress.currentStep / Math.max(buildProgress.totalSteps, 1)) * 100} className="h-1.5" />
                    <p className="text-[10px] text-muted-foreground">{buildProgress.message}</p>
                  </div>
                )}
                {buildProgress.status === "complete" && buildProgress.result && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-3 w-3 text-[#00D657]" />
                      <span className="text-xs text-[#00D657]">Summaries built successfully</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Contact journeys</span>
                        <span>{buildProgress.result.contactsProcessed.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Journey patterns</span>
                        <span>{buildProgress.result.patternsFound.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Stage transitions</span>
                        <span>{buildProgress.result.transitionsFound.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Asset stats</span>
                        <span>{buildProgress.result.assetStatsComputed.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                )}
                {buildProgress.status === "error" && (
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-3 w-3 text-red-400" />
                    <span className="text-xs text-red-400">{buildProgress.error || "Summary build failed"}</span>
                  </div>
                )}
                {buildProgress.status === "idle" && (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Waiting for summary builder to start...</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={onClose} className="bg-[#00D657] hover:bg-[#00D657]/90 text-black" data-testid="button-done">
                Done
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
