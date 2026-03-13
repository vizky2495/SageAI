import jsPDF from "jspdf";
import { type StructuredKeywordTags, normalizeKeywordTags, flattenKeywordTags } from "@shared/schema";

const SAGE = {
  black: "#000000",
  green: "#00D657",
  greenDark: "#00C04E",
  white: "#FFFFFF",
  bodyText: "#E0E0E0",
  muted: "#999999",
  tealRow: "#004D4D",
  darkRow: "#1A1A1A",
  headerRow: "#00D657",
  headerText: "#000000",
  sourceGreen: "#00D657",
  sourceJade: "#00B8A9",
  sourceAmber: "#F5A623",
  calloutBg: "#0A3D1F",
  dimGreen: "#00A65C",
  tagTeal: "#0D9488",
  tagJade: "#059669",
  tagShared: "#00D657",
  tagTopic: "#006362",
  tagAudience: "#00A65C",
  tagIntent: "#00D657",
  tagUser: "#666666",
};

const MARGIN = 18;
const PAGE_W = 210;
const PAGE_H = 297;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_Y = PAGE_H - 10;

interface FullComparisonResult {
  nameA: string;
  nameB: string;
  contentOverview: { a: { summary: string } | null; b: { summary: string } | null } | null;
  resonanceAssessment: { a: any | null; b: any | null; suggestedStageA?: string | null; suggestedStageB?: string | null } | null;
  sharedAndDifferent: { overlap: string[]; divergence: string[] } | null;
  keyTopics?: { a: { topic: string; detail: string }[] | null; b: { topic: string; detail: string }[] | null; comparisonInsight: string } | null;
  whatMakesItWork?: { a: any[] | null; b: any[] | null } | null;
  whatCouldBeImproved?: { a: any[] | null; b: any[] | null } | null;
  keywordTagsA?: StructuredKeywordTags | string[];
  keywordTagsB?: StructuredKeywordTags | string[];
  sharedTags?: string[];
  uniqueTagsA?: string[];
  uniqueTagsB?: string[];
  structuredSharedTags?: StructuredKeywordTags;
  structuredUniqueTagsA?: StructuredKeywordTags;
  structuredUniqueTagsB?: StructuredKeywordTags;
  verdict: string;
  suggestions: { text: string; source: string }[];
  metricsA: { pageviews: number; downloads: number; leads: number; sqos: number; avgTime: number; hasData: boolean };
  metricsB: { pageviews: number; downloads: number; leads: number; sqos: number; avgTime: number; hasData: boolean };
  performanceDisplay?: "table" | "inline" | "none";
  performanceInlineSummary?: string | null;
  lowEngagement?: boolean;
  isDuplicate?: boolean;
  duplicateMessage?: string;
  metadataIssues?: { asset: string; field: string; tagged: string; issue: string }[];
  metadata: {
    stageA: string; stageB: string; productA: string; productB: string;
    countryA: string; countryB: string; industryA: string; industryB: string;
    typeA: string; typeB: string; wordCountA: number | null; wordCountB: number | null;
    formatA: string; formatB: string;
    summaryA: string; summaryB: string; bothHaveContent: boolean;
    aHasContent?: boolean; bHasContent?: boolean;
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function dv(v: string | undefined | null): string {
  return v || "Not specified";
}

export function generateComparisonPdf(data: FullComparisonResult) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = 0;
  let pageNum = 0;

  function setColor(hex: string) { doc.setTextColor(...hexToRgb(hex)); }
  function setFill(hex: string) { doc.setFillColor(...hexToRgb(hex)); }

  function addFooter() {
    pageNum++;
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    setColor(SAGE.dimGreen);
    doc.text("Sage", MARGIN, FOOTER_Y);
    setColor(SAGE.green);
    doc.text("CONFIDENTIAL: INTERNAL USE ONLY", PAGE_W / 2, FOOTER_Y, { align: "center" });
    setColor(SAGE.dimGreen);
    doc.text(`${pageNum}`, PAGE_W - MARGIN, FOOTER_Y, { align: "right" });
    doc.setFontSize(5.5);
    doc.text(`\u00A9 ${new Date().getFullYear()} The Sage Group plc, or its licensors. All rights reserved.`, PAGE_W / 2, FOOTER_Y + 3, { align: "center" });
  }

  function addBlackPage() {
    setFill(SAGE.black);
    doc.rect(0, 0, PAGE_W, PAGE_H, "F");
  }

  function newPage() {
    if (pageNum > 0) doc.addPage();
    addBlackPage();
    addFooter();
    y = MARGIN + 2;
  }

  function checkPage(needed: number) {
    if (y + needed > FOOTER_Y - 8) newPage();
  }

  function sectionTitle(title: string) {
    checkPage(14);
    setColor(SAGE.white);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(title, MARGIN, y);
    y += 3;
    doc.setDrawColor(...hexToRgb(SAGE.green));
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, MARGIN + 50, y);
    doc.setLineWidth(0.2);
    y += 6;
  }

  function sourceTag(text: string, xPos?: number) {
    const color = text.includes("Internal") ? SAGE.sourceGreen : text.includes("Content") ? SAGE.sourceJade : SAGE.sourceAmber;
    setColor(color);
    doc.setFontSize(6);
    doc.setFont("helvetica", "italic");
    doc.text(`[${text}]`, xPos ?? MARGIN, y);
    y += 4;
  }

  function wrappedText(text: string, color: string, size: number, maxWidth: number, bold = false, xOffset = 0): number {
    if (!text) return 0;
    setColor(color);
    doc.setFontSize(size);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    const lines = doc.splitTextToSize(text, maxWidth);
    const lineHeight = size * 0.45;
    for (const line of lines) {
      checkPage(lineHeight + 2);
      doc.text(line, MARGIN + xOffset, y);
      y += lineHeight;
    }
    return lines.length;
  }

  function drawTableRow(cells: string[], widths: number[], isHeader: boolean, isAlt: boolean) {
    const cellPad = 2;
    doc.setFontSize(7);
    const lineH = 2.8;
    const wrappedCells = cells.map((cell, i) => doc.splitTextToSize(cell || "", widths[i] - cellPad * 2));
    const maxLines = Math.max(...wrappedCells.map(c => c.length));
    const rowHeight = Math.max(6, maxLines * lineH + cellPad * 2);
    checkPage(rowHeight + 2);
    setFill(isHeader ? SAGE.headerRow : isAlt ? SAGE.tealRow : SAGE.darkRow);
    let x = MARGIN;
    doc.rect(x, y - 1, widths.reduce((a, b) => a + b, 0), rowHeight, "F");
    wrappedCells.forEach((lines, i) => {
      setColor(isHeader ? SAGE.headerText : SAGE.bodyText);
      doc.setFont("helvetica", isHeader ? "bold" : "normal");
      lines.forEach((line: string, li: number) => {
        doc.text(line, x + cellPad, y + cellPad + li * lineH);
      });
      x += widths[i];
    });
    y += rowHeight;
  }

