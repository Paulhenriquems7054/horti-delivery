import { supabase } from "@/integrations/supabase/client";

export async function logAuditEvent(
  action: "login" | "logout",
  storeId?: string,
  metadata?: Record<string, unknown>
) {
  try {
    await supabase.rpc("log_audit_event", {
      p_store_id: storeId ?? null,
      p_action: action,
      p_metadata: metadata ?? null,
    });
  } catch {
    // Silently fail — audit log should never break the app
  }
}
