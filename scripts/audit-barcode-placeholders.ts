import * as fs from "node:fs";
import * as XLSX from "xlsx";
import { cellValueToString, normalizeIdentifier } from "../src/lib/productImport/normalize.ts";
import { isMeaningfulBarcode } from "../src/lib/productImport/dedupe.ts";

const buf = fs.readFileSync("Lista de Produtos/RELAÇÃO DE PRODUTOS - BEIRA RIO.xlsx");
const wb = XLSX.read(buf, { type: "buffer" });
const sheet = wb.Sheets[wb.SheetNames[0]!]!;
const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: "", raw: true });

const get = (r: number, c: number) => {
  const cell = sheet[XLSX.utils.encode_cell({ r, c })];
  return cell ? cellValueToString(cell.v, cell.w) : "";
};

let barcode0 = 0;
let barcodeEmpty = 0;
let meaningfulBcDupRows = 0;
const codes = new Map<string, number[]>();
const barcodes = new Map<string, number[]>();

for (let i = 1; i < matrix.length; i++) {
  const code = normalizeIdentifier(get(i, 0));
  const bc = normalizeIdentifier(get(i, 1));
  if (!bc) barcodeEmpty += 1;
  if (bc === "0") barcode0 += 1;
  if (code) {
    const a = codes.get(code) ?? [];
    a.push(i + 1);
    codes.set(code, a);
  }
  if (isMeaningfulBarcode(bc)) {
    const a = barcodes.get(bc) ?? [];
    a.push(i + 1);
    barcodes.set(bc, a);
  }
}

const multiCodes = [...codes.entries()].filter(([, a]) => a.length > 1);
const multiBc = [...barcodes.entries()].filter(([, a]) => a.length > 1);
for (const [, a] of multiBc) meaningfulBcDupRows += a.length;

console.log(
  JSON.stringify(
    {
      barcode0,
      barcodeEmpty,
      multiCodeGroups: multiCodes.length,
      multiMeaningfulBarcodeGroups: multiBc.length,
      meaningfulBcDupRows,
      topBarcodes: multiBc
        .map(([b, a]) => ({ b, n: a.length }))
        .sort((x, y) => y.n - x.n)
        .slice(0, 10),
    },
    null,
    2,
  ),
);
