import jsPDF from "jspdf";

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
  tagTeal: "#0D9488",
  tagJade: "#059669",
  tagShared: "#00D657",
};

const MARGIN = 20;
const PAGE_W = 210;
const CONTENT_W = PAGE_W - MARGIN * 2;

interface FullComparisonResult {
  nameA: string;
  nameB: string;
  contentOverview: { a: any; b: any } | null;
  resonanceAssessment: { a: any; b: any; suggestedStageA?: string | null; suggestedStageB?: string | null } | null;
  topicRelevance: { a: any[]; b: any[]; aiInsight: string } | null;
  sharedAndDifferent: { overlap: string[]; divergence: string[]; sharedTags?: string[]; uniqueTagsA?: string[]; uniqueTagsB?: string[] } | null;
  whatThisCovers?: { a: any; b: any; comparisonInsight: string } | null;
  whatMakesItWork?: { a: any[] | null; b: any[] | null } | null;
  whatCouldBeImproved?: { a: any[] | null; b: any[] | null } | null;
  keywordTagsA?: string[];
  keywordTagsB?: string[];
  sharedTags?: string[];
  uniqueTagsA?: string[];
  uniqueTagsB?: string[];
  verdict: string;
  suggestions: { text: string; source: string }[];
  metricsA: { pageviews: number; downloads: number; leads: number; sqos: number; avgTime: number; hasData: boolean };
  metricsB: { pageviews: number; downloads: number; leads: number; sqos: number; avgTime: number; hasData: boolean };
  performanceDisplay?: "table" | "inline" | "none";
  performanceInlineSummary?: string | null;
  metadata: {
    stageA: string; stageB: string; productA: string; productB: string;
    countryA: string; countryB: string; industryA: string; industryB: string;
    typeA: string; typeB: string; wordCountA: number | null; wordCountB: number | null;
    pageCountA: number | null; pageCountB: number | null; formatA: string; formatB: string;
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
    setFill(SAGE.green);
    doc.roundedRect(MARGIN, 278, 12, 4, 1, 1, "F");
    setColor(SAGE.black);
    doc.setFontSize(5);
    doc.setFont("helvetica", "bold");
    doc.text("SAGE", MARGIN + 1.5, 281);
    setColor(SAGE.muted);
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.text("CONFIDENTIAL", PAGE_W / 2, 285, { align: "center" });
    doc.text(`\u00A9 ${new Date().getFullYear()} The Sage Group plc. All rights reserved.`, PAGE_W / 2, 289, { align: "center" });
    doc.text(`${pageNum}`, PAGE_W - MARGIN, 289, { align: "right" });
  }

  function newPage() {
    if (pageNum > 0) doc.addPage();
    setFill(SAGE.black);
    doc.rect(0, 0, PAGE_W, 297, "F");
    addFooter();
    y = MARGIN;
  }

  function checkPage(needed: number) {
    if (y + needed > 268) newPage();
  }

