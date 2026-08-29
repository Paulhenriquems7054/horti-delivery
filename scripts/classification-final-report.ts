/**
 * Relatório final + grupos para revisão manual assistida.
 * Não altera Hosted nem o XLSX original.
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
import { annotateSpreadsheetDuplicates } from "../src/lib/productImport/dedupe.ts";
import {
  CATALOG_CATEGORY_NAMES,
  classifyProductName,
  LAYER0_RULES,
  LAYER1_RULES,
  normalizeForClassification,
  type CatalogCategoryName,
} from "../src/lib/productCategory/classifyProduct.ts";

const FILE = path.join("Lista de Produtos", "RELAÇÃO DE PRODUTOS - BEIRA RIO.xlsx");

const NEW_RULE_IDS = [
  "higiene_prestobarba",
  "mercearia_sopao",
  "utilidades_tigela",
  "utilidades_bola_brinquedo",
  "limpeza_bom_ar",
  "higiene_tesoura_unha",
  "higiene_tesoura_cabeleireiro",
  "utilidades_tesoura_contexto",
] as const;

function loadReady() {
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
  return rows.filter((r) => {
    const a = annotations.get(r.rowNumber);
    return a?.kind === "PRODUTO_UNICO" && a.keepForImport && r.price != null && r.name;
  });
}

function suggestForGroup(prefix: string, examples: string[]): {
  suggestion: CatalogCategoryName | null;
  confidence: "alta" | "media" | "baixa" | "nenhuma";
  note: string;
} {
  const n = examples.map((e) => normalizeForClassification(e));
  if (n.every((x) => /SH|CONDIC|HIDRAT|SABONETE|CREME|MASC|DESOD|ESM/.test(x))) {
    return { suggestion: "Higiene Pessoal", confidence: "media", note: "padrão cosmético/higiene" };
  }
  if (n.every((x) => /DETERG|LIMP|DESINF|AMAC|INSET/.test(x))) {
    return { suggestion: "Limpeza", confidence: "media", note: "padrão limpeza" };
  }
  if (prefix.length <= 2) {
    return { suggestion: null, confidence: "nenhuma", note: "abreviação insuficiente" };
  }
  return { suggestion: null, confidence: "baixa", note: "requer decisão manual / comercial" };
}

function main() {
  const ready = loadReady();
  const counts = { CLASSIFIED: 0, REVIEW_REQUIRED: 0, UNCLASSIFIED: 0 };
  const byCat: Record<string, number> = Object.fromEntries(
    CATALOG_CATEGORY_NAMES.map((c) => [c, 0]),
  );
  const ruleHits: Record<string, string[]> = {};
  const remaining: string[] = [];

  for (const r of ready) {
    const c = classifyProductName(r.name);
    counts[c.status] += 1;
    if (c.status === "CLASSIFIED" && c.categoryName) {
      byCat[c.categoryName] = (byCat[c.categoryName] ?? 0) + 1;
    } else {
      remaining.push(r.name);
    }
    const m = c.reason.match(/L[01]\[([^\]]+)\]/);
    if (m && (NEW_RULE_IDS as readonly string[]).includes(m[1]!)) {
      if (!ruleHits[m[1]!]) ruleHits[m[1]!] = [];
      ruleHits[m[1]!]!.push(r.name);
    }
  }

  // impacto por regra nova
  const newRulesImpact = NEW_RULE_IDS.map((id) => {
    const rule =
      LAYER1_RULES.find((r) => r.id === id) ?? LAYER0_RULES.find((r) => r.id === id);
    const products = ruleHits[id] ?? [];
    return {
      id,
      category: rule?.category,
      reason: rule?.reason,
      count: products.length,
      examples: products.slice(0, 10),
      all: products,
    };
  });

  // grupos para revisão assistida
  const groups = new Map<string, string[]>();
  for (const name of remaining) {
    const prefix = normalizeForClassification(name).split(" ")[0] || "?";
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix)!.push(name);
  }

  const reviewGroups = [...groups.entries()]
    .map(([prefix, products]) => {
      const sug = suggestForGroup(prefix, products);
      return {
        group_key: prefix,
        quantity: products.length,
        products: products.slice(0, 40),
        products_total: products.length,
        suggestion: sug.suggestion,
        confidence: sug.confidence,
        note: sug.note,
        action_placeholder: ["Aprovar grupo", "Escolher outra categoria", "Revisar individualmente"],
      };
    })
    .sort((a, b) => b.quantity - a.quantity);

  const sum =
    Object.values(byCat).reduce((a, b) => a + b, 0) +
    counts.REVIEW_REQUIRED +
    counts.UNCLASSIFIED;

  const report = {
    previous: { CLASSIFIED: 15888, REVIEW_REQUIRED: 8, UNCLASSIFIED: 3372 },
    ready: ready.length,
    counts,
    gain_classified: counts.CLASSIFIED - 15888,
    byCat,
    sum_check: sum,
    new_rules_impact: newRulesImpact.map(({ all: _a, ...rest }) => rest),
    remaining_total: remaining.length,
    remaining_top_groups: reviewGroups.slice(0, 40).map((g) => ({
      group_key: g.group_key,
      quantity: g.quantity,
      examples: g.products.slice(0, 6),
      suggestion: g.suggestion,
      confidence: g.confidence,
      note: g.note,
    })),
    candidates_manual_only: reviewGroups
      .filter((g) => g.quantity >= 8)
      .slice(0, 25)
      .map((g) => ({
        group: g.group_key,
        quantity: g.quantity,
        examples: g.products.slice(0, 5),
        why: "ambíguo / descrição insuficiente / decisão comercial — não forçar regra automática",
      })),
  };

  fs.writeFileSync(
    path.join("scripts", "classification-final-report.json"),
    JSON.stringify(report, null, 2),
    "utf8",
  );
  fs.writeFileSync(
    path.join("scripts", "manual-review-groups.json"),
    JSON.stringify(
      {
        total_remaining: remaining.length,
        groups: reviewGroups.slice(0, 120),
        instructions:
          "Revisão manual assistida: decidir por grupo quando semanticamente homogêneo; caso contrário revisar individualmente.",
      },
      null,
      2,
    ),
    "utf8",
  );
  fs.writeFileSync(
    path.join("scripts", "classification-remaining-groups.json"),
    JSON.stringify(
      reviewGroups.slice(0, 80).map((g) => ({
        prefix: g.group_key,
        count: g.quantity,
        examples: g.products.slice(0, 8),
      })),
      null,
      2,
    ),
    "utf8",
  );

  // auditoria completa dos afetados por regra (todos os nomes)
  fs.writeFileSync(
    path.join("scripts", "low-risk-rules-audit.json"),
    JSON.stringify(
      Object.fromEntries(
        newRulesImpact.map((r) => [
          r.id,
          { category: r.category, count: r.count, products: r.all },
        ]),
      ),
      null,
      2,
    ),
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        counts: report.counts,
        gain: report.gain_classified,
        byCat: report.byCat,
        sum_check: report.sum_check,
        new_rules: report.new_rules_impact,
        top_remaining: report.remaining_top_groups.slice(0, 15),
      },
      null,
      2,
    ),
  );
}

main();
