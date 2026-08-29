import * as fs from "fs";
import * as XLSX from "xlsx";
import { resolveBeiraRioColumns, cellValueToString } from "../src/lib/productImport/normalize.ts";
import { validateSpreadsheetRows } from "../src/lib/productImport/validateRows.ts";
import { parseBrazilianPrice } from "../src/lib/productImport/parseBrazilianPrice.ts";

const filePath = "Lista de Produtos/RELAÇÃO DE PRODUTOS - BEIRA RIO.xlsx";
const buf = fs.readFileSync(filePath);
const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
const sheet = wb.Sheets[wb.SheetNames[0]!];
const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
  header: 1,
  defval: "",
  raw: true,
});

const headerRow = matrix[0]!.map((cell) => cellValueToString(cell));
const resolved = resolveBeiraRioColumns(headerRow);
if (!resolved.ok) {
  console.error("FAIL headers", resolved.missingColumns);
  process.exit(1);
}

const { columns } = resolved;

function getCell(row: number, col: number): string {
  const addr = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = sheet[addr];
  if (!cell) return "";
  return cellValueToString(cell.v, cell.w);
}

const rawRows = [];
for (let i = 1; i < matrix.length; i += 1) {
  rawRows.push({
    rowNumber: i + 1,
    internalCode: getCell(i, columns.internalCode),
    barcode: getCell(i, columns.barcode),
    name: getCell(i, columns.name),
    priceRaw: getCell(i, columns.price),
  });
}

const { rows, stats } = validateSpreadsheetRows(rawRows);
const expected = {
  stats,
  validSample: rows.filter((r) => r.status === "VALID").slice(0, 5),
  invalidSample: rows.filter((r) => r.status === "INVALID"),
};
console.log(JSON.stringify(expected, null, 2));
if (stats.totalRows !== 19270 || stats.validRows !== 18628 || stats.invalidRows !== 0) {
  process.exitCode = 1;
}
