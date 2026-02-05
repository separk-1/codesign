export interface ParsedCsvLine {
  original: string;
  upper: string;
}

export interface ParsedCsv {
  header: string | null;
  rows: ParsedCsvLine[];
}

export function parseCsv(csvText: string): ParsedCsv {
  const lines = (csvText || '').split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    return { header: null, rows: [] };
  }

  // keep header if it looks like header
  const header = lines[0].includes(',') && /[a-zA-Z]/.test(lines[0]) ? lines[0] : null;
  const body = header ? lines.slice(1) : lines;

  const rows = body.map(line => ({
    original: line,
    upper: line.toUpperCase(),
  }));

  return { header, rows };
}

export function filterParsedCsv(parsed: ParsedCsv, keywords: string[], maxLines: number): string {
  if (parsed.rows.length === 0) return '';

  const upperKeys = keywords.map(k => k.toUpperCase());

  const scored = parsed.rows.map((row) => {
    let score = 0;
    // Optimization: row.upper is already calculated
    for (const k of upperKeys) if (row.upper.includes(k)) score += 1;
    return { line: row.original, score };
  });

  const picked = scored
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxLines)
    .map(x => x.line);

  const out = parsed.header ? [parsed.header, ...picked] : picked;
  return out.join('\n');
}