  function drawTags(tags: string[], color: string, borderColor: string, label?: string, maxTotal = 10) {
    if (!tags || tags.length === 0) return;
    checkPage(10);
    let x = MARGIN;
    if (label) {
      setColor(SAGE.muted);
      doc.setFontSize(6);
      doc.setFont("helvetica", "normal");
      doc.text(label, x, y);
      x += doc.getTextWidth(label) + 3;
    }
    const displayTags = tags.slice(0, maxTotal);
    const tagH = 4;
    const tagPad = 2;
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "bold");
    for (const tag of displayTags) {
      const w = doc.getTextWidth(tag) + tagPad * 2;
      if (x + w > PAGE_W - MARGIN) {
        x = MARGIN + (label ? 15 : 0);
        y += tagH + 1.5;
        checkPage(tagH + 2);
      }
      setFill(color);
      doc.roundedRect(x, y - 3, w, tagH, 1, 1, "F");
      if (borderColor) {
        doc.setDrawColor(...hexToRgb(borderColor));
        doc.roundedRect(x, y - 3, w, tagH, 1, 1, "S");
      }
      setColor(SAGE.white);
      doc.text(tag, x + tagPad, y - 0.5);
      x += w + 2;
    }
    y += tagH + 2;
    if (tags.length > maxTotal) {
      setColor(SAGE.muted);
      doc.setFontSize(5.5);
      doc.setFont("helvetica", "italic");
      doc.text(`+${tags.length - maxTotal} more tags — see full list in Content Library`, MARGIN, y);
      y += 4;
    }
  }

  function drawStructuredTags(structuredTags: StructuredKeywordTags, label?: string, maxTotal = 10) {
    const tagTypes: { key: keyof StructuredKeywordTags; typeLabel: string; bgColor: string; borderColor: string; textColor: string }[] = [
      { key: "topic_tags", typeLabel: "Topic", bgColor: SAGE.tagTopic, borderColor: "", textColor: SAGE.white },
      { key: "audience_tags", typeLabel: "Audience", bgColor: SAGE.tagAudience, borderColor: "", textColor: SAGE.white },
      { key: "intent_tags", typeLabel: "Intent", bgColor: "transparent", borderColor: SAGE.tagIntent, textColor: SAGE.tagIntent },
      { key: "user_added_tags", typeLabel: "Custom", bgColor: SAGE.tagUser, borderColor: "", textColor: SAGE.white },
    ];

    const hasAny = tagTypes.some(t => structuredTags[t.key].length > 0);
    if (!hasAny) return;

    let remaining = maxTotal;

    if (label) {
      checkPage(8);
      setColor(SAGE.muted);
      doc.setFontSize(6);
      doc.setFont("helvetica", "normal");
      doc.text(label, MARGIN, y);
      y += 4;
    }

    for (const { key, typeLabel, bgColor, borderColor, textColor } of tagTypes) {
      const allTags = structuredTags[key];
      if (allTags.length === 0 || remaining <= 0) continue;
      const tags = allTags.slice(0, remaining);
      remaining -= tags.length;
      checkPage(8);
      let x = MARGIN;
      setColor(SAGE.muted);
      doc.setFontSize(5);
      doc.setFont("helvetica", "normal");
      doc.text(`${typeLabel}:`, x, y);
      x += doc.getTextWidth(`${typeLabel}:`) + 2;

      const tagH = 4;
      const tagPad = 2;
      doc.setFontSize(5.5);
      doc.setFont("helvetica", "bold");
      for (const tag of tags) {
        const w = doc.getTextWidth(tag) + tagPad * 2;
        if (x + w > PAGE_W - MARGIN) {
          x = MARGIN + 15;
          y += tagH + 1.5;
          checkPage(tagH + 2);
        }
        if (bgColor !== "transparent") {
          setFill(bgColor);
          doc.roundedRect(x, y - 3, w, tagH, 1, 1, "F");
        }
        if (borderColor) {
          doc.setDrawColor(...hexToRgb(borderColor));
          doc.roundedRect(x, y - 3, w, tagH, 1, 1, "S");
        }
        setColor(textColor);
        doc.text(tag, x + tagPad, y - 0.5);
        x += w + 2;
      }
      y += tagH + 2;
    }
  }

  // === COVER PAGE ===
  addBlackPage();
  pageNum++;

  setFill(SAGE.green);
  doc.rect(MARGIN, 45, CONTENT_W, 0.8, "F");

  y = 60;
  setColor(SAGE.white);
  doc.setFontSize(34);
  doc.setFont("helvetica", "bold");
  doc.text("Content Comparison", MARGIN, y);
  y += 14;
  doc.setFontSize(34);
  doc.text("Report", MARGIN, y);
  y += 18;

  doc.setFontSize(16);
  doc.setFont("helvetica", "normal");
  setColor(SAGE.white);
  doc.text("Content Intelligence Analyst", MARGIN, y);
  y += 14;

  setColor(SAGE.muted);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  function shortName(name: string): string {
    let s = name;
    s = s.replace(/^CL_[A-Z0-9]+_[A-Z]{2,4}_[A-Z]{2,4}_[A-Z]+_[A-Z]+_/i, "");
    s = s.replace(/\s*\([^)]*\)\s*$/g, "");
    s = s.replace(/\s*[,|]\s*(GO|TOP|BOT|MID|GNRC|CER|COM|NFS)\b/gi, "");
    s = s.replace(/\s*(GO|TOP|BOT|MID|GNRC|CER|COM|NFS)\s*[,|]/gi, "");
    s = s.replace(/\s*[,|]\s*(English\s+)?(Canada|Australia|US|UK|France|Germany|Spain|Ireland|South Africa)\s*/gi, "");
    s = s.replace(/\s*(TOFU|MOFU|BOFU)\s*/gi, "");
    s = s.replace(/\b(PDF|DOCX|PPTX|DOC)\b/gi, "");
    s = s.replace(/\bWhitepaper[-\s]*/gi, "");
    s = s.replace(/\bBrochure[-\s]*/gi, () => "Brochure ");
    s = s.replace(/([a-z])([A-Z])/g, "$1 $2");
    s = s.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
    s = s.replace(/_/g, " ");
    s = s.replace(/\s*[-|,]\s*$/, "");
    s = s.trim().replace(/\s+/g, " ");
    if (!s) return name.length > 25 ? name.slice(0, 25) + "..." : name;
    const words = s.split(" ").filter(Boolean);
    return words.length > 4 ? words.slice(0, 4).join(" ") : words.join(" ");
  }
  let sA = shortName(data.nameA);
  let sB = shortName(data.nameB);
  if (sA === sB) {
    const meta0 = data.metadata;
    if (meta0.stageA && meta0.stageB && meta0.stageA !== meta0.stageB) {
      sA = `${sA} (${meta0.stageA})`;
      sB = `${sB} (${meta0.stageB})`;
    } else {
      sA = `${sA} (1)`;
      sB = `${sB} (2)`;
    }
  }
  const subtitle = `${sA} vs ${sB}`;
  const subtitleLines = doc.splitTextToSize(subtitle, CONTENT_W);
  subtitleLines.forEach((line: string) => { doc.text(line, MARGIN, y); y += 5; });
  y += 10;

  setColor(SAGE.green);
  doc.setFontSize(10);
  doc.text(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), MARGIN, y);
  y += 7;
  doc.text("Prepared by Content Intelligence Analyst", MARGIN, y);

  doc.setFontSize(12);
  setColor(SAGE.green);
  doc.text("Sage", MARGIN, FOOTER_Y);
  doc.setFontSize(5.5);
  setColor(SAGE.dimGreen);
  doc.text(`\u00A9 ${new Date().getFullYear()} The Sage Group plc, or its licensors. All rights reserved.`, PAGE_W / 2, FOOTER_Y + 3, { align: "center" });

  // === DUPLICATE ALERT ===
  if (data.isDuplicate && data.duplicateMessage) {
    newPage();
    const alertText = data.duplicateMessage;
    const alertLines = doc.splitTextToSize(alertText, CONTENT_W - 14);
    const alertH = alertLines.length * 4.5 + 14;
    setFill("#3D2800");
    doc.roundedRect(MARGIN, y, CONTENT_W, alertH, 2, 2, "F");
    setFill(SAGE.sourceAmber);
    doc.rect(MARGIN, y, 1.5, alertH, "F");
    setColor("#F5A623");
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("DUPLICATE CONTENT DETECTED", MARGIN + 7, y + 6);
    setColor(SAGE.bodyText);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    alertLines.forEach((line: string, li: number) => { doc.text(line, MARGIN + 7, y + 12 + li * 4.5); });
    y += alertH + 6;
  }

  // === ASSET IDENTITY (PAGE 2) ===
  newPage();
  sectionTitle("Asset Identity");
  y += 2;
  const meta = data.metadata;
  const idWidths = [50, 62, 62];
  drawTableRow(["", `${sA} (Baseline)`, `${sB} (Challenger)`], idWidths, true, false);
  drawTableRow(["Full ID", data.nameA, data.nameB], idWidths, false, true);
  drawTableRow(["Format", dv(meta.formatA), dv(meta.formatB)], idWidths, false, false);
  drawTableRow(["Funnel Stage", meta.stageA, meta.stageB], idWidths, false, true);
  drawTableRow(["Product", dv(meta.productA), dv(meta.productB)], idWidths, false, false);
  drawTableRow(["Country/Region", dv(meta.countryA), dv(meta.countryB)], idWidths, false, true);
  drawTableRow(["Industry", dv(meta.industryA), dv(meta.industryB)], idWidths, false, false);
  drawTableRow(["Word Count", meta.wordCountA?.toLocaleString() || "Not specified", meta.wordCountB?.toLocaleString() || "Not specified"], idWidths, false, true);
  drawTableRow(["Content Type", dv(meta.typeA), dv(meta.typeB)], idWidths, false, false);

  // === CONTENT OVERVIEW ===
  const hasOverview = data.contentOverview && (data.contentOverview.a || data.contentOverview.b);
  if (hasOverview) {
    newPage();
    sectionTitle("Content Overview");
    sourceTag("Source: Content Analysis");
    y += 2;

    const structUniqueA = normalizeKeywordTags(data.structuredUniqueTagsA || (Array.isArray(data.keywordTagsA) ? data.keywordTagsA : data.keywordTagsA));
    const structUniqueB = normalizeKeywordTags(data.structuredUniqueTagsB || (Array.isArray(data.keywordTagsB) ? data.keywordTagsB : data.keywordTagsB));
    const structShared = normalizeKeywordTags(data.structuredSharedTags);
    const hasStructured = flattenKeywordTags(structUniqueA).length > 0 || flattenKeywordTags(structUniqueB).length > 0 || flattenKeywordTags(structShared).length > 0;

    [{ name: sA, ov: data.contentOverview!.a, tags: data.uniqueTagsA || [], tagColor: SAGE.tagTeal, structTags: structUniqueA },
     { name: sB, ov: data.contentOverview!.b, tags: data.uniqueTagsB || [], tagColor: SAGE.tagJade, structTags: structUniqueB }].forEach(({ name, ov, tags, tagColor, structTags }) => {
      if (!ov) return;
      checkPage(10);
      wrappedText(name, SAGE.green, 10, CONTENT_W, true);
      y += 2;
      if (ov.summary) {
        wrappedText(ov.summary, SAGE.bodyText, 7.5, CONTENT_W - 4, false, 2);
        y += 1.5;
      }
      if (hasStructured) {
        y += 1;
        drawStructuredTags(structTags, "Tags:");
      } else if (tags.length > 0) {
        y += 1;
        drawTags(tags, tagColor, "", "Tags: ");
      }
      y += 3;
    });

    if (hasStructured && flattenKeywordTags(structShared).length > 0) {
      drawStructuredTags(structShared, "Shared tags:");
    } else {
      const sTags = data.sharedTags || [];
      if (sTags.length > 0) {
        drawTags(sTags, SAGE.tagShared, SAGE.green, "Shared tags: ");
      }
    }

    const metaIssues = data.metadataIssues || [];
    if (metaIssues.length > 0) {
      y += 3;
      checkPage(12 + metaIssues.length * 5);
      setFill("#3D2800");
      const issueTexts = metaIssues.map(mi => `${mi.asset}: ${mi.field} tag says "${mi.tagged}" — ${mi.issue}`);
      const allIssueLines: string[] = [];
      issueTexts.forEach(t => {
        const lines = doc.splitTextToSize(`\u2022 ${t}`, CONTENT_W - 14);
        allIssueLines.push(...lines);
      });
      const issueH = allIssueLines.length * 4 + 12;
      doc.roundedRect(MARGIN, y, CONTENT_W, issueH, 2, 2, "F");
      setFill(SAGE.sourceAmber);
      doc.rect(MARGIN, y, 1.5, issueH, "F");
      setColor("#F5A623");
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.text(`Metadata issues detected: ${metaIssues.length} field${metaIssues.length !== 1 ? "s" : ""} may be incorrect`, MARGIN + 5, y + 5);
      setColor(SAGE.bodyText);
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      allIssueLines.forEach((line: string, li: number) => { doc.text(line, MARGIN + 5, y + 10 + li * 4); });
      y += issueH + 3;
    }
  }

  // === KEY TOPICS ===
  const kt = data.keyTopics;
  if (!data.isDuplicate && kt && (kt.a?.length || kt.b?.length)) {
    newPage();
    sectionTitle("Key Topics");
    sourceTag("Source: Content Analysis");
    y += 2;

    [{ name: sA, items: kt.a }, { name: sB, items: kt.b }].forEach(({ name, items }) => {
      if (!items?.length) return;
      checkPage(10);
      wrappedText(name, SAGE.green, 10, CONTENT_W, true);
      y += 2;
      for (const t of items.slice(0, 5)) {
        checkPage(10);
        wrappedText(`${t.topic}: ${t.detail}`, SAGE.bodyText, 7.5, CONTENT_W - 6, false, 4);
        y += 1.5;
      }
      y += 3;
    });

    if (kt.comparisonInsight) {
      checkPage(14);
      wrappedText("Comparison Insight", SAGE.green, 9, CONTENT_W, true);
      y += 1;
      wrappedText(kt.comparisonInsight, SAGE.bodyText, 8, CONTENT_W);
      y += 2;
    }
  }

  // === AUDIENCE RESONANCE ASSESSMENT ===
  if (!data.isDuplicate && data.resonanceAssessment && (data.resonanceAssessment.a || data.resonanceAssessment.b)) {
    newPage();
    sectionTitle("Audience Resonance");
    sourceTag("Source: Content Analysis");
    y += 2;

    const dims = [
      { key: "countryFit", label: "Country/Region" },
      { key: "industryFit", label: "Industry" },
      { key: "funnelStageFit", label: "Funnel Stage" },
      { key: "productFit", label: "Product" },
    ] as const;

    const resWidths = data.resonanceAssessment.a && data.resonanceAssessment.b
      ? [35, 15, 55, 15, 50]
      : [35, 15, 120];

    if (data.resonanceAssessment.a && data.resonanceAssessment.b) {
      drawTableRow(["Dimension", "Rating", sA, "Rating", sB], resWidths, true, false);
      for (let i = 0; i < dims.length; i++) {
        const dimKey = dims[i].key;
        const dA = data.resonanceAssessment.a[dimKey];
        const dB = data.resonanceAssessment.b[dimKey];
        drawTableRow([
          dims[i].label,
          dA?.rating || "Not rated",
          dA?.explanation || "",
          dB?.rating || "Not rated",
          dB?.explanation || "",
        ], resWidths, false, i % 2 === 0);
      }
    } else {
      const assessment = data.resonanceAssessment.a || data.resonanceAssessment.b;
      const name = data.resonanceAssessment.a ? sA : sB;
      wrappedText(name, SAGE.green, 10, CONTENT_W, true);
      y += 2;
      drawTableRow(["Dimension", "Rating", "Explanation"], resWidths, true, false);
      for (let i = 0; i < dims.length; i++) {
        const d = assessment[dims[i].key];
        drawTableRow([dims[i].label, d?.rating || "Not rated", d?.explanation || ""], resWidths, false, i % 2 === 0);
      }
    }
  }

  // === WHAT'S SHARED, WHAT'S DIFFERENT ===
  const hasTagData = (data.sharedTags?.length || data.uniqueTagsA?.length || data.uniqueTagsB?.length);
  if (!data.isDuplicate && data.sharedAndDifferent && (data.sharedAndDifferent.overlap?.length || data.sharedAndDifferent.divergence?.length || hasTagData)) {
    newPage();
    sectionTitle("Shared vs Different");
    sourceTag("Source: Content Analysis");
    y += 2;

    const sTags = data.sharedTags || [];
    const uTagsA = data.uniqueTagsA || [];
    const uTagsB = data.uniqueTagsB || [];
    const sStructShared = normalizeKeywordTags(data.structuredSharedTags);
    const sStructA = normalizeKeywordTags(data.structuredUniqueTagsA || (Array.isArray(data.keywordTagsA) ? data.keywordTagsA : data.keywordTagsA));
    const sStructB = normalizeKeywordTags(data.structuredUniqueTagsB || (Array.isArray(data.keywordTagsB) ? data.keywordTagsB : data.keywordTagsB));
    const sHasStructured = flattenKeywordTags(sStructShared).length > 0 || flattenKeywordTags(sStructA).length > 0 || flattenKeywordTags(sStructB).length > 0;

    if (sHasStructured) {
      if (flattenKeywordTags(sStructShared).length > 0) drawStructuredTags(sStructShared, "Shared:");
      if (flattenKeywordTags(sStructA).length > 0) drawStructuredTags(sStructA, `Only ${sA}:`);
      if (flattenKeywordTags(sStructB).length > 0) drawStructuredTags(sStructB, `Only ${sB}:`);
      y += 2;
    } else if (sTags.length > 0 || uTagsA.length > 0 || uTagsB.length > 0) {
      if (sTags.length) drawTags(sTags, SAGE.tagShared, SAGE.green, "Shared: ");
      if (uTagsA.length) drawTags(uTagsA, SAGE.tagTeal, "", `Only ${sA}: `);
      if (uTagsB.length) drawTags(uTagsB, SAGE.tagJade, "", `Only ${sB}: `);
      y += 2;
    }

    if (data.sharedAndDifferent.overlap?.length) {
      wrappedText("Overlap", SAGE.green, 9, CONTENT_W, true);
      y += 1;
      data.sharedAndDifferent.overlap.forEach(item => {
        checkPage(8);
        wrappedText(`\u2022 ${item}`, SAGE.bodyText, 7.5, CONTENT_W - 4, false, 2);
        y += 1;
      });
      y += 3;
    }

    if (data.sharedAndDifferent.divergence?.length) {
      wrappedText("Differences", SAGE.green, 9, CONTENT_W, true);
      y += 1;
      data.sharedAndDifferent.divergence.forEach(item => {
        checkPage(8);
        wrappedText(`\u2022 ${item}`, SAGE.bodyText, 7.5, CONTENT_W - 4, false, 2);
        y += 1;
      });
    }
  }

  // === WHAT WORKS / COULD BE IMPROVED ===
  const wmw = data.whatMakesItWork;
  if (!data.isDuplicate && wmw && (wmw.a?.length || wmw.b?.length)) {
    newPage();
    sectionTitle("What Works");
    y += 2;

    [{ name: sA, items: wmw.a }, { name: sB, items: wmw.b }].forEach(({ name, items }) => {
      if (!items?.length) return;
      checkPage(10);
      wrappedText(name, SAGE.green, 10, CONTENT_W, true);
      y += 2;
      for (const item of items.slice(0, 3)) {
        const text = item.point || (item.factor && item.explanation ? `${item.factor}: ${item.explanation}` : item.factor || item.explanation || "");
        if (!text) continue;
        checkPage(8);
        wrappedText(`\u2022 ${text}`, SAGE.bodyText, 7.5, CONTENT_W - 4, false, 2);
        y += 1.5;
      }
      y += 3;
    });
  }

  const wci = data.whatCouldBeImproved;
  if (!data.isDuplicate && wci && (wci.a?.length || wci.b?.length)) {
    checkPage(40);
    sectionTitle("Could Be Improved");
    y += 2;

    [{ name: sA, items: wci.a }, { name: sB, items: wci.b }].forEach(({ name, items }) => {
      if (!items?.length) return;
      checkPage(10);
      wrappedText(name, SAGE.green, 10, CONTENT_W, true);
      y += 2;
      for (const item of items.slice(0, 3)) {
        const text = item.point || (item.issue && item.detail ? `${item.issue}: ${item.detail}` : item.issue || item.detail || "");
        if (!text) continue;
        checkPage(8);
        wrappedText(`\u2022 ${text}`, SAGE.sourceAmber, 7.5, CONTENT_W - 4, false, 2);
        y += 1.5;
      }
      y += 3;
    });
  }

  // === VERDICT & SUGGESTIONS ===
  if (data.verdict || data.suggestions?.length) {
    newPage();
    sectionTitle("Verdict");
    y += 2;

    if (data.verdict) {
      checkPage(20);
      setFill(SAGE.calloutBg);
      const verdictLines = doc.splitTextToSize(data.verdict, CONTENT_W - 14);
      const verdictH = verdictLines.length * 4.2 + 10;
      doc.roundedRect(MARGIN, y, CONTENT_W, verdictH, 2, 2, "F");
      setFill(SAGE.green);
      doc.rect(MARGIN, y, 1.5, verdictH, "F");
      setColor(SAGE.white);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      verdictLines.forEach((line: string, li: number) => { doc.text(line, MARGIN + 6, y + 6 + li * 4.2); });
      y += verdictH + 6;
    }

    if (data.suggestions?.length) {
      wrappedText("Suggestions", SAGE.green, 10, CONTENT_W, true);
      y += 2;
      data.suggestions.slice(0, 4).forEach((s, i) => {
        checkPage(10);
        wrappedText(`${i + 1}. ${s.text}`, SAGE.bodyText, 8, CONTENT_W - 4, false, 2);
        y += 2;
      });
    }
  }

  // === PERFORMANCE COMPARISON ===
  const perfDisplay = data.performanceDisplay || ((data.metricsA.hasData && data.metricsB.hasData) ? "table" : (data.metricsA.hasData || data.metricsB.hasData) ? "inline" : "none");

  if (perfDisplay === "table") {
    newPage();
    sectionTitle("Performance");
    sourceTag("Source: Internal Data");
    y += 2;

    if (data.lowEngagement) {
      setFill(SAGE.calloutBg);
      const noteText = `Both assets have minimal engagement (fewer than 10 total interactions each). Sample sizes are too small for meaningful percentage comparisons.`;
      const noteLines = doc.splitTextToSize(noteText, CONTENT_W - 12);
      const noteH = noteLines.length * 4 + 8;
      doc.roundedRect(MARGIN, y, CONTENT_W, noteH, 2, 2, "F");
      setFill(SAGE.sourceAmber);
      doc.rect(MARGIN, y, 1.5, noteH, "F");
      setColor(SAGE.sourceAmber);
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.text("Minimal Engagement Data", MARGIN + 5, y + 5);
      setColor(SAGE.bodyText);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      noteLines.forEach((line: string, li: number) => { doc.text(line, MARGIN + 5, y + 10 + li * 4); });
      y += noteH + 4;

      const summaryA = `${sA}: ${data.metricsA.pageviews} views, ${data.metricsA.downloads} downloads, ${data.metricsA.leads} leads, ${data.metricsA.sqos} SQOs${data.metricsA.avgTime > 0 ? `, ${data.metricsA.avgTime}s avg time` : ""}`;
      const summaryB = `${sB}: ${data.metricsB.pageviews} views, ${data.metricsB.downloads} downloads, ${data.metricsB.leads} leads, ${data.metricsB.sqos} SQOs${data.metricsB.avgTime > 0 ? `, ${data.metricsB.avgTime}s avg time` : ""}`;
      wrappedText(summaryA, SAGE.bodyText, 7.5, CONTENT_W, false);
      y += 1;
      wrappedText(summaryB, SAGE.bodyText, 7.5, CONTENT_W, false);
    } else {
      const perfWidths = [40, 40, 40, 40];
      drawTableRow(["Metric", sA, sB, "Delta"], perfWidths, true, false);

      const metrics = [
        { label: "Pageviews", key: "pageviews" as const },
        { label: "Downloads", key: "downloads" as const },
        { label: "Leads", key: "leads" as const },
        { label: "SQOs", key: "sqos" as const },
        { label: "Avg Time (s)", key: "avgTime" as const },
      ];

      metrics.forEach(({ label, key }, i) => {
        const aVal = data.metricsA[key];
        const bVal = data.metricsB[key];
        const aStr = aVal.toLocaleString();
        const bStr = bVal.toLocaleString();
        let delta = "\u2014";
        if (aVal > 0) {
          const pct = Math.round(((bVal - aVal) / aVal) * 100);
          delta = `${pct > 0 ? "+" : ""}${pct}%`;
        }
        drawTableRow([label, aStr, bStr, delta], perfWidths, false, i % 2 === 0);
      });
    }
  } else if (perfDisplay === "inline") {
    checkPage(20);
    sectionTitle("Performance");
    sourceTag("Source: Internal Data");
    y += 2;
    const summary = data.performanceInlineSummary || `Performance data available for ${data.metricsA.hasData ? sA : sB} only.`;
    wrappedText(summary, SAGE.bodyText, 8, CONTENT_W);
  }

  doc.save(`Comparison_Report_${sA.replace(/[^a-zA-Z0-9]/g, "_")}_vs_${sB.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`);
}

