import TopNav from "@/components/top-nav";
import ContentLibrary from "@/components/content-library";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  FileUp,
  Filter,
  Loader2,
  LineChart,
  Sparkles,
  Table as TableIcon,
  XCircle,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type FunnelStage = "TOFU" | "MOFU" | "BOFU" | "UNKNOWN";

type ParsedRow = Record<string, string | number | null | undefined>;

type NormalizedRow = {
  id: string;
  content: string;
  stage: FunnelStage;
  utmChannel?: string;
  utmMedium?: string;
  utmContent?: string;
  productFranchise?: string;
  objective?: string;
  contentType?: string;
  cta?: string;
  engagedSessions?: number;
  sessions?: number;
  pageViews?: number;
  timeSpentSeconds?: number;
  scrollDepth?: number;
  newUsers?: number;
  returningUsers?: number;
  newsletterSignups?: number;
  nextContentViews?: number;
  newContacts?: number;
  formSubmissions?: number;
  mqls?: number;
  qdcs?: number;
  sqos?: number;
  leadScore?: number;
};

type TopContentRow = {
  content: string;
  product: string;
  channel: string;
  value: number;
  newContacts: number;
};

type StageKey = Exclude<FunnelStage, "UNKNOWN">;

type TopByStage = Record<StageKey, TopContentRow[]>;

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const s = String(value).trim();
  if (!s) return undefined;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function normalizeKey(key: string) {
  return key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function pickFirst(row: ParsedRow, keys: string[]) {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return undefined;
}

function classifyStage(contentRaw: string, explicitStage?: string): FunnelStage {
  const exp = (explicitStage || "").toUpperCase();
  if (exp.includes("BOFU")) return "BOFU";
  if (exp.includes("MOFU")) return "MOFU";
  if (exp.includes("TOFU")) return "TOFU";

  const s = (contentRaw || "").toUpperCase();
  const hasTOFU = s.includes("TOFU");
  const hasMOFU = s.includes("MOFU");
  const hasBOFU = s.includes("BOFU");
  if (hasBOFU) return "BOFU";
  if (hasMOFU) return "MOFU";
  if (hasTOFU) return "TOFU";
  return "UNKNOWN";
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

function isValidUrl(v: string): boolean {
  if (!v) return false;
  try {
    const url = new URL(v.startsWith("http") ? v : `https://${v}`);
    return url.hostname.includes(".");
  } catch {
    return false;
  }
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
        campaignName: getMapped(row, "name") || null,
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

function parseCSV(text: string): ParsedRow[] {
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
        if (inQuotes && next === '"') {
          cur += '"';
          i++;
          continue;
        }
        inQuotes = !inQuotes;
        continue;
      }

      if (c === "," && !inQuotes) {
        out.push(cur);
        cur = "";
        continue;
      }

      cur += c;
    }

    out.push(cur);
    return out;
  };

  const headersRaw = parseLine(lines[0]);
  const headers = headersRaw.map((h) => normalizeKey(h));

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i]);
    const row: ParsedRow = {};
    for (let c = 0; c < headers.length; c++) {
      row[headers[c]] = cells[c] ?? "";
    }
    rows.push(row);
  }

  return rows;
}

function normalizeRows(rows: ParsedRow[]): NormalizedRow[] {
  return rows.map((r, idx) => {
    const content = String(
      pickFirst(r, ["content", "utm_content", "name", "url_path_only", "url"]) ??
        "",
    ).trim();

    const explicitStage = String(
      pickFirst(r, ["funnel_stage", "stage", "funnel", "lifecycle_stage"]) ?? "",
    ).trim();

    const stage = classifyStage(content, explicitStage);

    const utmChannel =
      String(pickFirst(r, ["utm_channel", "channel"]) ?? "").trim() || undefined;
    const utmMedium =
      String(pickFirst(r, ["utm_medium", "medium"]) ?? "").trim() || undefined;
    const utmContent =
      String(pickFirst(r, ["utm_content", "utmcontent"]) ?? "").trim() ||
      undefined;

    const productFranchise =
      String(
        pickFirst(r, [
          "product_franchise__c",
          "product_franchise",
          "product",
        ]) ?? "",
      ).trim() || undefined;

    const objective =
      String(pickFirst(r, ["objective", "campaign_objective"]) ?? "").trim() ||
      undefined;

    const contentType =
      String(
        pickFirst(r, ["typecampaignmember__c", "content_type", "type"]) ?? "",
      ).trim() || undefined;

    const cta =
      String(pickFirst(r, ["cta", "call_to_action", "cta_type"]) ?? "").trim() || undefined;

    const engagedSessions = toNumber(
      pickFirst(r, [
        "engaged_sessions",
        "engaged_session",
        "sessions_engaged",
        "engagedsession",
      ]),
    );

    const sessions = toNumber(
      pickFirst(r, ["sessions", "visits", "traffic", "visitors"]),
    );

    const pageViews = toNumber(
      pickFirst(r, ["pageviews", "page_views", "views", "page_views_total"]),
    );

    const timeSpentSeconds = toNumber(
      pickFirst(r, [
        "avg_time_on_page",
        "time_on_page",
        "time_spent_seconds",
        "avg_time_seconds",
      ]),
    );

    const scrollDepth = toNumber(
      pickFirst(r, [
        "scroll_depth",
        "avg_scroll_depth",
        "max_scroll_depth",
      ]),
    );

    const newUsers = toNumber(
      pickFirst(r, [
        "new_users",
        "new_user",
        "first_time_users",
        "first_time_contacts",
      ]),
    );

    const returningUsers = toNumber(
      pickFirst(r, ["returning_users", "returning_user"]),
    );

    const newsletterSignups = toNumber(
      pickFirst(r, [
        "newsletter_signups",
        "newsletter_opt_ins",
        "newsletter_subscriptions",
      ]),
    );

    const nextContentViews = toNumber(
      pickFirst(r, [
        "next_content_views",
        "subsequent_pageviews",
        "secondary_content_views",
      ]),
    );

    const newContacts = toNumber(
      pickFirst(r, [
        "new_contacts",
        "contacts_created",
        "new_leads",
        "first_time_contacts",
        "new_contact",
      ]),
    );

    const formSubmissions = toNumber(
      pickFirst(r, [
        "form_submissions",
        "form_submission",
        "submissions",
        "forms_submitted",
      ]),
    );

    const mqls = toNumber(pickFirst(r, ["mqls", "mql", "mql_flag", "is_mql"]));

    const qdcs = toNumber(
      pickFirst(r, [
        "qdc",
        "qdcs",
        "qdc_flag",
        "qdc_count",
        "qualified_discovery_calls",
      ]),
    );

    const sqos = toNumber(
      pickFirst(r, ["sqos", "sqo", "sqo_flag", "is_sqo", "sql"]),
    );

    const leadScore = toNumber(
      pickFirst(r, ["lead_score", "form_score1", "score", "leadscore"]),
    );

    const id = `${idx + 1}`;

    return {
      id,
      content,
      stage,
      utmChannel,
      utmMedium,
      utmContent,
      productFranchise,
      objective,
      contentType,
      cta,
      engagedSessions,
      sessions,
      pageViews,
      timeSpentSeconds,
      scrollDepth,
      newUsers,
      returningUsers,
      newsletterSignups,
      nextContentViews,
      newContacts,
      formSubmissions,
      mqls,
      qdcs,
      sqos,
      leadScore,
    };
  });
}

