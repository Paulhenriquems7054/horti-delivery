export interface StoreHoursConfig {
  timezone: string;
  deliveryWeekdays: number[];
  deliveryStartTime: string;
  deliveryEndTime: string;
  deliveryHoursMessage?: string | null;
  outsideHoursMessage?: string | null;
}

const DEFAULT_CONFIG: StoreHoursConfig = {
  timezone: "America/Aracaju",
  deliveryWeekdays: [1, 2, 3, 4, 5, 6],
  deliveryStartTime: "08:00",
  deliveryEndTime: "17:00",
  deliveryHoursMessage: "Horário de entregas: segunda a sábado, das 08:00 às 17:00.",
  outsideHoursMessage:
    "No momento estamos fora do horário de entregas. Os pedidos podem ser registrados e serão atendidos conforme disponibilidade no próximo período de funcionamento.",
};

export function mergeStoreHoursConfig(
  partial?: Partial<StoreHoursConfig> | null
): StoreHoursConfig {
  if (!partial) return { ...DEFAULT_CONFIG };
  return {
    timezone: partial.timezone ?? DEFAULT_CONFIG.timezone,
    deliveryWeekdays: partial.deliveryWeekdays?.length
      ? partial.deliveryWeekdays
      : DEFAULT_CONFIG.deliveryWeekdays,
    deliveryStartTime: partial.deliveryStartTime ?? DEFAULT_CONFIG.deliveryStartTime,
    deliveryEndTime: partial.deliveryEndTime ?? DEFAULT_CONFIG.deliveryEndTime,
    deliveryHoursMessage:
      partial.deliveryHoursMessage ?? DEFAULT_CONFIG.deliveryHoursMessage,
    outsideHoursMessage:
      partial.outsideHoursMessage ?? DEFAULT_CONFIG.outsideHoursMessage,
  };
}

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

function safeTimezone(timezone: string): string {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return timezone;
  } catch {
    return "America/Sao_Paulo";
  }
}

/** ISO weekday: Monday=1 … Sunday=7 */
function getIsoWeekdayInTimezone(date: Date, timezone: string): number {
  const tz = safeTimezone(timezone);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  }).format(date);
  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return map[weekday] ?? 7;
}

function getMinutesInTimezone(date: Date, timezone: string): number {
  const tz = safeTimezone(timezone);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

export function isWithinDeliveryHours(
  config: StoreHoursConfig,
  now: Date = new Date()
): boolean {
  const weekday = getIsoWeekdayInTimezone(now, config.timezone);
  if (!config.deliveryWeekdays.includes(weekday)) return false;
  const minutes = getMinutesInTimezone(now, config.timezone);
  const start = parseTimeToMinutes(config.deliveryStartTime);
  const end = parseTimeToMinutes(config.deliveryEndTime);
  return minutes >= start && minutes < end;
}