interface MultiComparisonData {
  contents: { name: string; summary: string; resonance: any | null; keyTopics: any[] | null; whatWorks: any[] | null; improvements: any[] | null; keywordTags: any }[];
  crossAnalysis: { sharedThemes: string[]; differentiators: string[]; contentGaps: string[] };
  rankings: { overall: { name: string; score: number; reason: string }[]; methodology?: string; bestForLeads?: string; bestForEngagement?: string; bestForConversion?: string };
  verdict: string;
  suggestions: { text: string; source: string }[];
  contentNames: string[];
  contentMetrics: { name: string; metrics: { pageviews: number; downloads: number; leads: number; sqos: number; avgTime: number; hasData: boolean } }[];
  contentMetadata: { name: string; stage: string; product: string; type: string; country: string; industry: string }[];
}

function multiShortName(name: string): string {
  let s = name;
  s = s.replace(/^CL_[A-Z0-9]+_[A-Z]{2,4}_[A-Z]{2,4}_[A-Z]+_[A-Z]+_/i, "");
  s = s.replace(/\s*\([^)]*\)\s*$/g, "");
  s = s.replace(/\s*[,|]\s*(GO|TOP|BOT|MID|GNRC|CER|COM|NFS)\b/gi, "");
  s = s.replace(/\s*(GO|TOP|BOT|MID|GNRC|CER|COM|NFS)\s*[,|]/gi, "");
  s = s.replace(/\s*[,|]\s*(English\s+)?(Canada|Australia|US|UK|France|Germany|Spain|Ireland|South Africa)\s*/gi, "");
  s = s.replace(/\s*(TOFU|MOFU|BOFU)\s*/gi, "");
  s = s.replace(/\b(PDF|DOCX|PPTX|DOC)\b/gi, "");
  s = s.replace(/\bWhitepaper[-\s]*/gi, "");
  s = s.replace(/\bBrochure[-\s]*/gi, () => "Brochure ");
  s = s.replace(/([a-z])([A-Z])/g, "$1 $2");
  s = s.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  s = s.replace(/_/g, " ");
  s = s.replace(/\s*[-|,]\s*$/, "");
  s = s.trim().replace(/\s+/g, " ");
  if (!s) return name.length > 25 ? name.slice(0, 25) + "..." : name;
  const words = s.split(" ").filter(Boolean);
  return words.length > 5 ? words.slice(0, 5).join(" ") : words.join(" ");
}

