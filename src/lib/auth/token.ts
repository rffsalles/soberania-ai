import { SignJWT, jwtVerify } from 'jose';
import { AuthSessionPayload, UserRole } from './types';
import { AUTH_COOKIE_NAME } from './rbac';

/** Segredo de desenvolvimento: aceito apenas fora de produção. */
export const DEFAULT_SECRET = 'soberania-ai-institution-secret-key-32-chars-minimum-safe';
const MIN_SECRET_LENGTH = 32;
const JWT_EXPIRES_IN = '7d';

type SecretEnv = { NODE_ENV?: string; AUTH_SECRET?: string; JWT_SECRET?: string };

/**
 * Em produção exige AUTH_SECRET forte (definido, com 32+ caracteres e diferente do padrão de desenvolvimento)
 * e lança na primeira leitura; fora de produção cai no segredo padrão.
 */
export function resolveJwtSecret(env: SecretEnv = process.env): string {
  const secret = env.AUTH_SECRET || env.JWT_SECRET;
  if (env.NODE_ENV !== 'production') return secret || DEFAULT_SECRET;
  if (!secret) throw new Error('AUTH_SECRET não definido: configure um segredo forte antes de iniciar em produção.');
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`AUTH_SECRET deve ter pelo menos ${MIN_SECRET_LENGTH} caracteres em produção.`);
  }
  if (secret === DEFAULT_SECRET) {
    throw new Error('AUTH_SECRET não pode ser o segredo padrão de desenvolvimento em produção.');
  }
  return secret;
}

function getJwtSecret(): Uint8Array {
  return new TextEncoder().encode(resolveJwtSecret());
}

/**
 * Assina um JWT contendo os dados essenciais da sessão e perfil acadêmico.
 * Compatível com Edge Runtime e Node.js.
 */
export async function signAuthToken(payload: AuthSessionPayload): Promise<string> {
  const secretKey = getJwtSecret();
  return new SignJWT({
    sub: payload.sub,
    name: payload.name,
    email: payload.email,
    role: payload.role,
    enrollment: payload.enrollment,
    sessionId: payload.sessionId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRES_IN)
    .sign(secretKey);
}

/**
 * Verifica a assinatura e validade temporal do JWT no Edge Middleware ou API.
 * Retorna o payload decodificado ou null se inválido/expirado.
 */
export async function verifyAuthToken(token: string): Promise<AuthSessionPayload | null> {
  // Fora do try: segredo mal configurado em produção é erro de configuração, não token inválido.
  const secretKey = getJwtSecret();
  try {
    const { payload } = await jwtVerify(token, secretKey);

    return {
      sub: payload.sub as string,
      name: (payload.name as string) || '',
      email: (payload.email as string) || '',
      role: (payload.role as UserRole) || 'STUDENT',
      enrollment: (payload.enrollment as string | null) || null,
      sessionId: (payload.sessionId as string) || '',
      exp: payload.exp,
      iat: payload.iat,
    };
  } catch {
    return null;
  }
}

/**
 * Cookie `Secure` em produção ou quando FORCE_SECURE_COOKIE=true
 * (ex.: appliance atrás de proxy TLS rodando com NODE_ENV diferente de production).
 */
export function shouldUseSecureCookie(
  env: { NODE_ENV?: string; FORCE_SECURE_COOKIE?: string } = process.env
): boolean {
  return env.NODE_ENV === 'production' || env.FORCE_SECURE_COOKIE === 'true';
}

/**
 * Opções padronizadas de cookies para sessão segura e soberana.
 */
export function getSessionCookieConfig(isProduction: boolean) {
  return {
    name: AUTH_COOKIE_NAME,
    options: {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 dias
    },
  };
}
