/**
 * TenantContext — Central multi-tenant context
 *
 * Provides the current store (tenant) to all components.
 * Admin: resolved from auth.uid() → stores.user_id ou store_members
 * Customer: resolved from URL slug → stores.slug
 *
 * All hooks should consume this context instead of resolving
 * the store independently.
 */
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyStore } from "@/lib/resolveMyStore";
import { StoreUnavailable } from "@/components/StoreUnavailable";

export interface TenantStore {
  id: string;
  slug: string;
  name: string;
  logo_path?: string | null;
  subscription_status?: string;
  active?: boolean;
}

interface TenantContextValue {
  store: TenantStore | null;
  isLoading: boolean;
  /** Reload the tenant context (e.g. after store update) */
  refresh: () => void;
}

const TenantContext = createContext<TenantContextValue>({
  store: null,
  isLoading: true,
  refresh: () => {},
});

/**
 * AdminTenantProvider — resolves tenant from authenticated user
 * Use inside ProtectedRoute wrappers
 */
export function AdminTenantProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<TenantStore | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) { setIsLoading(false); return; }

      try {
        const data = await fetchMyStore();
        if (!cancelled) {
          setStore(data ?? null);
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) {
          setStore(null);
          setIsLoading(false);
        }
      }
    };

    resolve();
    return () => { cancelled = true; };
  }, [tick]);

  if (!isLoading && store && isStorePubliclyBlocked(store)) {
    return <StoreUnavailable storeName={store.name} />;
  }

  return (
    <TenantContext.Provider value={{ store, isLoading, refresh: () => setTick(t => t + 1) }}>
      {children}
    </TenantContext.Provider>
  );
}

/**
 * CustomerTenantProvider — resolves tenant from URL slug
 * Use in public store pages
 */
export function CustomerTenantProvider({
  slug,
  children,
}: {
  slug: string | undefined;
  children: ReactNode;
}) {
  const [store, setStore] = useState<TenantStore | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!slug) { setIsLoading(false); return; }
    let cancelled = false;

    (supabase as any)
      .from("stores_public")
      .select("id, slug, name, logo_path, subscription_status, active")
      .eq("slug", slug)
      .maybeSingle()
      .then(({ data }: any) => {
        if (!cancelled) {
          setStore(data ?? null);
          setIsLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [slug]);

  return (
    <TenantContext.Provider value={{ store, isLoading, refresh: () => {} }}>
      {children}
    </TenantContext.Provider>
  );
}

/** Hook to consume tenant context */
export function useTenant() {
  return useContext(TenantContext);
}

/** Returns the current store_id or throws if not in tenant context */
export function useStoreId(): string {
  const { store } = useContext(TenantContext);
  if (!store?.id) throw new Error("useStoreId called outside TenantContext");
  return store.id;
}
