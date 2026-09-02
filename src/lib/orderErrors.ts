const ORDER_ERROR_MESSAGES: Record<string, string> = {
  "invalid payload": "Dados do pedido incompletos. Verifique nome e endereço.",
  "privacy acknowledgment required": "Aceite a política de privacidade para continuar.",
  "invalid phone": "Telefone inválido. Informe DDD + número.",
  "invalid payment method": "Forma de pagamento inválida.",
  "rate limited": "Muitas tentativas seguidas. Aguarde um minuto e tente novamente.",
  "store not found": "Loja não encontrada.",
  "active order exists":
    "Você já possui um pedido em andamento. Aguarde a entrega antes de fazer outro pedido.",
  "empty cart": "Sua cesta está vazia. Adicione produtos antes de finalizar.",
  "invalid product": "Um produto do carrinho não está mais disponível. Remova-o e tente novamente.",
  "invalid weight": "Informe um peso válido (kg) para os itens vendidos por peso.",
  "invalid quantity": "Quantidade inválida em um dos itens.",
  "invalid delivery zone": "Bairro de entrega inválido. Selecione novamente o bairro na lista.",
  "minimum order not met": "Valor mínimo do pedido não atingido para o bairro selecionado.",
  "invalid coupon": "Cupom inválido.",
  "coupon expired": "Cupom expirado.",
  "coupon exhausted": "Cupom esgotado.",
  "orders_payment_method_check":
    "Forma de pagamento não suportada. Atualize a loja ou escolha dinheiro/cartão.",
};

export function mapOrderErrorMessage(raw: string | undefined | null): string {
  if (!raw) return "Não foi possível enviar o pedido. Tente novamente.";
  const normalized = raw.toLowerCase().trim();
  for (const [key, message] of Object.entries(ORDER_ERROR_MESSAGES)) {
    if (normalized.includes(key)) return message;
  }
  return raw;
}
