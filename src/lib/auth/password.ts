import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

/**
 * Gera o hash de uma senha em texto puro usando bcrypt.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Valida se uma senha em texto puro coincide com o hash gravado.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash || !password) return false;
  return bcrypt.compare(password, hash);
}
