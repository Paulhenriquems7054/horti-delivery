import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

type Gate = "loading" | "anon" | "denied" | "ok";

export function PlatformProtectedRoute({ children }: { children: React.ReactNode }) {
  const [gate, setGate] = useState<Gate>("loading");

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (!cancelled) setGate("anon");
        return;
      }
      const { data, error } = await supabase.rpc("is_platform_admin" as never);
      if (cancelled) return;
      if (error || data !== true) setGate("denied");
      else setGate("ok");
    };

    run();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      run();
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  if (gate === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
      </div>
    );
  }
  if (gate === "anon") {
    return <Navigate to="/login?next=/superadmin" replace />;
  }
  if (gate === "denied") {
    return <Navigate to="/acesso-negado" replace />;
  }
  return <>{children}</>;
}