  function sectionTitle(title: string) {
    checkPage(14);
    setColor(SAGE.white);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(title, MARGIN, y);
    y += 2;
    setFill(SAGE.green);
    doc.rect(MARGIN, y, 30, 0.5, "F");
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

  function drawTags(tags: string[], color: string, borderColor: string, label?: string) {
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
    const tagH = 4;
    const tagPad = 2;
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "bold");
    for (const tag of tags) {
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
  }

  function drawCalloutBox(title: string, text: string, srcLabel?: string) {
    checkPage(18);
    const lines = doc.splitTextToSize(text, CONTENT_W - 10);
    const boxH = Math.max(12, lines.length * 3.2 + 10);
    checkPage(boxH + 4);
    setFill(SAGE.calloutBg);
    doc.rect(MARGIN, y - 2, CONTENT_W, boxH, "F");
    setFill(SAGE.green);
    doc.rect(MARGIN, y - 2, 1.5, boxH, "F");
    setColor(SAGE.green);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text(title, MARGIN + 5, y + 2);
    setColor(SAGE.bodyText);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    let ty = y + 6;
    for (const line of lines) {
      doc.text(line, MARGIN + 5, ty);
      ty += 3.2;
    }
    y += boxH + 3;
    if (srcLabel) sourceTag(srcLabel);
  }

  // === COVER PAGE ===
  newPage();
  try {
    setFill("#001A0A");
    doc.circle(PAGE_W - 20, 270, 90, "F");
  } catch {}

  y = 80;
  setColor(SAGE.white);
  doc.setFontSize(32);
  doc.setFont("helvetica", "bold");
  doc.text("Content Comparison", MARGIN, y);
  y += 14;
  doc.setFontSize(32);
  doc.text("Report", MARGIN, y);
  y += 18;

  setColor(SAGE.muted);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  const subtitle = `${data.nameA} vs ${data.nameB}`;
  const subtitleLines = doc.splitTextToSize(subtitle, CONTENT_W);
  subtitleLines.forEach((line: string) => { doc.text(line, MARGIN, y); y += 5; });
  y += 10;

  setColor(SAGE.green);
  doc.setFontSize(10);
  doc.text(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), MARGIN, y);
  y += 7;
  doc.text("Prepared by Content Intelligence Analyst", MARGIN, y);

  setFill(SAGE.green);
  doc.roundedRect(MARGIN, 265, 16, 5, 1, 1, "F");
  setColor(SAGE.black);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("SAGE", MARGIN + 2, 268.5);

  // === CONTENT OVERVIEW ===
  const hasOverview = data.contentOverview && (data.contentOverview.a || data.contentOverview.b);
  if (hasOverview) {
    newPage();
    sectionTitle("Content Overview");
    sourceTag("Source: Content Analysis");
    y += 2;

    const overviewFields = ["covers", "writtenFor", "tone", "language", "depth", "structure"] as const;
    const labels: Record<string, string> = { covers: "What it covers", writtenFor: "Written for", tone: "Tone & approach", language: "Language", depth: "Depth", structure: "Structure" };

    [{ name: data.nameA, ov: data.contentOverview!.a, tags: data.uniqueTagsA || [], tagColor: SAGE.tagTeal },
     { name: data.nameB, ov: data.contentOverview!.b, tags: data.uniqueTagsB || [], tagColor: SAGE.tagJade }].forEach(({ name, ov, tags, tagColor }) => {
      if (!ov) return;
      checkPage(10);
      wrappedText(name, SAGE.green, 10, CONTENT_W, true);
      y += 2;
      for (const field of overviewFields) {
        if (ov[field]) {
          wrappedText(`${labels[field]}:`, SAGE.muted, 7, CONTENT_W, true);
          wrappedText(ov[field], SAGE.bodyText, 7.5, CONTENT_W - 4, false, 2);
          y += 1.5;
        }
      }
      if (tags.length > 0) {
        y += 1;
        drawTags(tags, tagColor, "", "Tags: ");
      }
      y += 3;
    });

    const sTags = data.sharedTags || [];
    if (sTags.length > 0) {
      drawTags(sTags, SAGE.tagShared, SAGE.green, "Shared tags: ");
    }

    // Metadata table
    const meta = data.metadata;
    y += 2;
    checkPage(30);
    wrappedText("Key Metadata", SAGE.green, 9, CONTENT_W, true);
    y += 2;
    const metaWidths = [50, 55, 55];
    drawTableRow(["", data.nameA, data.nameB], metaWidths, true, false);
    const metaRows = [
      ["Format", dv(meta.formatA), dv(meta.formatB)],
      ["Word Count", meta.wordCountA?.toLocaleString() || "Not specified", meta.wordCountB?.toLocaleString() || "Not specified"],
      ["Country/Region", dv(meta.countryA), dv(meta.countryB)],
      ["Funnel Stage", meta.stageA, meta.stageB],
      ["Product", dv(meta.productA), dv(meta.productB)],
      ["Industry", dv(meta.industryA), dv(meta.industryB)],
    ];
    metaRows.forEach((row, i) => drawTableRow(row, metaWidths, false, i % 2 === 0));
  }

