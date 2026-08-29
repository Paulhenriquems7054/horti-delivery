import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseBrazilianPrice, formatBrazilianCurrency } from "@/lib/productImport/parseBrazilianPrice";
import {
  normalizeProductName,
  normalizeSpreadsheetHeader,
  resolveBeiraRioColumns,
  cellValueToString,
} from "@/lib/productImport/normalize";
import {
  buildWorkbookFromRows,
  parseBeiraRioSpreadsheetFile,
  validateSpreadsheetFile,
} from "@/lib/productImport/parseBeiraRioSpreadsheet";
import {
  getImportableProducts,
  validateSpreadsheetRows,
  type RawSpreadsheetRow,
} from "@/lib/productImport/validateRows";

const HEADERS = ["Código", "Código de Barras", "Produto", "Preço de Venda", "Extra"];

function makeFile(buffer: ArrayBuffer, name: string, type: string): File {
  return new File([buffer], name, { type });
}

describe("normalizeSpreadsheetHeader", () => {
  it("normaliza acentos, caixa e espaços", () => {
    expect(normalizeSpreadsheetHeader("  PREÇO DE VENDA ")).toBe("preco de venda");
    expect(normalizeSpreadsheetHeader("CODIGO DE BARRAS")).toBe("codigo de barras");
  });
});

describe("resolveBeiraRioColumns", () => {
  it("resolve cabeçalhos Beira Rio", () => {
    const result = resolveBeiraRioColumns(["CODIGO", "Codigo de barras", "PRODUTO", "Preco de Venda"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.columns.internalCode).toBe(0);
      expect(result.columns.barcode).toBe(1);
      expect(result.columns.name).toBe(2);
      expect(result.columns.price).toBe(3);
    }
  });

  it("falha quando falta coluna obrigatória", () => {
    const result = resolveBeiraRioColumns(["Código", "Produto"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missingColumns).toContain("Código de Barras");
      expect(result.missingColumns).toContain("Preço de Venda");
    }
  });
});

describe("parseBrazilianPrice", () => {
  it("parseia R$ 17,90", () => {
    expect(parseBrazilianPrice("R$ 17,90")).toEqual({ ok: true, value: "17.90", cents: 1790 });
  });

  it("parseia 17,90", () => {
    expect(parseBrazilianPrice("17,90")).toEqual({ ok: true, value: "17.90", cents: 1790 });
  });

  it("parseia 17.90", () => {
    expect(parseBrazilianPrice("17.90")).toEqual({ ok: true, value: "17.90", cents: 1790 });
  });

  it("parseia R$ 1,800.00 (milhar US com prefixo R$)", () => {
    expect(parseBrazilianPrice("R$ 1,800.00")).toEqual({ ok: true, value: "1800.00", cents: 180000 });
  });

  it("parseia R$ 1,033.40", () => {
    expect(parseBrazilianPrice("R$ 1,033.40")).toEqual({ ok: true, value: "1033.40", cents: 103340 });
  });

  it("rejeita preço inválido", () => {
    expect(parseBrazilianPrice("R$ abc").ok).toBe(false);
  });
});

describe("normalizeProductName", () => {
  it("remove espaços extras sem alterar #", () => {
    expect(normalizeProductName("  CHIA TIA SONIA 100G ")).toBe("CHIA TIA SONIA 100G");
    expect(normalizeProductName("  #AGUA  ")).toBe("#AGUA");
  });
});

describe("cellValueToString", () => {
  it("preserva zeros à esquerda via texto formatado", () => {
    expect(cellValueToString(789123456789, "0789123456789")).toBe("0789123456789");
  });

  it("converte inteiros sem notação científica", () => {
    expect(cellValueToString(12803)).toBe("12803");
  });
});

