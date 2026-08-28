const TRACK_PHONE_PREFIX = "horti_track_phone_";
const LAST_PHONE_KEY = "horti_last_order_phone";
const CUSTOMER_NAME_KEY = "horti_customer_name";
const CHECKOUT_ADDRESS_KEY = "horti_checkout_address";

export type CheckoutAddress = {
  street: string;
  number: string;
  neighborhood: string;
  reference: string;
  zone: string;
};

export function saveTrackingPhone(orderId: string, phone: string) {
  try {
    sessionStorage.setItem(`${TRACK_PHONE_PREFIX}${orderId}`, phone.replace(/\D/g, ""));
  } catch {
    /* ignore */
  }
}

export function getTrackingPhone(orderId: string): string {
  try {
    return sessionStorage.getItem(`${TRACK_PHONE_PREFIX}${orderId}`) ?? "";
  } catch {
    return "";
  }
}

export function saveLastOrderPhone(phone: string) {
  try {
    localStorage.setItem(LAST_PHONE_KEY, phone.replace(/\D/g, ""));
  } catch {
    /* ignore */
  }
}

export function getLastOrderPhone(): string {
  try {
    return localStorage.getItem(LAST_PHONE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveCustomerName(name: string) {
  try {
    localStorage.setItem(CUSTOMER_NAME_KEY, name.trim());
  } catch {
    /* ignore */
  }
}

export function getCustomerName(): string {
  try {
    return localStorage.getItem(CUSTOMER_NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveCheckoutAddress(addr: CheckoutAddress) {
  try {
    sessionStorage.setItem(CHECKOUT_ADDRESS_KEY, JSON.stringify(addr));
  } catch {
    /* ignore */
  }
}

export function getCheckoutAddress(): CheckoutAddress | null {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_ADDRESS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CheckoutAddress;
  } catch {
    return null;
  }
}

export function clearLegacyCustomerProfile() {
  try {
    localStorage.removeItem("horti_customer_profile");
  } catch {
    /* ignore */
  }
}
