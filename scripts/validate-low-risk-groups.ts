/** Validação cirúrgica dos grupos de baixo risco — só leitura. */
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
import { annotateSpreadsheetDuplicates } from "../src/lib/productImport/dedupe.ts";
import { normalizeForClassification } from "../src/lib/productCategory/classifyProduct.ts";

const FILE = path.join("Lista de Produtos", "RELAÇÃO DE PRODUTOS - BEIRA RIO.xlsx");

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
    const name = normalizeProductName(getCell(i, cols.name));
    const price = parseBrazilianPrice(getCell(i, cols.price));
    rows.push({
      rowNumber: i + 1,
      internalCode: normalizeIdentifier(getCell(i, cols.internalCode)),
      barcode: normalizeIdentifier(getCell(i, cols.barcode)),
      name,
      price: price.ok ? price.value : null,
    });
  }
  const { annotations } = annotateSpreadsheetDuplicates(rows);
  const ready = rows.filter((r) => {
    const a = annotations.get(r.rowNumber);
    return a?.kind === "PRODUTO_UNICO" && a.keepForImport && r.price != null && r.name;
  });

  const patterns: Record<string, (n: string) => boolean> = {
    PRESTOBARBA: (n) => /\bPRESTOBARBA\b/.test(n),
    SOPAO: (n) => /\bSOPAO\b/.test(n),
    TIGELA: (n) => /\bTIGELA\b/.test(n),
    TOALHAS_PAPEL: (n) => /TOALHAS? DE PAPEL/.test(n),
    TOALHA_OTHER: (n) => /\bTOALHAS?\b/.test(n) && !/TOALHAS? DE PAPEL/.test(n),
    BOLA: (n) => /\bBOLA\b/.test(n),
    BOM_AR: (n) => /\bBOM AR\b/.test(n),
    TESOURA: (n) => /\bTESOURA\b/.test(n),
  };

  const out: Record<string, { count: number; examples: string[] }> = {};
  for (const [key, test] of Object.entries(patterns)) {
    const matches = ready.filter((r) => test(normalizeForClassification(r.name)));
    out[key] = {
      count: matches.length,
      examples: matches.slice(0, 20).map((r) => r.name),
    };
  }
  fs.writeFileSync(
    path.join("scripts", "low-risk-group-samples.json"),
    JSON.stringify(out, null, 2),
    "utf8",
  );
  console.log(JSON.stringify(out, null, 2));
}

main();
