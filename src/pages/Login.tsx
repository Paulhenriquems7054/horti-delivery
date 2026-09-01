import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { logAuditEvent } from "@/hooks/useAuditLog";
import { fetchMyStore } from "@/lib/resolveMyStore";
import { Eye, EyeOff } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { StoreLogo } from "@/components/StoreLogo";
import { useLandingStore } from "@/hooks/useLandingStore";

export default function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [isResettingPassword, setIsResettingPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { data: store } = useLandingStore();

    const redirectAfterAuth = async () => {
        const { data: isAdmin } = await supabase.rpc("is_platform_admin" as never);
        const next = searchParams.get("next");
        if (isAdmin === true) {
            navigate(next === "/superadmin" ? "/superadmin" : "/superadmin");
            return;
        }
        const store = await fetchMyStore();
        navigate(store?.slug ? `/${store.slug}/admin` : "/admin");
    };

    useEffect(() => {
        const hash = window.location.hash;
        if (hash && hash.includes("type=recovery")) {
            setIsResettingPassword(true);
            return;
        }

        supabase.auth.getSession().then(async ({ data: { session } }) => {
            if (session && !isResettingPassword) {
                await redirectAfterAuth();
            }
        });

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
            const store = await fetchMyStore();
            await logAuditEvent("login", store?.id, { email });
            toast.success("Login bem-sucedido");
            await redirectAfterAuth();
        }
    };

    const handleForgotPassword = async () => {
        if (!email) {
            toast.error("Por favor, digite seu e-mail primeiro para que possamos enviar o link de recuperação.");
            return;
        }

        setLoading(true);
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/login`,
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
        if (newPassword.length < 8) {
            toast.error("A senha deve ter pelo menos 8 caracteres.");
            return;
        }
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
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
            <div className="absolute top-6 right-6 z-20">
                <ThemeToggle />
            </div>

            <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-emerald-400 dark:bg-emerald-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 dark:opacity-10" />

            <div className="w-full max-w-sm space-y-6 relative z-10">
                <div className="text-center space-y-2">
                    <div className="h-14 w-14 rounded-2xl gradient-hero flex items-center justify-center text-white shadow-md mx-auto mb-4 overflow-hidden p-2">
                        <StoreLogo
                          logoPath={store?.logo_path}
                          logoVersion={store?.updated_at}
                          alt={store?.name ?? "Logo"}
                          className="h-full w-full"
                        />
                    </div>
                    <h1 className="text-3xl font-black text-foreground">Painel da loja</h1>
                    <p className="text-muted-foreground font-medium tracking-tight">
                        Entre com o e-mail e a senha fornecidos pelo administrador da plataforma.
                    </p>
                </div>

                <div className="bg-card dark:bg-card p-6 sm:p-8 rounded-3xl border border-border shadow-xl">
                    <form onSubmit={isResettingPassword ? handleUpdatePassword : handleLogin} className="space-y-4">
                        {isResettingPassword ? (
                            <div className="space-y-4 animate-fade-in">
                                <div className="text-center mb-4">
                                    <h2 className="text-xl font-bold text-foreground">Recuperar Senha</h2>
                                    <p className="text-xs text-muted-foreground">Digite sua nova senha de acesso abaixo</p>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-foreground font-bold">Nova Senha</Label>
                                    <div className="relative">
                                        <Input
                                            type={showNewPassword ? "text" : "password"}
                                            placeholder="Mínimo 8 caracteres"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            required
                                            minLength={8}
                                            autoComplete="new-password"
                                            className="h-12 rounded-xl pr-11"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowNewPassword((v) => !v)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            {showNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                        </button>
                                    </div>
                                </div>
                                <Button type="submit" className="w-full h-12 rounded-xl gradient-hero mt-2 shadow-button text-base font-bold" disabled={loading}>
                                    {loading ? "Atualizando..." : "Salvar Nova Senha"}
                                </Button>
                                <button
                                    type="button"
                                    onClick={() => setIsResettingPassword(false)}
                                    className="w-full text-xs text-muted-foreground hover:text-primary font-bold"
                                >
                                    Cancelar e Voltar
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="space-y-1.5">
                                    <Label className="text-foreground font-bold">Email</Label>
                                    <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-12 rounded-xl" />
                                </div>
                                <div className="space-y-1.5 relative">
                                    <Label className="text-foreground font-bold">Senha</Label>
                                    <div className="relative">
                                        <Input
                                            type={showPassword ? "text" : "password"}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            required
                                            className="h-12 rounded-xl pr-11"
                                            autoComplete="current-password"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword((v) => !v)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleForgotPassword}
                                        className="text-[10px] text-primary font-bold hover:underline absolute right-0 top-0 pt-1"
                                    >
                                        Esqueci minha senha
                                    </button>
                                </div>

                                <Button type="submit" className="w-full h-12 rounded-xl gradient-hero mt-2 shadow-button text-base font-bold" disabled={loading}>
                                    {loading ? "Aguarde..." : "Entrar"}
                                </Button>
                            </>
                        )}
                    </form>
                </div>

                <p className="text-center text-xs text-muted-foreground font-medium pt-4">
                    Novas lojas são criadas pelo administrador da plataforma.
                </p>
            </div>
        </div>
    );
}
