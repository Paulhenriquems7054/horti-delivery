import { Badge } from "@/components/ui/badge";

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "Pendente", className: "bg-secondary text-secondary-foreground" },
  preparing: { label: "Preparando", className: "bg-primary text-primary-foreground" },
  delivered: { label: "Entregue", className: "bg-accent text-accent-foreground" },
};

export function OrderStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || { label: status, className: "" };
  return <Badge className={config.className}>{config.label}</Badge>;
}
