/**
 * Mineração de UNCLASSIFIED + auditoria reversa de falsos positivos.
 * Não altera o XLSX original nem o Hosted.
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
import {
  CATALOG_CATEGORY_NAMES,
  classifyProductName,
  normalizeForClassification,
  type CatalogCategoryName,
} from "../src/lib/productCategory/classifyProduct.ts";
import { annotateSpreadsheetDuplicates } from "../src/lib/productImport/dedupe.ts";

const FILE = path.join("Lista de Produtos", "RELAÇÃO DE PRODUTOS - BEIRA RIO.xlsx");

type Ready = { rowNumber: number; name: string };

function loadReady(): Ready[] {
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
    const price = parseBrazilianPrice(getCell(i, cols.price));
    rows.push({
      rowNumber: i + 1,
      internalCode: code,
      barcode,
      name,
      price: price.ok ? price.value : null,
    });
  }
  const { annotations } = annotateSpreadsheetDuplicates(rows);
  return rows
    .filter((r) => {
      const a = annotations.get(r.rowNumber);
      return a?.kind === "PRODUTO_UNICO" && a.keepForImport && r.price != null && r.name;
    })
    .map((r) => ({ rowNumber: r.rowNumber, name: r.name }));
}

function bump(map: Map<string, { count: number; examples: string[] }>, key: string, name: string) {
  const cur = map.get(key) ?? { count: 0, examples: [] };
  cur.count += 1;
  if (cur.examples.length < 6) cur.examples.push(name);
  map.set(key, cur);
}

function topN(map: Map<string, { count: number; examples: string[] }>, n: number) {
  return [...map.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, n)
    .map(([pattern, v]) => ({ pattern, count: v.count, examples: v.examples }));
}

function main() {
  const ready = loadReady();
  const byStatus = { CLASSIFIED: 0, REVIEW_REQUIRED: 0, UNCLASSIFIED: 0 };
  const byCat: Record<string, string[]> = Object.fromEntries(
    CATALOG_CATEGORY_NAMES.map((c) => [c, [] as string[]]),
  );
  const unclassified: string[] = [];

  for (const r of ready) {
    const c = classifyProductName(r.name);
    byStatus[c.status] += 1;
    if (c.status === "CLASSIFIED" && c.categoryName) {
      byCat[c.categoryName]!.push(r.name);
    } else {
      unclassified.push(r.name);
    }
  }

  // --- mineração UNCLASSIFIED ---
  const firstWord = new Map<string, { count: number; examples: string[] }>();
  const twoWords = new Map<string, { count: number; examples: string[] }>();
  const brandHits = new Map<string, { count: number; examples: string[] }>();

  const brands = [
    "GARNIER",
    "LOLA",
    "ADES",
    "ALPINO",
    "NESTLE",
    "DANONE",
    "YOKI",
    "KITANO",
    "PRATICE",
    "HALLS",
    "TRIDENT",
    "ORAL",
    "PATO",
  ];

  for (const name of unclassified) {
    const n = normalizeForClassification(name);
    const parts = n.split(" ").filter(Boolean);
    if (parts[0]) bump(firstWord, parts[0], name);
    if (parts.length >= 2) bump(twoWords, `${parts[0]} ${parts[1]}`, name);
    for (const b of brands) {
      if (n.includes(b)) bump(brandHits, b, name);
    }
  }

  // --- auditoria reversa (heurísticas de falso positivo) ---
  const fp: Array<{ category: string; name: string; suspicion: string }> = [];

  const hortiSuspect = (n: string) =>
    /\b(ADES|SUCO|REFRI|IOGURTE|ACTIVIA|ACTIVA|DANONE|DANONINHO|BEBIDA|LEITE|SHAMPOO|CONDIC|HIDRAT)\b/.test(
      n,
    ) || /^ADES\b/.test(n);

  const bebidasSuspect = (n: string) =>
    /AGUA SANIT|AGUA MICELAR|AGUA COL|AGUA DE COLONIA|AGUA OXIGENADA/.test(n);

  const utilSuspect = (n: string) =>
    /\b(ALCAPARRA|BEBIDA|SUCO|LEITE|IOGURTE|SABONETE|SHAMPOO|DETERGENTE|BISCOITO|ARROZ|FEIJAO|ACUCAR)\b/.test(
      n,
    ) ||
    /^ADES\b/.test(n) ||
    /ALPINO BEBIDA/.test(n);

  const merceariaSuspect = (n: string) =>
    /\b(SAND|HAVAIANAS|DETERGENTE|SHAMPOO|ABSORVENTE|FRALDA)\b/.test(n);

  for (const name of byCat["Hortifrúti"] ?? []) {
    const n = normalizeForClassification(name);
    if (hortiSuspect(n)) fp.push({ category: "Hortifrúti", name, suspicion: "fruta em produto não fresco" });
  }
  for (const name of byCat["Bebidas"] ?? []) {
    const n = normalizeForClassification(name);
    if (bebidasSuspect(n)) fp.push({ category: "Bebidas", name, suspicion: "água não potável / higiene" });
  }
  for (const name of byCat["Utilidades e Outros"] ?? []) {
    const n = normalizeForClassification(name);
    if (utilSuspect(n)) fp.push({ category: "Utilidades e Outros", name, suspicion: "parece alimento/higiene/limpeza" });
  }
  for (const name of byCat["Mercearia Seca e Básica"] ?? []) {
    const n = normalizeForClassification(name);
    if (merceariaSuspect(n)) fp.push({ category: "Mercearia Seca e Básica", name, suspicion: "não parece mercearia" });
  }

  // contagens ADES / ALCAPARRA / ALPINO no catálogo pronto
  const namedChecks: Record<string, Array<{ name: string; category: string | null; status: string }>> = {
    ADES: [],
    ALCAPARRA: [],
    ALPINO: [],
    POLPA: [],
    ANTI: [],
    PASTILHA: [],
    GARNIER: [],
    LOLA: [],
  };

  for (const r of ready) {
    const n = normalizeForClassification(r.name);
    const c = classifyProductName(r.name);
    for (const key of Object.keys(namedChecks)) {
      if (n.includes(key) || (key === "ANTI" && /\bANTI/.test(n))) {
        if (namedChecks[key]!.length < 25) {
          namedChecks[key]!.push({
            name: r.name,
            category: c.categoryName,
            status: c.status,
          });
        }
      }
    }
  }

  const out = {
    baseline: byStatus,
    unclassified_count: unclassified.length,
    first_word_top: topN(firstWord, 50),
    two_words_top: topN(twoWords, 40),
    brand_in_unclassified: topN(brandHits, 20),
    false_positive_candidates: fp.slice(0, 120),
    false_positive_count: fp.length,
    named_checks: namedChecks,
    category_sizes: Object.fromEntries(
      CATALOG_CATEGORY_NAMES.map((c) => [c, byCat[c]?.length ?? 0]),
    ),
  };

  fs.writeFileSync(
    path.join("scripts", "mine-unclassified-audit.json"),
    JSON.stringify(out, null, 2),
    "utf8",
  );
  console.log(
    JSON.stringify(
      {
        baseline: out.baseline,
        unclassified: out.unclassified_count,
        first_word_top: out.first_word_top.slice(0, 25),
        two_words_top: out.two_words_top.slice(0, 15),
        fp_count: out.false_positive_count,
        fp_sample: out.false_positive_candidates.slice(0, 30),
        named_sample: {
          ADES: namedChecks.ADES?.slice(0, 8),
          ALCAPARRA: namedChecks.ALCAPARRA,
          ALPINO: namedChecks.ALPINO?.slice(0, 8),
          POLPA: namedChecks.POLPA?.slice(0, 8),
          PASTILHA: namedChecks.PASTILHA?.slice(0, 8),
        },
      },
      null,
      2,
    ),
  );
}

main();
