type PromoPricedProduct = {
  price: number;
  price_per_kg?: number | null;
  has_weekday_promo?: boolean | null;
  price_mon_wed?: number | null;
  price_thu_sun?: number | null;
};

function isValidPrice(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isMonToWed(day: number): boolean {
  return day >= 1 && day <= 3;
}

export function getEffectiveProductPrice(
  product: PromoPricedProduct,
  referenceDate: Date = new Date(),
): number {
  if (!product.has_weekday_promo) {
    return product.price;
  }

  const day = referenceDate.getDay(); // 0=domingo, 1=segunda ... 6=sábado
  const promoPrice = isMonToWed(day) ? product.price_mon_wed : product.price_thu_sun;

  if (isValidPrice(promoPrice)) {
    return promoPrice;
  }

  return product.price;
}

export function getEffectivePricePerKg(
  product: PromoPricedProduct,
  referenceDate: Date = new Date(),
): number {
  if (product.has_weekday_promo) {
    return getEffectiveProductPrice(product, referenceDate);
  }

  return isValidPrice(product.price_per_kg) ? product.price_per_kg : product.price;
}
