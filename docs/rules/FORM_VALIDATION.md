# Padrão de Implementação — Formulários com Validação

> **Domínios:** `@frontend-specialist` · `@backend-specialist` · `@documentation-writer`
> **Última atualização:** 2026-03-06

---

## Visão Geral

Este documento define o padrão canônico para implementar telas com formulários que possuem campos validados no projeto Swapo.

Existem dois padrões suportados dependendo do contexto:

| Padrão | Quando usar | Validação |
|--------|-------------|-----------|
| **A — Server Action + Zod + `useActionState`** | Mutações (criar/atualizar) delegadas ao servidor | Servidor (Zod no `actions.ts`) |
| **B — Client Validation + API Route** | Formulários com interatividade rica (máscaras, preview em tempo real, lógica condicional) | Cliente (Zod no `.validation.ts`) + Servidor (Zod na API Route) |

---

## Padrão A — Server Action + Zod + `useActionState`

**Uso:** Formulários de mutação simples em páginas `"use client"` que delegam todo o processamento ao servidor.

### Estrutura de Arquivos

```
src/app/(rota)/
├── page.tsx         ← "use client" — só UI + useActionState
└── actions.ts       ← "use server" — Zod + lógica de negócio
```

### `page.tsx`

```tsx
"use client";

import { useActionState } from "react";
import { registerUser } from "./actions";

export default function RegisterPage() {
  // useActionState conecta o Server Action ao estado local do componente
  const [state, action, isPending] = useActionState(registerUser, null);

  // Exibição condicional após sucesso
  if (state?.success) {
    return <SuccessView />;
  }

  return (
    // form usa action={action} — sem onSubmit, sem preventDefault
    <form action={action}>
      <CardContent>
        {/* Erro retornado pelo server action */}
        {state?.error && (
          <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium">
            {state.error}
          </div>
        )}

        <Label htmlFor="name">Nome completo</Label>
        <Input id="name" name="name" type="text" required />

        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" required />

        <Label htmlFor="password">Senha</Label>
        <Input id="password" name="password" type="password" required minLength={6} />
      </CardContent>

      <CardFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <><Loader2 className="animate-spin mr-2" /> Processando...</>
          ) : "Enviar"}
        </Button>
      </CardFooter>
    </form>
  );
}
```

### `actions.ts`

```ts
"use server";

import { z } from "zod";

// 1. Schema Zod definido no escopo de módulo (fora da função)
const meuSchema = z.object({
  campo1: z.string().min(2, "Campo1 deve ter pelo menos 2 caracteres"),
  email:  z.string().email("E-mail inválido"),
  numero: z.coerce.number().int().positive("Deve ser um número positivo"),
  opcao:  z.enum(["OPCAO_A", "OPCAO_B"], { message: "Opção inválida" }),
});

// 2. Tipo inferido — exportar se usado em outros módulos
type MeuInput = z.infer<typeof meuSchema>;

// 3. Server Action — assinatura obrigatória: (prevState, formData)
export async function minhaAction(prevState: unknown, formData: FormData) {
  try {
    // 3a. Converter FormData para objeto plano
    const rawData = Object.fromEntries(formData.entries());

    // 3b. Validar com safeParse (não lança exceção)
    const result = meuSchema.safeParse(rawData);

    if (!result.success) {
      return {
        error: result.error.issues.map((e) => e.message).join(", "),
      };
    }

    const { campo1, email, numero } = result.data; // dados tipados

    // 3c. Verificações de negócio (unicidade, permissões, etc.)
    // ...

    // 3d. Operação no banco
    // await db.insert(minhaTabela).values({ campo1, email, numero });

    return { success: true };
  } catch (error) {
    console.error("MinhaAction Error:", error);
    return { error: "Erro interno. Tente novamente." };
  }
}
```

### ✅ Regras do Padrão A

