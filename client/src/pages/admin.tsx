import TopNav from "@/components/top-nav";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  Database,
  FileUp,
  HardDrive,
  Lock,
  Loader2,
  LogOut,
  Settings,
  Sparkles,
  Trash2,
  XCircle,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";

type FunnelStage = "TOFU" | "MOFU" | "BOFU" | "UNKNOWN";

type NormalizedRow = {
  id: string;
  content: string;
  stage: FunnelStage;
  utmChannel?: string;
  utmMedium?: string;
  utmContent?: string;
  productFranchise?: string;
  industry?: string;
  objective?: string;
  contentType?: string;
  cta?: string;
  campaignName?: string;
  pageViews?: number;
  timeSpentSeconds?: number;
  newContacts?: number;
  sqos?: number;
};

type AiAnalysis = {
  mapping: Record<string, string | null>;
  contentIdColumn: string;
  stageSignals: string[];
  unmappedColumns: string[];
  dataQualityNotes: string[];
  confidence: string;
};

type UploadDiagnostics = {
  ingested: number;
  totalRows: number;
  skippedNoContentId: number;
  uniqueContentIds: number;
  stageBreakdown: Record<string, number>;
};

type AiStep = "idle" | "parsing" | "analyzing" | "ingesting" | "done" | "error";

const stageMeta: Record<FunnelStage, { label: string; tone: string }> = {
  TOFU: { label: "TOFU", tone: "bg-chart-1/12 text-chart-1 border-chart-1/20" },
  MOFU: { label: "MOFU", tone: "bg-chart-2/12 text-chart-2 border-chart-2/20" },
  BOFU: { label: "BOFU", tone: "bg-chart-3/12 text-chart-3 border-chart-3/20" },
  UNKNOWN: { label: "UNKNOWN", tone: "bg-muted text-muted-foreground border-border" },
};

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const s = String(value).trim();
  if (!s) return undefined;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function isValidUrl(v: string): boolean {
  if (!v) return false;
  try {
    const url = new URL(v.startsWith("http") ? v : `https://${v}`);
    return url.hostname.includes(".");
  } catch {
    return false;
  }
}

function classifyStageFull(contentId: string, row: Record<string, any>, reverseMap: Record<string, string>): FunnelStage {
  const s = contentId.toUpperCase();
  if (s.includes("BOFU")) return "BOFU";
  if (s.includes("MOFU")) return "MOFU";
  if (s.includes("TOFU")) return "TOFU";

  const getMapped = (field: string) => {
    const col = reverseMap[field];
    if (!col) return "";
    const val = row[col];
    if (val === null || val === undefined) return "";
    return String(val).trim();
  };

  const sqo = toNumber(getMapped("is_sqo"));
  if (sqo && sqo > 0) return "BOFU";
  const leadId = getMapped("leadorcontactid");
  if (leadId) return "MOFU";
  const clientId = getMapped("google_clientid1");
  const time = toNumber(getMapped("total_time_on_page_seconds"));
  if (clientId || (time && time > 0)) return "TOFU";
  return "UNKNOWN";
}

