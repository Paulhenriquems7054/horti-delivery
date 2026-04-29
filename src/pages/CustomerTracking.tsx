import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Package, MapPin, Clock, CheckCircle2, ChefHat, Bike, Leaf, ArrowLeft, Send } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { useStoreInfo } from "@/hooks/useStoreInfo";
import { toast } from "sonner";

type OrderItem = {
  id: string;
  product_name: string;
  quantity: number;
  weight_kg?: number;
  price: number;
  sold_by: 'unit' | 'weight';
  needs_weighing?: boolean;
  actual_weight_kg?: number;
  final_price?: number;
};

type Order = {
  id: string;
  customer_name: string;
  phone: string;
  address: string;
  status: string;
  total: number;
  created_at: string;
  notes?: string;
  order_items?: OrderItem[];
};

type OrderTrackingRow = {
  id?: string;
  notes: string | null;
  created_at: string;
};

type ChatMessage = {
  author: "admin" | "client" | "delivery";
  message: string;
  created_at: string;
};

const STATUS_STEPS = [
  { key: "pending",    label: "Recebido",   icon: Package,       color: "text-slate-500",  bg: "bg-slate-100"  },
  { key: "preparing",  label: "Separando",  icon: ChefHat,       color: "text-blue-600",   bg: "bg-blue-100"   },
  { key: "delivering", label: "A Caminho",  icon: Bike,          color: "text-amber-600",  bg: "bg-amber-100"  },
  { key: "delivered",  label: "Entregue",   icon: CheckCircle2,  color: "text-emerald-600",bg: "bg-emerald-100"},
];

function getStepIndex(status: string) {
  return STATUS_STEPS.findIndex(s => s.key === status);
}