function extractTopicText(t: any): { topic: string; detail: string } {
  if (typeof t === "string") return { topic: t, detail: "" };
  return { topic: t?.topic || t?.name || "", detail: t?.detail || t?.description || "" };
}

function extractResonanceRating(val: any): { rating: string; explanation: string } {
  if (!val) return { rating: "Not rated", explanation: "" };
  if (typeof val === "string") return { rating: val, explanation: "" };
  return { rating: val?.rating || "Not rated", explanation: val?.explanation || val?.detail || "" };
}

function flattenTagsFromAny(tags: any): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.filter((t: any) => typeof t === "string");
  const flat: string[] = [];
  if (tags.topic_tags) flat.push(...tags.topic_tags);
  if (tags.audience_tags) flat.push(...tags.audience_tags);
  if (tags.intent_tags) flat.push(...tags.intent_tags);
  if (tags.user_added_tags) flat.push(...tags.user_added_tags);
  return flat;
}

function getStructuredTagsFromAny(tags: any): { topic: string[]; audience: string[]; intent: string[] } {
  if (!tags) return { topic: [], audience: [], intent: [] };
  if (Array.isArray(tags)) return { topic: tags.filter((t: any) => typeof t === "string"), audience: [], intent: [] };
  return {
    topic: tags.topic_tags || [],
    audience: tags.audience_tags || [],
    intent: tags.intent_tags || [],
  };
}

