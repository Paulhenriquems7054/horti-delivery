export type PriceParseResult =
  | { ok: true; value: string; cents: number }
  | { ok: false; error: string };

/**
 * Converte preços no formato brasileiro/comercial para decimal string (NUMERIC).
 * Ex.: "R$ 17,90" → "17.90", "17,90" → "17.90", "17.90" → "17.90"
 */
export function parseBrazilianPrice(input: string): PriceParseResult {
  const original = input;
  let s = input
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();

  if (!s) {
    return { ok: false, error: "Preço vazio" };
  }

  s = s.replace(/^R\$\s*/i, "").trim();
  s = s.replace(/\s/g, "");

  // R$ 1,800.00 ou 1,033.40 (vírgula milhar + ponto decimal)
  if (/^\d{1,3}(,\d{3})+\.\d{1,2}$/.test(s)) {
    s = s.replace(/,/g, "");
  } else if (/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+,\d{1,2}$/.test(s)) {
    s = s.replace(",", ".");
  } else if (/^\d+\.\d{1,2}$/.test(s)) {
    // decimal com ponto
  } else if (/^\d+$/.test(s)) {
    s = `${s}.00`;
  } else {
    return { ok: false, error: `Preço inválido: "${original}"` };
  }

  const parts = s.split(".");
  if (parts.length !== 2 || parts[1].length === 0 || parts[1].length > 2) {
    return { ok: false, error: `Preço inválido: "${original}"` };
  }

  const num = Number(s);
  if (!Number.isFinite(num) || num < 0) {
    return { ok: false, error: `Preço inválido: "${original}"` };
  }

  const normalized = num.toFixed(2);
  const cents = Math.round(num * 100);

  return { ok: true, value: normalized, cents };
}

export function formatBrazilianCurrency(value: string | number): string {
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return String(value);
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