function aggregateRowsClientSide(
  rows: Record<string, any>[],
  mapping: Record<string, string | null>,
): { assets: any[]; skippedNoContentId: number } {
  const reverseMap: Record<string, string> = {};
  for (const [originalCol, targetField] of Object.entries(mapping)) {
    if (targetField) reverseMap[targetField] = originalCol;
  }

  const getMapped = (row: Record<string, any>, field: string): string => {
    const col = reverseMap[field];
    if (!col) return "";
    const val = row[col];
    if (val === null || val === undefined) return "";
    return String(val).trim();
  };

  const aggMap = new Map<string, any>();
  let skippedNoContentId = 0;

  for (const row of rows) {
    const contentId = getMapped(row, "content");
    if (!contentId) { skippedNoContentId++; continue; }

    const stage = classifyStageFull(contentId, row, reverseMap);

    if (!aggMap.has(contentId)) {
      aggMap.set(contentId, {
        contentId,
        stage,
        name: getMapped(row, "name") || null,
        url: isValidUrl(getMapped(row, "url")) ? getMapped(row, "url") : null,
        typecampaignmember: getMapped(row, "typecampaignmember") || null,
        productFranchise: getMapped(row, "product_franchise") || null,
        utmChannel: getMapped(row, "utm_channel") || null,
        utmCampaign: getMapped(row, "utm_campaign") || null,
        utmMedium: getMapped(row, "utm_medium") || null,
        utmTerm: getMapped(row, "utm_term") || null,
        utmContent: getMapped(row, "utm_content") || null,
        formName: getMapped(row, "form_name") || null,
        cta: getMapped(row, "cta") || null,
        objective: getMapped(row, "objective") || null,
        productCategory: getMapped(row, "product_category") || null,
        campaignId: getMapped(row, "campaign_id") || null,
        campaignName: getMapped(row, "campaign_name") || null,
        dateStamp: getMapped(row, "date_stamp") || null,
        clientIds: new Set<string>(),
        timeTotal: 0,
        timeCount: 0,
        downloadsSum: 0,
        leadIds: new Set<string>(),
        sqoLeadIds: new Set<string>(),
      });
    }

    const agg = aggMap.get(contentId)!;
    const clientId = getMapped(row, "google_clientid1");
    if (clientId) agg.clientIds.add(clientId);
    const timeVal = toNumber(getMapped(row, "total_time_on_page_seconds"));
    if (timeVal) { agg.timeTotal += timeVal; agg.timeCount += 1; }
    const downloads = toNumber(getMapped(row, "total_downloads"));
    agg.downloadsSum += downloads || 0;
    const leadId = getMapped(row, "leadorcontactid");
    if (leadId) agg.leadIds.add(leadId);
    const isSqo = toNumber(getMapped(row, "is_sqo"));
    if (isSqo && isSqo > 0 && leadId) agg.sqoLeadIds.add(leadId);
  }

  const assets = Array.from(aggMap.values()).map((a) => ({
    contentId: a.contentId,
    stage: a.stage,
    name: a.name,
    url: a.url,
    typecampaignmember: a.typecampaignmember,
    productFranchise: a.productFranchise,
    utmChannel: a.utmChannel,
    utmCampaign: a.utmCampaign,
    utmMedium: a.utmMedium,
    utmTerm: a.utmTerm,
    utmContent: a.utmContent,
    formName: a.formName,
    cta: a.cta,
    objective: a.objective,
    productCategory: a.productCategory,
    campaignId: a.campaignId,
    campaignName: a.campaignName,
    dateStamp: a.dateStamp,
    pageviewsSum: a.clientIds.size,
    timeAvg: a.timeCount > 0 ? Math.round(a.timeTotal / a.timeCount) : 0,
    downloadsSum: a.downloadsSum,
    uniqueLeads: a.leadIds.size,
    sqoCount: a.sqoLeadIds.size,
  }));

  return { assets, skippedNoContentId };
}

