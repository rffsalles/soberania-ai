// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/components/layout/use-current-user', () => ({
  useCurrentUser: () => ({ user: null, isLoading: true }),
}));
vi.mock('@/components/layout/telemetry-badge', () => ({ TelemetryBadge: () => null }));

import StudentLayout from '../(student)/layout';
import TeacherGroupLayout from '../(teacher)/layout';
import AdminGroupLayout from '../(admin)/layout';
import TeacherLayout from '../teacher/layout';
import AdminLayout from '../admin/layout';

const layouts = { StudentLayout, TeacherGroupLayout, AdminGroupLayout, TeacherLayout, AdminLayout };

describe('layouts por área', () => {
  afterEach(() => cleanup());

  for (const [name, Layout] of Object.entries(layouts)) {
    it(`${name} renderiza o header e o conteúdo`, () => {
      render(
        <Layout>
          <p>conteúdo da página</p>
        </Layout>
      );
      expect(screen.getByRole('link', { name: /Soberania/ })).toBeTruthy();
      expect(screen.getByText('conteúdo da página')).toBeTruthy();
    });
  }
});
