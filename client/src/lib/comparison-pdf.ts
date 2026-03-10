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
  function coverName(name: string): string {
    let s = name;
    s = s.replace(/^CL_[A-Z0-9]+_[A-Z]{2,4}_[A-Z]{2,4}_[A-Z]+_[A-Z]+_/i, "");
    s = s.replace(/\s*\([^)]*\)\s*$/g, "");
    s = s.replace(/\s*[,|]\s*(GO|TOP|BOT|MID|GNRC|CER|COM|NFS)\b/gi, "");
    s = s.replace(/\s*(GO|TOP|BOT|MID|GNRC|CER|COM|NFS)\s*[,|]/gi, "");
    s = s.replace(/\s*[,|]\s*(English\s+)?(Canada|Australia|US|UK|France|Germany|Spain|Ireland)\s*/gi, "");
    s = s.replace(/\s*(TOFU|MOFU|BOFU)\s*/gi, "");
    s = s.replace(/([a-z])([A-Z])/g, "$1 $2");
    s = s.replace(/_/g, " ");
    s = s.trim().replace(/\s+/g, " ");
    if (s.length > 45) s = s.slice(0, 45).trim() + "...";
    return s;
  }
  const subtitle = `${coverName(data.nameA)} vs ${coverName(data.nameB)}`;
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
  drawTableRow(["", "Content A", "Content B"], idWidths, true, false);
  drawTableRow(["Full Name", data.nameA, data.nameB], idWidths, false, true);
  drawTableRow(["Format", dv(meta.formatA), dv(meta.formatB)], idWidths, false, false);
  drawTableRow(["Funnel Stage", meta.stageA, meta.stageB], idWidths, false, true);
  drawTableRow(["Product", dv(meta.productA), dv(meta.productB)], idWidths, false, false);
  drawTableRow(["Country/Region", dv(meta.countryA), dv(meta.countryB)], idWidths, false, true);
  drawTableRow(["Industry", dv(meta.industryA), dv(meta.industryB)], idWidths, false, false);
  drawTableRow(["Word Count", meta.wordCountA?.toLocaleString() || "N/A", meta.wordCountB?.toLocaleString() || "N/A"], idWidths, false, true);
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

    [{ name: data.nameA, ov: data.contentOverview!.a, tags: data.uniqueTagsA || [], tagColor: SAGE.tagTeal, structTags: structUniqueA },
     { name: data.nameB, ov: data.contentOverview!.b, tags: data.uniqueTagsB || [], tagColor: SAGE.tagJade, structTags: structUniqueB }].forEach(({ name, ov, tags, tagColor, structTags }) => {
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

    [{ name: data.nameA, items: kt.a }, { name: data.nameB, items: kt.b }].forEach(({ name, items }) => {
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
      drawTableRow(["Dimension", "Rating", data.nameA, "Rating", data.nameB], resWidths, true, false);
      for (let i = 0; i < dims.length; i++) {
        const dimKey = dims[i].key;
        const dA = data.resonanceAssessment.a[dimKey];
        const dB = data.resonanceAssessment.b[dimKey];
        drawTableRow([
          dims[i].label,
          dA?.rating || "N/A",
          dA?.explanation || "",
          dB?.rating || "N/A",
          dB?.explanation || "",
        ], resWidths, false, i % 2 === 0);
      }
    } else {
      const assessment = data.resonanceAssessment.a || data.resonanceAssessment.b;
      const name = data.resonanceAssessment.a ? data.nameA : data.nameB;
      wrappedText(name, SAGE.green, 10, CONTENT_W, true);
      y += 2;
      drawTableRow(["Dimension", "Rating", "Explanation"], resWidths, true, false);
      for (let i = 0; i < dims.length; i++) {
        const d = assessment[dims[i].key];
        drawTableRow([dims[i].label, d?.rating || "N/A", d?.explanation || ""], resWidths, false, i % 2 === 0);
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
      if (flattenKeywordTags(sStructA).length > 0) drawStructuredTags(sStructA, `Only ${data.nameA}:`);
      if (flattenKeywordTags(sStructB).length > 0) drawStructuredTags(sStructB, `Only ${data.nameB}:`);
      y += 2;
    } else if (sTags.length > 0 || uTagsA.length > 0 || uTagsB.length > 0) {
      if (sTags.length) drawTags(sTags, SAGE.tagShared, SAGE.green, "Shared: ");
      if (uTagsA.length) drawTags(uTagsA, SAGE.tagTeal, "", `Only ${data.nameA}: `);
      if (uTagsB.length) drawTags(uTagsB, SAGE.tagJade, "", `Only ${data.nameB}: `);
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

    [{ name: data.nameA, items: wmw.a }, { name: data.nameB, items: wmw.b }].forEach(({ name, items }) => {
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

    [{ name: data.nameA, items: wci.a }, { name: data.nameB, items: wci.b }].forEach(({ name, items }) => {
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

      const summaryA = `${data.nameA}: ${data.metricsA.pageviews} views, ${data.metricsA.downloads} downloads, ${data.metricsA.leads} leads, ${data.metricsA.sqos} SQOs${data.metricsA.avgTime > 0 ? `, ${data.metricsA.avgTime}s avg time` : ""}`;
      const summaryB = `${data.nameB}: ${data.metricsB.pageviews} views, ${data.metricsB.downloads} downloads, ${data.metricsB.leads} leads, ${data.metricsB.sqos} SQOs${data.metricsB.avgTime > 0 ? `, ${data.metricsB.avgTime}s avg time` : ""}`;
      wrappedText(summaryA, SAGE.bodyText, 7.5, CONTENT_W, false);
      y += 1;
      wrappedText(summaryB, SAGE.bodyText, 7.5, CONTENT_W, false);
    } else {
      const perfWidths = [40, 40, 40, 40];
      drawTableRow(["Metric", data.nameA, data.nameB, "Delta"], perfWidths, true, false);

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
    const summary = data.performanceInlineSummary || `Performance data available for ${data.metricsA.hasData ? data.nameA : data.nameB} only.`;
    wrappedText(summary, SAGE.bodyText, 8, CONTENT_W);
  }

  doc.save(`Comparison_Report_${data.nameA.replace(/[^a-zA-Z0-9]/g, "_")}_vs_${data.nameB.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`);
}
