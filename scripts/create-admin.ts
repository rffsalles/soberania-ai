/**
 * Cria o primeiro ADMIN de uma instalação de produção (sem depender do seed de demonstração).
 *
 * Uso: npm run admin:create -- --email admin@instituicao.edu.br --name "Nome" --password "senha-forte"
 *      [--enrollment ADM001]  (padrão: o próprio e-mail)
 */
import { Role } from '@prisma/client';
import { hashPassword } from '@/lib/auth/password';
import { createUser, findUserByEmailOrEnrollment } from '@/domains/auth/services/user-repository';

const MIN_PASSWORD_LENGTH = 8;
const USAGE =
  'Uso: npm run admin:create -- --email <email> --name <nome> --password <senha> [--enrollment <matrícula>]';

type AdminArgs = { email: string; name: string; password: string; enrollment: string };

function parseArgs(argv: string[]): AdminArgs {
  const values: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(USAGE);
    values[key.slice(2)] = value;
  }
  const email = values.email?.trim().toLowerCase();
  const name = values.name?.trim();
  const password = values.password ?? '';
  if (!email || !email.includes('@') || !name) throw new Error(USAGE);
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  return { email, name, password, enrollment: values.enrollment?.trim() || email };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const existing = await findUserByEmailOrEnrollment(args.email, args.enrollment);
  if (existing) throw new Error('Já existe um usuário com este e-mail ou matrícula.');

  const admin = await createUser({
    name: args.name,
    email: args.email,
    enrollment: args.enrollment,
    passwordHash: await hashPassword(args.password),
    role: Role.ADMIN,
  });
  console.log(`ADMIN criado: ${admin.email} (matrícula ${admin.enrollment}).`);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
