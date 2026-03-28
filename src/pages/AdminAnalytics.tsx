import { useRealtimeOrders } from "@/hooks/useOrders";
import { useProducts } from "@/hooks/useProducts";
import { ArrowLeft, TrendingUp, Package, DollarSign, ShoppingCart, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useMemo } from "react";

export default function AdminAnalytics() {
  const navigate = useNavigate();
  const { orders } = useRealtimeOrders();
  const { data: products } = useProducts();

  const analytics = useMemo(() => {
    const totalRevenue = orders.reduce((acc, o) => acc + o.total, 0);
    const deliveredRevenue = orders.filter(o => o.status === "delivered").reduce((acc, o) => acc + o.total, 0);
    const pendingRevenue = orders.filter(o => o.status !== "delivered").reduce((acc, o) => acc + o.total, 0);
    
    const statusCounts = {
      pending: orders.filter(o => o.status === "pending").length,
      preparing: orders.filter(o => o.status === "preparing").length,
      delivering: orders.filter(o => o.status === "delivering").length,
      delivered: orders.filter(o => o.status === "delivered").length,
    };

    const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;

    // Orders by day
    const ordersByDay: Record<string, number> = {};
    orders.forEach(o => {
      const date = new Date(o.created_at).toLocaleDateString();
      ordersByDay[date] = (ordersByDay[date] || 0) + 1;
    });

    // Revenue by day
    const revenueByDay: Record<string, number> = {};
    orders.forEach(o => {
      const date = new Date(o.created_at).toLocaleDateString();
      revenueByDay[date] = (revenueByDay[date] || 0) + o.total;
    });

    // Top customers
    const customerOrders: Record<string, { count: number; total: number; name: string }> = {};
    orders.forEach(o => {
      if (!customerOrders[o.phone]) {
        customerOrders[o.phone] = { count: 0, total: 0, name: o.customer_name };
      }
      customerOrders[o.phone].count++;
      customerOrders[o.phone].total += o.total;
    });
    const topCustomers = Object.entries(customerOrders)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5);

    return {
      totalRevenue,
      deliveredRevenue,
      pendingRevenue,
      statusCounts,
      avgOrderValue,
      ordersByDay,
      revenueByDay,
      topCustomers,
      totalOrders: orders.length,
      totalProducts: products?.length || 0,
    };
  }, [orders, products]);

  return (
    <div className="min-h-screen bg-background">
      <header className="gradient-hero px-4 py-5 shadow-md">
        <div className="mx-auto max-w-4xl flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")} className="text-white hover:bg-white/20">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <TrendingUp className="h-6 w-6 text-white" />
          <h1 className="text-lg font-extrabold text-white">Analytics & Relatórios</h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 space-y-6">
        {/* KPIs principais */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm border">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <DollarSign className="h-5 w-5 text-emerald-500" />
              <span className="text-xs font-bold uppercase">Receita Total</span>
            </div>
            <p className="text-3xl font-extrabold text-foreground">
              R$ {analytics.totalRevenue.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{analytics.totalOrders} pedidos</p>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm border">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <ShoppingCart className="h-5 w-5 text-blue-500" />
              <span className="text-xs font-bold uppercase">Ticket Médio</span>
            </div>
            <p className="text-3xl font-extrabold text-foreground">
              R$ {analytics.avgOrderValue.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">por pedido</p>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm border">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Package className="h-5 w-5 text-amber-500" />
              <span className="text-xs font-bold uppercase">Produtos</span>
            </div>
            <p className="text-3xl font-extrabold text-foreground">
              {analytics.totalProducts}
            </p>
            <p className="text-xs text-muted-foreground mt-1">no catálogo</p>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm border">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <TrendingUp className="h-5 w-5 text-purple-500" />
              <span className="text-xs font-bold uppercase">Entregues</span>
            </div>
            <p className="text-3xl font-extrabold text-foreground">
              {analytics.statusCounts.delivered}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              R$ {analytics.deliveredRevenue.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Status dos pedidos */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border">
          <h2 className="text-lg font-extrabold mb-4">Status dos Pedidos</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-slate-50 rounded-xl">
              <p className="text-2xl font-extrabold text-slate-700">{analytics.statusCounts.pending}</p>
              <p className="text-xs text-muted-foreground mt-1">Pendentes</p>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-xl">
              <p className="text-2xl font-extrabold text-blue-700">{analytics.statusCounts.preparing}</p>
              <p className="text-xs text-muted-foreground mt-1">Preparando</p>
            </div>
            <div className="text-center p-4 bg-amber-50 rounded-xl">
              <p className="text-2xl font-extrabold text-amber-700">{analytics.statusCounts.delivering}</p>
              <p className="text-xs text-muted-foreground mt-1">Em Rota</p>
            </div>
            <div className="text-center p-4 bg-emerald-50 rounded-xl">
              <p className="text-2xl font-extrabold text-emerald-700">{analytics.statusCounts.delivered}</p>
              <p className="text-xs text-muted-foreground mt-1">Entregues</p>
            </div>
          </div>
        </div>

        {/* Pedidos por dia */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border">
          <h2 className="text-lg font-extrabold mb-4 flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Pedidos por Dia
          </h2>
          <div className="space-y-2">
            {Object.entries(analytics.ordersByDay)
              .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
              .slice(0, 7)
              .map(([date, count]) => (
                <div key={date} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <span className="text-sm font-semibold">{date}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">{count} pedidos</span>
                    <span className="text-sm font-bold text-primary">
                      R$ {analytics.revenueByDay[date]?.toFixed(2) || "0.00"}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Top clientes */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border">
          <h2 className="text-lg font-extrabold mb-4">Top 5 Clientes</h2>
          <div className="space-y-2">
            {analytics.topCustomers.map(([phone, data], idx) => (
              <div key={phone} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                    {idx + 1}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{data.name}</p>
                    <p className="text-xs text-muted-foreground">{phone}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-primary">R$ {data.total.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">{data.count} pedidos</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
