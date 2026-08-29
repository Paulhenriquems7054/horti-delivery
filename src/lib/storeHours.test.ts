import { describe, expect, it } from "vitest";
import { isWithinDeliveryHours, mergeStoreHoursConfig } from "@/lib/storeHours";

const base = mergeStoreHoursConfig({
  timezone: "America/Aracaju",
  deliveryWeekdays: [1, 2, 3, 4, 5, 6],
  deliveryStartTime: "08:00",
  deliveryEndTime: "17:00",
});

describe("storeHours", () => {
  it("segunda dentro do horário (10:00 Aracaju)", () => {
    const monday = new Date("2026-09-07T13:00:00.000Z");
    expect(isWithinDeliveryHours(base, monday)).toBe(true);
  });

  it("segunda antes das 08:00", () => {
    const early = new Date("2026-09-07T10:30:00.000Z");
    expect(isWithinDeliveryHours(base, early)).toBe(false);
  });

  it("segunda após 17:00", () => {
    const late = new Date("2026-09-07T21:00:00.000Z");
    expect(isWithinDeliveryHours(base, late)).toBe(false);
  });

  it("domingo fora do horário", () => {
    const sunday = new Date("2026-09-06T15:00:00.000Z");
    expect(isWithinDeliveryHours(base, sunday)).toBe(false);
  });
});