  // === WHAT THIS CONTENT COVERS ===
  const wtc = data.whatThisCovers;
  if (wtc && (wtc.a || wtc.b)) {
    newPage();
    sectionTitle("What This Content Covers");
    sourceTag("Source: Content Analysis");
    y += 2;

    [{ name: data.nameA, item: wtc.a }, { name: data.nameB, item: wtc.b }].forEach(({ name, item }) => {
      if (!item) return;
      checkPage(10);
      wrappedText(name, SAGE.green, 10, CONTENT_W, true);
      y += 2;

      if (item.primaryFocus) {
        wrappedText("Primary Focus:", SAGE.muted, 7, CONTENT_W, true);
        wrappedText(item.primaryFocus, SAGE.bodyText, 7.5, CONTENT_W - 4, false, 2);
        y += 2;
      }

      if (item.keyTopics?.length) {
        wrappedText("Key Topics Discussed:", SAGE.muted, 7, CONTENT_W, true);
        y += 1;
        for (const t of item.keyTopics) {
          checkPage(12);
          wrappedText(t.topic, SAGE.white, 7.5, CONTENT_W - 4, true, 4);
          wrappedText(t.detail, SAGE.bodyText, 7, CONTENT_W - 8, false, 6);
          y += 2;
        }
      }

      if (item.notCovered) {
        checkPage(10);
        wrappedText("What It Does NOT Cover:", SAGE.sourceAmber, 7, CONTENT_W, true);
        wrappedText(item.notCovered, SAGE.bodyText, 7, CONTENT_W - 4, false, 2);
        y += 2;
      }
      y += 4;
    });

    if (wtc.comparisonInsight) {
      checkPage(14);
      wrappedText("Comparison Insight", SAGE.green, 9, CONTENT_W, true);
      y += 1;
      wrappedText(wtc.comparisonInsight, SAGE.bodyText, 8, CONTENT_W);
      y += 2;
      sourceTag("Source: Content Analysis");
    }
  }

  // === AUDIENCE RESONANCE ASSESSMENT ===
  if (data.resonanceAssessment) {
    newPage();
    sectionTitle("Audience Resonance Assessment");
    sourceTag("Source: Content Analysis");
    y += 2;

    const dims = [
      { key: "countryFit", label: "Country/Region Fit" },
      { key: "industryFit", label: "Industry Fit" },
      { key: "funnelStageFit", label: "Funnel Stage Fit" },
      { key: "productFit", label: "Product Fit" },
    ] as const;

    const meta = data.metadata;
    [{ name: data.nameA, assessment: data.resonanceAssessment.a, suggested: data.resonanceAssessment.suggestedStageA, current: meta.stageA },
     { name: data.nameB, assessment: data.resonanceAssessment.b, suggested: data.resonanceAssessment.suggestedStageB, current: meta.stageB }].forEach(({ name, assessment, suggested, current }) => {
      if (!assessment) return;
      checkPage(10);
      wrappedText(name, SAGE.green, 10, CONTENT_W, true);
      y += 2;

      for (const dim of dims) {
        const d = assessment[dim.key];
        if (!d) continue;
        checkPage(14);
        const ratingColor = d.rating === "Strong" ? SAGE.green : d.rating === "Moderate" ? SAGE.sourceAmber : "#EF4444";
        wrappedText(`${dim.label}:`, SAGE.white, 8, CONTENT_W - 30, true);
        const savedY = y;
        y = savedY - 3.6;
        setColor(ratingColor);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text(d.rating, PAGE_W - MARGIN, y, { align: "right" });
        y = savedY;
        wrappedText(d.explanation, SAGE.bodyText, 7, CONTENT_W - 4, false, 2);
        y += 2;
      }

      if (suggested && suggested !== current) {
        checkPage(8);
        wrappedText(`Note: Based on content analysis, this may perform better as ${suggested}. Current tag: ${current}`, SAGE.sourceAmber, 7, CONTENT_W - 4, false, 2);
        y += 2;
      }
      y += 4;
    });
  }