describe("validateSpreadsheetRows", () => {
  const baseRows: RawSpreadsheetRow[] = [
    {
      rowNumber: 2,
      internalCode: "12803",
      barcode: "7898115755600",
      name: "  CHIA TIA SONIA 100G ",
      priceRaw: "R$ 17,90",
    },
    {
      rowNumber: 3,
      internalCode: "18189",
      barcode: "18189",
      name: "GREGO DANONE ORIGINAL 85G",
      priceRaw: "3,25",
    },
  ];

  it("valida linhas corretamente", () => {
    const { rows, stats } = validateSpreadsheetRows(baseRows);
    expect(stats.validRows).toBe(2);
    expect(rows[0].name).toBe("CHIA TIA SONIA 100G");
    expect(rows[0].price).toBe("17.90");
  });

  it("ignora linhas vazias", () => {
    const { stats } = validateSpreadsheetRows([
      ...baseRows,
      { rowNumber: 4, internalCode: "", barcode: "", name: "", priceRaw: "" },
      { rowNumber: 5, internalCode: "   ", barcode: "", name: "", priceRaw: "" },
    ]);
    expect(stats.skippedEmptyRows).toBe(2);
    expect(stats.totalRows).toBe(2);
  });

  it("marca produto vazio como inválido", () => {
    const { rows } = validateSpreadsheetRows([
      {
        rowNumber: 10,
        internalCode: "999",
        barcode: "",
        name: "",
        priceRaw: "10,00",
      },
    ]);
    expect(rows[0].status).toBe("INVALID");
    expect(rows[0].messages.some((m) => m.includes("Produto vazio"))).toBe(true);
  });

  it("marca preço inválido", () => {
    const { rows } = validateSpreadsheetRows([
      {
        rowNumber: 57,
        internalCode: "1",
        barcode: "",
        name: "Teste",
        priceRaw: "R$ abc",
      },
    ]);
    expect(rows[0].status).toBe("INVALID");
    expect(rows[0].messages.some((m) => m.includes("Preço inválido"))).toBe(true);
  });

  it("marca conflito quando mesmo código tem dados diferentes", () => {
    const { rows, stats } = validateSpreadsheetRows([
      ...baseRows,
      {
        rowNumber: 4,
        internalCode: "12803",
        barcode: "999",
        name: "OUTRO PRODUTO",
        priceRaw: "1,00",
      },
    ]);
    expect(stats.codeConflictRows).toBe(2);
    expect(rows.filter((r) => r.status === "CODE_CONFLICT").length).toBe(2);
    expect(getImportableProducts(rows).every((p) => p.internal_code !== "12803")).toBe(true);
  });

  it("remove apenas extras de duplicata exata", () => {
    const { rows, stats } = validateSpreadsheetRows([
      {
        rowNumber: 2,
        internalCode: "12803",
        barcode: "7898115755600",
        name: "CHIA TIA SONIA 100G",
        priceRaw: "R$ 17,90",
      },
      {
        rowNumber: 3,
        internalCode: "12803",
        barcode: "7898115755600",
        name: "CHIA TIA SONIA 100G",
        priceRaw: "17,90",
      },
    ]);
    expect(stats.exactDuplicateRows).toBe(1);
    expect(stats.validRows).toBe(1);
    expect(rows[0].status).toBe("VALID");
    expect(rows[1].status).toBe("EXACT_DUPLICATE");
  });

  it("não trata barcode 0 como identidade (falso positivo)", () => {
    const { rows, stats } = validateSpreadsheetRows([
      {
        rowNumber: 2,
        internalCode: "100",
        barcode: "0",
        name: "PRODUTO A",
        priceRaw: "1,00",
      },
      {
        rowNumber: 3,
        internalCode: "200",
        barcode: "0",
        name: "PRODUTO B",
        priceRaw: "2,00",
      },
    ]);
    expect(stats.validRows).toBe(2);
    expect(stats.barcodeConflictRows).toBe(0);
    expect(rows.every((r) => r.status === "VALID")).toBe(true);
  });

  it("detecta conflito de código de barras significativo", () => {
    const { rows, stats } = validateSpreadsheetRows([
      {
        rowNumber: 2,
        internalCode: "2528",
        barcode: "7891025121626",
        name: "BEBIDA LACTEA DANONE 510G",
        priceRaw: "8,70",
      },
      {
        rowNumber: 3,
        internalCode: "17974",
        barcode: "7891025121626",
        name: "POLPA DANONE 85G",
        priceRaw: "1,45",
      },
    ]);
    expect(stats.barcodeConflictRows).toBe(2);
    expect(rows.every((r) => r.status === "BARCODE_CONFLICT")).toBe(true);
  });

  it("mesmo nome com códigos diferentes NÃO é duplicata", () => {
    const { rows, stats } = validateSpreadsheetRows([
      {
        rowNumber: 2,
        internalCode: "1",
        barcode: "111",
        name: "LEITE INTEGRAL 1L",
        priceRaw: "5,00",
      },
      {
        rowNumber: 3,
        internalCode: "2",
        barcode: "222",
        name: "LEITE INTEGRAL 1L",
        priceRaw: "5,50",
      },
    ]);
    expect(stats.validRows).toBe(2);
    expect(rows.every((r) => r.status === "VALID")).toBe(true);
  });

  it("detecta duplicidade com produtos existentes por código", () => {
    const { rows } = validateSpreadsheetRows(baseRows, {
      internalCodes: new Set(["12803"]),
      barcodes: new Set(),
      namesLower: new Set(),
    });
    expect(rows[0].status).toBe("DUPLICATE_EXISTING");
  });

  it("nome existente na loja não bloqueia se códigos diferem", () => {
    const { rows } = validateSpreadsheetRows(baseRows, {
      internalCodes: new Set(),
      barcodes: new Set(),
      namesLower: new Set(["chia tia sonia 100g"]),
    });
    expect(rows[0].status).toBe("VALID");
    expect(rows[0].messages.some((m) => m.includes("Aviso"))).toBe(true);
  });

  it("retorna produtos importáveis apenas das linhas válidas", () => {
    const { rows } = validateSpreadsheetRows(baseRows);
    const importable = getImportableProducts(rows);
    expect(importable).toHaveLength(2);
    expect(importable[0].internal_code).toBe("12803");
  });
});

