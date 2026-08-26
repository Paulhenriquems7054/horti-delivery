import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Shield } from "lucide-react";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function AccountSecurity() {
  const [currentEmail, setCurrentEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentEmail(data.user?.email ?? "");
    });
  }, []);

  const handleEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = newEmail.trim().toLowerCase();
    const confirm = confirmEmail.trim().toLowerCase();
    if (!next || !isValidEmail(next)) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    if (next !== confirm) {
      toast.error("Os e-mails não coincidem.");
      return;
    }
    if (next === currentEmail.toLowerCase()) {
      toast.error("O novo e-mail é igual ao atual.");
      return;
    }

    setEmailLoading(true);
    const { error } = await supabase.auth.updateUser({ email: next });
    setEmailLoading(false);
    if (error) {
      toast.error(error.message || "Não foi possível alterar o e-mail.");
      return;
    }
    setNewEmail("");
    setConfirmEmail("");
    toast.success("Solicitação enviada. Se a confirmação estiver ativa, verifique a caixa de entrada do novo e-mail.");
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Preencha todos os campos de senha.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("A confirmação não coincide com a nova senha.");
      return;
    }

    setPasswordLoading(true);
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: currentEmail,
      password: currentPassword,
    });
    if (reauthError) {
      setPasswordLoading(false);
      toast.error("Senha atual incorreta.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordLoading(false);
    if (error) {
      toast.error(error.message || "Não foi possível alterar a senha.");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    toast.success("Senha alterada com sucesso.");
  };

  return (
    <section id="minha-conta" className="mt-8 rounded-xl border bg-card p-4 shadow-sm space-y-6">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary" />
        <div>
          <h2 className="font-extrabold text-foreground">Minha conta</h2>
          <p className="text-xs text-muted-foreground">Credenciais de acesso. Só você pode alterá-las.</p>
        </div>
      </div>

      <form onSubmit={handleEmailChange} className="space-y-3">
        <h3 className="text-sm font-bold text-foreground">E-mail de acesso</h3>
        <div className="space-y-1">
          <Label>E-mail atual</Label>
          <Input value={currentEmail} readOnly className="bg-muted" />
        </div>
        <div className="space-y-1">
          <Label>Novo e-mail</Label>
          <Input type="email" autoComplete="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Confirmar novo e-mail</Label>
          <Input type="email" autoComplete="email" value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} />
        </div>
        <Button type="submit" disabled={emailLoading} className="w-full sm:w-auto">
          {emailLoading ? "Enviando..." : "Atualizar e-mail"}
        </Button>
      </form>

      <form onSubmit={handlePasswordChange} className="space-y-3 border-t pt-6">
        <h3 className="text-sm font-bold text-foreground">Senha</h3>
        <div className="space-y-1">
          <Label>Senha atual</Label>
          <Input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Nova senha</Label>
          <Input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Confirmar nova senha</Label>
          <Input type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </div>
        <Button type="submit" disabled={passwordLoading} className="w-full sm:w-auto">
          {passwordLoading ? "Salvando..." : "Alterar senha"}
        </Button>
      </form>
    </section>
  );
}
