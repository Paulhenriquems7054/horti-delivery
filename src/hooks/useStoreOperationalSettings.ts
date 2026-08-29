import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { mergeStoreHoursConfig, type StoreHoursConfig } from "@/lib/storeHours";

export interface StoreOperationalSettings extends StoreHoursConfig {
  return_policy_text?: string | null;
}

function parseSettings(data: Record<string, unknown> | null): StoreOperationalSettings | null {
  if (!data) return null;
  const weekdays = Array.isArray(data.delivery_weekdays)
    ? (data.delivery_weekdays as number[])
    : undefined;
  const base = mergeStoreHoursConfig({
    timezone: String(data.timezone ?? "America/Aracaju"),
    deliveryWeekdays: weekdays,
    deliveryStartTime: String(data.delivery_start_time ?? "08:00"),
    deliveryEndTime: String(data.delivery_end_time ?? "17:00"),
    deliveryHoursMessage: (data.delivery_hours_message as string | null) ?? undefined,
    outsideHoursMessage: (data.outside_hours_message as string | null) ?? undefined,
  });
  return {
    ...base,
    return_policy_text: (data.return_policy_text as string | null) ?? null,
  };
}

export function useStoreOperationalSettings(storeSlug: string | undefined) {
  return useQuery({
    queryKey: ["store-operational-settings", storeSlug],
    queryFn: async () => {
      if (!storeSlug) return null;
      const { data, error } = await supabase.rpc("get_store_operational_settings", {
        p_store_slug: storeSlug,
      });
      if (error) throw error;
      return parseSettings(data as Record<string, unknown>);
    },
    enabled: !!storeSlug,
    staleTime: 60_000,
  });
}
