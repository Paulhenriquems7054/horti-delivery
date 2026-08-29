import * as fs from "fs";
import * as XLSX from "xlsx";
import { classifyProductName } from "../src/lib/productCategory/classifyProduct.ts";

const buf = fs.readFileSync("Lista de Produtos/RELAÇÃO DE PRODUTOS - BEIRA RIO.xlsx");
const wb = XLSX.read(buf, { type: "buffer" });
const sheet = wb.Sheets[wb.SheetNames[0]!];
const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: "" });
const counts = { CLASSIFIED: 0, REVIEW_REQUIRED: 0, UNCLASSIFIED: 0 };
const byCat: Record<string, number> = {};
for (let i = 1; i < matrix.length; i++) {
  const name = String(matrix[i]?.[2] ?? "").trim();
  if (!name) continue;
  const r = classifyProductName(name);
  counts[r.status]++;
  if (r.categoryName) byCat[r.categoryName] = (byCat[r.categoryName] || 0) + 1;
}
console.log(JSON.stringify({ total: counts.CLASSIFIED + counts.REVIEW_REQUIRED + counts.UNCLASSIFIED, counts, byCat }, null, 2));
