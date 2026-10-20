import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hashPassword, verifyPassword } from '../password';
import { signAuthToken, verifyAuthToken } from '../token';
import {
  canAccessRoute,
  getDefaultRouteForRole,
  isPublicRoute,
  AUTH_COOKIE_NAME,
} from '../rbac';
import { Role } from '@prisma/client';

describe('Soberania Auth & RBAC Security Suite', () => {
  describe('Password Hashing & Verification', () => {
    it('deve gerar um hash bcrypt válido e validar senha correta', async () => {
      const plainTextSecret = ['senha', 'teste', '2026'].join('_');
      const hash = await hashPassword(plainTextSecret);

      expect(hash).toBeDefined();
      expect(hash.startsWith('$2a$') || hash.startsWith('$2b$')).toBe(true);

      const isValid = await verifyPassword(plainTextSecret, hash);
      expect(isValid).toBe(true);

      const isInvalid = await verifyPassword('senhaerrada', hash);
      expect(isInvalid).toBe(false);
    });

    it('deve retornar falso ao verificar senhas vazias ou nulas', async () => {
      expect(await verifyPassword('', 'qualquerhash')).toBe(false);
      expect(await verifyPassword('senha', '')).toBe(false);
    });
  });

  describe('JWT Edge Tokens (jose)', () => {
    it('deve assinar e verificar um token JWT com metadados de sessão', async () => {
      const payload = {
        sub: 'usr_123',
        name: 'Maria Aluna',
        email: 'maria@soberania.edu.br',
        role: Role.STUDENT,
        enrollment: '202601001',
        sessionId: 'sess_abc',
      };

      const token = await signAuthToken(payload);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      const verified = await verifyAuthToken(token);
      expect(verified).not.toBeNull();
      expect(verified?.sub).toBe('usr_123');
      expect(verified?.role).toBe(Role.STUDENT);
      expect(verified?.enrollment).toBe('202601001');
      expect(verified?.sessionId).toBe('sess_abc');
    });

    it('deve rejeitar tokens forjados ou corrompidos', async () => {
      const invalidToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.fake_signature';
      const verified = await verifyAuthToken(invalidToken);
      expect(verified).toBeNull();
    });
  });

  describe('RBAC Route Protection Rules', () => {
    it('deve classificar apenas a raiz e login como públicas', () => {
      expect(isPublicRoute('/')).toBe(true);
      expect(isPublicRoute('/login')).toBe(true);
      expect(isPublicRoute('/api/v1/auth/login')).toBe(true);
      expect(isPublicRoute('/favicon.ico')).toBe(true);

      // Pitch e rotas internas são estritamente protegidas
      expect(isPublicRoute('/pitch')).toBe(false);
      expect(isPublicRoute('/dashboard')).toBe(false);
      expect(isPublicRoute('/appliance')).toBe(false);
      expect(isPublicRoute('/materials')).toBe(false);
    });

    it('deve permitir acesso ao /appliance apenas para ADMIN', () => {
      expect(canAccessRoute('/appliance', Role.ADMIN)).toBe(true);
      expect(canAccessRoute('/appliance', Role.TEACHER)).toBe(false);
      expect(canAccessRoute('/appliance', Role.STUDENT)).toBe(false);
    });

    it('deve manter /materials (legado, redirect) acessível a qualquer perfil e proibir /teacher/materials ao STUDENT', () => {
      expect(canAccessRoute('/materials', Role.TEACHER)).toBe(true);
      expect(canAccessRoute('/materials', Role.ADMIN)).toBe(true);
      expect(canAccessRoute('/materials', Role.STUDENT)).toBe(true);
      expect(canAccessRoute('/teacher/materials', Role.STUDENT)).toBe(false);
    });

    it('deve permitir acesso ao /pitch para qualquer perfil autenticado', () => {
      expect(canAccessRoute('/pitch', Role.STUDENT)).toBe(true);
      expect(canAccessRoute('/pitch', Role.TEACHER)).toBe(true);
      expect(canAccessRoute('/pitch', Role.ADMIN)).toBe(true);
    });

    it('deve retornar a rota inicial correta por papel', () => {
      expect(getDefaultRouteForRole(Role.ADMIN)).toBe('/appliance');
      expect(getDefaultRouteForRole(Role.TEACHER)).toBe('/teacher/plans');
      expect(getDefaultRouteForRole(Role.STUDENT)).toBe('/dashboard');
    });
  });
});