  // === WHAT'S SHARED, WHAT'S DIFFERENT ===
  const hasTagData = (data.sharedTags?.length || data.uniqueTagsA?.length || data.uniqueTagsB?.length || data.sharedAndDifferent?.sharedTags?.length || data.sharedAndDifferent?.uniqueTagsA?.length || data.sharedAndDifferent?.uniqueTagsB?.length);
  if (data.sharedAndDifferent && (data.sharedAndDifferent.overlap?.length || data.sharedAndDifferent.divergence?.length || hasTagData)) {
    newPage();
    sectionTitle("What's Shared, What's Different");
    sourceTag("Source: Content Analysis");
    y += 2;

    const sTags = data.sharedTags || data.sharedAndDifferent.sharedTags || [];
    const uTagsA = data.uniqueTagsA || data.sharedAndDifferent.uniqueTagsA || [];
    const uTagsB = data.uniqueTagsB || data.sharedAndDifferent.uniqueTagsB || [];

    if (sTags.length > 0 || uTagsA.length > 0 || uTagsB.length > 0) {
      wrappedText("Tag Overlap", SAGE.green, 9, CONTENT_W, true);
      y += 1;
      if (sTags.length) drawTags(sTags, SAGE.tagShared, SAGE.green, "Shared: ");
      if (uTagsA.length) drawTags(uTagsA, SAGE.tagTeal, "", `Unique to ${data.nameA}: `);
      if (uTagsB.length) drawTags(uTagsB, SAGE.tagJade, "", `Unique to ${data.nameB}: `);
      y += 3;
    }

    if (data.sharedAndDifferent.overlap?.length) {
      wrappedText("Where They Overlap", SAGE.green, 9, CONTENT_W, true);
      y += 2;
      data.sharedAndDifferent.overlap.forEach(item => {
        checkPage(8);
        wrappedText(`- ${item}`, SAGE.bodyText, 7.5, CONTENT_W - 4, false, 2);
        y += 1;
      });
      y += 3;
    }

    if (data.sharedAndDifferent.divergence?.length) {
      wrappedText("Where They Diverge", SAGE.green, 9, CONTENT_W, true);
      y += 2;
      data.sharedAndDifferent.divergence.forEach(item => {
        checkPage(8);
        wrappedText(`- ${item}`, SAGE.bodyText, 7.5, CONTENT_W - 4, false, 2);
        y += 1;
      });
    }
  }

  // === WHAT MAKES THIS CONTENT WORK ===
  const wmw = data.whatMakesItWork;
  if (wmw && (wmw.a?.length || wmw.b?.length)) {
    newPage();
    sectionTitle("What Makes This Content Work");
    sourceTag("Source: Content Analysis + Internal Data");
    y += 2;

    [{ name: data.nameA, items: wmw.a }, { name: data.nameB, items: wmw.b }].forEach(({ name, items }) => {
      if (!items?.length) return;
      checkPage(10);
      wrappedText(name, SAGE.green, 10, CONTENT_W, true);
      y += 2;

      for (const item of items) {
        drawCalloutBox(item.factor, item.explanation, `Source: ${item.source || "Content Analysis + Internal Data"}`);
      }
      y += 3;
    });
  }

