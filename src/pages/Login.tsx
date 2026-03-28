import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Leaf, Store, Link as LinkIcon } from "lucide-react";

export default function Login() {
    const [mode, setMode] = useState<"login" | "register">("login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [isResettingPassword, setIsResettingPassword] = useState(false);
    
    // Campos do Registro
    const [storeName, setStoreName] = useState("");
    const [slug, setSlug] = useState("");
    
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        // Redireciona usuários já logados para o painel de admin
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session && !isResettingPassword) {
                navigate("/admin");
            }
        });

        // Escuta eventos de autenticação (como clicar no link de recuperação)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === "PASSWORD_RECOVERY") {
                setIsResettingPassword(true);
            }
        });

        return () => subscription.unsubscribe();
    }, [navigate, isResettingPassword]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        setLoading(false);

        if (error) {
            toast.error(error.message);
        } else {
            toast.success("Login bem-sucedido");
            navigate("/admin");
        }
    };

    const handleForgotPassword = async () => {
        if (!email) {
            toast.error("Por favor, digite seu e-mail primeiro para que possamos enviar o link de recuperação.");
            return;
        }
        
        setLoading(true);
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + "/login",
        });
        setLoading(false);

        if (error) {
            toast.error(error.message);
        } else {
            toast.success("E-mail de recuperação enviado com sucesso! Verifique sua caixa de entrada.");
        }
    };

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        const { error } = await supabase.auth.updateUser({
            password: newPassword,
        });
        setLoading(false);

        if (error) {
            toast.error(error.message);
        } else {
            toast.success("Senha atualizada com sucesso! Agora você pode entrar.");
            setIsResettingPassword(false);
            setMode("login");
        }
    };



    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        if (slug.length < 3) return toast.error("O link da loja precisa ter pelo menos 3 caracteres");
        const formattedSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, "");

        setLoading(true);
        
        // 1. Cria usuário
        const { data: { user }, error: signUpError } = await supabase.auth.signUp({
            email,
            password,
        });

        if (signUpError || !user) {
            toast.error(signUpError?.message || "Ocorreu um erro ao criar usuário.");
            setLoading(false);
            return;
        }

        // 2. Prepara a Loja do Usuário
        const { error: storeError } = await (supabase as any).from("stores").insert({
            user_id: user.id,
            name: storeName,
            slug: formattedSlug,
            active: true,
        });

        if (storeError) {
           toast.error("Erro ao criar loja. Esse link já pode estar em uso.");
           setLoading(false);
           return;
        }
        
        // 3. Cria o primeiro Catálogo (Basket) Ativo da Nova Loja
        const { data: storeInfo } = await (supabase as any).from("stores").select("id").eq("slug", formattedSlug).single();
        if (storeInfo) {
          await (supabase as any).from("baskets").insert({
            name: `Catálogo | ${storeName}`,
            price: 0,
            store_id: storeInfo.id,
            active: true
          });
        }

        toast.success("Loja criada e configurada com sucesso! Bem vindo!");
        navigate("/admin");
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
            {/* Background elements */}
            <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-emerald-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20" />
            
            <div className="w-full max-w-sm space-y-6 relative z-10">
                <div className="text-center space-y-2">
                    <div className="h-14 w-14 rounded-2xl gradient-hero flex items-center justify-center text-white shadow-md mx-auto mb-4">
                        <Leaf className="h-7 w-7" />
                    </div>
                    <h1 className="text-3xl font-black text-slate-800">Área do Empreendedor</h1>
                    <p className="text-slate-500 font-medium tracking-tight">Cofre seguro HortiDelivery</p>
                </div>

                <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-100 shadow-xl shadow-emerald-900/5">
                    
                    {/* Tabs Navbar */}
                    <div className="flex bg-slate-100 rounded-xl p-1 mb-6">
                        <button 
                            onClick={() => setMode("login")} 
                            className={`flex-1 text-sm font-bold py-2 rounded-lg transition-all ${mode === "login" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500"}`}
                        >
                            Entrar
                        </button>
                        <button 
                            onClick={() => setMode("register")} 
                            className={`flex-1 text-sm font-bold py-2 rounded-lg transition-all ${mode === "register" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500"}`}
                        >
                            Criar Minha Loja
                        </button>
                    </div>

                    <form onSubmit={isResettingPassword ? handleUpdatePassword : (mode === "login" ? handleLogin : handleRegister)} className="space-y-4">
                        
                        {isResettingPassword ? (
                            <div className="space-y-4 animate-fade-in">
                                <div className="text-center mb-4">
                                    <h2 className="text-xl font-bold text-slate-800">Recuperar Senha</h2>
                                    <p className="text-xs text-slate-500">Digite sua nova senha de acesso abaixo</p>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-slate-600 font-bold">Nova Senha</Label>
                                    <Input 
                                        type="password" 
                                        placeholder="Mínimo 6 caracteres" 
                                        value={newPassword} 
                                        onChange={(e) => setNewPassword(e.target.value)} 
                                        required 
                                        autoComplete="new-password"
                                        className="h-12 rounded-xl" 
                                    />
                                </div>
                                <Button type="submit" className="w-full h-12 rounded-xl gradient-hero mt-2 shadow-button text-base font-bold" disabled={loading}>
                                    {loading ? "Atualizando..." : "Salvar Nova Senha"}
                                </Button>
                                <button 
                                    type="button" 
                                    onClick={() => setIsResettingPassword(false)}
                                    className="w-full text-xs text-slate-400 hover:text-emerald-600 font-bold"
                                >
                                    Cancelar e Voltar
                                </button>
                            </div>
                        ) : (
                            <>
                                {mode === "register" && (
                                    <div className="space-y-3 animate-fade-in">
                                        <div className="space-y-1.5">
                                            <Label className="text-slate-600 font-bold flex items-center gap-2"><Store className="h-4 w-4" /> Nome da sua Empresa</Label>
                                            <Input placeholder="Ex: Sítio São João" value={storeName} onChange={(e) => setStoreName(e.target.value)} required className="h-12 rounded-xl" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-slate-600 font-bold flex items-center gap-2"><LinkIcon className="h-4 w-4" /> Link Personalizado</Label>
                                            <div className="flex h-12 rounded-xl border border-input focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 overflow-hidden bg-white">
                                                <div className="flex items-center px-3 bg-slate-50 text-slate-500 text-sm border-r select-none">/</div>
                                                <input 
                                                    placeholder="sitio-sao-joao" 
                                                    value={slug} 
                                                    onChange={(e) => {
                                                        let val = e.target.value;
                                                        // Se o usuário colou uma URL, tenta extrair só a última parte (o slug)
                                                        if (val.includes('/') && val.indexOf('/') !== val.lastIndexOf('/')) {
                                                          const parts = val.split('/').filter(Boolean);
                                                          val = parts[parts.length - 1];
                                                        }
                                                        setSlug(val.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                                                    }} 
                                                    required 
                                                    className="flex-1 bg-transparent px-3 text-sm focus:outline-none placeholder:text-muted-foreground"
                                                />
                                            </div>
                                            <p className="text-[10px] text-slate-400 font-medium">Seus clientes vão acessar: hortidelivery.com.br/<span className="text-emerald-500 font-bold">{slug || "seu-nome"}</span></p>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    <Label className="text-slate-600 font-bold">Email</Label>
                                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-12 rounded-xl" />
                                </div>
                                <div className="space-y-1.5 relative">
                                    <Label className="text-slate-600 font-bold">Senha</Label>
                                    <Input 
                                        type="password" 
                                        value={password} 
                                        onChange={(e) => setPassword(e.target.value)} 
                                        required={mode === "login"}
                                        className="h-12 rounded-xl" 
                                        autoComplete={mode === "login" ? "current-password" : "new-password"} 
                                    />
                                    {mode === "login" && (
                                        <button
                                            type="button"
                                            onClick={handleForgotPassword}
                                            className="text-[10px] text-emerald-600 font-bold hover:underline absolute right-0 top-0 pt-1"
                                        >
                                            Esqueci minha senha
                                        </button>
                                    )}
                                </div>
                                
                                <Button type="submit" className="w-full h-12 rounded-xl gradient-hero mt-2 shadow-button text-base font-bold" disabled={loading}>
                                    {loading ? "Aguarde..." : (mode === "login" ? "Entrar Seguramente" : "Lançar Minha Loja 🚀")}
                                </Button>
                            </>
                        )}
                    </form>

                </div>
                
                <p className="text-center text-xs text-slate-400 font-medium pt-4">
                    Protegido e autenticado em tempo real.
                </p>
            </div>
        </div>
    );
}
