/** Marca da plataforma — uso discreto (rodapé, etc.). */
export function PoweredByHortiDelivery({ className = "" }: { className?: string }) {
  return (
    <span className={`text-muted-foreground/80 ${className}`.trim()}>
      Tecnologia{" "}
      <span className="font-semibold text-muted-foreground">
        horti<span className="text-primary/80">delivery</span>
      </span>
    </span>
  );
}