- `"use server"` **sempre** no topo do `actions.ts`
- Schema Zod **sempre** no escopo de módulo — nunca dentro da função
- Assinatura obrigatória: `(prevState: unknown, formData: FormData)`
- Usar **`safeParse`** — nunca `parse` (evita exceção não tratada)
- Retorno **sempre** `{ error: string }` ou `{ success: true }` — nunca lança para o cliente
- Formulário usa `action={action}` — **sem `onSubmit`**, **sem `e.preventDefault()`**

---

## Padrão B — Client Validation + API Route

**Uso:** Formulários com lógica de UI rica — máscaras (CPF/CNPJ), regras visuais de senha, validação inline ao perder foco, campos condicionais.

### Estrutura de Arquivos

```
src/app/(rota)/_components/
├── MeuForm.tsx              ← "use client" — UI + estado + event handlers
└── meu-form.validation.ts  ← tipos + masks + getFieldErrors() — sem JSX
```

```
src/app/api/v1/(dominio)/route.ts  ← API Route com Zod — mesmo schema
src/lib/validators/auth.ts         ← schema Zod compartilhado
```

> [!IMPORTANT]
> **Single Source of Truth:** o schema Zod deve ficar em `src/lib/validators/` e ser importado tanto pelo `.validation.ts` (frontend) quanto pela API Route (backend). Nunca duplicar o schema.

### `meu-form.validation.ts`

```ts
import { meuSchema } from '@/lib/validators/meu-dominio';
import type { IntlShape } from 'react-intl';

// ─── Tipos ────────────────────────────────────────────────────────

export interface MeuFormData {
    campo1:   string;
    email:    string;
    password: string;
    // ... todos os campos do formulário
}

export type MeuFieldErrors = Partial<Record<keyof MeuFormData, string | null>>;

// ─── Máscaras (se necessário) ─────────────────────────────────────

export function maskCPF(value: string): string {
    return value
        .replace(/\D/g, '')
        .slice(0, 11)
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

// ─── Validação ─────────────────────────────────────────────────────

/**
 * Executa safeParse com o schema compartilhado e retorna erros por campo
 * mapeados para mensagens i18n.
 */
export function getFieldErrors(
    data: MeuFormData,
    formatMessage: IntlShape['formatMessage'],
): MeuFieldErrors {
    const result = meuSchema.safeParse(data);
    if (result.success) return {};

    const flat = result.error.flatten().fieldErrors;
    return {
        campo1:   flat.campo1?.[0]   ? formatMessage({ id: 'form.campo1.error' })   : null,
        email:    flat.email?.[0]    ? formatMessage({ id: 'form.email.invalid' })   : null,
        password: flat.password?.[0] ? formatMessage({ id: 'form.password.weak' }) : null,
    };
}
```

### `MeuForm.tsx`

```tsx
"use client";

import { useState } from 'react';
import { useIntl } from 'react-intl';
import {
    getFieldErrors,
    maskCPF,
    type MeuFieldErrors,
    type MeuFormData,
} from './meu-form.validation';

// Pequenos componentes auxiliares podem ficar no mesmo arquivo
function FieldError({ message }: { message?: string | null }) {
    if (!message) return null;
    return <p className="mt-1 text-xs text-destructive">{message}</p>;
}

export default function MeuForm() {
    const [form, setForm]           = useState<MeuFormData>({ /* valores iniciais */ });
    const [fieldErrors, setErrors]  = useState<MeuFieldErrors>({});
    const [loading, setLoading]     = useState(false);
    const [error, setError]         = useState('');
    const intl = useIntl();

    // Validação por campo ao perder foco
    const validateField = (field: keyof MeuFormData) => {
        const errors = getFieldErrors(form, intl.formatMessage);
        setErrors((prev) => ({ ...prev, [field]: errors[field] ?? null }));
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError('');

        const errors = getFieldErrors(form, intl.formatMessage);
        if (Object.values(errors).some(Boolean)) {
            setErrors(errors);
            return;
        }

        setLoading(true);
        try {
            // Chamar API Route ou store
        } catch (err) {
            setError('Erro ao processar. Tente novamente.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} noValidate>
            <input
                value={form.campo1}
                onChange={(e) => setForm((p) => ({ ...p, campo1: e.target.value }))}
                onBlur={() => validateField('campo1')}
            />
            <FieldError message={fieldErrors.campo1} />

            <button type="submit" disabled={loading}>
                {loading ? 'Processando...' : 'Enviar'}
            </button>
            {error && <p className="text-destructive">{error}</p>}
        </form>
    );
}
```

