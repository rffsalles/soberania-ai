import { DEMO_CREDENTIALS } from '../../src/lib/constants/demo-credentials';

export const DEMO_USERS = DEMO_CREDENTIALS.map(({ name, email, enrollment, password, role }) => ({
  name,
  email,
  enrollment,
  passwordPlain: password,
  role,
}));