  // === WHAT COULD BE IMPROVED ===
  const wci = data.whatCouldBeImproved;
  if (wci && (wci.a?.length || wci.b?.length)) {
    checkPage(40);
    sectionTitle("What Could Be Improved");
    sourceTag("Source: Content Analysis");
    y += 2;

    [{ name: data.nameA, items: wci.a }, { name: data.nameB, items: wci.b }].forEach(({ name, items }) => {
      if (!items?.length) return;
      checkPage(10);
      wrappedText(name, SAGE.green, 10, CONTENT_W, true);
      y += 2;

      for (const item of items) {
        checkPage(14);
        wrappedText(item.issue, SAGE.sourceAmber, 8, CONTENT_W, true);
        wrappedText(item.detail, SAGE.bodyText, 7.5, CONTENT_W - 4, false, 2);
        y += 1;
        sourceTag(`Source: ${item.source || "Content Analysis"}`);
        y += 1;
      }
      y += 3;
    });
  }

  // === TOPIC RELEVANCE ===
  if (data.topicRelevance && (data.topicRelevance.a?.length || data.topicRelevance.b?.length)) {
    newPage();
    sectionTitle("Topic Relevance");
    sourceTag("Source: Content Analysis");
    y += 2;

    const topicWidths = [45, 30, 85];
    [{ name: data.nameA, items: data.topicRelevance.a }, { name: data.nameB, items: data.topicRelevance.b }].forEach(({ name, items }) => {
      if (!items?.length) return;
      checkPage(10);
      wrappedText(name, SAGE.green, 9, CONTENT_W, true);
      y += 2;
      drawTableRow(["Topic", "Relevant?", "Why"], topicWidths, true, false);
      items.forEach((item: any, i: number) => {
        drawTableRow([item.topic || "", item.relevance || "", item.why || ""], topicWidths, false, i % 2 === 0);
      });
      y += 5;
    });

    if (data.topicRelevance.aiInsight) {
      checkPage(14);
      wrappedText("AI Insight", SAGE.green, 9, CONTENT_W, true);
      y += 1;
      wrappedText(data.topicRelevance.aiInsight, SAGE.bodyText, 8, CONTENT_W);
      y += 3;
    }
  }

  // === VERDICT & SUGGESTIONS ===
  if (data.verdict || data.suggestions?.length) {
    newPage();
    sectionTitle("Verdict & Suggestions");
    y += 2;

    if (data.verdict) {
      wrappedText(data.verdict, SAGE.bodyText, 9, CONTENT_W);
      y += 2;
      sourceTag("Source: Content Analysis + Internal Data");
      y += 4;
    }

    if (data.suggestions?.length) {
      wrappedText("Actionable Suggestions", SAGE.green, 10, CONTENT_W, true);
      y += 2;
      data.suggestions.forEach((s, i) => {
        checkPage(12);
        wrappedText(`${i + 1}. ${s.text}`, SAGE.bodyText, 8, CONTENT_W - 4, false, 2);
        const srcType = s.source?.includes("Internal") ? "Internal Data" : s.source?.includes("Content") ? "Content Analysis" : "AI Recommendation";
        sourceTag(`Source: ${srcType}`, MARGIN + 4);
        y += 1;
      });
    }
  }

  // === PERFORMANCE COMPARISON ===
  const perfDisplay = data.performanceDisplay || ((data.metricsA.hasData && data.metricsB.hasData) ? "table" : (data.metricsA.hasData || data.metricsB.hasData) ? "inline" : "none");

  if (perfDisplay === "table") {
    newPage();
    sectionTitle("Performance Comparison");
    sourceTag("Source: Internal Data");
    y += 2;

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
  } else if (perfDisplay === "inline") {
    checkPage(20);
    sectionTitle("Performance Data");
    sourceTag("Source: Internal Data");
    y += 2;
    const summary = data.performanceInlineSummary || `Performance data available for ${data.metricsA.hasData ? data.nameA : data.nameB} only.`;
    wrappedText(summary, SAGE.bodyText, 8, CONTENT_W);
  }

  doc.save(`Comparison_Report_${data.nameA.replace(/[^a-zA-Z0-9]/g, "_")}_vs_${data.nameB.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`);
}