describe("parseBeiraRioSpreadsheetFile", () => {
  it("parseia arquivo xlsx válido", async () => {
    const buffer = buildWorkbookFromRows(HEADERS, [
      ["12803", "7898115755600", "CHIA TIA SONIA 100G", "R$ 17,90", ""],
      ["18189", "18189", "GREGO DANONE ORIGINAL 85G", "3,25", ""],
    ]);
    const file = makeFile(
      buffer,
      "catalogo.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    const result = await parseBeiraRioSpreadsheetFile(file);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.stats.validRows).toBe(2);
      expect(result.rows[0].barcode).toBe("7898115755600");
    }
  });

  it("parseia arquivo xls", async () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      HEADERS,
      ["12803", "0789123456789", "PRODUTO TESTE", "17,90", ""],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Produtos");
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xls" }) as ArrayBuffer;
    const file = makeFile(buffer, "catalogo.xls", "application/vnd.ms-excel");

    const result = await parseBeiraRioSpreadsheetFile(file);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows[0].barcode).toBe("0789123456789");
    }
  });

  it("falha quando cabeçalho obrigatório está ausente", async () => {
    const buffer = buildWorkbookFromRows(["Código", "Produto"], [["1", "Teste"]]);
    const file = makeFile(buffer, "invalido.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const result = await parseBeiraRioSpreadsheetFile(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missingColumns?.length).toBeGreaterThan(0);
    }
  });

  it("rejeita extensão inválida", () => {
    const file = makeFile(new ArrayBuffer(8), "dados.csv", "text/csv");
    expect(validateSpreadsheetFile(file)).toMatch(/Formato não suportado/);
  });
});

describe("formatBrazilianCurrency", () => {
  it("formata valor numérico", () => {
    expect(formatBrazilianCurrency("17.90")).toContain("17,90");
  });
});