function parseCSV(text: string): Record<string, any>[] {
  const normalizeKey = (key: string) =>
    key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const parseLine = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      const next = line[i + 1];
      if (c === '"') {
        if (inQuotes && next === '"') { cur += '"'; i++; continue; }
        inQuotes = !inQuotes;
        continue;
      }
      if (c === "," && !inQuotes) { out.push(cur); cur = ""; continue; }
      cur += c;
    }
    out.push(cur);
    return out;
  };

  const headersRaw = parseLine(lines[0]);
  const headers = headersRaw.map((h) => normalizeKey(h));

  const rows: Record<string, any>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i]);
    const row: Record<string, any> = {};
    for (let c = 0; c < headers.length; c++) {
      row[headers[c]] = cells[c] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

function getAdminToken(): string | null {
  try {
    return sessionStorage.getItem("admin_token");
  } catch {
    return null;
  }
}

function setAdminToken(token: string) {
  try {
    sessionStorage.setItem("admin_token", token);
  } catch {}
}

function clearAdminToken() {
  try {
    sessionStorage.removeItem("admin_token");
  } catch {}
}

function adminHeaders(): Record<string, string> {
  const token = getAdminToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function AdminPage() {
  const { isAdmin, token: authToken } = useAuth();
  const [authenticated, setAuthenticated] = useState(() => !!getAdminToken());
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    if (isAdmin && authToken && !authenticated) {
      setAdminToken(authToken);
      setAuthenticated(true);
    }
  }, [isAdmin, authToken, authenticated]);

  const [aiStep, setAiStep] = useState<AiStep>("idle");
  const [aiAnalysis, setAiAnalysis] = useState<AiAnalysis | null>(null);
  const [uploadDiagnostics, setUploadDiagnostics] = useState<UploadDiagnostics | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [currentAssets, setCurrentAssets] = useState<any[] | null>(null);
  const [loadingAssets, setLoadingAssets] = useState(false);

  const [contentStats, setContentStats] = useState<{ totalStored: number; totalSize: number } | null>(null);
  const [contentStatusMap, setContentStatusMap] = useState<Record<string, { fetchStatus: string; sourceUrl: string | null }> | null>(null);
  const [loadingContentStats, setLoadingContentStats] = useState(false);
  const [bulkFetchActive, setBulkFetchActive] = useState(false);
  const [bulkFetchProgress, setBulkFetchProgress] = useState<{ completed: number; failed: number; total: number; current: string } | null>(null);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [unfetchedCount, setUnfetchedCount] = useState(0);
  const [clearingAssetId, setClearingAssetId] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const loadContentStats = useCallback(async () => {
    setLoadingContentStats(true);
    try {
      const [statsRes, statusRes] = await Promise.all([
        fetch("/api/content/stats", { headers: adminHeaders() }),
        fetch("/api/content/status", { headers: adminHeaders() }),
      ]);
      if (statsRes.ok) setContentStats(await statsRes.json());
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setContentStatusMap(statusData);
        const unfetched = Object.values(statusData as Record<string, { fetchStatus: string; sourceUrl: string | null }>)
          .filter((v) => v.fetchStatus === "not_stored" && v.sourceUrl).length;
        setUnfetchedCount(unfetched);
      }
    } catch {}
    setLoadingContentStats(false);
  }, []);

  const loadCurrentData = useCallback(async () => {
    setLoadingAssets(true);
    try {
      const res = await fetch("/api/assets/all", { headers: adminHeaders() });
      if (res.ok) {
        const data = await res.json();
        setCurrentAssets(data);
      }
    } catch {}
    setLoadingAssets(false);
    loadContentStats();
  }, [loadContentStats]);

  const handleBulkFetch = useCallback(async () => {
    setShowBulkConfirm(false);
    setBulkFetchActive(true);
    setBulkFetchProgress(null);

    try {
      const unfetchedRes = await fetch("/api/content/unfetched-urls", { headers: adminHeaders() });
      if (!unfetchedRes.ok) throw new Error("Failed to get unfetched URLs");
      const unfetched: { assetId: string; sourceUrl: string }[] = await unfetchedRes.json();
      if (unfetched.length === 0) {
        setBulkFetchActive(false);
        return;
      }

      const assets = unfetched.map((u) => ({ assetId: u.assetId, url: u.sourceUrl }));
      const response = await fetch("/api/content/bulk-fetch", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ assets }),
      });

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.done) {
                setBulkFetchProgress({ completed: data.completed, failed: data.failed, total: data.total, current: "" });
              } else {
                setBulkFetchProgress({ completed: data.completed, failed: data.failed, total: data.total, current: data.current });
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      console.error("Bulk fetch error:", err);
    }
    setBulkFetchActive(false);
    loadContentStats();
  }, [loadContentStats]);

  const handleClearContent = useCallback(async (assetId: string) => {
    setClearingAssetId(assetId);
    try {
      await fetch(`/api/content/${encodeURIComponent(assetId)}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
      loadContentStats();
    } catch {}
    setClearingAssetId(null);
  }, [loadContentStats]);

  const handleLogin = useCallback(async () => {
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Login failed" }));
        throw new Error(err.message || "Login failed");
      }
      const { token } = await res.json();
      setAdminToken(token);
      setAuthenticated(true);
      setPassword("");
      loadCurrentData();
    } catch (err: any) {
      setLoginError(err.message || "Login failed");
    }
    setLoginLoading(false);
  }, [password, loadCurrentData]);

  const handleLogout = useCallback(() => {
    clearAdminToken();
    setAuthenticated(false);
    setAiStep("idle");
    setAiAnalysis(null);
    setUploadDiagnostics(null);
    setAiError(null);
    setFileName("");
  }, []);

  useState(() => {
    if (authenticated) {
      fetch("/api/admin/check", { headers: adminHeaders() })
        .then((res) => {
          if (!res.ok) {
            clearAdminToken();
            setAuthenticated(false);
          } else {
            loadCurrentData();
          }
        })
        .catch(() => {
          clearAdminToken();
          setAuthenticated(false);
        });
    }
  });

  const safeJsonParse = useCallback(async (res: globalThis.Response, fallbackMsg: string): Promise<any> => {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      if (text.trim().startsWith("<")) {
        throw new Error(`${fallbackMsg} (server returned an unexpected response — the file may be too large or the server timed out)`);
      }
      throw new Error(`${fallbackMsg}: ${text.slice(0, 200)}`);
    }
  }, []);

  const ALLOWED_EXTENSIONS = /\.(csv|xlsx?)$/i;
  const MAX_FILE_SIZE_MB = 50;

  const handleAiUpload = useCallback(async (file: File) => {
    setAiStep("parsing");
    setAiError(null);
    setAiAnalysis(null);
    setUploadDiagnostics(null);
    setFileName(file.name);

    try {
      if (!ALLOWED_EXTENSIONS.test(file.name)) {
        throw new Error(`Unsupported file type. Please upload a CSV or Excel (.xlsx) file.`);
      }

      const fileSizeMB = file.size / (1024 * 1024);
      if (fileSizeMB > MAX_FILE_SIZE_MB) {
        throw new Error(`File is too large (${fileSizeMB.toFixed(1)} MB). Maximum allowed size is ${MAX_FILE_SIZE_MB} MB.`);
      }

      const isExcel = file.name.match(/\.xlsx?$/i);
      let headers: string[];
      let sampleRows: Record<string, any>[];
      let allRows: Record<string, any>[];

      if (isExcel) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(",")[1]);
          };
          reader.onerror = () => reject(new Error("Failed to read file. Please try again."));
          reader.readAsDataURL(file);
        });

        let parseRes: globalThis.Response;
        try {
          parseRes = await fetch("/api/assets/upload-excel", {
            method: "POST",
            headers: adminHeaders(),
            body: JSON.stringify({ base64, filename: file.name }),
          });
        } catch (networkErr: any) {
          throw new Error("Network error while uploading file. Please check your connection and try again.");
        }

        if (!parseRes.ok) {
          if (parseRes.status === 401) throw new Error("Session expired. Please log in again.");
          const err = await safeJsonParse(parseRes, "Failed to parse Excel file");
          throw new Error(err.message || "Failed to parse Excel file");
        }

        const parseData = await safeJsonParse(parseRes, "Failed to parse server response");
        headers = parseData.headers;
        sampleRows = parseData.sampleRows;
        allRows = parseData.rows;
      } else {
        let text: string;
        try {
          text = await file.text();
        } catch {
          throw new Error("Failed to read the CSV file. The file may be corrupted.");
        }
        const parsed = parseCSV(text);
        if (parsed.length === 0) throw new Error("No data rows found in the file.");
        headers = Object.keys(parsed[0]);
        if (headers.length === 0) throw new Error("Could not detect column headers.");
        sampleRows = parsed.slice(0, 5);
        allRows = parsed;
      }

      if (headers.length === 0) {
        throw new Error("No column headers found in the file.");
      }

      setAiStep("analyzing");

      let analyzeRes: globalThis.Response;
      try {
        analyzeRes = await fetch("/api/assets/analyze", {
          method: "POST",
          headers: adminHeaders(),
          body: JSON.stringify({ headers, sampleRows }),
        });
      } catch (networkErr: any) {
        throw new Error("Network error during AI analysis. Please try again.");
      }

      if (!analyzeRes.ok) {
        if (analyzeRes.status === 401) throw new Error("Session expired. Please log in again.");
        const err = await safeJsonParse(analyzeRes, "AI analysis failed");
        throw new Error(err.message || "AI analysis failed");
      }

      const analysis: AiAnalysis = await safeJsonParse(analyzeRes, "Failed to parse AI analysis response");
      if (!analysis.mapping || typeof analysis.mapping !== "object") {
        throw new Error("AI returned an invalid column mapping. Please try uploading again.");
      }
      setAiAnalysis(analysis);

      setAiStep("ingesting");

      const { assets: aggregatedAssets, skippedNoContentId } = aggregateRowsClientSide(allRows, analysis.mapping);

      let ingestRes: globalThis.Response;
      try {
        ingestRes = await fetch("/api/assets/ingest-aggregated", {
          method: "POST",
          headers: adminHeaders(),
          body: JSON.stringify({ assets: aggregatedAssets, totalRows: allRows.length, skippedNoContentId }),
        });
      } catch (networkErr: any) {
        throw new Error("Network error during data ingestion. Please try again.");
      }

      if (!ingestRes.ok) {
        if (ingestRes.status === 401) throw new Error("Session expired. Please log in again.");
        const err = await safeJsonParse(ingestRes, "Data ingestion failed");
        throw new Error(err.message || "Ingestion failed");
      }

      const diagnostics: UploadDiagnostics = await safeJsonParse(ingestRes, "Failed to parse ingestion results");
      setUploadDiagnostics(diagnostics);
      setAiStep("done");
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      loadCurrentData();
    } catch (err: any) {
      console.error("AI upload error:", err);
      if (err.message?.includes("Session expired")) {
        clearAdminToken();
        setAuthenticated(false);
      }
      setAiError(err.message || "Upload failed");
      setAiStep("error");
    }
  }, [queryClient, safeJsonParse, loadCurrentData]);

  if (!authenticated) {
    return (
      <div className="min-h-screen">
        <TopNav />
        <div className="pointer-events-none fixed inset-0 -z-10">
          <div className="absolute inset-0 bg-[radial-gradient(1200px_circle_at_15%_10%,hsl(var(--chart-1)/0.16),transparent_58%),radial-gradient(900px_circle_at_80%_0%,hsl(var(--chart-2)/0.14),transparent_62%),radial-gradient(900px_circle_at_75%_80%,hsl(var(--chart-3)/0.12),transparent_58%)]" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/40" />
          <div className="absolute inset-0 grain" />
        </div>

        <div className="mx-auto w-full max-w-md px-4 py-24">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <Card className="rounded-2xl border bg-card/70 p-8 shadow-sm backdrop-blur" data-testid="admin-login-card">
              <div className="flex items-center gap-3 mb-6">
                <div className="grid h-11 w-11 place-items-center rounded-2xl border bg-card shadow-sm">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-xl font-[650] tracking-tight" data-testid="text-admin-title">Admin Panel</h1>
                  <p className="text-sm text-muted-foreground">Sign in to manage dashboard data</p>
                </div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleLogin();
                }}
                className="flex flex-col gap-4"
              >
                <Input
                  type="password"
                  placeholder="Enter admin password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-xl"
                  autoFocus
                  data-testid="input-admin-password"
                />
                {loginError && (
                  <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive" data-testid="text-login-error">
                    {loginError}
                  </div>
                )}
                <Button
                  type="submit"
                  disabled={loginLoading || !password}
                  className="rounded-xl"
                  data-testid="button-admin-login"
                >
                  {loginLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                  Sign in
                </Button>
              </form>

              <div className="mt-4 text-center">
                <a href="/" className="text-sm text-muted-foreground hover:text-foreground transition" data-testid="link-back-dashboard">
                  Back to public dashboard
                </a>
              </div>
            </Card>
          </motion.div>
        </div>
      </div>
    );
  }

  const stageBreakdown = currentAssets
    ? {
        TOFU: currentAssets.filter((a: any) => a.stage === "TOFU").length,
        MOFU: currentAssets.filter((a: any) => a.stage === "MOFU").length,
        BOFU: currentAssets.filter((a: any) => a.stage === "BOFU").length,
        UNKNOWN: currentAssets.filter((a: any) => a.stage === "UNKNOWN").length,
      }
    : null;

  return (
    <div className="min-h-screen">
      <TopNav />
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_circle_at_15%_10%,hsl(var(--chart-1)/0.16),transparent_58%),radial-gradient(900px_circle_at_80%_0%,hsl(var(--chart-2)/0.14),transparent_62%),radial-gradient(900px_circle_at_75%_80%,hsl(var(--chart-3)/0.12),transparent_58%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/40" />
        <div className="absolute inset-0 grain" />
      </div>

      <div className="mx-auto w-full max-w-4xl px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="flex flex-col gap-6"
        >
          <header className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl border bg-card shadow-sm">
                  <Settings className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-[650] tracking-tight" data-testid="text-admin-heading">
                      Data Management
                    </h1>
                    <Badge variant="secondary" className="border bg-card/70 backdrop-blur" data-testid="badge-admin">
                      Admin
                    </Badge>
                  </div>
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground" data-testid="text-admin-subtitle">
                    Upload CSV or Excel files to replace the public dashboard data.
                    Changes take effect immediately for all viewers.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a href="/" data-testid="link-view-dashboard">
                  <Button variant="outline" className="rounded-xl" size="sm">
                    View dashboard
                  </Button>
                </a>
                <Button variant="ghost" size="sm" className="rounded-xl" onClick={handleLogout} data-testid="button-logout">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </Button>
              </div>
            </div>
          </header>

          {currentAssets && (
            <Card className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur" data-testid="current-data-card">
              <div className="text-sm font-medium mb-3">Current Dataset</div>
              {loadingAssets ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading...
                </div>
              ) : currentAssets.length === 0 ? (
                <div className="text-sm text-muted-foreground">No data uploaded yet. Upload a file below to get started.</div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <div className="rounded-xl border bg-card/60 p-2.5 text-center">
                    <div className="text-lg font-[650]">{currentAssets.length.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground">Total assets</div>
                  </div>
                  {stageBreakdown && Object.entries(stageBreakdown).filter(([, c]) => c > 0).map(([stage, count]) => (
                    <div key={stage} className="rounded-xl border bg-card/60 p-2.5 text-center">
                      <div className="text-lg font-[650]">{count}</div>
                      <div className="text-[10px] text-muted-foreground">{stage}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          <Card className="rounded-2xl border bg-card/70 p-6 shadow-sm backdrop-blur" data-testid="content-storage-card">
            <div className="flex items-center gap-3 mb-4">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border bg-card">
                <Database className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">Content Storage</div>
                <div className="text-xs text-muted-foreground">
                  Manage stored content assets and AI-analyzed files
                </div>
              </div>
            </div>

            {loadingContentStats ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading content stats...
              </div>
            ) : contentStats ? (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border bg-card/60 p-2.5 text-center">
                    <div className="text-lg font-[650]" data-testid="text-content-stored-count">{contentStats.totalStored.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground">Assets stored</div>
                  </div>
                  <div className="rounded-xl border bg-card/60 p-2.5 text-center">
                    <div className="text-lg font-[650]" data-testid="text-content-storage-size">
                      {contentStats.totalSize >= 1024 * 1024
                        ? `${(contentStats.totalSize / (1024 * 1024)).toFixed(1)} MB`
                        : contentStats.totalSize >= 1024
                          ? `${(contentStats.totalSize / 1024).toFixed(1)} KB`
                          : `${contentStats.totalSize} B`}
                    </div>
                    <div className="text-[10px] text-muted-foreground">Storage used</div>
                  </div>
                  <div className="rounded-xl border bg-card/60 p-2.5 text-center">
                    <div className="text-lg font-[650]" data-testid="text-unfetched-count">{unfetchedCount}</div>
                    <div className="text-[10px] text-muted-foreground">Unfetched URLs</div>
                  </div>
                  <div className="rounded-xl border bg-card/60 p-2.5 text-center">
                    <div className="text-lg font-[650]" data-testid="text-total-content-entries">
                      {contentStatusMap ? Object.keys(contentStatusMap).length : 0}
                    </div>
                    <div className="text-[10px] text-muted-foreground">Total entries</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {unfetchedCount > 0 && !bulkFetchActive && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl"
                      onClick={() => setShowBulkConfirm(true)}
                      data-testid="button-bulk-fetch"
                    >
                      <Zap className="mr-2 h-4 w-4" />
                      Fetch all unfetched URLs ({unfetchedCount})
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-xl"
                    onClick={loadContentStats}
                    disabled={loadingContentStats}
                    data-testid="button-refresh-stats"
                  >
                    <HardDrive className="mr-2 h-4 w-4" />
                    Refresh stats
                  </Button>
                </div>

                {showBulkConfirm && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4" data-testid="bulk-fetch-confirm">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="text-sm font-medium">Confirm Bulk Fetch</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          This will fetch and analyze {unfetchedCount} URLs. Each URL is processed with a 2-second delay
                          to respect rate limits. Estimated time: ~{Math.ceil(unfetchedCount * 2 / 60)} minutes.
                        </div>
                        <div className="flex gap-2 mt-3">
                          <Button
                            size="sm"
                            className="rounded-xl"
                            onClick={handleBulkFetch}
                            data-testid="button-confirm-bulk-fetch"
                          >
                            <Zap className="mr-2 h-3 w-3" />
                            Start fetching
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-xl"
                            onClick={() => setShowBulkConfirm(false)}
                            data-testid="button-cancel-bulk-fetch"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {bulkFetchActive && bulkFetchProgress && (
                  <div className="rounded-xl border bg-muted/30 p-4" data-testid="bulk-fetch-progress">
                    <div className="flex items-center gap-2 mb-2">
                      <Loader2 className="h-4 w-4 animate-spin text-chart-1" />
                      <span className="text-sm font-medium">Fetching content...</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 mb-2">
                      <div
                        className="bg-chart-1 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${Math.round(((bulkFetchProgress.completed + bulkFetchProgress.failed) / bulkFetchProgress.total) * 100)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{bulkFetchProgress.completed + bulkFetchProgress.failed} of {bulkFetchProgress.total}</span>
                      <span>
                        <span className="text-chart-1">{bulkFetchProgress.completed} succeeded</span>
                        {bulkFetchProgress.failed > 0 && (
                          <span className="text-destructive ml-2">{bulkFetchProgress.failed} failed</span>
                        )}
                      </span>
                    </div>
                    {bulkFetchProgress.current && (
                      <div className="text-xs text-muted-foreground mt-1 truncate">
                        Current: {bulkFetchProgress.current}
                      </div>
                    )}
                  </div>
                )}

                {!bulkFetchActive && bulkFetchProgress && (
                  <div className="rounded-xl border border-chart-1/20 bg-chart-1/5 p-3 text-sm flex items-center gap-2" data-testid="bulk-fetch-complete">
                    <CheckCircle2 className="h-4 w-4 text-chart-1" />
                    Bulk fetch complete: {bulkFetchProgress.completed} succeeded, {bulkFetchProgress.failed} failed out of {bulkFetchProgress.total} total.
                  </div>
                )}

                {contentStatusMap && Object.keys(contentStatusMap).length > 0 && (
                  <div className="mt-2">
                    <div className="text-xs font-medium text-muted-foreground mb-2">Stored Content Assets</div>
                    <div className="max-h-64 overflow-y-auto rounded-xl border bg-card/30">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-card border-b">
                          <tr>
                            <th className="text-left p-2 font-medium">Asset ID</th>
                            <th className="text-left p-2 font-medium">Status</th>
                            <th className="text-right p-2 font-medium">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(contentStatusMap)
                            .filter(([, v]) => v.fetchStatus !== "not_stored")
                            .map(([assetId, v]) => (
                              <tr key={assetId} className="border-b last:border-0 hover:bg-muted/30" data-testid={`row-content-${assetId}`}>
                                <td className="p-2 truncate max-w-[200px]" title={assetId}>{assetId}</td>
                                <td className="p-2">
                                  <Badge
                                    variant="secondary"
                                    className={`text-[10px] border ${
                                      v.fetchStatus === "success"
                                        ? "bg-chart-1/10 text-chart-1 border-chart-1/20"
                                        : v.fetchStatus === "failed"
                                          ? "bg-destructive/10 text-destructive border-destructive/20"
                                          : v.fetchStatus === "partial" || v.fetchStatus === "gated"
                                            ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                            : "bg-muted text-muted-foreground"
                                    }`}
                                  >
                                    {v.fetchStatus}
                                  </Badge>
                                </td>
                                <td className="p-2 text-right">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-xs rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => handleClearContent(assetId)}
                                    disabled={clearingAssetId === assetId}
                                    data-testid={`button-clear-content-${assetId}`}
                                  >
                                    {clearingAssetId === assetId ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-3 w-3" />
                                    )}
                                  </Button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                      {Object.values(contentStatusMap).filter((v) => v.fetchStatus !== "not_stored").length === 0 && (
                        <div className="p-4 text-center text-xs text-muted-foreground">
                          No content has been stored yet.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No content storage data available.</div>
            )}
          </Card>

          <Card className="rounded-2xl border bg-card/70 p-6 shadow-sm backdrop-blur" data-testid="upload-card">
            <div className="flex items-center gap-3 mb-4">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border bg-card">
                <FileUp className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-medium">Upload New Data</div>
                <div className="text-xs text-muted-foreground">
                  This will replace all existing dashboard data
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl border bg-card/70 px-4 py-2.5 text-sm shadow-sm backdrop-blur hover:shadow transition"
                data-testid="button-upload"
              >
                {aiStep !== "idle" && aiStep !== "done" && aiStep !== "error" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileUp className="h-4 w-4" />
                )}
                <span className="font-medium">Upload CSV / Excel</span>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  className="hidden"
                  disabled={aiStep !== "idle" && aiStep !== "done" && aiStep !== "error"}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleAiUpload(f);
                    e.target.value = "";
                  }}
                  data-testid="input-file"
                />
              </label>
              {fileName && (
                <div className="text-xs text-muted-foreground">
                  File: <span className="font-medium text-foreground">{fileName}</span>
                </div>
              )}
            </div>

            {aiStep !== "idle" && (
              <div className="mt-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border bg-card">
                    <Brain className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">AI-Powered File Analysis</div>
                    <div className="text-xs text-muted-foreground">
                      Claude Opus analyzes your file to map columns intelligently
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    {aiStep === "parsing" ? (
                      <Loader2 className="h-4 w-4 animate-spin text-chart-1" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-chart-1" />
                    )}
                    <span className={aiStep === "parsing" ? "font-medium" : "text-muted-foreground"}>
                      Parsing file...
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    {aiStep === "analyzing" ? (
                      <Loader2 className="h-4 w-4 animate-spin text-chart-2" />
                    ) : aiStep === "ingesting" || aiStep === "done" ? (
                      <CheckCircle2 className="h-4 w-4 text-chart-2" />
                    ) : aiStep === "error" && !aiAnalysis ? (
                      <XCircle className="h-4 w-4 text-destructive" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-muted" />
                    )}
                    <span className={aiStep === "analyzing" ? "font-medium" : "text-muted-foreground"}>
                      AI analyzing columns with Claude Opus...
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    {aiStep === "ingesting" ? (
                      <Loader2 className="h-4 w-4 animate-spin text-chart-3" />
                    ) : aiStep === "done" ? (
                      <CheckCircle2 className="h-4 w-4 text-chart-3" />
                    ) : aiStep === "error" && aiAnalysis ? (
                      <XCircle className="h-4 w-4 text-destructive" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-muted" />
                    )}
                    <span className={aiStep === "ingesting" ? "font-medium" : "text-muted-foreground"}>
                      Processing data with AI mapping...
                    </span>
                  </div>
                </div>

                {aiError && (
                  <div className="mt-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive" data-testid="ai-error">
                    {aiError}
                  </div>
                )}

                {aiAnalysis && (
                  <div className="mt-3 rounded-xl border bg-muted/30 p-3" data-testid="ai-analysis-results">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="secondary" className="rounded-lg border bg-card/60">
                        Confidence: {aiAnalysis.confidence}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Content ID column: <span className="font-medium text-foreground">{aiAnalysis.contentIdColumn}</span>
                      </span>
                    </div>

                    {aiAnalysis.dataQualityNotes.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {aiAnalysis.dataQualityNotes.map((note, i) => (
                          <div key={i} className="text-xs text-muted-foreground">
                            • {note}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-2 flex flex-wrap gap-1">
                      {Object.entries(aiAnalysis.mapping)
                        .filter(([, v]) => v !== null)
                        .slice(0, 8)
                        .map(([orig, target]) => (
                          <Badge key={orig} variant="secondary" className="rounded-lg border bg-card/60 text-[10px]">
                            {orig} → {target}
                          </Badge>
                        ))}
                      {Object.values(aiAnalysis.mapping).filter(Boolean).length > 8 && (
                        <Badge variant="secondary" className="rounded-lg border bg-card/60 text-[10px] text-muted-foreground">
                          +{Object.values(aiAnalysis.mapping).filter(Boolean).length - 8} more
                        </Badge>
                      )}
                    </div>

                    {aiAnalysis.unmappedColumns.length > 0 && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        Unmapped: {aiAnalysis.unmappedColumns.join(", ")}
                      </div>
                    )}
                  </div>
                )}

                {uploadDiagnostics && (
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="upload-diagnostics">
                    <div className="rounded-xl border bg-card/60 p-2.5 text-center">
                      <div className="text-lg font-[650]">{uploadDiagnostics.totalRows.toLocaleString()}</div>
                      <div className="text-[10px] text-muted-foreground">Total rows</div>
                    </div>
                    <div className="rounded-xl border bg-card/60 p-2.5 text-center">
                      <div className="text-lg font-[650]">{uploadDiagnostics.uniqueContentIds.toLocaleString()}</div>
                      <div className="text-[10px] text-muted-foreground">Unique content IDs</div>
                    </div>
                    <div className="rounded-xl border bg-card/60 p-2.5 text-center">
                      <div className="text-lg font-[650]">{uploadDiagnostics.ingested.toLocaleString()}</div>
                      <div className="text-[10px] text-muted-foreground">Ingested</div>
                    </div>
                    <div className="rounded-xl border bg-card/60 p-2.5 text-center">
                      <div className={`text-lg font-[650] ${uploadDiagnostics.skippedNoContentId > 0 ? "text-destructive" : ""}`}>
                        {uploadDiagnostics.skippedNoContentId.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Skipped (no ID)</div>
                    </div>
                    <div className="col-span-2 sm:col-span-4 flex flex-wrap gap-2 justify-center">
                      {Object.entries(uploadDiagnostics.stageBreakdown).map(([stage, count]) => (
                        <Badge key={stage} className={`border ${(stageMeta as any)[stage]?.tone || ""}`}>
                          {stage}: {count}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {aiStep === "done" && (
                  <div className="mt-3 rounded-xl border border-chart-1/20 bg-chart-1/5 p-3 text-sm text-chart-1 flex items-center gap-2" data-testid="upload-success">
                    <CheckCircle2 className="h-4 w-4" />
                    Data uploaded successfully. The public dashboard now shows the new data.
                  </div>
                )}
              </div>
            )}
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
