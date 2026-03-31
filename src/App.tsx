import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index";
import Landing from "./pages/Landing";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import AdminBasket from "./pages/AdminBasket";
import AdminCoupons from "./pages/AdminCoupons";
import AdminStores from "./pages/AdminStores";
import AdminDeliveryZones from "./pages/AdminDeliveryZones";
import AdminAnalytics from "./pages/AdminAnalytics";
import OrderTracking from "./pages/OrderTracking";
import Delivery from "./pages/Delivery";
import AdminDirectDelivery from "./pages/AdminDirectDelivery";
import DirectDeliveryTracking from "./pages/DirectDeliveryTracking";
import { ProtectedRoute } from "./components/ProtectedRoute";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster position="top-center" richColors />
      <BrowserRouter>
        <Routes>
          {/* ── Públicas ── */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/track" element={<OrderTracking />} />
          <Route path="/delivery-tracking" element={<DirectDeliveryTracking />} />
          <Route path="/delivery" element={<Delivery />} />
          <Route path="/delivery/:slug" element={<Delivery />} />

          {/* ── Admin (protegidas) ── */}
          <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
          <Route path="/admin/basket" element={<ProtectedRoute><AdminBasket /></ProtectedRoute>} />
          <Route path="/admin/coupons" element={<ProtectedRoute><AdminCoupons /></ProtectedRoute>} />
          <Route path="/admin/stores" element={<ProtectedRoute><AdminStores /></ProtectedRoute>} />
          <Route path="/admin/delivery-zones" element={<ProtectedRoute><AdminDeliveryZones /></ProtectedRoute>} />
          <Route path="/admin/analytics" element={<ProtectedRoute><AdminAnalytics /></ProtectedRoute>} />
          <Route path="/admin/direct-delivery" element={<ProtectedRoute><AdminDirectDelivery /></ProtectedRoute>} />

          {/* ── Entregador por loja ── */}
          <Route path="/:slug/delivery" element={<Delivery />} />

          {/* ── Loja do cliente — última rota dinâmica ── */}
          <Route path="/:slug" element={<Index />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
