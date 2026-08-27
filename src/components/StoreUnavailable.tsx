export function StoreUnavailable({ storeName }: { storeName?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      <div className="text-center max-w-sm">
        <div className="mx-auto h-24 w-24 rounded-full bg-red-100 flex items-center justify-center mb-5">
          <span className="text-5xl">🔒</span>
        </div>
        <h1 className="text-2xl font-extrabold text-foreground mb-2">Loja temporariamente indisponível</h1>
        {storeName && (
          <p className="font-bold text-foreground mb-2">{storeName}</p>
        )}
        <p className="text-muted-foreground leading-relaxed">
          Esta loja está temporariamente fora do ar. Entre em contato com o estabelecimento para mais informações.
        </p>
      </div>
    </div>
  );
}