function StatusTimeline({ status }: { status: string }) {
  const currentIdx = getStepIndex(status);

  return (
    <div className="mt-6 pt-4 border-t border-primary/10">
      <p className="text-xs font-bold text-muted-foreground mb-4 text-center">STATUS DO PEDIDO</p>
      <div className="flex items-center justify-between relative px-2">
        {/* Linha de progresso */}
        <div className="absolute left-8 right-8 top-5 h-1 bg-slate-200 z-0" />
        <div
          className="absolute left-8 top-5 h-1 bg-emerald-500 z-0 transition-all duration-700 ease-out"
          style={{ 
            width: currentIdx === 0 ? '0%' : `calc(${(currentIdx / (STATUS_STEPS.length - 1)) * 100}% - 2rem)`,
          }}
        />

        {STATUS_STEPS.map((step, idx) => {
          const Icon = step.icon;
          const done = idx <= currentIdx;
          const active = idx === currentIdx;

          return (
            <div key={step.key} className="flex flex-col items-center gap-2 z-10 flex-1">
              <div className={`h-11 w-11 rounded-full flex items-center justify-center transition-all duration-500 ${
                done ? step.bg : "bg-slate-100"
              } ${active ? "ring-4 ring-offset-2 ring-emerald-400/50 scale-110 shadow-lg" : ""}`}>
                <Icon className={`h-5 w-5 ${done ? step.color : "text-slate-300"} transition-colors duration-300`} />
              </div>
              <span className={`text-[11px] font-bold text-center leading-tight transition-colors duration-300 ${
                done ? "text-slate-700" : "text-slate-400"
              }`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Mensagem de status */}
      <div className="mt-5 text-center p-3 rounded-xl bg-gradient-to-r from-slate-50 to-slate-100">
        {status === "pending" && (
          <p className="text-sm text-slate-600">
            <span className="font-bold">⏳ Aguardando confirmação</span>
            <br />
            <span className="text-xs">A loja está verificando seu pedido</span>
          </p>
        )}
        {status === "preparing" && (
          <p className="text-sm text-blue-600">
            <span className="font-bold">🧑‍🍳 Separando os produtos!</span>
            <br />
            <span className="text-xs">Sua cesta está sendo preparada com carinho</span>
          </p>
        )}
        {status === "delivering" && (
          <p className="text-sm text-amber-600">
            <span className="font-bold">🛵 Entregador a caminho!</span>
            <br />
            <span className="text-xs">Seu pedido está sendo entregue</span>
          </p>
        )}
        {status === "delivered" && (
          <p className="text-sm text-emerald-600">
            <span className="font-bold">✅ Pedido entregue!</span>
            <br />
            <span className="text-xs">Bom apetite! 🥬✨</span>
          </p>
        )}
      </div>
    </div>
  );
}

function useRealtimeOrder(orderId: string, phone: string) {
  const [order, setOrder] = useState<Order | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [arrivalAlertTick, setArrivalAlertTick] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId || !phone) {
      setLoading(false);
      return;
    }

    // Normaliza o telefone para garantir compatibilidade
    const normalizedPhone = phone.replace(/\D/g, "");

    const loadChatMessages = async () => {
      const { data } = await (supabase as any)
        .from("order_tracking")
        .select("id, notes, created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });

      const parsedMessages = ((data as OrderTrackingRow[] | null) ?? [])
        .filter((row) => {
          const notes = row.notes ?? "";
          return (
            notes.startsWith("[CHAT-ADMIN]") ||
            notes.startsWith("[CHAT-CLIENTE]") ||
            notes.startsWith("[CHAT-ENTREGADOR-CLIENTE]")
          );
        })
        .map((row) => {
          const notes = row.notes ?? "";
          if (notes.startsWith("[CHAT-ADMIN]")) {
            return {
              author: "admin" as const,
              message: notes.replace("[CHAT-ADMIN]", "").trim(),
              created_at: row.created_at,
            };
          }

          if (notes.startsWith("[CHAT-ENTREGADOR-CLIENTE]")) {
            return {
              author: "delivery" as const,
              message: notes.replace("[CHAT-ENTREGADOR-CLIENTE]", "").trim(),
              created_at: row.created_at,
            };
          }

          return {
            author: "client" as const,
            message: notes.replace("[CHAT-CLIENTE]", "").trim(),
            created_at: row.created_at,
          };
        })
        .filter((row) => row.message.length > 0);

      setChatMessages(parsedMessages.slice(-20));
    };

    // Busca inicial com itens
    supabase
      .from("orders")
      .select(`
        *,
        order_items (
          id,
          quantity,
          weight_kg,
          price,
          sold_by,
          needs_weighing,
          actual_weight_kg,
          final_price,
          product:products (
            name
          )
        )
      `)
      .eq("id", orderId)
      .eq("phone", normalizedPhone)
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          // Transforma os dados para o formato esperado
          const transformedData = {
            ...data,
            order_items: data.order_items?.map((item: any) => ({
              ...item,
              product_name: item.product?.name || 'Produto'
            }))
          };
          setOrder(transformedData as Order);
        }
        setLoading(false);
      });

    loadChatMessages();

    // Realtime - atualiza status em tempo real
    const channel = supabase
      .channel(`customer-order-${orderId}`)
      .on(
        "postgres_changes",
        { 
          event: "UPDATE", 
          schema: "public", 
          table: "orders", 
          filter: `id=eq.${orderId}` 
        },
        (payload) => {
          setOrder(prev => prev ? { ...prev, ...(payload.new as Order) } : null);
        }
      )
      .on(
        "postgres_changes",
        { 
          event: "*", 
          schema: "public", 
          table: "order_items", 
          filter: `order_id=eq.${orderId}` 
        },
        () => {
          // Recarrega itens quando houver mudança (pesagem)
          supabase
            .from("orders")
            .select(`
              *,
              order_items (
                id,
                quantity,
                weight_kg,
                price,
                sold_by,
                needs_weighing,
                actual_weight_kg,
                final_price,
                product:products (
                  name
                )
              )
            `)
            .eq("id", orderId)
            .single()
            .then(({ data }) => {
              if (data) {
                const transformedData = {
                  ...data,
                  order_items: data.order_items?.map((item: any) => ({
                    ...item,
                    product_name: item.product?.name || 'Produto'
                  }))
                };
                setOrder(transformedData as Order);
              }
            });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "order_tracking",
          filter: `order_id=eq.${orderId}`,
        },
        (payload: any) => {
          const insertedNotes = String(payload?.new?.notes || "");
          if (insertedNotes.startsWith("[DELIVERY_ARRIVED_ALERT]")) {
            setArrivalAlertTick((prev) => prev + 1);
          }
          loadChatMessages();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orderId, phone]);

  return { order, loading, chatMessages, arrivalAlertTick };
}

export default function CustomerTracking() {
  const { slug, orderId } = useParams();
  const navigate = useNavigate();
  const { data: store } = useStoreInfo(slug);
  
  // Pega o telefone da URL (passado como query param)
  const searchParams = new URLSearchParams(window.location.search);
  const phone = searchParams.get('phone') || '';
  
  const { order, loading, chatMessages, arrivalAlertTick } = useRealtimeOrder(orderId || '', phone);
  const [clientChatMessage, setClientChatMessage] = useState("");
  const [sendingClientChat, setSendingClientChat] = useState(false);
  const arrivalAudioRef = useRef<HTMLAudioElement | null>(null);
  const formatWeight = (weightKg: number) =>
    weightKg < 1
      ? `${Math.round(weightKg * 1000)}g`
      : `${weightKg.toFixed(2).replace(".", ",")}kg`;

  useEffect(() => {
    if (!arrivalAlertTick) return;

    const playArrivalAlert = async () => {
      try {
        const audio = arrivalAudioRef.current;
        if (audio) {
          audio.currentTime = 0;
          await audio.play();
        }
      } catch (error) {
        console.error("Erro ao reproduzir aviso de chegada:", error);
      }

      if ("vibrate" in navigator) {
        navigator.vibrate([200, 120, 200]);
      }

      toast.success("Entregador chegou ao local! 🚚");
    };

    playArrivalAlert();
  }, [arrivalAlertTick]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-4">
        <div className="flex flex-col items-center gap-3">
          <div className="relative h-16 w-16">
            <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin" />
          </div>
          <p className="text-muted-foreground font-semibold animate-pulse">
            Carregando pedido...
          </p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-background">
        <header className="gradient-hero px-4 py-5 shadow-md">
          <div className="mx-auto max-w-lg flex items-center gap-3">
            <button onClick={() => navigate(`/${slug}`)} className="text-white">
              <ArrowLeft className="h-6 w-6" />
            </button>
            <div>
              <h1 className="text-base font-extrabold text-white">
                {store?.name || "Rastreamento"}
              </h1>
              <p className="text-xs text-white/75">Acompanhamento do Pedido</p>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-lg px-4 py-8">
          <div className="text-center">
            <Package className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-foreground mb-2">Pedido não encontrado</h2>
            <p className="text-muted-foreground text-sm mb-6">
              Verifique se o link está correto ou entre em contato com a loja
            </p>
            <button
              onClick={() => navigate(`/${slug}`)}
              className="px-6 py-3 rounded-xl gradient-hero text-white font-bold"
            >
              Voltar à Loja
            </button>
          </div>
        </main>
      </div>
    );
  }

  const canUseQuickChat = ["pending", "preparing", "ready_for_delivery"].includes(order.status);

  const sendClientMessage = async () => {
    if (!clientChatMessage.trim()) return;

    setSendingClientChat(true);
    try {
      const { error } = await (supabase as any).from("order_tracking").insert({
        order_id: order.id,
        status: order.status,
        notes: `[CHAT-CLIENTE] ${clientChatMessage.trim()}`,
      });

      if (error) throw error;

      setClientChatMessage("");
      toast.success("Mensagem enviada para a loja");
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível enviar sua mensagem agora");
    } finally {
      setSendingClientChat(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="gradient-hero px-4 py-5 shadow-md">
        <div className="mx-auto max-w-lg flex items-center gap-3">
          <button onClick={() => navigate(`/${slug}`)} className="text-white hover:opacity-80 transition-opacity">
            <ArrowLeft className="h-6 w-6" />
          </button>
          <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center overflow-hidden p-1.5">
            <img 
              src="/play_store_512.png" 
              alt="Logo" 
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-white leading-tight">
              {store?.name || "Rastreamento"}
            </h1>
            <p className="text-xs text-white/75">Acompanhamento em Tempo Real</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-6 pb-10">
        <audio
          ref={arrivalAudioRef}
          src="/sounds/hortideliverysuaenregachegou.mp3"
          preload="auto"
        />

        {/* Indicador de atualização em tempo real */}
        <div className="mb-4 flex items-center justify-center gap-2 text-xs text-emerald-600 font-semibold">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          Atualização automática ativa
        </div>

        {/* Card do Pedido */}
        <div className="bg-white rounded-2xl p-5 shadow-lg border border-primary/10 animate-slide-up">
          {/* Header do pedido */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs text-muted-foreground font-mono mb-1">
                Pedido #{order.id.split("-")[0].toUpperCase()}
              </p>
              <p className="font-bold text-xl text-foreground">{order.customer_name}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground mb-1">
                {(order as any).receipt_total ? 'Total (Cupom Fiscal)' : 'Total'}
              </p>
              <p className="text-2xl font-extrabold text-primary">
                R$ {((order as any).receipt_total || order.total).toFixed(2).replace(".", ",")}
              </p>
              {(order as any).receipt_total && (order as any).receipt_total !== order.total && (
                <p className="text-xs text-muted-foreground line-through mt-1">
                  Estimado: R$ {order.total.toFixed(2).replace(".", ",")}
                </p>
              )}
            </div>
          </div>

          {/* Informações de entrega */}
          <div className="space-y-2 text-sm text-muted-foreground mb-4 pb-4 border-b border-primary/10">
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
              <span className="flex-1">{order.address}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0 text-primary" />
              <span>{new Date(order.created_at).toLocaleString("pt-BR")}</span>
            </div>
          </div>

          {/* Itens do pedido */}
          {order.order_items && order.order_items.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-bold text-muted-foreground mb-3">ITENS DO PEDIDO</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {order.order_items.map((item) => (
                  <div key={item.id} className="flex justify-between items-start text-sm bg-slate-50 p-3 rounded-lg">
                    <div className="flex-1">
                      <p className="font-semibold text-foreground">{item.product_name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.sold_by === 'weight' ? (
                          <>
                            {item.actual_weight_kg ? (
                              <>Peso real: {item.actual_weight_kg < 1 
                                ? `${Math.round(item.actual_weight_kg * 1000)}g` 
                                : formatWeight(item.actual_weight_kg)}</>
                            ) : (
                              <>Peso estimado: {item.weight_kg && item.weight_kg < 1 
                                ? `${Math.round(item.weight_kg * 1000)}g` 
                                : formatWeight(item.weight_kg || 0)}</>
                            )}
                          </>
                        ) : (
                          <>
                            {item.quantity} unidade{item.quantity > 1 ? 's' : ''}
                            {item.needs_weighing && !item.actual_weight_kg && ' (aguardando pesagem)'}
                          </>
                        )}
                      </p>
                    </div>
                    <p className="font-bold text-primary ml-2">
                      {item.final_price != null ? (
                        `R$ ${item.final_price.toFixed(2).replace(".", ",")}`
                      ) : item.sold_by === 'weight' ? (
                        `R$ ${item.price.toFixed(2).replace(".", ",")}`
                      ) : item.needs_weighing ? (
                        <span className="text-amber-600 text-xs">A pesar</span>
                      ) : (
                        `R$ ${(item.quantity * item.price).toFixed(2).replace(".", ",")}`
                      )}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Observações */}
          {order.notes && (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
              <p className="text-xs font-semibold text-blue-900 mb-1">📝 Observações:</p>
              <p className="text-sm text-blue-800">{order.notes}</p>
            </div>
          )}

          {/* Chat rápido com a loja */}
          {(chatMessages.length > 0 || canUseQuickChat) && (
            <div className="mb-4 p-3 bg-amber-50 rounded-lg border border-amber-100 space-y-2">
              <p className="text-xs font-semibold text-amber-900">💬 Chat rápido com a loja</p>

              {chatMessages.length === 0 ? (
                <p className="text-xs text-amber-700">Sem mensagens por enquanto.</p>
              ) : (
                <div className="space-y-2 max-h-44 overflow-y-auto">
                  {chatMessages.map((msg, idx) => (
                    <div
                      key={`${msg.created_at}-${idx}`}
                      className={`rounded-lg px-3 py-2 text-xs ${
                        msg.author === "admin"
                          ? "bg-white border border-amber-200 text-amber-900"
                          : msg.author === "delivery"
                            ? "bg-emerald-50 border border-emerald-200 text-emerald-900"
                          : "bg-blue-50 border border-blue-200 text-blue-900 ml-6"
                      }`}
                    >
                      <p className="font-bold mb-0.5">
                        {msg.author === "admin" ? "Loja" : msg.author === "delivery" ? "Entregador" : "Você"}
                      </p>
                      <p>{msg.message}</p>
                    </div>
                  ))}
                </div>
              )}

              {canUseQuickChat ? (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    value={clientChatMessage}
                    onChange={(e) => setClientChatMessage(e.target.value)}
                    placeholder="Digite sua mensagem..."
                    className="flex-1 h-9 rounded-lg border border-amber-200 bg-white px-3 text-xs"
                  />
                  <button
                    onClick={sendClientMessage}
                    disabled={sendingClientChat || !clientChatMessage.trim()}
                    className="h-9 px-3 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 disabled:opacity-50 flex items-center gap-1"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Enviar
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-amber-700">
                  Chat encerrado para este pedido (após "Pronto p/ Entrega").
                </p>
              )}
            </div>
          )}

          {/* Cupom Fiscal */}
          {(order as any).receipt_photo_url && (
            <div className="mb-4">
              <p className="text-xs font-bold text-muted-foreground mb-3">📸 CUPOM FISCAL</p>
              <div className="bg-white dark:bg-slate-800 rounded-xl border-2 border-emerald-200 dark:border-emerald-700 overflow-hidden">
                <img 
                  src={(order as any).receipt_photo_url} 
                  alt="Cupom Fiscal" 
                  className="w-full h-auto cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => window.open((order as any).receipt_photo_url, '_blank')}
                />
                <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 border-t border-emerald-200 dark:border-emerald-700">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                      Registrado em: {new Date((order as any).receipt_uploaded_at).toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-white dark:bg-slate-800 rounded-lg">
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Valor Total:</span>
                    <span className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400">
                      R$ {((order as any).receipt_total || order.total).toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 text-center">
                    ✓ Clique na imagem para ampliar
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Timeline de status */}
          <StatusTimeline status={order.status} />
        </div>

        {/* Botão voltar */}
        <button
          onClick={() => navigate(`/${slug}`)}
          className="mt-6 w-full h-12 rounded-2xl border-2 border-primary text-primary font-bold hover:bg-accent transition-colors"
        >
          ← Voltar à Loja
        </button>

        {/* Informação de contato */}
        <p className="text-center text-xs text-muted-foreground mt-4">
          Dúvidas? Entre em contato com a loja 📞
        </p>
      </main>
    </div>
  );
}
