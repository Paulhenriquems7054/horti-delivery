/**
 * Extrai padrões frequentes dos produtos UNCLASSIFIED / REVIEW_REQUIRED.
 * Não altera a planilha original.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as XLSX from "xlsx";
import {
  cellValueToString,
  normalizeIdentifier,
  normalizeProductName,
  resolveBeiraRioColumns,
} from "../src/lib/productImport/normalize.ts";
import { parseBrazilianPrice } from "../src/lib/productImport/parseBrazilianPrice.ts";
import { classifyProductName, normalizeForClassification } from "../src/lib/productCategory/classifyProduct.ts";
import { annotateSpreadsheetDuplicates } from "../src/lib/productImport/dedupe.ts";

const FILE = path.join("Lista de Produtos", "RELAÇÃO DE PRODUTOS - BEIRA RIO.xlsx");

function topN(map: Map<string, number>, n: number) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function main() {
  const buf = fs.readFileSync(FILE);
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]!]!;
  const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
  });
  const header = (matrix[0] ?? []).map((c) => cellValueToString(c));
  const resolved = resolveBeiraRioColumns(header);
  if (!resolved.ok) throw new Error("headers");
  const cols = resolved.columns;
  const getCell = (r: number, c: number) => {
    const cell = sheet[XLSX.utils.encode_cell({ r, c })];
    return cell ? cellValueToString(cell.v, cell.w) : "";
  };

  const rows = [];
  for (let i = 1; i < matrix.length; i++) {
    const code = normalizeIdentifier(getCell(i, cols.internalCode));
    const barcode = normalizeIdentifier(getCell(i, cols.barcode));
    const name = normalizeProductName(getCell(i, cols.name));
    const priceRaw = getCell(i, cols.price);
    const price = parseBrazilianPrice(priceRaw);
    rows.push({
      rowNumber: i + 1,
      internalCode: code,
      barcode,
      name,
      price: price.ok ? price.value : null,
    });
  }

  const { annotations } = annotateSpreadsheetDuplicates(rows);
  const ready = rows.filter((r) => {
    const a = annotations.get(r.rowNumber);
    return a?.kind === "PRODUTO_UNICO" && a.keepForImport && r.price != null && r.name;
  });

  const unclassified: string[] = [];
  const review: string[] = [];
  for (const r of ready) {
    const c = classifyProductName(r.name);
    if (c.status === "UNCLASSIFIED") unclassified.push(r.name);
    if (c.status === "REVIEW_REQUIRED") review.push(r.name);
  }

  const tokens = new Map<string, number>();
  const bigrams = new Map<string, number>();
  const prefixes = new Map<string, number>();

  for (const name of unclassified) {
    const n = normalizeForClassification(name);
    const parts = n.split(" ").filter((p) => p.length >= 2);
    if (parts[0]) prefixes.set(parts[0], (prefixes.get(parts[0]) ?? 0) + 1);
    for (const p of parts) {
      if (p.length < 3) continue;
      if (/^\d+$/.test(p)) continue;
      tokens.set(p, (tokens.get(p) ?? 0) + 1);
    }
    for (let i = 0; i < parts.length - 1; i++) {
      const bg = `${parts[i]} ${parts[i + 1]}`;
      bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1);
    }
  }

  const report = {
    ready: ready.length,
    unclassified: unclassified.length,
    review: review.length,
    top_tokens: topN(tokens, 80),
    top_bigrams: topN(bigrams, 60),
    top_prefixes: topN(prefixes, 60),
    sample_unclassified: unclassified.slice(0, 40),
    sample_review: review.slice(0, 30),
  };

  const out = path.join("scripts", "unclassified-patterns.json");
  fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({
    ready: report.ready,
    unclassified: report.unclassified,
    review: report.review,
    top_tokens: report.top_tokens.slice(0, 40),
    top_bigrams: report.top_bigrams.slice(0, 30),
    top_prefixes: report.top_prefixes.slice(0, 30),
  }, null, 2));
  console.log("full ->", out);
}

main();
