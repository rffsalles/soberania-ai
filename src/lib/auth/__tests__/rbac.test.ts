import { describe, expect, it } from 'vitest';
import { Role } from '@prisma/client';
import { canAccessRoute, getDefaultRouteForRole } from '../rbac';

const { STUDENT, TEACHER, ADMIN } = Role;

describe('canAccessRoute', () => {
  it.each([
    '/teacher/plans',
    '/admin/subjects',
    '/admin/classes',
    '/reports',
    '/appliance',
    '/api/v1/admin/teachers',
    '/api/v1/admin/classes',
    '/api/v1/admin/students',
    '/admin/classes/abc/students',
    '/api/v1/teacher/plans',
    '/api/v1/library/materials',
    '/api/v1/mcp',
  ])('nega %s para STUDENT', (path) => {
    expect(canAccessRoute(path, STUDENT)).toBe(false);
  });

  it('permite a mídia de aula para STUDENT, mas não outras rotas de lessons', () => {
    expect(canAccessRoute('/api/v1/teacher/lessons/abc/media', STUDENT)).toBe(true);
    expect(canAccessRoute('/api/v1/teacher/lessons/abc', STUDENT)).toBe(false);
    expect(canAccessRoute('/api/v1/teacher/lessons', STUDENT)).toBe(false);
  });

  it.each([
    '/teacher/plans',
    '/reports',
    '/api/v1/library/materials',
    '/api/v1/admin/subjects',
    '/api/v1/admin/classes',
    '/api/v1/academic-periods',
    '/api/v1/appliance/telemetry',
  ])('permite %s para TEACHER', (path) => {
    expect(canAccessRoute(path, TEACHER)).toBe(true);
  });

  it.each(['/appliance', '/admin/subjects', '/admin/classes', '/api/v1/admin/teachers', '/api/v1/admin/students', '/admin/classes/abc/students'])(
    'nega %s para TEACHER',
    (path) => {
      expect(canAccessRoute(path, TEACHER)).toBe(false);
    },
  );

  it.each([
    '/teacher/plans',
    '/admin/subjects',
    '/admin/classes',
    '/appliance',
    '/reports',
    '/api/v1/admin/teachers',
    '/api/v1/admin/classes',
    '/api/v1/admin/students',
    '/admin/classes/abc/students',
    '/api/v1/appliance/telemetry',
    '/api/v1/mcp',
  ])('permite %s para ADMIN', (path) => {
    expect(canAccessRoute(path, ADMIN)).toBe(true);
  });

  it.each([STUDENT, TEACHER, ADMIN])('permite rotas comuns para %s', (role) => {
    for (const path of [
      '/dashboard',
      '/classroom/x',
      '/office-hours/x',
      '/draft-review/x',
      '/pitch',
      '/materials',
      '/api/v1/agendas',
      '/api/v1/agent/chat',
      '/api/v1/exams/x',
      '/api/v1/drafts',
      '/api/v1/auth/me',
    ]) {
      expect(canAccessRoute(path, role)).toBe(true);
    }
  });

  it('nega API desconhecida até para ADMIN', () => {
    expect(canAccessRoute('/api/v1/rota-inexistente', ADMIN)).toBe(false);
  });

  it('nega área desconhecida sob prefixo de área', () => {
    expect(canAccessRoute('/teacher', STUDENT)).toBe(false);
    expect(canAccessRoute('/admin', TEACHER)).toBe(false);
  });

  it('não confunde prefixos parecidos', () => {
    expect(canAccessRoute('/teachers-lounge', STUDENT)).toBe(true);
  });
});

describe('getDefaultRouteForRole', () => {
  it('retorna a rota inicial de cada papel', () => {
    expect(getDefaultRouteForRole(TEACHER)).toBe('/teacher/plans');
    expect(getDefaultRouteForRole(ADMIN)).toBe('/appliance');
    expect(getDefaultRouteForRole(STUDENT)).toBe('/dashboard');
  });
});