export function generateMultiComparisonPdf(data: MultiComparisonData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = 0;
  let pageNum = 0;
  const contentCount = data.contents.length;
  const shortNames = data.contentNames.map((n, i) => {
    const s = multiShortName(n);
    return s || `Content ${i + 1}`;
  });
  const deduped = [...shortNames];
  for (let i = 0; i < deduped.length; i++) {
    for (let j = i + 1; j < deduped.length; j++) {
      if (deduped[i] === deduped[j]) {
        const metaI = data.contentMetadata[i];
        const metaJ = data.contentMetadata[j];
        if (metaI?.stage && metaJ?.stage && metaI.stage !== metaJ.stage) {
          deduped[i] = `${deduped[i]} (${metaI.stage})`;
          deduped[j] = `${deduped[j]} (${metaJ.stage})`;
        } else {
          deduped[i] = `${deduped[i]} (${i + 1})`;
          deduped[j] = `${deduped[j]} (${j + 1})`;
        }
      }
    }
  }

  function setColor(hex: string) { doc.setTextColor(...hexToRgb(hex)); }
  function setFill(hex: string) { doc.setFillColor(...hexToRgb(hex)); }

  function addFooter() {
    pageNum++;
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    setColor(SAGE.dimGreen);
    doc.text("Sage", MARGIN, FOOTER_Y);
    setColor(SAGE.green);
    doc.text("CONFIDENTIAL: INTERNAL USE ONLY", PAGE_W / 2, FOOTER_Y, { align: "center" });
    setColor(SAGE.dimGreen);
    doc.text(`${pageNum}`, PAGE_W - MARGIN, FOOTER_Y, { align: "right" });
    doc.setFontSize(5.5);
    doc.text(`\u00A9 ${new Date().getFullYear()} The Sage Group plc, or its licensors. All rights reserved.`, PAGE_W / 2, FOOTER_Y + 3, { align: "center" });
  }

  function addBlackPage() {
    setFill(SAGE.black);
    doc.rect(0, 0, PAGE_W, PAGE_H, "F");
  }

  function newPage() {
    if (pageNum > 0) doc.addPage();
    addBlackPage();
    addFooter();
    y = MARGIN + 2;
  }

  function checkPage(needed: number) {
    if (y + needed > FOOTER_Y - 8) newPage();
  }

  function sectionTitle(title: string) {
    checkPage(14);
    setColor(SAGE.white);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(title, MARGIN, y);
    y += 3;
    doc.setDrawColor(...hexToRgb(SAGE.green));
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, MARGIN + 50, y);
    doc.setLineWidth(0.2);
    y += 6;
  }

  function wrappedText(text: string, color: string, size: number, maxW: number, bold = false, xOffset = 0): number {
    if (!text) return 0;
    setColor(color);
    doc.setFontSize(size);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    const lines = doc.splitTextToSize(text, maxW);
    const lineH = size * 0.45;
    for (const line of lines) {
      checkPage(lineH + 2);
      doc.text(line, MARGIN + xOffset, y);
      y += lineH;
    }
    return lines.length;
  }

  function bulletPoint(text: string, color: string = SAGE.bodyText) {
    const lineH = 3.5;
    const lines = doc.splitTextToSize(text, CONTENT_W - 6);
    checkPage(lineH * lines.length + 2);
    setColor(SAGE.green);
    doc.setFontSize(8);
    doc.text("\u2022", MARGIN + 1, y);
    setColor(color);
    doc.setFontSize(7.5);
    for (let i = 0; i < lines.length; i++) {
      doc.text(lines[i], MARGIN + 5, y);
      y += lineH;
    }
    y += 0.5;
  }

  function sourceTag(label: string) {
    doc.setFontSize(6);
    setColor(SAGE.dimGreen);
    doc.setFont("helvetica", "italic");
    doc.text(label, MARGIN, y);
    doc.setFont("helvetica", "normal");
    y += 4;
  }

  function drawMultiTableRow(cells: string[], widths: number[], isHeader: boolean, isAlt: boolean) {
    const cellPad = 2;
    doc.setFontSize(6.5);
    const lineH = 2.6;
    const wrappedCells = cells.map((cell, i) => doc.splitTextToSize(cell || "", widths[i] - cellPad * 2));
    const maxLines = Math.max(...wrappedCells.map(c => c.length));
    const rowHeight = Math.max(6, maxLines * lineH + cellPad * 2);
    checkPage(rowHeight + 2);
    setFill(isHeader ? SAGE.headerRow : isAlt ? SAGE.tealRow : SAGE.darkRow);
    let x = MARGIN;
    doc.rect(x, y - 1, widths.reduce((a, b) => a + b, 0), rowHeight, "F");
    wrappedCells.forEach((lines, i) => {
      setColor(isHeader ? SAGE.headerText : SAGE.bodyText);
      doc.setFont("helvetica", isHeader ? "bold" : "normal");
      lines.forEach((line: string, li: number) => {
        doc.text(line, x + cellPad, y + cellPad + li * lineH);
      });
      x += widths[i];
    });
    y += rowHeight;
  }

  function drawTagPills(tags: string[], bgColor: string, label?: string, maxTags = 8) {
    if (!tags || tags.length === 0) return;
    let x = MARGIN;
    if (label) {
      setColor(SAGE.muted);
      doc.setFontSize(5);
      doc.setFont("helvetica", "normal");
      doc.text(label, x, y);
      x += doc.getTextWidth(label) + 2;
    }
    const tagH = 3.5;
    const tagPad = 1.5;
    doc.setFontSize(5);
    doc.setFont("helvetica", "bold");
    for (const tag of tags.slice(0, maxTags)) {
      const w = doc.getTextWidth(tag) + tagPad * 2;
      if (x + w > PAGE_W - MARGIN) {
        x = MARGIN + (label ? 12 : 0);
        y += tagH + 1;
        checkPage(tagH + 2);
      }
      setFill(bgColor);
      doc.roundedRect(x, y - 2.5, w, tagH, 0.8, 0.8, "F");
      setColor(SAGE.white);
      doc.text(tag, x + tagPad, y - 0.5);
      x += w + 1.5;
    }
    if (tags.length > maxTags) {
      setColor(SAGE.muted);
      doc.setFontSize(5);
      doc.setFont("helvetica", "italic");
      doc.text(`+${tags.length - maxTags} more`, x, y - 0.5);
    }
    y += tagH + 2;
  }

  // === PAGE 1: COVER ===
  addBlackPage();
  pageNum++;
  setFill(SAGE.green);
  doc.rect(MARGIN, 42, CONTENT_W, 0.8, "F");

  y = 56;
  setColor(SAGE.white);
  doc.setFontSize(32);
  doc.setFont("helvetica", "bold");
  doc.text("Content Comparison", MARGIN, y);
  y += 13;
  doc.setFontSize(32);
  doc.text("Report", MARGIN, y);
  y += 16;

  doc.setFontSize(16);
  doc.setFont("helvetica", "normal");
  setColor(SAGE.white);
  doc.text("Content Intelligence Analyst", MARGIN, y);
  y += 10;

  setColor(SAGE.muted);
  doc.setFontSize(11);
  doc.text(`${contentCount} content pieces compared`, MARGIN, y);
  y += 12;

  setColor(SAGE.green);
  doc.setFontSize(10);
  doc.text(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), MARGIN, y);
  y += 5;
  doc.text("Prepared by Content Intelligence Analyst", MARGIN, y);
  y += 12;

  setColor(SAGE.bodyText);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  for (let i = 0; i < contentCount; i++) {
    checkPage(5);
    doc.setFont("helvetica", "bold");
    setColor(SAGE.green);
    doc.text(`${i + 1}.`, MARGIN, y);
    doc.setFont("helvetica", "normal");
    setColor(SAGE.bodyText);
    const displayName = deduped[i].length > 70 ? deduped[i].slice(0, 67) + "..." : deduped[i];
    doc.text(displayName, MARGIN + 6, y);
    y += 5;
  }

  doc.setFontSize(12);
  setColor(SAGE.green);
  doc.text("Sage", MARGIN, FOOTER_Y);
  doc.setFontSize(5.5);
  setColor(SAGE.dimGreen);
  doc.text(`\u00A9 ${new Date().getFullYear()} The Sage Group plc, or its licensors. All rights reserved.`, PAGE_W / 2, FOOTER_Y + 3, { align: "center" });

  // === PAGE 2: RANKINGS + VERDICT ===
  newPage();
  sectionTitle("Rankings");

  const labelW = 35;
  const colW = Math.floor((CONTENT_W - labelW - 30) / contentCount);
  const reasonW = 30;
  const rankWidths = [labelW, ...data.rankings.overall.map(() => colW), reasonW];

  drawMultiTableRow(["Content", ...data.rankings.overall.map((_, i) => `#${i + 1}`), ""], [labelW, ...data.rankings.overall.map(() => colW), reasonW], true, false);
  drawMultiTableRow(["Name", ...data.rankings.overall.map(r => deduped[data.contentNames.indexOf(r.name)] || r.name.substring(0, 20)), ""], rankWidths, false, true);
  drawMultiTableRow(["Score", ...data.rankings.overall.map(r => `${r.score}/100`), ""], rankWidths, false, false);
  drawMultiTableRow(["Reason", ...data.rankings.overall.map(r => r.reason.substring(0, 40)), ""], rankWidths, false, true);

  y += 2;

  const methodology = data.rankings.methodology || "content depth/specificity (30%), audience targeting (25%), metrics/proof points (25%), structural clarity (20%)";
  setColor(SAGE.muted);
  doc.setFontSize(6);
  doc.setFont("helvetica", "italic");
  const methLines = doc.splitTextToSize(`Scoring methodology: ${methodology}`, CONTENT_W);
  methLines.forEach((line: string) => { doc.text(line, MARGIN, y); y += 2.5; });
  y += 3;

  if (data.rankings.bestForLeads || data.rankings.bestForEngagement || data.rankings.bestForConversion) {
    checkPage(12);
    const badges: string[] = [];
    if (data.rankings.bestForLeads) badges.push(`Best for Leads: ${data.rankings.bestForLeads}`);
    if (data.rankings.bestForEngagement) badges.push(`Best for Engagement: ${data.rankings.bestForEngagement}`);
    if (data.rankings.bestForConversion) badges.push(`Best for Conversion: ${data.rankings.bestForConversion}`);

    let bx = MARGIN;
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    for (const badge of badges) {
      const bw = doc.getTextWidth(badge) + 6;
      if (bx + bw > PAGE_W - MARGIN) { bx = MARGIN; y += 6; }
      setFill(SAGE.calloutBg);
      doc.roundedRect(bx, y - 3, bw, 5.5, 1, 1, "F");
      doc.setDrawColor(...hexToRgb(SAGE.green));
      doc.roundedRect(bx, y - 3, bw, 5.5, 1, 1, "S");
      setColor(SAGE.green);
      doc.text(badge, bx + 3, y);
      bx += bw + 3;
    }
    y += 8;
  }

  sectionTitle("Verdict");
  checkPage(20);
  setFill(SAGE.calloutBg);
  const verdictLines = doc.splitTextToSize(data.verdict, CONTENT_W - 14);
  const verdictH = verdictLines.length * 4.2 + 10;
  doc.roundedRect(MARGIN, y, CONTENT_W, verdictH, 2, 2, "F");
  setFill(SAGE.green);
  doc.rect(MARGIN, y, 1.5, verdictH, "F");
  setColor(SAGE.white);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  verdictLines.forEach((line: string, li: number) => { doc.text(line, MARGIN + 6, y + 6 + li * 4.2); });
  y += verdictH + 4;

  // === PAGE 3: ASSET IDENTITY + CONTENT OVERVIEW + TAGS ===
  newPage();
  sectionTitle("Asset Identity");
  sourceTag("Source: Internal Data");

  const idLabelW = 32;
  const idColW = Math.floor((CONTENT_W - idLabelW) / contentCount);
  const idWidths = [idLabelW, ...data.contentMetadata.map(() => idColW)];

  drawMultiTableRow(["", ...deduped.map((n, i) => `${i + 1}. ${n.substring(0, 18)}`)], idWidths, true, false);
  drawMultiTableRow(["Full Name", ...data.contentNames.map(n => n.substring(0, 30))], idWidths, false, true);
  drawMultiTableRow(["Stage", ...data.contentMetadata.map(m => m.stage || "Not specified")], idWidths, false, false);
  drawMultiTableRow(["Product", ...data.contentMetadata.map(m => m.product || "Not specified")], idWidths, false, true);
  drawMultiTableRow(["Country", ...data.contentMetadata.map(m => m.country || "Not specified")], idWidths, false, false);
  drawMultiTableRow(["Industry", ...data.contentMetadata.map(m => m.industry || "Not specified")], idWidths, false, true);
  drawMultiTableRow(["Type", ...data.contentMetadata.map(m => m.type || "Not specified")], idWidths, false, false);

  y += 4;

  sectionTitle("Content Overview");
  sourceTag("Source: Content Analysis");

  data.contents.forEach((content, idx) => {
    if (!content.summary) return;
    checkPage(18);
    wrappedText(`${idx + 1}. ${deduped[idx]}`, SAGE.green, 9, CONTENT_W, true);
    y += 1;
    wrappedText(content.summary, SAGE.bodyText, 7, CONTENT_W - 4, false, 2);
    y += 1;

    const structured = getStructuredTagsFromAny(content.keywordTags);
    const hasCategorized = structured.audience.length > 0 || structured.intent.length > 0;
    if (hasCategorized) {
      if (structured.topic.length > 0) drawTagPills(structured.topic, SAGE.tagTopic, "Topic:", 5);
      if (structured.audience.length > 0) drawTagPills(structured.audience, SAGE.tagAudience, "Audience:", 4);
      if (structured.intent.length > 0) drawTagPills(structured.intent, SAGE.tagIntent, "Intent:", 4);
    } else {
      const flat = flattenTagsFromAny(content.keywordTags);
      if (flat.length > 0) drawTagPills(flat, SAGE.tagTopic, "Tags:", 6);
    }
    y += 2;
  });

  // === PAGE 4: AUDIENCE RESONANCE + KEY TOPICS ===
  const hasAnyResonance = data.contents.some(c => c.resonance);
  if (hasAnyResonance) {
    newPage();
    sectionTitle("Audience Resonance");
    sourceTag("Source: Content Analysis");

    const resDims = [
      { key: "countryFit", label: "Country/Region" },
      { key: "industryFit", label: "Industry" },
      { key: "funnelStageFit", label: "Funnel Stage" },
      { key: "productFit", label: "Product" },
    ];

    const resLabelW = 28;
    const resColW = Math.floor((CONTENT_W - resLabelW) / contentCount);
    const resWidths = [resLabelW, ...data.contents.map(() => resColW)];

    drawMultiTableRow(["Dimension", ...deduped.map(n => n.substring(0, 16))], resWidths, true, false);
    resDims.forEach((dim, di) => {
      const cells = data.contents.map(c => {
        const r = extractResonanceRating(c.resonance?.[dim.key]);
        return r.rating;
      });
      drawMultiTableRow([dim.label, ...cells], resWidths, false, di % 2 === 0);
    });

    y += 3;

    const hasExplanations = data.contents.some(c => {
      if (!c.resonance) return false;
      return resDims.some(d => {
        const r = extractResonanceRating(c.resonance?.[d.key]);
        return r.explanation;
      });
    });
    if (hasExplanations) {
      setColor(SAGE.muted);
      doc.setFontSize(6);
      doc.setFont("helvetica", "italic");
      doc.text("Detailed resonance explanations:", MARGIN, y);
      y += 4;

      data.contents.forEach((content, idx) => {
        if (!content.resonance) return;
        const explanations: string[] = [];
        resDims.forEach(dim => {
          const r = extractResonanceRating(content.resonance?.[dim.key]);
          if (r.explanation) explanations.push(`${dim.label}: ${r.explanation}`);
        });
        if (explanations.length > 0) {
          checkPage(10);
          wrappedText(deduped[idx], SAGE.green, 7, CONTENT_W, true);
          y += 1;
          explanations.forEach(exp => {
            checkPage(6);
            wrappedText(`\u2022 ${exp}`, SAGE.bodyText, 6.5, CONTENT_W - 6, false, 4);
            y += 0.5;
          });
          y += 2;
        }
      });
    }
  }

  const hasAnyTopics = data.contents.some(c => c.keyTopics && c.keyTopics.length > 0);
  if (hasAnyTopics) {
    checkPage(30);
    sectionTitle("Key Topics");
    sourceTag("Source: Content Analysis");

    data.contents.forEach((content, idx) => {
      if (!content.keyTopics || content.keyTopics.length === 0) return;
      checkPage(14);
      wrappedText(`${idx + 1}. ${deduped[idx]}`, SAGE.green, 8, CONTENT_W, true);
      y += 1;
      content.keyTopics.slice(0, 4).forEach((t: any) => {
        const parsed = extractTopicText(t);
        if (!parsed.topic) return;
        const text = parsed.detail ? `${parsed.topic}: ${parsed.detail}` : parsed.topic;
        bulletPoint(text);
      });
      y += 2;
    });
  }

  // === PAGE 5: CROSS-CONTENT ANALYSIS ===
  const hasCross = data.crossAnalysis.sharedThemes.length > 0 || data.crossAnalysis.differentiators.length > 0 || data.crossAnalysis.contentGaps.length > 0;
  if (hasCross) {
    newPage();
    sectionTitle("Cross-Content Analysis");
    sourceTag("Source: Content Analysis");

    if (data.crossAnalysis.sharedThemes.length > 0) {
      checkPage(10);
      wrappedText("Shared Themes", SAGE.green, 10, CONTENT_W, true);
      y += 1;
      data.crossAnalysis.sharedThemes.forEach(t => bulletPoint(t));
      y += 3;
    }

    if (data.crossAnalysis.differentiators.length > 0) {
      checkPage(10);
      wrappedText("Key Differentiators", SAGE.green, 10, CONTENT_W, true);
      y += 1;
      data.crossAnalysis.differentiators.forEach(t => bulletPoint(t));
      y += 3;
    }

    if (data.crossAnalysis.contentGaps.length > 0) {
      checkPage(10);
      wrappedText("Content Gaps", SAGE.sourceAmber, 10, CONTENT_W, true);
      y += 1;
      data.crossAnalysis.contentGaps.forEach(t => bulletPoint(t, SAGE.sourceAmber));
      y += 3;
    }
  }

  // === PAGE 6: IMPROVEMENTS + SUGGESTIONS + PERFORMANCE ===
  const hasImprovements = data.contents.some(c => c.improvements && c.improvements.length > 0);
  if (hasImprovements) {
    newPage();
    sectionTitle("Areas for Improvement");

    data.contents.forEach((content, idx) => {
      if (!content.improvements || content.improvements.length === 0) return;
      checkPage(12);
      wrappedText(`${idx + 1}. ${deduped[idx]}`, SAGE.green, 8, CONTENT_W, true);
      y += 1;
      content.improvements.slice(0, 3).forEach((item: any) => {
        const text = typeof item === "string" ? item : (item?.point || item?.issue || item?.text || "");
        if (text) bulletPoint(text, SAGE.sourceAmber);
      });
      y += 2;
    });
  }

  if (data.suggestions.length > 0) {
    checkPage(30);
    sectionTitle("Recommendations");
    data.suggestions.forEach((s, i) => {
      checkPage(10);
      wrappedText(`${i + 1}. ${s.text}`, SAGE.bodyText, 7.5, CONTENT_W - 4, false, 2);
      y += 1;
      sourceTag(`[${s.source}]`);
    });
  }

  const metricsWithData = data.contentMetrics.filter(cm => cm.metrics.hasData);
  if (metricsWithData.length > 0) {
    checkPage(40);
    sectionTitle("Performance Comparison");
    sourceTag("Source: Internal Data");

    const perfLabelW = 32;
    const perfColW = Math.floor((CONTENT_W - perfLabelW) / metricsWithData.length);
    const perfWidths = [perfLabelW, ...metricsWithData.map(() => perfColW)];
    const perfNames = metricsWithData.map(cm => {
      const idx = data.contentNames.indexOf(cm.name);
      return (idx >= 0 ? deduped[idx] : cm.name).substring(0, 18);
    });

    drawMultiTableRow(["Metric", ...perfNames], perfWidths, true, false);
    const metricKeys: { label: string; key: "pageviews" | "downloads" | "leads" | "sqos" | "avgTime" }[] = [
      { label: "Views", key: "pageviews" },
      { label: "Downloads", key: "downloads" },
      { label: "Leads", key: "leads" },
      { label: "SQOs", key: "sqos" },
      { label: "Avg Time (s)", key: "avgTime" },
    ];
    metricKeys.forEach(({ label, key }, i) => {
      drawMultiTableRow([label, ...metricsWithData.map(cm => cm.metrics[key].toLocaleString())], perfWidths, false, i % 2 === 0);
    });
  }

  const names = data.contentNames.map(n => n.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 15)).join("_");
  doc.save(`Multi_Comparison_${names}.pdf`);
}
