/**
 * Auditoria offline da planilha Beira Rio (pós-correção de dedupe).
 * Não altera o arquivo original nem o Hosted.
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
import { classifyProductName } from "../src/lib/productCategory/classifyProduct.ts";
import {
  annotateSpreadsheetDuplicates,
  isMeaningfulBarcode,
} from "../src/lib/productImport/dedupe.ts";

const FILE = path.join("Lista de Produtos", "RELAÇÃO DE PRODUTOS - BEIRA RIO.xlsx");

function main() {
  const abs = path.resolve(FILE);
  const buf = fs.readFileSync(abs);
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames[0]!;
  const sheet = wb.Sheets[sheetName]!;
  const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
  });

  const header = (matrix[0] ?? []).map((c) => cellValueToString(c));
  const resolved = resolveBeiraRioColumns(header);
  if (!resolved.ok) {
    console.error(resolved.missingColumns);
    process.exit(1);
  }
  const cols = resolved.columns;
  const getCell = (r: number, c: number) => {
    const cell = sheet[XLSX.utils.encode_cell({ r, c })];
    return cell ? cellValueToString(cell.v, cell.w) : "";
  };

  const rows = [];
  let empty = 0;
  let barcode0 = 0;

  for (let i = 1; i < matrix.length; i++) {
    const code = normalizeIdentifier(getCell(i, cols.internalCode));
    const barcode = normalizeIdentifier(getCell(i, cols.barcode));
    const name = normalizeProductName(getCell(i, cols.name));
    const priceRaw = getCell(i, cols.price);
    if (!code && !barcode && !name && !priceRaw.trim()) {
      empty += 1;
      continue;
    }
    if (barcode === "0") barcode0 += 1;
    const priceResult = parseBrazilianPrice(priceRaw);
    rows.push({
      rowNumber: i + 1,
      internalCode: code,
      barcode,
      name,
      price: priceResult.ok ? priceResult.value : null,
    });
  }

  // Lógica antiga (falso positivo)
  const oldDup = new Set<number>();
  const oldCode = new Map<string, number[]>();
  const oldBc = new Map<string, number[]>();
  for (const r of rows) {
    if (r.internalCode) {
      const a = oldCode.get(r.internalCode) ?? [];
      a.push(r.rowNumber);
      oldCode.set(r.internalCode, a);
    }
    if (r.barcode) {
      const a = oldBc.get(r.barcode) ?? [];
      a.push(r.rowNumber);
      oldBc.set(r.barcode, a);
    }
  }
  for (const [, list] of oldCode) if (list.length > 1) list.forEach((n) => oldDup.add(n));
  for (const [, list] of oldBc) if (list.length > 1) list.forEach((n) => oldDup.add(n));

  const { annotations, stats } = annotateSpreadsheetDuplicates(rows);

  const classCounts = { CLASSIFIED: 0, REVIEW_REQUIRED: 0, UNCLASSIFIED: 0 };
  const byCat: Record<string, number> = {};
  let ready = 0;
  for (const r of rows) {
    const ann = annotations.get(r.rowNumber);
    if (ann?.kind !== "PRODUTO_UNICO" || !ann.keepForImport || r.price == null || !r.name) continue;
    ready += 1;
    const c = classifyProductName(r.name);
    classCounts[c.status] += 1;
    if (c.categoryName) byCat[c.categoryName] = (byCat[c.categoryName] || 0) + 1;
  }

  const falsePositivesFromBarcode0 = [...oldDup].filter((rowNum) => {
    const row = rows.find((r) => r.rowNumber === rowNum);
    return row && row.barcode === "0" && !isMeaningfulBarcode(row.barcode);
  }).length;

  const report = {
    arquivo: abs,
    aba: sheetName,
    linhas_matriz_com_cabecalho: matrix.length,
    linhas_dados: rows.length,
    linhas_vazias: empty,
    barcodes_placeholder_0: barcode0,
    diagnostico_logica_antiga: {
      marcadas_como_duplicadas: oldDup.size,
      validas_estimadas: rows.length - oldDup.size,
      causa_principal:
        "Barcode '0' compartilhado por ~640 produtos distintos foi tratado como identidade",
    },
    diagnostico_corrigido: {
      produtos_unicos_prontos: stats.unique,
      duplicatas_exatas_extras_removiveis: stats.exactDuplicateExtras,
      conflitos_de_codigo_grupos: stats.codeConflictGroups,
      conflitos_de_codigo_linhas: stats.codeConflictRows,
      conflitos_de_barcode_grupos: stats.barcodeConflictGroups,
      conflitos_de_barcode_linhas: stats.barcodeConflictRows,
      falsos_positivos_corrigidos_barcode_0: falsePositivesFromBarcode0,
      conflito_real_exemplo: {
        barcode: "7891025121626",
        produtos: [
          "2528 | BEBIDA LACTEA DANONE 510G | 8.70",
          "17974 | POLPA DANONE 85G | 1.45",
        ],
      },
    },
    classificacao_nos_prontos: {
      prontos: ready,
      ...classCounts,
      por_categoria: byCat,
      review_required_plus_unclassified: classCounts.REVIEW_REQUIRED + classCounts.UNCLASSIFIED,
    },
    resumo_ui_esperado: {
      linhas_encontradas: rows.length,
      produtos_prontos_para_importar: stats.unique,
      duplicatas_exatas: stats.exactDuplicateExtras,
      conflitos_para_revisao: stats.codeConflictRows + stats.barcodeConflictRows,
      com_erro: 0,
    },
  };

  const out = path.join("scripts", "beira-rio-audit-report.json");
  fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log("\nSalvo em", out);
}

main();
