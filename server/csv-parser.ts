import { parse } from "csv-parse/sync";

export function parseDelimitedText(text: string): { headers: string[]; rows: Record<string, any>[] } {
  const sampleLines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 5);
  if (sampleLines.length < 2) {
    return { headers: [], rows: [] };
  }

  let delimiter = "\t";
  const firstLine = sampleLines[0];
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;

  if (tabCount >= 1 && tabCount >= commaCount && tabCount >= semiCount) {
    delimiter = "\t";
  } else if (commaCount >= 1 && commaCount >= semiCount) {
    delimiter = ",";
  } else if (semiCount >= 1) {
    delimiter = ";";
  }

  const records: string[][] = parse(text, {
    delimiter,
    quote: '"',
    escape: '"',
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  if (records.length < 2) {
    return { headers: [], rows: [] };
  }

  const headers = records[0].map(h => h.trim());
  const rows: Record<string, any>[] = [];

  for (let i = 1; i < records.length; i++) {
    const vals = records[i];
    const row: Record<string, any> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (vals[j] || "").trim();
    }
    rows.push(row);
  }

  return { headers, rows };
}
