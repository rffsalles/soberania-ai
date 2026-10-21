'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  GraduationCap,
  ShieldCheck,
  Lock,
  User,
  ArrowRight,
  AlertCircle,
  Sparkles,
  Server,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { isDemoMode } from '@/lib/constants/env';
import { DemoShortcuts } from './DemoShortcuts';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = searchParams.get('redirect') || '';

  const [identifier, setIdentifier] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const handleQuickFill = (demoIdentifier: string, demoPassword: string) => {
    setIdentifier(demoIdentifier);
    setPassword(demoPassword);
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!identifier.trim() || !password) {
      setErrorMessage('Por favor, preencha sua matrícula/e-mail e senha.');
      return;
    }

    try {
      setIsLoading(true);
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || 'Credenciais inválidas. Tente novamente.');
        return;
      }

      // Redirecionamento pós-login
      if (redirectTarget && redirectTarget.startsWith('/')) {
        router.push(redirectTarget);
      } else if (data.user.role === 'ADMIN') {
        router.push('/appliance');
      } else if (data.user.role === 'TEACHER') {
        router.push('/materials');
      } else {
        router.push('/dashboard');
      }
      router.refresh();
    } catch {
      setErrorMessage('Falha de conexão com o Appliance local. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-slate-950 text-slate-100 px-4 py-12 relative overflow-hidden">
      {/* Background Subtle Gradient Blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[45vw] h-[45vw] rounded-full bg-brand-teal/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[45vw] h-[45vw] rounded-full bg-brand-orange/10 blur-3xl pointer-events-none" />

      {/* Main Login Card */}
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 backdrop-blur-xl z-10">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <Link href="/" className="flex items-center gap-2.5 mb-3 group cursor-pointer">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-teal to-brand-teal-dark text-white shadow-md group-hover:scale-105 transition-transform">
              <GraduationCap className="h-6 w-6" />
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-heading font-bold text-white tracking-tight">
              Soberania <span className="text-brand-orange">AI</span>
            </h1>
            <Badge variant="outline" className="border-brand-teal/30 bg-brand-teal/10 text-brand-teal text-[10px] uppercase font-semibold">
              Appliance
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Acesso Institucional On-Premises · Tutora Lucy & Apoio Docente
          </p>
        </div>

        {/* Redirect Notice if coming from protected route */}
        {redirectTarget && (
          <div className="mb-5 p-3 rounded-lg bg-brand-orange/10 border border-brand-orange/20 text-xs text-brand-orange flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0" />
            <span>Faça login para acessar o recurso solicitado ({redirectTarget}).</span>
          </div>
        )}

        {/* Inline Error Message */}
        {errorMessage && (
          <div className="mb-5 p-3 rounded-lg bg-brand-rose/10 border border-brand-rose/20 text-xs text-brand-rose flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="identifier" className="text-xs font-medium text-slate-300">
              Matrícula Acadêmica ou E-mail
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <Input
                id="identifier"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Ex: 202601001 ou usuario@soberania.edu.br"
                className="pl-9 bg-slate-950/60 border-slate-800 text-white placeholder:text-slate-600 focus-visible:ring-brand-teal text-sm rounded-lg"
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs font-medium text-slate-300">
              Senha de Acesso
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pl-9 bg-slate-950/60 border-slate-800 text-white placeholder:text-slate-600 focus-visible:ring-brand-teal text-sm rounded-lg"
                disabled={isLoading}
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full bg-brand-teal hover:bg-brand-teal-dark text-white font-medium text-sm h-10 gap-2 cursor-pointer shadow-md rounded-lg transition-colors mt-2"
          >
            {isLoading ? (
              <span>Autenticando...</span>
            ) : (
              <>
                <span>Acessar Ambiente</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </form>

        {/* Atalhos de demonstração: só em NEXT_PUBLIC_DEMO_MODE=true */}
        {isDemoMode() && <DemoShortcuts onFill={handleQuickFill} />}

        {/* Sovereign Privacy Trust Seal */}
        <div className="mt-6 p-3 rounded-xl bg-slate-950/60 border border-slate-800/60 flex items-start gap-2.5">
          <ShieldCheck className="h-4 w-4 text-brand-teal shrink-0 mt-0.5" />
          <p className="text-[11px] text-slate-400 leading-relaxed">
            <strong className="text-slate-300 font-semibold">Zero-Egress & LGPD:</strong> Autenticação física no servidor on-premises da instituição. Suas credenciais nunca saem da rede acadêmica.
          </p>
        </div>
      </div>

      {/* Footer link to landing page */}
      <div className="mt-6 text-center z-10">
        <Link href="/" className="text-xs text-slate-500 hover:text-slate-300 cursor-pointer transition-colors">
          ← Voltar para a Apresentação Pública
        </Link>
      </div>
    </div>
  );
}