### `src/lib/validators/meu-dominio.ts` (schema compartilhado)

```ts
import { z } from 'zod';

export const meuSchema = z.object({
    campo1:   z.string().min(2, 'Campo obrigatório'),
    email:    z.string().email('E-mail inválido').toLowerCase().trim(),
    password: z.string().regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/, 'Senha fraca'),
});

export type MeuInput = z.infer<typeof meuSchema>;
```

### `api/v1/(dominio)/route.ts`

```ts
import { meuSchema } from '@/lib/validators/meu-dominio';
import { AppError } from '@/lib/errors';

export const POST = async (request: NextRequest) => {
    try {
        const body = await request.json();
        const parsed = meuSchema.safeParse(body);

        if (!parsed.success) {
            throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', parsed.error.flatten());
        }

        // lógica com parsed.data (tipado)
        return NextResponse.json({ success: true }, { status: 201 });
    } catch (error) {
        return errorResponse(error);
    }
};
```

### ✅ Regras do Padrão B

- Schema Zod fica em `src/lib/validators/<domínio>.ts` — **nunca inline no componente ou no `.validation.ts`**
- O arquivo `.validation.ts` **importa** o schema — nunca o redefine
- O componente `.tsx` **não importa** Zod nem schemas diretamente — só funções e tipos do `.validation.ts`
- Validação por campo: `onBlur` → `validateField(field: keyof FormData)`
- Validação no submit: `getFieldErrors(form, intl.formatMessage)` antes de chamar a API
- `<form noValidate>` — desabilitar validação nativa do browser
- API Route usa o **mesmo schema** para validar o payload

---

## Quando usar cada padrão

```
Formulário simples + dados vão direto pro servidor?
  └─ Usar Padrão A (Server Action)

Formulário com máscaras / validação visual / campos condicionais?
  └─ Usar Padrão B (Client Validation + API Route)
```

> [!NOTE]
> O Padrão A é mais simples e preferido para formulários sem interatividade cliente rica. O Padrão B é necessário quando a UX exige feedback em tempo real (ex: força de senha, CPF formatado, telefone internacional).

---

## Checklist de Implementação

### Padrão A
- [ ] `"use server"` no topo do `actions.ts`
- [ ] Schema Zod no escopo de módulo
- [ ] Assinatura `(prevState: unknown, formData: FormData)`
- [ ] `safeParse` — nunca `parse`
- [ ] Retorno `{ error }` ou `{ success: true }`
- [ ] `<form action={action}>` — sem `onSubmit`

### Padrão B
- [ ] Schema em `src/lib/validators/<domínio>.ts`
- [ ] `<nome>.validation.ts` criado junto ao componente
- [ ] `<form noValidate>` no TSX
- [ ] `onBlur` → `validateField(keyof FormData)`
- [ ] `getFieldErrors()` no submit antes de chamar a API
- [ ] API Route usa o mesmo schema (`safeParse`)
- [ ] Nenhum import de Zod no `.tsx`

---

## Exemplo Real — Registro de Usuário (Padrão B)

```
src/app/(auth)/register/_components/
├── RegisterPage.tsx          ← UI apenas
└── register.validation.ts    ← tipos + máscaras + getRegisterFieldErrors()

src/lib/validators/auth.ts    ← registerSchema (source of truth)
src/app/api/v1/auth/register/route.ts  ← usa registerSchema
```

Ver implementação em:
- [`register.validation.ts`](src/app/(auth)/register/_components/register.validation.ts)
- [`auth.ts`](src/lib/validators/auth.ts)
- [`route.ts`](src/app/api/v1/auth/register/route.ts)
