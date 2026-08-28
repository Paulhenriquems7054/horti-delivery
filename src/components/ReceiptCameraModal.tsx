import { useState, useRef, useEffect } from "react";
import { X, Camera, Upload, Check, RotateCcw, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface ReceiptCameraModalProps {
  orderId: string;
  storeId: string;
  customerName: string;
  orderTotal: number;
  onClose: () => void;
  onSuccess: () => void;
}

export function ReceiptCameraModal({ 
  orderId, 
  storeId,
  customerName, 
  orderTotal,
  onClose, 
  onSuccess 
}: ReceiptCameraModalProps) {
  const [mode, setMode] = useState<'camera' | 'preview' | 'uploading'>('camera');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [receiptTotal, setReceiptTotal] = useState<string>(orderTotal.toFixed(2));
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === 'camera') {
      startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [mode]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment', // Câmera traseira
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error('Erro ao acessar câmera:', error);
      toast.error('Não foi possível acessar a câmera. Tente fazer upload de uma foto.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    const imageData = canvas.toDataURL('image/jpeg', 0.9);
    
    setCapturedImage(imageData);
    setMode('preview');
    stopCamera();
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    setMode('camera');
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecione uma imagem');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setCapturedImage(e.target?.result as string);
      setMode('preview');
      stopCamera();
    };
    reader.readAsDataURL(file);
  };

  const uploadReceipt = async () => {
    if (!capturedImage) return;

    setMode('uploading');

    try {
      // Valida o valor do cupom
      const receiptValue = parseFloat(receiptTotal);
      if (!receiptValue || receiptValue <= 0) {
        toast.error('Por favor, informe o valor total do cupom');
        setMode('preview');
        return;
      }

      // Converte base64 para blob
      const response = await fetch(capturedImage);
      const blob = await response.blob();
      
      // Nome único para o arquivo
      const fileName = `receipt_${orderId}_${Date.now()}.jpg`;
      const filePath = `receipts/${storeId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('order-receipts')
        .upload(filePath, blob, {
          contentType: 'image/jpeg',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from('orders')
        .update({
          receipt_photo_url: filePath,
          receipt_uploaded_at: new Date().toISOString(),
          receipt_total: receiptValue,
          total: receiptValue
        })
        .eq('id', orderId);

      if (updateError) throw updateError;

      toast.success(`Cupom registrado! Valor atualizado: R$ ${receiptValue.toFixed(2)} 📸`);
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Erro ao fazer upload:', error);
      toast.error(error.message || 'Erro ao fazer upload do cupom');
      setMode('preview');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between bg-gradient-to-r from-emerald-50 to-blue-50 dark:from-emerald-950/30 dark:to-blue-950/30">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
              <Camera className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-foreground">Registrar Cupom Fiscal</h2>
              <p className="text-xs text-muted-foreground">{customerName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors"
          >
            <X className="h-5 w-5 text-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {mode === 'camera' && (
            <div className="space-y-4">
              <div className="relative bg-black rounded-xl overflow-hidden aspect-[4/3]">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 border-4 border-dashed border-white/30 m-4 rounded-lg pointer-events-none" />
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={capturePhoto}
                  className="flex-1 h-14 rounded-xl bg-emerald-500 text-white font-bold hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2"
                >
                  <Camera className="h-5 w-5" />
                  Capturar Foto
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="h-14 px-6 rounded-xl border-2 border-slate-300 text-slate-700 font-bold hover:bg-slate-100 transition-colors flex items-center justify-center gap-2"
                >
                  <Upload className="h-5 w-5" />
                  Galeria
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />

              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                <p className="text-sm text-blue-800 dark:text-blue-200 font-semibold flex items-start gap-2">
                  <ImageIcon className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Posicione o cupom fiscal dentro da área tracejada para melhor qualidade da foto.</span>
                </p>
              </div>
            </div>
          )}

          {mode === 'preview' && capturedImage && (
            <div className="space-y-4">
              <div className="relative bg-muted rounded-xl overflow-hidden">
                <img
                  src={capturedImage}
                  alt="Cupom capturado"
                  className="w-full h-auto"
                />
              </div>

              <div>
                <label className="text-sm font-bold text-foreground mb-2 block flex items-center gap-2">
                  <span className="text-red-500">*</span>
                  Valor Total do Cupom (R$)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={receiptTotal}
                  onChange={(e) => {
                    // Permite apenas números, vírgula e ponto
                    const value = e.target.value.replace(/[^0-9.,]/g, '');
                    setReceiptTotal(value);
                  }}
                  className="w-full h-12 px-4 border-2 border-emerald-300 dark:border-emerald-700 rounded-xl text-lg font-bold text-center focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-card text-foreground"
                  placeholder="0,00"
                  autoFocus
                />
                <div className="flex justify-between items-center mt-2">
                  <p className="text-xs text-muted-foreground">
                    Valor estimado: R$ {orderTotal.toFixed(2).replace(".", ",")}
                  </p>
                  {parseFloat(receiptTotal.replace(',', '.')) > 0 && (
                    <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      ✓ Valor confirmado
                    </p>
                  )}
                </div>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 font-semibold">
                  ⚠️ Este valor substituirá o total do pedido
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={retakePhoto}
                  className="flex-1 h-12 rounded-xl border-2 border-border text-foreground font-bold hover:bg-muted transition-colors flex items-center justify-center gap-2"
                >
                  <RotateCcw className="h-4 w-4" />
                  Tirar Outra
                </button>
                <button
                  onClick={uploadReceipt}
                  disabled={!receiptTotal || parseFloat(receiptTotal.replace(',', '.')) <= 0}
                  className="flex-1 h-12 rounded-xl bg-emerald-500 text-white font-bold hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Check className="h-4 w-4" />
                  Confirmar e Enviar
                </button>
              </div>
              
              {(!receiptTotal || parseFloat(receiptTotal.replace(',', '.')) <= 0) && (
                <p className="text-xs text-red-600 dark:text-red-400 text-center mt-2 font-semibold">
                  ⚠️ Informe o valor total do cupom para continuar
                </p>
              )}
            </div>
          )}

          {mode === 'uploading' && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="h-16 w-16 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin mb-4" />
              <p className="text-lg font-bold text-foreground">Enviando cupom...</p>
              <p className="text-sm text-muted-foreground mt-1">Aguarde um momento</p>
            </div>
          )}
        </div>

        {/* Canvas oculto para captura */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}
