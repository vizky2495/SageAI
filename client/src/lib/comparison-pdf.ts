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
  sharedAndDifferent: { overlap: string[]; divergence: string[] } | null;
  verdict: string;
  suggestions: { text: string; source: string }[];
  metricsA: { pageviews: number; downloads: number; leads: number; sqos: number; avgTime: number; hasData: boolean };
  metricsB: { pageviews: number; downloads: number; leads: number; sqos: number; avgTime: number; hasData: boolean };
  metadata: {
    stageA: string; stageB: string; productA: string; productB: string;
    countryA: string; countryB: string; industryA: string; industryB: string;
    typeA: string; typeB: string; wordCountA: number | null; wordCountB: number | null;
    pageCountA: number | null; pageCountB: number | null; formatA: string; formatB: string;
    summaryA: string; summaryB: string; bothHaveContent: boolean;
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

export function generateComparisonPdf(data: FullComparisonResult) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = 0;
  let pageNum = 0;

  function setColor(hex: string) {
    doc.setTextColor(...hexToRgb(hex));
  }

  function setFill(hex: string) {
    doc.setFillColor(...hexToRgb(hex));
  }

  function addFooter() {
    pageNum++;
    setColor(SAGE.green);
    doc.setFontSize(7);
    doc.text("CONFIDENTIAL: INTERNAL USE ONLY", MARGIN, 285);
    doc.text(`(C) ${new Date().getFullYear()} The Sage Group plc, or its licensors. All rights reserved.`, MARGIN, 289);
    doc.text(`${pageNum}`, PAGE_W - MARGIN, 289, { align: "right" });
    setFill(SAGE.green);
    doc.roundedRect(MARGIN, 278, 12, 4, 1, 1, "F");
    setColor(SAGE.black);
    doc.setFontSize(5);
    doc.text("SAGE", MARGIN + 1.5, 281);
  }

  function newPage() {
    if (pageNum > 0) doc.addPage();
    setFill(SAGE.black);
    doc.rect(0, 0, PAGE_W, 297, "F");
    addFooter();
    y = MARGIN;
  }

  function checkPage(needed: number) {
    if (y + needed > 270) {
      newPage();
    }
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

  function sourceTag(text: string, type: "internal" | "content" | "recommendation") {
    const color = type === "internal" ? SAGE.sourceGreen : type === "content" ? SAGE.sourceJade : SAGE.sourceAmber;
    setColor(color);
    doc.setFontSize(6);
    doc.setFont("helvetica", "italic");
    doc.text(`[${text}]`, MARGIN, y);
    y += 4;
  }

  function wrappedText(text: string, color: string, size: number, maxWidth: number, bold = false, xOffset = 0): number {
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
    const fontSize = isHeader ? 7 : 7;
    doc.setFontSize(fontSize);
    const lineH = fontSize * 0.4;

    const wrappedCells = cells.map((cell, i) => doc.splitTextToSize(cell, widths[i] - cellPad * 2));
    const maxLines = Math.max(...wrappedCells.map(c => c.length));
    const rowHeight = Math.max(6, maxLines * lineH + cellPad * 2);

    checkPage(rowHeight + 2);

    if (isHeader) {
      setFill(SAGE.headerRow);
    } else {
      setFill(isAlt ? SAGE.tealRow : SAGE.darkRow);
    }
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

  newPage();
  setFill(SAGE.black);
  doc.rect(0, 0, PAGE_W, 297, "F");

  const grd = doc as any;
  if (grd.setGState) {
    try {
      setFill("#003310");
      doc.circle(PAGE_W - 30, 260, 80, "F");
    } catch {}
  }

  y = 80;
  setColor(SAGE.white);
  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.text("Content Comparison", MARGIN, y);
  y += 12;
  doc.text("Report", MARGIN, y);
  y += 16;

  setColor(SAGE.muted);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  const subtitle = `${data.nameA} vs ${data.nameB}`;
  const subtitleLines = doc.splitTextToSize(subtitle, CONTENT_W);
  subtitleLines.forEach((line: string) => {
    doc.text(line, MARGIN, y);
    y += 5;
  });
  y += 8;

  setColor(SAGE.green);
  doc.setFontSize(10);
  doc.text(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), MARGIN, y);
  y += 8;
  doc.text("Prepared by Content Intelligence Analyst", MARGIN, y);

  setFill(SAGE.green);
  doc.roundedRect(MARGIN, 265, 16, 5, 1, 1, "F");
  setColor(SAGE.black);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("SAGE", MARGIN + 2, 268.5);

  newPage();
  sectionTitle("Content Overview");
  sourceTag("Source: Content Analysis - from uploaded files", "content");
  y += 2;

  if (data.contentOverview) {
    const overviewFields = ["covers", "writtenFor", "tone", "language", "depth", "structure"] as const;
    const labels: Record<string, string> = { covers: "What it covers", writtenFor: "Written for", tone: "Tone & approach", language: "Language", depth: "Depth", structure: "Structure" };

    [{ name: data.nameA, ov: data.contentOverview.a }, { name: data.nameB, ov: data.contentOverview.b }].forEach(({ name, ov }) => {
      checkPage(10);
      wrappedText(name, SAGE.green, 10, CONTENT_W, true);
      y += 2;
      for (const field of overviewFields) {
        if (ov[field]) {
          wrappedText(`${labels[field]}:`, SAGE.muted, 7, CONTENT_W, true);
          wrappedText(ov[field], SAGE.bodyText, 8, CONTENT_W - 4, false, 2);
          y += 2;
        }
      }
      y += 4;
    });
  }

  const meta = data.metadata;
  checkPage(30);
  wrappedText("Key Metadata", SAGE.green, 9, CONTENT_W, true);
  y += 2;
  const metaWidths = [50, 55, 55];
  drawTableRow(["", data.nameA, data.nameB], metaWidths, true, false);
  const metaRows = [
    ["Format", meta.formatA, meta.formatB],
    ["Word Count", meta.wordCountA?.toLocaleString() || "N/A", meta.wordCountB?.toLocaleString() || "N/A"],
    ["Language/Country", meta.countryA || "N/A", meta.countryB || "N/A"],
    ["Funnel Stage", meta.stageA, meta.stageB],
    ["Product", meta.productA, meta.productB],
    ["Industry", meta.industryA || "N/A", meta.industryB || "N/A"],
  ];
  metaRows.forEach((row, i) => drawTableRow(row, metaWidths, false, i % 2 === 0));

  if (data.metricsA.hasData || data.metricsB.hasData) {
    y += 4;
    wrappedText("Engagement Summary", SAGE.green, 9, CONTENT_W, true);
    y += 2;
    drawTableRow(["Metric", data.nameA, data.nameB], metaWidths, true, false);
    const engRows = [
      ["Pageviews", data.metricsA.hasData ? data.metricsA.pageviews.toLocaleString() : "No data", data.metricsB.hasData ? data.metricsB.pageviews.toLocaleString() : "No data"],
      ["Downloads", data.metricsA.hasData ? data.metricsA.downloads.toLocaleString() : "No data", data.metricsB.hasData ? data.metricsB.downloads.toLocaleString() : "No data"],
      ["Leads", data.metricsA.hasData ? data.metricsA.leads.toLocaleString() : "No data", data.metricsB.hasData ? data.metricsB.leads.toLocaleString() : "No data"],
      ["SQOs", data.metricsA.hasData ? data.metricsA.sqos.toLocaleString() : "No data", data.metricsB.hasData ? data.metricsB.sqos.toLocaleString() : "No data"],
    ];
    engRows.forEach((row, i) => drawTableRow(row, metaWidths, false, i % 2 === 0));
  }

  newPage();
  sectionTitle("Audience Resonance Assessment");
  sourceTag("Source: Content Analysis - from uploaded files, cross-referenced with asset metadata from Internal Data", "content");
  y += 2;

  if (data.resonanceAssessment) {
    const dims = [
      { key: "countryFit", label: "Country/Region Fit" },
      { key: "industryFit", label: "Industry Fit" },
      { key: "funnelStageFit", label: "Funnel Stage Fit" },
      { key: "productFit", label: "Product Fit" },
    ] as const;

    [{ name: data.nameA, assessment: data.resonanceAssessment.a, suggested: data.resonanceAssessment.suggestedStageA, current: meta.stageA },
     { name: data.nameB, assessment: data.resonanceAssessment.b, suggested: data.resonanceAssessment.suggestedStageB, current: meta.stageB }].forEach(({ name, assessment, suggested, current }) => {
      checkPage(10);
      wrappedText(name, SAGE.green, 10, CONTENT_W, true);
      y += 2;

      for (const dim of dims) {
        const d = assessment[dim.key];
        if (!d) continue;
        checkPage(12);
        wrappedText(`${dim.label}: ${d.rating}`, SAGE.white, 8, CONTENT_W, true);
        wrappedText(d.explanation, SAGE.bodyText, 7.5, CONTENT_W - 4, false, 2);
        y += 2;
      }

      if (suggested && suggested !== current) {
        checkPage(8);
        wrappedText(`Note: Based on content analysis, this may perform better as ${suggested}. Current tag: ${current}`, SAGE.sourceAmber, 7, CONTENT_W - 4, false, 2);
        y += 2;
      }
      y += 4;
    });
  } else {
    wrappedText("Content files not uploaded for both assets. Upload content for both to enable resonance analysis.", SAGE.muted, 8, CONTENT_W);
  }

  newPage();
  sectionTitle("Topic Relevance");
  sourceTag("Source: Content Analysis", "content");
  y += 2;

  if (data.topicRelevance) {
    const topicWidths = [45, 30, 85];
    [{ name: data.nameA, items: data.topicRelevance.a }, { name: data.nameB, items: data.topicRelevance.b }].forEach(({ name, items }) => {
      if (!items || items.length === 0) return;
      checkPage(10);
      wrappedText(name, SAGE.green, 9, CONTENT_W, true);
      y += 2;
      drawTableRow(["Topic", "Relevant?", "Why"], topicWidths, true, false);
      items.forEach((item: any, i: number) => {
        drawTableRow([item.topic, item.relevance, item.why], topicWidths, false, i % 2 === 0);
      });
      y += 6;
    });

    if (data.topicRelevance.aiInsight) {
      checkPage(12);
      wrappedText("AI Insight", SAGE.green, 9, CONTENT_W, true);
      y += 1;
      wrappedText(data.topicRelevance.aiInsight, SAGE.bodyText, 8, CONTENT_W);
      y += 4;
    }
  }

  newPage();
  sectionTitle("What's Shared, What's Different");
  sourceTag("Source: Content Analysis", "content");
  y += 2;

  if (data.sharedAndDifferent) {
    if (data.sharedAndDifferent.overlap?.length) {
      wrappedText("Where They Overlap", SAGE.green, 9, CONTENT_W, true);
      y += 2;
      data.sharedAndDifferent.overlap.forEach(item => {
        checkPage(8);
        wrappedText(`- ${item}`, SAGE.bodyText, 8, CONTENT_W - 4, false, 2);
        y += 1;
      });
      y += 4;
    }

    if (data.sharedAndDifferent.divergence?.length) {
      wrappedText("Where They Diverge", SAGE.green, 9, CONTENT_W, true);
      y += 2;
      data.sharedAndDifferent.divergence.forEach(item => {
        checkPage(8);
        wrappedText(`- ${item}`, SAGE.bodyText, 8, CONTENT_W - 4, false, 2);
        y += 1;
      });
    }
  }

  newPage();
  sectionTitle("Verdict & Suggestions");
  y += 2;

  if (data.verdict) {
    wrappedText(data.verdict, SAGE.bodyText, 9, CONTENT_W);
    y += 2;
    sourceTag("Source: Content Analysis + Internal Data", "content");
    y += 4;
  }

  if (data.suggestions?.length) {
    wrappedText("Suggestions", SAGE.green, 10, CONTENT_W, true);
    y += 2;
    data.suggestions.forEach((s, i) => {
      checkPage(10);
      wrappedText(`${i + 1}. ${s.text}`, SAGE.bodyText, 8, CONTENT_W - 4, false, 2);
      y += 1;
    });
    y += 2;
    sourceTag("Source: AI Recommendation - based on content analysis and engagement patterns", "recommendation");
  }

  if (data.metricsA.hasData || data.metricsB.hasData) {
    newPage();
    sectionTitle("Performance Comparison");
    sourceTag("Source: Internal Data", "internal");
    y += 2;

    const perfWidths = [40, 40, 40, 40];
    drawTableRow(["Metric", `${data.nameA} (Actual)`, `${data.nameB} (Actual)`, "Delta"], perfWidths, true, false);

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
      const aStr = data.metricsA.hasData ? aVal.toLocaleString() : "No data";
      const bStr = data.metricsB.hasData ? bVal.toLocaleString() : "No data";
      let delta = "\u2014";
      if (data.metricsA.hasData && data.metricsB.hasData && aVal > 0) {
        const pct = Math.round(((bVal - aVal) / aVal) * 100);
        delta = `${pct > 0 ? "+" : ""}${pct}%`;
      }
      drawTableRow([label, aStr, bStr, delta], perfWidths, false, i % 2 === 0);
    });

    if (!data.metricsA.hasData || !data.metricsB.hasData) {
      y += 4;
      const note = !data.metricsB.hasData && data.metricsA.hasData
        ? "Content B has no engagement history. Performance comparison will be meaningful once this content is deployed and generates data."
        : !data.metricsA.hasData && data.metricsB.hasData
        ? "Content A has no engagement history. Performance comparison will be meaningful once this content is deployed and generates data."
        : "Neither asset has engagement data yet.";
      wrappedText(note, SAGE.muted, 7, CONTENT_W);
    }
  }

  doc.save(`Comparison_Report_${data.nameA.replace(/[^a-zA-Z0-9]/g, "_")}_vs_${data.nameB.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`);
}
