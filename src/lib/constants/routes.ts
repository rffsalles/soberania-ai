/**
 * Rotas de página da aplicação. Única fonte de strings de rota para a matriz
 * de RBAC e para a rota inicial de cada papel.
 */
export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  PITCH: '/pitch',
  DASHBOARD: '/dashboard',
  CLASSROOM: '/classroom',
  CLASSROOM_DETAIL: '/classroom/[id]',
  STUDY_GROUP: '/study-group',
  STUDY_GROUP_DETAIL: '/study-group/[id]',
  EXAM: '/exam',
  EXAM_DETAIL: '/exam/[id]',
  OFFICE_HOURS: '/office-hours',
  OFFICE_HOURS_DETAIL: '/office-hours/[id]',
  DRAFT_REVIEW: '/draft-review',
  DRAFT_REVIEW_DETAIL: '/draft-review/[id]',
  MATERIALS: '/materials',
  REPORTS: '/reports',
  APPLIANCE: '/appliance',
  TEACHER: '/teacher',
  TEACHER_PLANS: '/teacher/plans',
  TEACHER_PLANS_NEW: '/teacher/plans/new',
  TEACHER_LESSONS: '/teacher/lessons',
  TEACHER_SCHEDULES: '/teacher/schedules',
  TEACHER_ASSESSMENTS: '/teacher/assessments',
  TEACHER_MATERIALS: '/teacher/materials',
  ADMIN: '/admin',
  ADMIN_SUBJECTS: '/admin/subjects',
} as const;

/** Prefixos das rotas de API protegidas pelo RBAC. */
export const API_ROUTES = {
  ROOT: '/api/',
  AGENT: '/api/v1/agent',
  AGENDAS: '/api/v1/agendas',
  PEDAGOGY: '/api/v1/pedagogy',
  EXAMS: '/api/v1/exams',
  AUTH_ME: '/api/v1/auth/me',
  AUTH_LOGOUT: '/api/v1/auth/logout',
  TEACHER: '/api/v1/teacher',
  LIBRARY: '/api/v1/library',
  MCP: '/api/v1/mcp',
  ADMIN: '/api/v1/admin',
  ADMIN_SUBJECTS: '/api/v1/admin/subjects',
  ACADEMIC_PERIODS: '/api/v1/academic-periods',
  APPLIANCE: '/api/v1/appliance',
} as const;
