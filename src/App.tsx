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
          <Route path="/" element={<Landing />} />
          <Route path="/track" element={<OrderTracking />} />
          <Route path="/delivery" element={<Delivery />} />
          <Route path="/:slug" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route 
            path="/admin" 
            element={
              <ProtectedRoute>
                <Admin />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/basket" 
            element={
              <ProtectedRoute>
                <AdminBasket />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/coupons" 
            element={
              <ProtectedRoute>
                <AdminCoupons />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/stores" 
            element={
              <ProtectedRoute>
                <AdminStores />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/delivery-zones" 
            element={
              <ProtectedRoute>
                <AdminDeliveryZones />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/analytics" 
            element={
              <ProtectedRoute>
                <AdminAnalytics />
              </ProtectedRoute>
            } 
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
