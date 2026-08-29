export interface PrintReceiptItem {
  product_name: string;
  sold_by: "unit" | "weight";
  quantity: number;
  weight_kg?: number | null;
  price: number;
  item_notes?: string | null;
}

export interface PrintReceiptOrder {
  store_name: string;
  order_id: string;
  created_at: string;
  customer_name: string;
  phone: string;
  address: string;
  payment_method?: string | null;
  notes?: string | null;
  total: number;
  items: PrintReceiptItem[];
}

function formatMoney(value: number): string {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("pt-BR");
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`;
}

function shortOrderId(orderId: string): string {
  return orderId.split("-")[0].toUpperCase();
}

function paymentLabel(method?: string | null): string {
  switch (method) {
    case "pix":
      return "PIX na entrega";
    case "credit":
    case "card":
      return "Cartão na entrega";
    case "debit":
      return "Débito na entrega";
    case "cash":
    default:
      return "Pagamento na entrega (dinheiro)";
  }
}

export function formatOrderReceiptText(order: PrintReceiptOrder): string {
  const width = 32;
  const line = "=".repeat(width);
  const dash = "-".repeat(width);
  const center = (text: string) => {
    if (text.length >= width) return text.slice(0, width);
    const pad = Math.floor((width - text.length) / 2);
    return " ".repeat(pad) + text;
  };

  const rows: string[] = [
    line,
    center(order.store_name.toUpperCase()),
    line,
    "",
    `PEDIDO: #${shortOrderId(order.order_id)}`,
    `DATA: ${formatDateTime(order.created_at)}`,
    "",
    "CLIENTE:",
    order.customer_name,
    order.phone,
    "",
    "ENTREGA:",
    order.address,
    "",
    dash,
    "ITENS DO PEDIDO",
    dash,
  ];

  for (const item of order.items) {
    rows.push(item.product_name.toUpperCase());
    if (item.sold_by === "weight") {
      const kg =
        (item.weight_kg ?? 0) < 1
          ? `${Math.round((item.weight_kg ?? 0) * 1000)}g`
          : `${(item.weight_kg ?? 0).toFixed(2)} kg`;
      rows.push(`Quantidade: ${kg}`);
    } else {
      rows.push(`Quantidade: ${item.quantity} un`);
    }
    rows.push(`Subtotal: ${formatMoney(item.price)}`);
    if (item.item_notes?.trim()) {
      rows.push(`Obs: ${item.item_notes.trim()}`);
    }
    rows.push("");
  }

  rows.push(
    dash,
    "",
    `TOTAL: ${formatMoney(order.total)}`,
    "",
    "PAGAMENTO:",
    paymentLabel(order.payment_method),
  );

  if (order.notes?.trim()) {
    rows.push("", "OBSERVACOES DO PEDIDO:", order.notes.trim());
  }

  rows.push("", line);
  return rows.join("\n");
}
