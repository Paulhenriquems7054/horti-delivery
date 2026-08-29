// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import { parseBeiraRioSpreadsheetFile } from "@/lib/productImport/parseBeiraRioSpreadsheet";

const REAL_FILE = "Lista de Produtos/RELAÇÃO DE PRODUTOS - BEIRA RIO.xlsx";

describe("planilha real Beira Rio", () => {
  it("parseia RELAÇÃO DE PRODUTOS - BEIRA RIO.xlsx", async () => {
    if (!fs.existsSync(REAL_FILE)) return;

    const buffer = fs.readFileSync(REAL_FILE);
    const file = new File([buffer], "RELAÇÃO DE PRODUTOS - BEIRA RIO.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const result = await parseBeiraRioSpreadsheetFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.stats.totalRows).toBe(19270);
    expect(result.stats.validRows).toBe(18628);
    expect(result.stats.invalidRows).toBe(0);
    expect(result.stats.duplicateRows).toBe(642);

    const chia = result.rows.find((row) => row.internalCode === "12803");
    expect(chia?.name).toBe("CHIA TIA SONIA 100G");
    expect(chia?.barcode).toBe("7898115755600");
    expect(chia?.price).toBe("17.90");

    const grego = result.rows.find((row) => row.internalCode === "18189");
    expect(grego?.name).toBe("GREGO DANONE ORIGINAL 85G");
    expect(grego?.price).toBe("3.25");
  }, 60_000);
});