function sum(rows: NormalizedRow[], key: keyof NormalizedRow) {
  return rows.reduce(
    (acc, r) => acc + (typeof r[key] === "number" ? (r[key] as number) : 0),
    0,
  );
}

function pct(n: number, d: number) {
  if (!d) return 0;
  return (n / d) * 100;
}

function formatCompact(n: number) {
  return Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

function formatPct(n: number) {
  return `${n.toFixed(1)}%`;
}

const stageMeta: Record<FunnelStage, { label: string; tone: string }> = {
  TOFU: { label: "TOFU", tone: "bg-chart-1/12 text-chart-1 border-chart-1/20" },
  MOFU: { label: "MOFU", tone: "bg-chart-2/12 text-chart-2 border-chart-2/20" },
  BOFU: { label: "BOFU", tone: "bg-chart-3/12 text-chart-3 border-chart-3/20" },
  UNKNOWN: { label: "UNKNOWN", tone: "bg-muted text-muted-foreground border-border" },
};

const mockCSV = `CONTENT,UTM_CHANNEL,UTM_MEDIUM,PRODUCT_FRANCHISE__C,TYPECAMPAIGNMEMBER__C,OBJECTIVE,ENGAGED_SESSIONS,SESSIONS,PAGEVIEWS,AVG_TIME_ON_PAGE,AVG_SCROLL_DEPTH,NEW_USERS,RETURNING_USERS,NEWSLETTER_SIGNUPS,NEXT_CONTENT_VIEWS,NEW_CONTACTS,FORM_SUBMISSIONS,MQL_FLAG,QDC_COUNT,SQO_FLAG,FORM_SCORE1
TOFU_Cloud_Security_101,Organic,Search,CloudShield,Blog,NCA,980,1520,4200,64,58,510,210,22,380,64,18,0,0,0,18
TOFU_Zero_Trust_Checklist,Paid,Search,CloudShield,Landing Page,NCA,720,1200,3100,49,52,402,160,19,240,51,16,0,0,0,22
MOFU_CloudShield_Webinar_Threats,Email,Email,CloudShield,Webinar,NCA,410,620,1200,71,63,180,110,8,120,44,44,21,6,2,51
MOFU_Threat_Model_Whitepaper,Partner,Referral,CloudShield,Whitepaper,NCA,330,470,1400,83,66,190,120,11,150,39,39,17,4,1,47
BOFU_CloudShield_Demo_Request,Paid,Social,CloudShield,Landing Page,NCA,120,200,640,58,50,70,60,2,44,28,28,14,7,9,72
BOFU_CaseStudy_FinServ,Email,Email,CloudShield,Case Study,NCA,140,210,880,92,71,90,75,4,62,19,19,9,3,7,68
TOFU_Data_Privacy_Basics,Organic,Search,DataGuard,Blog,NCA,640,980,2600,61,56,350,180,14,190,41,10,0,0,0,16
MOFU_DataGuard_Interactive_Guide,Organic,Search,DataGuard,Landing Page,NCA,260,420,1100,77,65,140,95,9,130,25,25,10,2,1,44
BOFU_DataGuard_Pricing,Direct,Direct,DataGuard,Landing Page,NCA,90,140,520,44,47,55,45,1,38,10,10,6,2,4,66`;

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

export default function FunnelDashboard() {
  const [csvText, setCsvText] = useState<string>(mockCSV);
  const [fileName, setFileName] = useState<string>("sample.csv");
  const [stageFilter, setStageFilter] = useState<FunnelStage | "ALL">("ALL");
  const [dimension, setDimension] = useState<
    "utmChannel" | "productFranchise" | "contentType"
  >("utmChannel");
  const [contentTypeFilter, setContentTypeFilter] = useState<string>("ALL");
  const [productFilter, setProductFilter] = useState<string>("ALL");

  const [aiStep, setAiStep] = useState<AiStep>("idle");
  const [aiAnalysis, setAiAnalysis] = useState<AiAnalysis | null>(null);
  const [uploadDiagnostics, setUploadDiagnostics] = useState<UploadDiagnostics | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [dbRows, setDbRows] = useState<NormalizedRow[] | null>(null);

  const parsedRows = useMemo(() => parseCSV(csvText), [csvText]);
  const csvRows = useMemo(() => normalizeRows(parsedRows), [parsedRows]);
  const rows = dbRows ?? csvRows;

  const queryClient = useQueryClient();
  const ingestedRef = useRef<string>("");

  const aiActiveRef = useRef(false);

  useEffect(() => {
    if (aiActiveRef.current) return;
    const key = csvText.slice(0, 200);
    if (key === ingestedRef.current || parsedRows.length === 0) return;
    ingestedRef.current = key;
    fetch("/api/assets/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: parsedRows }),
    })
      .then(() => queryClient.invalidateQueries({ queryKey: ["/api/assets"] }))
      .catch((err) => console.error("Ingest failed:", err));
  }, [parsedRows, csvText, queryClient]);

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
    aiActiveRef.current = true;
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
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ base64, filename: file.name }),
          });
        } catch (networkErr: any) {
          throw new Error("Network error while uploading file. Please check your connection and try again.");
        }

        if (!parseRes.ok) {
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
        setCsvText(text);
        const parsed = parseCSV(text);
        if (parsed.length === 0) throw new Error("No data rows found in the file. Please check the file contains data rows with headers.");
        headers = Object.keys(parsed[0]);
        if (headers.length === 0) throw new Error("Could not detect column headers. Please ensure the first row contains column names.");
        sampleRows = parsed.slice(0, 5) as Record<string, any>[];
        allRows = parsed as Record<string, any>[];
      }

      if (headers.length === 0) {
        throw new Error("No column headers found in the file. Please check the file format.");
      }

      setAiStep("analyzing");

      let analyzeRes: globalThis.Response;
      try {
        analyzeRes = await fetch("/api/assets/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ headers, sampleRows }),
        });
      } catch (networkErr: any) {
        throw new Error("Network error during AI analysis. Please try again.");
      }

      if (!analyzeRes.ok) {
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assets: aggregatedAssets, totalRows: allRows.length, skippedNoContentId }),
        });
      } catch (networkErr: any) {
        throw new Error("Network error during data ingestion. Please try again.");
      }

      if (!ingestRes.ok) {
        const err = await safeJsonParse(ingestRes, "Data ingestion failed");
        throw new Error(err.message || "Ingestion failed");
      }

      const diagnostics: UploadDiagnostics = await safeJsonParse(ingestRes, "Failed to parse ingestion results");
      setUploadDiagnostics(diagnostics);

      let allAssetsRes: globalThis.Response;
      try {
        allAssetsRes = await fetch("/api/assets/all");
      } catch {
        allAssetsRes = new Response(null, { status: 500 });
      }
      if (allAssetsRes.ok) {
        const dbAssets: any[] = await safeJsonParse(allAssetsRes, "Failed to load assets");
        const converted: NormalizedRow[] = dbAssets.map((a, idx) => ({
          id: a.id || `db-${idx}`,
          content: a.contentId || "",
          stage: (a.stage || "UNKNOWN") as FunnelStage,
          utmChannel: a.utmChannel || undefined,
          utmMedium: a.utmMedium || undefined,
          utmContent: a.utmContent || undefined,
          productFranchise: a.productFranchise || undefined,
          objective: a.objective || undefined,
          contentType: a.typecampaignmember || undefined,
          cta: a.cta || undefined,
          engagedSessions: undefined,
          sessions: undefined,
          pageViews: a.pageviewsSum || 0,
          timeSpentSeconds: a.timeAvg || undefined,
          scrollDepth: undefined,
          newUsers: undefined,
          returningUsers: undefined,
          newsletterSignups: undefined,
          nextContentViews: undefined,
          newContacts: a.uniqueLeads || 0,
          formSubmissions: undefined,
          mqls: undefined,
          qdcs: undefined,
          sqos: a.sqoCount || 0,
          leadScore: undefined,
        }));
        setDbRows(converted);
      }

      setAiStep("done");
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
    } catch (err: any) {
      console.error("AI upload error:", err);
      setAiError(err.message || "Upload failed");
      setAiStep("error");
    }
  }, [queryClient, safeJsonParse]);

  const filtered = useMemo(() => {
    const stageFiltered =
      stageFilter === "ALL" ? rows : rows.filter((r) => r.stage === stageFilter);

    if (contentTypeFilter === "ALL") return stageFiltered;
    return stageFiltered.filter(
      (r) => (r.contentType || "(unattributed)") === contentTypeFilter,
    );
  }, [rows, stageFilter, contentTypeFilter]);

  const byStage = useMemo(() => {
    const groups: Record<FunnelStage, NormalizedRow[]> = {
      TOFU: [],
      MOFU: [],
      BOFU: [],
      UNKNOWN: [],
    };
    for (const r of filtered) groups[r.stage].push(r);
    return groups;
  }, [filtered]);

  const tofuBase = byStage.TOFU;
  const mofuBase = byStage.MOFU;
  const bofuBase = byStage.BOFU;

  const tofuEngaged = sum(tofuBase, "engagedSessions");
  const tofuSessions = sum(tofuBase, "sessions");
  const tofuNewUsers = sum(tofuBase, "newUsers");
  const tofuNewContacts = sum(tofuBase, "newContacts");
  const tofuHero = tofuNewUsers || tofuNewContacts;
  const tofuDenom = tofuEngaged || tofuSessions;
  const tofuConv = pct(tofuHero, tofuDenom);

  const mofuContacts = sum(mofuBase, "formSubmissions") || sum(mofuBase, "newContacts");
  const mofuNewContacts = sum(mofuBase, "newContacts");
  const mofuMqls = sum(mofuBase, "mqls");
  const mofuQdcs = sum(mofuBase, "qdcs");
  const mofuConv = pct(mofuMqls, mofuContacts || mofuNewContacts || 0);

  const bofuSqos = sum(bofuBase, "sqos");
  const bofuQdcs = sum(bofuBase, "qdcs");

  const qualityMqlScores = mofuBase
    .filter((r) => (r.mqls ?? 0) > 0 && typeof r.leadScore === "number")
    .map((r) => r.leadScore as number);
  const avgMqlScore =
    qualityMqlScores.length > 0
      ? qualityMqlScores.reduce((a, b) => a + b, 0) / qualityMqlScores.length
      : undefined;

  const totalRows = filtered.length;
  const unknownCount = byStage.UNKNOWN.length;

  const contentTypeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(r.contentType || "(unattributed)");
    return ["ALL", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [rows]);

  const topByStage: TopByStage = useMemo(() => {
    const compute = (stage: StageKey) => {
      const base = byStage[stage];
      const metricKey: keyof NormalizedRow = uploadDiagnostics
        ? "pageViews"
        : stage === "TOFU"
          ? (sum(base, "newUsers") ? "newUsers" : "newContacts")
          : stage === "MOFU"
            ? "mqls"
            : "sqos";

      const roll = new Map<
        string,
        { row: NormalizedRow; value: number; newContacts: number }
      >();

      for (const r of base) {
        const k = r.content || "(no content)";
        const v = typeof r[metricKey] === "number" ? (r[metricKey] as number) : 0;
        const nc = typeof r.newContacts === "number" ? r.newContacts : 0;
        const prev = roll.get(k);
        if (!prev) {
          roll.set(k, { row: r, value: v, newContacts: nc });
        } else {
          roll.set(k, {
            row: prev.row,
            value: prev.value + v,
            newContacts: prev.newContacts + nc,
          });
        }
      }

      return Array.from(roll.values())
        .sort((a, b) => b.value - a.value)
        .slice(0, 8)
        .map((x) => ({
          content: x.row.content || "(no content)",
          product: x.row.productFranchise || "—",
          channel: x.row.utmChannel || "—",
          value: x.value,
          newContacts: x.newContacts,
        }));
    };

    return {
      TOFU: compute("TOFU"),
      MOFU: compute("MOFU"),
      BOFU: compute("BOFU"),
    };
  }, [byStage, uploadDiagnostics]);

  const dimensionData = useMemo(() => {
    const roll = new Map<
      string,
      {
        key: string;
        engaged: number;
        views: number;
        newUsers: number;
        returningUsers: number;
        contacts: number;
        mqls: number;
        qdcs: number;
        sqos: number;
      }
    >();

    for (const r of filtered) {
      const key = (r[dimension] as string | undefined) || "(unattributed)";
      const cur =
        roll.get(key) || {
          key,
          engaged: 0,
          views: 0,
          newUsers: 0,
          returningUsers: 0,
          contacts: 0,
          mqls: 0,
          qdcs: 0,
          sqos: 0,
        };
      cur.engaged += r.engagedSessions ?? 0;
      cur.views += r.pageViews ?? 0;
      cur.newUsers += r.newUsers ?? 0;
      cur.returningUsers += r.returningUsers ?? 0;
      cur.contacts += r.formSubmissions ?? r.newContacts ?? 0;
      cur.mqls += r.mqls ?? 0;
      cur.qdcs += r.qdcs ?? 0;
      cur.sqos += r.sqos ?? 0;
      roll.set(key, cur);
    }

    return Array.from(roll.values())
      .sort(
        (a, b) =>
          b.sqos + b.mqls + b.contacts + b.newUsers + b.views + b.engaged -
          (a.sqos + a.mqls + a.contacts + a.newUsers + a.views + a.engaged),
      )
      .slice(0, 10);
  }, [filtered, dimension]);

  const productList = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      if (r.productFranchise) s.add(r.productFranchise);
    }
    return Array.from(s).sort();
  }, [rows]);

  const productMixData = useMemo(() => {
    const roll = new Map<
      string,
      {
        key: string;
        count: number;
        views: number;
        contacts: number;
        mqls: number;
        qdcs: number;
        sqos: number;
        tofu: number;
        mofu: number;
        bofu: number;
      }
    >();

    const source = productFilter === "ALL" ? filtered : filtered.filter((r) => r.productFranchise === productFilter);

    for (const r of source) {
      const key = r.productFranchise || "(unattributed)";
      const cur = roll.get(key) || {
        key,
        count: 0,
        views: 0,
        contacts: 0,
        mqls: 0,
        qdcs: 0,
        sqos: 0,
        tofu: 0,
        mofu: 0,
        bofu: 0,
      };
      cur.count += 1;
      cur.views += r.pageViews ?? 0;
      cur.contacts += r.formSubmissions ?? r.newContacts ?? 0;
      cur.mqls += r.mqls ?? 0;
      cur.qdcs += r.qdcs ?? 0;
      cur.sqos += r.sqos ?? 0;
      if (r.stage === "TOFU") cur.tofu += 1;
      else if (r.stage === "MOFU") cur.mofu += 1;
      else if (r.stage === "BOFU") cur.bofu += 1;
      roll.set(key, cur);
    }

    return Array.from(roll.values())
      .sort((a, b) => b.count + b.sqos + b.mqls - (a.count + a.sqos + a.mqls))
      .slice(0, 12);
  }, [filtered, productFilter]);

  const ctaByStage = useMemo(() => {
    const map: Record<string, Map<string, number>> = { TOFU: new Map(), MOFU: new Map(), BOFU: new Map() };
    for (const r of filtered) {
      const ctaVal = r.cta || "(none)";
      const s = r.stage;
      if (s === "TOFU" || s === "MOFU" || s === "BOFU") {
        map[s].set(ctaVal, (map[s].get(ctaVal) || 0) + 1);
      }
    }
    const toArr = (m: Map<string, number>) =>
      Array.from(m.entries())
        .map(([cta, count]) => ({ cta, count }))
        .sort((a, b) => b.count - a.count);
    return {
      TOFU: toArr(map.TOFU),
      MOFU: toArr(map.MOFU),
      BOFU: toArr(map.BOFU),
    };
  }, [filtered]);

  const ctaSummary = useMemo(() => {
    const ctaMap = new Map<string, { cta: string; assets: number; tofu: number; mofu: number; bofu: number; pageViews: number; leads: number; sqos: number }>();
    for (const r of filtered) {
      const ctaVal = r.cta || "(none)";
      if (!ctaMap.has(ctaVal)) {
        ctaMap.set(ctaVal, { cta: ctaVal, assets: 0, tofu: 0, mofu: 0, bofu: 0, pageViews: 0, leads: 0, sqos: 0 });
      }
      const entry = ctaMap.get(ctaVal)!;
      entry.assets += 1;
      if (r.stage === "TOFU") entry.tofu += 1;
      else if (r.stage === "MOFU") entry.mofu += 1;
      else if (r.stage === "BOFU") entry.bofu += 1;
      entry.pageViews += r.pageViews || 0;
      entry.leads += r.newContacts || 0;
      entry.sqos += r.sqos || 0;
    }
    return Array.from(ctaMap.values())
      .sort((a, b) => b.assets - a.assets);
  }, [filtered]);

  const funnelSeries = useMemo(() => {
    if (uploadDiagnostics) {
      return [
        {
          stage: "TOFU",
          contentAssets: byStage.TOFU.length,
          pageViews: sum(byStage.TOFU, "pageViews"),
          uniqueLeads: sum(byStage.TOFU, "newContacts"),
        },
        {
          stage: "MOFU",
          contentAssets: byStage.MOFU.length,
          pageViews: sum(byStage.MOFU, "pageViews"),
          uniqueLeads: sum(byStage.MOFU, "newContacts"),
        },
        {
          stage: "BOFU",
          contentAssets: byStage.BOFU.length,
          pageViews: sum(byStage.BOFU, "pageViews"),
          uniqueLeads: sum(byStage.BOFU, "newContacts"),
          sqos: sum(byStage.BOFU, "sqos"),
        },
      ];
    }
    return [
      {
        stage: "TOFU",
        engagedSessions: tofuEngaged,
        newContacts: tofuNewContacts,
      },
      {
        stage: "MOFU",
        engagedSessions: sum(mofuBase, "engagedSessions"),
        newContacts: mofuNewContacts,
        mqls: mofuMqls,
      },
      {
        stage: "BOFU",
        sqos: bofuSqos,
      },
    ];
  }, [tofuEngaged, tofuNewContacts, mofuBase, mofuNewContacts, mofuMqls, bofuSqos, uploadDiagnostics, byStage]);

  function onPickFile(file: File) {
    handleAiUpload(file);
  }

  return (
    <div className="min-h-screen">
      <TopNav />
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_circle_at_15%_10%,hsl(var(--chart-1)/0.16),transparent_58%),radial-gradient(900px_circle_at_80%_0%,hsl(var(--chart-2)/0.14),transparent_62%),radial-gradient(900px_circle_at_75%_80%,hsl(var(--chart-3)/0.12),transparent_58%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/40" />
        <div className="absolute inset-0 grain" />
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 py-8">
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
                  <LineChart className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1
                      className="text-balance text-2xl font-[650] tracking-tight"
                      data-testid="text-title"
                    >
                      Content Intelligence Analyst
                    </h1>
                    <Badge
                      variant="secondary"
                      className="border bg-card/70 backdrop-blur"
                      data-testid="badge-mode"
                    >
                      CIA dashboard
                    </Badge>
                  </div>
                  <p
                    className="mt-1 max-w-2xl text-sm text-muted-foreground"
                    data-testid="text-subtitle"
                  >
                    Upload your daily export and get a TOFU/MOFU/BOFU view with
                    stage KPIs, top content, and drilldowns by channel, product,
                    and content type.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 md:items-end">
                <div className="flex flex-wrap items-center gap-2">
                  <label
                    className="inline-flex cursor-pointer items-center gap-2 rounded-xl border bg-card/70 px-3 py-2 text-sm shadow-sm backdrop-blur hover:shadow"
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
                        if (f) onPickFile(f);
                        e.target.value = "";
                      }}
                      data-testid="input-file"
                    />
                  </label>

                  <Button
                    variant="secondary"
                    className="rounded-xl"
                    onClick={() => {
                      aiActiveRef.current = false;
                      setAiStep("idle");
                      setAiAnalysis(null);
                      setUploadDiagnostics(null);
                      setAiError(null);
                      setDbRows(null);
                      setCsvText(mockCSV);
                      setFileName("sample.csv");
                    }}
                    data-testid="button-load-sample"
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    Load sample
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground" data-testid="text-filename">
                  Currently loaded:{" "}
                  <span className="font-medium text-foreground">{fileName}</span>
                </div>
              </div>
            </div>

            {aiStep !== "idle" && (
              <Card className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur" data-testid="ai-analysis-panel">
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
                      Parsing file…
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
                      AI analyzing columns with Claude Opus…
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
                      Processing data with AI mapping…
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
              </Card>
            )}

            <div className="grid gap-3 md:grid-cols-3">
              <Card className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">TOFU</div>
                    <div className="mt-1 text-2xl font-[650] tracking-tight" data-testid="text-tofu-hero">
                      {formatCompact(uploadDiagnostics ? (uploadDiagnostics.stageBreakdown.TOFU ?? 0) : tofuHero)}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {uploadDiagnostics ? "Content assets" : "New users / contacts"}
                    </div>
                  </div>
                  <Badge className={`border ${stageMeta.TOFU.tone}`} data-testid="badge-tofu">
                    {uploadDiagnostics
                      ? `${formatPct(pct(uploadDiagnostics.stageBreakdown.TOFU ?? 0, uploadDiagnostics.ingested))} of total`
                      : `${formatPct(tofuConv)} new-user rate`}
                  </Badge>
                </div>
                <div className="mt-3 text-xs text-muted-foreground" data-testid="text-tofu-notes">
                  {uploadDiagnostics
                    ? `${uploadDiagnostics.stageBreakdown.TOFU ?? 0} unique content IDs classified as Top-of-Funnel`
                    : `Hero metric uses ${tofuNewUsers ? "new users" : "new contacts"}. Denominator uses ${tofuEngaged ? "engaged sessions" : "sessions"}.`}
                </div>
              </Card>

              <Card className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">MOFU</div>
                    <div className="mt-1 text-2xl font-[650] tracking-tight" data-testid="text-mofu-mqls">
                      {formatCompact(uploadDiagnostics ? (uploadDiagnostics.stageBreakdown.MOFU ?? 0) : mofuMqls)}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {uploadDiagnostics ? "Content assets" : "MQLs"}
                    </div>
                  </div>
                  <Badge
                    className={`border ${stageMeta.MOFU.tone}`}
                    data-testid="badge-mofu"
                  >
                    {uploadDiagnostics
                      ? `${formatPct(pct(uploadDiagnostics.stageBreakdown.MOFU ?? 0, uploadDiagnostics.ingested))} of total`
                      : `${formatPct(mofuConv)} MQL rate`}
                  </Badge>
                </div>
                <div className="mt-3 text-xs text-muted-foreground" data-testid="text-mofu-notes">
                  {uploadDiagnostics
                    ? `${uploadDiagnostics.stageBreakdown.MOFU ?? 0} unique content IDs classified as Middle-of-Funnel`
                    : <>
                        {avgMqlScore !== undefined
                          ? `Avg MQL lead score: ${avgMqlScore.toFixed(1)}`
                          : "Lead score not available"}
                        {mofuQdcs ? ` \u00b7 QDCs: ${formatCompact(mofuQdcs)}` : " \u00b7 QDC not tracked"}
                      </>}
                </div>
              </Card>

              <Card className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">BOFU</div>
                    <div
                      className="mt-1 text-2xl font-[650] tracking-tight"
                      data-testid="text-bofu-sqos"
                    >
                      {formatCompact(uploadDiagnostics ? (uploadDiagnostics.stageBreakdown.BOFU ?? 0) : bofuSqos)}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {uploadDiagnostics ? "Content assets" : "SQOs"}
                    </div>
                  </div>
                  <Badge className={`border ${stageMeta.BOFU.tone}`} data-testid="badge-bofu">
                    {uploadDiagnostics
                      ? `${formatPct(pct(uploadDiagnostics.stageBreakdown.BOFU ?? 0, uploadDiagnostics.ingested))} of total`
                      : bofuQdcs ? `${formatCompact(bofuQdcs)} QDCs` : "QDC not tracked"}
                  </Badge>
                </div>
                <div className="mt-3 text-xs text-muted-foreground" data-testid="text-bofu-notes">
                  {uploadDiagnostics
                    ? `${uploadDiagnostics.stageBreakdown.BOFU ?? 0} unique content IDs classified as Bottom-of-Funnel`
                    : bofuQdcs ? `QDC \u2192 SQO: ${formatPct(pct(bofuSqos, bofuQdcs))}` : "QDC \u2192 SQO conversion is skipped (no QDC data)."}
                </div>
              </Card>
            </div>

            <Card className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <div className="text-sm font-medium" data-testid="text-filters">
                    Filters & views
                  </div>
                </div>

                <div className="flex flex-col gap-2 md:flex-row md:items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Stage</span>
                    <Select
                      value={stageFilter}
                      onValueChange={(v) =>
                        setStageFilter(v as FunnelStage | "ALL")
                      }
                    >
                      <SelectTrigger
                        className="h-9 w-[160px] rounded-xl"
                        data-testid="select-stage"
                      >
                        <SelectValue placeholder="All stages" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL" data-testid="option-stage-all">
                          All stages
                        </SelectItem>
                        <SelectItem value="TOFU" data-testid="option-stage-tofu">
                          TOFU
                        </SelectItem>
                        <SelectItem value="MOFU" data-testid="option-stage-mofu">
                          MOFU
                        </SelectItem>
                        <SelectItem value="BOFU" data-testid="option-stage-bofu">
                          BOFU
                        </SelectItem>
                        <SelectItem
                          value="UNKNOWN"
                          data-testid="option-stage-unknown"
                        >
                          UNKNOWN
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Content type</span>
                    <Select value={contentTypeFilter} onValueChange={setContentTypeFilter}>
                      <SelectTrigger
                        className="h-9 w-[220px] rounded-xl"
                        data-testid="select-content-type"
                      >
                        <SelectValue placeholder="All types" />
                      </SelectTrigger>
                      <SelectContent>
                        {contentTypeOptions.map((opt) => (
                          <SelectItem
                            key={opt}
                            value={opt}
                            data-testid={`option-content-type-${opt.replace(/\s+/g, "-").toLowerCase()}`}
                          >
                            {opt === "ALL" ? "All types" : opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Breakdown</span>
                    <Select
                      value={dimension}
                      onValueChange={(v) => setDimension(v as typeof dimension)}
                    >
                      <SelectTrigger
                        className="h-9 w-[200px] rounded-xl"
                        data-testid="select-dimension"
                      >
                        <SelectValue placeholder="Dimension" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          value="utmChannel"
                          data-testid="option-dim-channel"
                        >
                          UTM Channel
                        </SelectItem>
                        <SelectItem
                          value="productFranchise"
                          data-testid="option-dim-product"
                        >
                          Product
                        </SelectItem>
                        <SelectItem
                          value="contentType"
                          data-testid="option-dim-type"
                        >
                          Content type
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="hidden items-center gap-2 md:flex">
                    <Badge
                      variant="secondary"
                      className="rounded-xl"
                      data-testid="badge-rows"
                    >
                      {filtered.length} rows
                    </Badge>
                    <Badge
                      variant="secondary"
                      className="rounded-xl"
                      data-testid="badge-unknown"
                    >
                      {unknownCount} unknown
                    </Badge>
                  </div>
                </div>
              </div>
            </Card>
          </header>

          <div className="grid gap-4 lg:grid-cols-3 mb-4">
            {(["TOFU", "MOFU", "BOFU"] as StageKey[]).map((stage) => {
              const stageColors: Record<string, string> = {
                TOFU: "hsl(var(--chart-1))",
                MOFU: "hsl(var(--chart-2))",
                BOFU: "hsl(var(--chart-3))",
              };
              const data = ctaByStage[stage];
              const chartHeight = Math.max(200, data.length * 32 + 40);
              return (
                <Card
                  key={stage}
                  className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur"
                  data-testid={`card-cta-${stage.toLowerCase()}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium" data-testid={`text-cta-stage-title-${stage.toLowerCase()}`}>
                        {stage} — CTA Breakdown
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Count of content IDs per CTA type
                      </div>
                    </div>
                    <Badge variant="secondary" className="rounded-xl" data-testid={`badge-cta-stage-${stage.toLowerCase()}`}>
                      {data.reduce((s, d) => s + d.count, 0)} assets
                    </Badge>
                  </div>
                  <div className="mt-3" style={{ height: chartHeight }} data-testid={`chart-cta-${stage.toLowerCase()}`}>
                    {data.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} layout="vertical" barCategoryGap={4} margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.2} horizontal={false} />
                          <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} />
                          <YAxis
                            type="category"
                            dataKey="cta"
                            tickLine={false}
                            axisLine={false}
                            width={120}
                            tick={{ fontSize: 11 }}
                          />
                          <ReTooltip formatter={(value: number) => [value, "Content IDs"]} />
                          <Bar dataKey="count" name="Content IDs" fill={stageColors[stage]} radius={[0, 6, 6, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        No CTA data for {stage}
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-5">

            <Card className="lg:col-span-2 rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium" data-testid="text-mix-title">
                    Stage mix
                  </div>
                  <div
                    className="mt-1 text-xs text-muted-foreground"
                    data-testid="text-mix-subtitle"
                  >
                    Row distribution by classified stage.
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className="rounded-xl"
                  data-testid="badge-mix"
                >
                  {formatCompact(totalRows)} {uploadDiagnostics ? "content assets" : "rows"}
                </Badge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {([
                  "TOFU",
                  "MOFU",
                  "BOFU",
                  "UNKNOWN",
                ] as FunnelStage[]).map((s) => (
                  <button
                    key={s}
                    className="group flex items-center justify-between rounded-2xl border bg-card/60 px-3 py-3 text-left shadow-sm transition hover:shadow"
                    onClick={() => setStageFilter((prev) => (prev === s ? "ALL" : s))}
                    data-testid={`button-stage-${s.toLowerCase()}`}
                  >
                    <div>
                      <div className="text-xs text-muted-foreground">
                        {stageMeta[s].label}
                      </div>
                      <div
                        className="mt-1 text-lg font-[650] tracking-tight"
                        data-testid={`text-stage-count-${s.toLowerCase()}`}
                      >
                        {byStage[s].length}
                      </div>
                    </div>
                    <span
                      className={`rounded-full border px-2 py-1 text-xs ${stageMeta[s].tone}`}
                    >
                      {Math.round(pct(byStage[s].length, totalRows))}%
                    </span>
                  </button>
                ))}
              </div>

              <Separator className="my-4" />

              <div className="grid gap-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium" data-testid="text-dim-title">
                    Breakdown: {dimension}
                  </div>
                  <Badge
                    variant="secondary"
                    className="rounded-xl"
                    data-testid="badge-breakdown"
                  >
                    Top {dimensionData.length}
                  </Badge>
                </div>
                <div className="h-[190px]" data-testid="chart-dimension">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dimensionData}>
                      <defs>
                        <linearGradient id="g1" x1="0" x2="0" y1="0" y2="1">
                          <stop
                            offset="0%"
                            stopColor="hsl(var(--chart-1))"
                            stopOpacity={0.35}
                          />
                          <stop
                            offset="100%"
                            stopColor="hsl(var(--chart-1))"
                            stopOpacity={0.03}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                      <XAxis dataKey="key" hide />
                      <YAxis hide />
                      <ReTooltip />
                      <Area
                        type="monotone"
                        dataKey={uploadDiagnostics ? "views" : "mqls"}
                        name={uploadDiagnostics ? "Page Views" : "MQLs"}
                        stroke="hsl(var(--chart-1))"
                        fill="url(#g1)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid gap-2">
                  {dimensionData.slice(0, 6).map((d) => (
                    <div
                      key={d.key}
                      className="flex items-center justify-between rounded-xl border bg-card/60 px-3 py-2"
                      data-testid={`row-dimension-${d.key.replace(/\s+/g, "-").toLowerCase()}`}
                    >
                      <div className="truncate text-sm font-medium">{d.key}</div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {uploadDiagnostics ? (
                          <>
                            <span>{formatCompact(d.views)} page views</span>
                            <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                            <span>{formatCompact(d.contacts)} leads</span>
                            <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                            <span>{formatCompact(d.sqos)} SQOs</span>
                          </>
                        ) : (
                          <>
                            <span>{formatCompact(d.contacts)} contacts</span>
                            <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                            <span>{formatCompact(d.mqls)} MQLs</span>
                            <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                            <span>{formatCompact(d.qdcs)} QDCs</span>
                            <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                            <span>{formatCompact(d.sqos)} SQOs</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card className="lg:col-span-3 rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur" data-testid="card-product-mix">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium" data-testid="text-product-mix-title">
                    Product mix
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground" data-testid="text-product-mix-subtitle">
                    Performance breakdown by product franchise.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={productFilter} onValueChange={setProductFilter}>
                    <SelectTrigger className="h-8 w-[180px] rounded-xl text-xs" data-testid="select-product-filter">
                      <SelectValue placeholder="All products" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL" data-testid="option-product-all">All products</SelectItem>
                      {productList.map((p) => (
                        <SelectItem key={p} value={p} data-testid={`option-product-${p.replace(/\s+/g, "-").toLowerCase()}`}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Badge variant="secondary" className="rounded-xl" data-testid="badge-product-count">
                    {productMixData.length} {productMixData.length === 1 ? "product" : "products"}
                  </Badge>
                </div>
              </div>

              <div className="mt-4 h-[180px]" data-testid="chart-product-mix">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={productMixData} layout="vertical" margin={{ left: 4, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="key"
                      width={110}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <ReTooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "12px",
                        fontSize: "12px",
                      }}
                    />
                    <Bar dataKey="tofu" name="TOFU" stackId="stage" fill="hsl(var(--chart-1))" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="mofu" name="MOFU" stackId="stage" fill="hsl(var(--chart-2))" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="bofu" name="BOFU" stackId="stage" fill="hsl(var(--chart-3))" radius={[0, 4, 4, 0]} />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <Separator className="my-4" />

              <div className="grid gap-2 max-h-[260px] overflow-y-auto pr-1">
                {productMixData.map((d) => (
                  <button
                    key={d.key}
                    className="flex items-center justify-between rounded-xl border bg-card/60 px-3 py-2.5 text-left transition hover:shadow hover:bg-card/80"
                    onClick={() => setProductFilter(d.key === productFilter ? "ALL" : d.key)}
                    data-testid={`row-product-${d.key.replace(/\s+/g, "-").toLowerCase()}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{d.key}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{d.count} assets</span>
                        <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                        <span className="text-emerald-400">{d.tofu} TOFU</span>
                        <span className="text-sky-400">{d.mofu} MOFU</span>
                        <span className="text-orange-400">{d.bofu} BOFU</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0 ml-3">
                      {uploadDiagnostics ? (
                        <>
                          <span>{formatCompact(d.views)} views</span>
                          <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                          <span>{formatCompact(d.contacts)} leads</span>
                          <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                          <span className="font-medium text-foreground">{formatCompact(d.sqos)} SQOs</span>
                        </>
                      ) : (
                        <>
                          <span>{formatCompact(d.contacts)} contacts</span>
                          <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                          <span>{formatCompact(d.mqls)} MQLs</span>
                          <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                          <span className="font-medium text-foreground">{formatCompact(d.sqos)} SQOs</span>
                        </>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </Card>

          </div>

          <Tabs defaultValue="cta-analysis" className="w-full">
            <TabsList className="grid w-full grid-cols-3 rounded-2xl border bg-card/60 p-1 shadow-sm backdrop-blur">
              <TabsTrigger
                value="cta-analysis"
                className="rounded-xl"
                data-testid="tab-cta-analysis"
              >
                <Filter className="mr-2 h-4 w-4" />
                CTA Analysis
              </TabsTrigger>
              <TabsTrigger
                value="top-content"
                className="rounded-xl"
                data-testid="tab-top-content"
              >
                <TableIcon className="mr-2 h-4 w-4" />
                Top content
              </TabsTrigger>
              <TabsTrigger
                value="data"
                className="rounded-xl"
                data-testid="tab-data"
              >
                <ArrowRight className="mr-2 h-4 w-4" />
                Raw CSV
              </TabsTrigger>
            </TabsList>

            <TabsContent value="cta-analysis" className="mt-4">
              <Card className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium" data-testid="text-cta-title">
                      CTA Performance Summary
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground" data-testid="text-cta-subtitle">
                      Metrics breakdown per CTA type across all funnel stages.
                    </div>
                  </div>
                  <Badge variant="secondary" className="rounded-xl" data-testid="badge-cta-count">
                    {ctaSummary.length} CTAs
                  </Badge>
                </div>
                <div className="mt-4 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>CTA</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">TOFU</TableHead>
                        <TableHead className="text-right">MOFU</TableHead>
                        <TableHead className="text-right">BOFU</TableHead>
                        <TableHead className="text-right">Page Views</TableHead>
                        <TableHead className="text-right">Leads</TableHead>
                        <TableHead className="text-right">SQOs</TableHead>
                        <TableHead className="text-right">Conv.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ctaSummary.map((d, idx) => (
                        <TableRow key={d.cta} className="hover:bg-muted/30" data-testid={`row-cta-${idx}`}>
                          <TableCell>
                            <div className="text-sm font-medium" data-testid={`text-cta-name-${idx}`}>{d.cta}</div>
                          </TableCell>
                          <TableCell className="text-right text-sm font-[650]" data-testid={`text-cta-assets-${idx}`}>
                            {formatCompact(d.assets)}
                          </TableCell>
                          <TableCell className="text-right text-sm" data-testid={`text-cta-tofu-${idx}`}>
                            {d.tofu || "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm" data-testid={`text-cta-mofu-${idx}`}>
                            {d.mofu || "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm" data-testid={`text-cta-bofu-${idx}`}>
                            {d.bofu || "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm" data-testid={`text-cta-views-${idx}`}>
                            {formatCompact(d.pageViews)}
                          </TableCell>
                          <TableCell className="text-right text-sm" data-testid={`text-cta-leads-${idx}`}>
                            {formatCompact(d.leads)}
                          </TableCell>
                          <TableCell className="text-right text-sm font-[650]" data-testid={`text-cta-sqos-${idx}`}>
                            {formatCompact(d.sqos)}
                          </TableCell>
                          <TableCell className="text-right text-sm" data-testid={`text-cta-conv-${idx}`}>
                            {d.leads > 0 ? `${((d.sqos / d.leads) * 100).toFixed(1)}%` : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="top-content" className="mt-4">
              <div className="grid gap-4 lg:grid-cols-3">
                {(["TOFU", "MOFU", "BOFU"] as StageKey[]).map((s) => {
                  const metricLabel = uploadDiagnostics
                    ? "Page Views"
                    : s === "TOFU" ? "Engaged Sessions" : s === "MOFU" ? "MQLs" : "SQOs";

                  return (
                    <Card
                      key={s}
                      className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur"
                      data-testid={`card-top-${s.toLowerCase()}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div
                            className="text-sm font-medium"
                            data-testid={`text-top-title-${s.toLowerCase()}`}
                          >
                            Top {s} content
                          </div>
                          <div
                            className="mt-1 text-xs text-muted-foreground"
                            data-testid={`text-top-subtitle-${s.toLowerCase()}`}
                          >
                            Ranked by {metricLabel}.
                          </div>
                        </div>
                        <Badge
                          className={`border ${stageMeta[s].tone}`}
                          data-testid={`badge-top-${s.toLowerCase()}`}
                        >
                          {metricLabel}
                        </Badge>
                      </div>

                      <div className="mt-3">
                        <div className="rounded-2xl border bg-card/60">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-[46%]">Content</TableHead>
                                <TableHead className="w-[26%]">Product</TableHead>
                                <TableHead className="text-right">Value</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {topByStage[s].map((r: TopContentRow, idx: number) => (
                                <TableRow
                                  key={`${r.content}-${idx}`}
                                  className="hover:bg-muted/30"
                                  data-testid={`row-top-${s.toLowerCase()}-${idx}`}
                                >
                                  <TableCell>
                                    <div
                                      className="max-w-[240px] truncate text-sm font-medium"
                                      data-testid={`text-content-${s.toLowerCase()}-${idx}`}
                                    >
                                      {r.content}
                                    </div>
                                    <div
                                      className="mt-0.5 text-xs text-muted-foreground"
                                      data-testid={`text-channel-${s.toLowerCase()}-${idx}`}
                                    >
                                      {r.channel}
                                    </div>
                                  </TableCell>
                                  <TableCell
                                    className="text-sm"
                                    data-testid={`text-product-${s.toLowerCase()}-${idx}`}
                                  >
                                    {r.product}
                                  </TableCell>
                                  <TableCell
                                    className="text-right text-sm font-[650]"
                                    data-testid={`text-value-${s.toLowerCase()}-${idx}`}
                                  >
                                    {formatCompact(r.value)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="data" className="mt-4">
              <Card className="rounded-2xl border bg-card/70 p-4 shadow-sm backdrop-blur">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium" data-testid="text-raw-title">
                      CSV text
                    </div>
                    <div
                      className="mt-1 text-xs text-muted-foreground"
                      data-testid="text-raw-subtitle"
                    >
                      Paste your CSV here, or upload a file above.
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className="rounded-xl"
                    data-testid="badge-rows-raw"
                  >
                    {rows.length} parsed
                  </Badge>
                </div>

                <div className="mt-3 grid gap-3 lg:grid-cols-5">
                  <div className="lg:col-span-3">
                    <textarea
                      value={csvText}
                      onChange={(e) => setCsvText(e.target.value)}
                      className="min-h-[260px] w-full resize-y rounded-2xl border bg-card/60 px-3 py-3 font-mono text-xs leading-relaxed shadow-sm outline-none focus:ring-2 focus:ring-ring/30"
                      data-testid="textarea-csv"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <div className="rounded-2xl border bg-card/60 p-3">
                      <div className="text-sm font-medium" data-testid="text-schema-title">
                        Detected columns
                      </div>
                      <div
                        className="mt-1 text-xs text-muted-foreground"
                        data-testid="text-schema-subtitle"
                      >
                        Normalized keys from your header row.
                      </div>
                      <Separator className="my-3" />
                      <ScrollArea className="h-[210px] pr-3" data-testid="scroll-columns">
                        <div className="flex flex-wrap gap-2">
                          {Object.keys(parsedRows[0] || {}).map((k) => (
                            <Badge
                              key={k}
                              variant="secondary"
                              className="rounded-xl border bg-card"
                              data-testid={`badge-col-${k}`}
                            >
                              {k}
                            </Badge>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>

                    <div className="mt-3 rounded-2xl border bg-card/60 p-3">
                      <div className="text-sm font-medium" data-testid="text-mapping-title">
                        Metric mapping (preview)
                      </div>
                      <div
                        className="mt-1 text-xs text-muted-foreground"
                        data-testid="text-mapping-subtitle"
                      >
                        What the dashboard is currently using, based on your CSV.
                      </div>
                      <Separator className="my-3" />
                      <div className="grid gap-2 text-sm">
                        <div className="flex items-center justify-between" data-testid="map-engaged">
                          <span className="text-muted-foreground">Engaged sessions</span>
                          <span className="font-medium">engaged_sessions → engagedSessions</span>
                        </div>
                        <div className="flex items-center justify-between" data-testid="map-new-contacts">
                          <span className="text-muted-foreground">New contacts</span>
                          <span className="font-medium">new_contacts → newContacts</span>
                        </div>
                        <div className="flex items-center justify-between" data-testid="map-mql">
                          <span className="text-muted-foreground">MQLs</span>
                          <span className="font-medium">mql_flag → mqls</span>
                        </div>
                        <div className="flex items-center justify-between" data-testid="map-sqo">
                          <span className="text-muted-foreground">SQOs</span>
                          <span className="font-medium">sqo_flag → sqos</span>
                        </div>
                        <div className="flex items-center justify-between" data-testid="map-score">
                          <span className="text-muted-foreground">Lead score</span>
                          <span className="font-medium">form_score1 → leadScore</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.55 }}
          className="mt-6"
        >
          <ContentLibrary />
        </motion.div>
      </div>
    </div>
  );
}
