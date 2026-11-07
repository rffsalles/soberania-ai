# Guia de deploy da demo pública

Este guia cobre a demo local com Docker, o deploy na Vercel com Neon, a alternativa Railway, um checklist pós-deploy, custos estimados e o que evitar. Variáveis de exemplo: veja `.env.example`.

## 1. Demo local com Docker Compose (5 passos)

Pré-requisito: Docker com Compose v2.

1. `cp .env.example .env` e preencha `AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY` e `AI_MODEL` (ex.: Groq com `openai/gpt-oss-120b`). Sem chave, use `AI_PROVIDER=mock`.
2. (Opcional) defina `AUTH_SECRET` com 32+ caracteres (`openssl rand -base64 48`). Se vazio, o compose usa um segredo fixo apenas para a demo local.
3. `docker compose up --build`. O entrypoint roda `prisma migrate deploy` e, por padrão, o seed de demonstração (`SEED_DEMO=true`).
4. Abra http://localhost:3000 e entre com os atalhos de demo da tela de login (`NEXT_PUBLIC_DEMO_MODE` vem `true` no compose).
5. Para zerar tudo: `docker compose down -v` (apaga banco e uploads).

Notas:
- O banco fica exposto em `localhost:5433` (imagem `pgvector/pgvector:pg16`).
- Em produção o cookie de sessão é `Secure`. Em `http://localhost` funciona no Chrome e no Firefox, mas não no Safari.
- O serviço `ollama` está comentado no `docker-compose.yml`, com as variáveis necessárias.
- O `.env` é lido pelo serviço `app`, mas `DATABASE_URL` é sobrescrito para apontar para o serviço `db`.

## 2. Vercel + Neon, passo a passo

### 2.1 Banco (Neon)
1. Crie um projeto no Neon (região próxima da função da Vercel, ex.: `us-east-1`/`sa-east-1`).
2. No SQL Editor, rode `CREATE EXTENSION IF NOT EXISTS vector;` (a migração `20261020130000_pgvector_fulltext` também faz isso, mas a role precisa ter permissão; o Neon permite).
3. Copie duas strings de conexão:
   - **pooled** (host com `-pooler`) para `DATABASE_URL`, acrescentando `?sslmode=require&pgbouncer=true&connect_timeout=15`.
   - **direta** (sem `-pooler`) para migrações.
4. Atenção: `prisma/schema.prisma` hoje declara só `url = env("DATABASE_URL")`, sem `directUrl`. `prisma migrate deploy` através do pooler (pgbouncer) pode falhar por causa de advisory locks. Duas saídas:
   - Mais simples: no build da Vercel, rode as migrações com a URL direta (ver 2.3, usa `DIRECT_URL` só no comando do build); a aplicação em runtime usa a URL pooled.
   - Alternativa: adicionar `directUrl = env("DIRECT_URL")` ao datasource (mudança de schema, não feita neste commit).

### 2.2 Armazenamento de arquivos (obrigatório na Vercel)
O disco da Vercel é somente leitura/efêmero. Com `STORAGE_PROVIDER=local`, o upload de material falha. Use **Cloudflare R2** (`STORAGE_PROVIDER=r2` + variáveis `R2_*`). Crie um bucket privado e uma chave de API com acesso de leitura/escrita só a esse bucket.

### 2.3 Projeto na Vercel
1. Importe o repositório. Framework: Next.js (detectado).
2. `vercel.json` (na raiz) já define o build: `prisma generate && prisma migrate deploy && next build`. Para isso funcionar com o pooler, cadastre `DATABASE_URL` com a URL **direta** no escopo *Build* e a pooled no escopo *Runtime*, ou aceite a URL pooled se o `migrate deploy` passar no seu caso (teste).
3. Cadastre as variáveis de ambiente (seção 2.4) e faça o deploy.
4. Funções de IA/upload podem passar de 10 s (limite do plano Hobby). Respostas longas da tutora e OCR podem estourar o timeout; o plano Pro eleva o limite.

### 2.4 Variáveis de ambiente (sem valores)

Obrigatórias:
- `DATABASE_URL`: conexão PostgreSQL com pgvector (pooled no runtime).
- `AUTH_SECRET`: segredo de assinatura das sessões; 32+ caracteres. Em produção o servidor recusa iniciar sem ele.
- `AI_PROVIDER`: `groq` para a demo.
- `AI_BASE_URL`: URL compatível com OpenAI; para o Groq, `https://api.groq.com/openai/v1`.
- `AI_API_KEY`: chave Groq. Só no servidor; nunca com prefixo `NEXT_PUBLIC_`.
- `AI_MODEL`: use `openai/gpt-oss-120b` (outros modelos do Groq no plano gratuito têm limites de tokens por minuto muito baixos).
- `STORAGE_PROVIDER`: `r2` na Vercel.
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT`: credenciais e destino do bucket. `R2_PUBLIC_DOMAIN` só se o bucket for servido por domínio público.

Recomendadas:
- `NEXT_PUBLIC_DEMO_MODE`: `true` exibe atalhos de login com as credenciais do seed. Lida no **build**; mudar exige novo deploy.
- `NEXT_PUBLIC_INSTITUTION_TIMEZONE`: fuso IANA (padrão `America/Sao_Paulo`). Lida no build.
- `NEXT_PUBLIC_AGENDA_IGNORE_TIME_WINDOW`: `true` libera sessões fora do horário, útil na demo para que a aula esteja sempre aberta. Lida no build. Nunca em produção real.
- `MAX_UPLOAD_SIZE_MB`: limite de upload (a Vercel limita o corpo da requisição a cerca de 4,5 MB em funções; arquivos maiores precisam de outra rota).
- `ALLOWED_DOCUMENT_EXTENSIONS`: extensões aceitas (padrão `pdf,docx,txt,md`).
- `ENABLE_OCR`, `OCR_MAX_PAGES`: OCR de PDFs escaneados; desligue (`ENABLE_OCR=false`) na Vercel se houver timeouts.
- `AI_EMBEDDING_MODEL`, `AI_EMBEDDING_BASE_URL`, `AI_EMBEDDING_API_KEY`: embeddings para busca vetorial. O Groq não oferece embeddings; deixe vazio para busca apenas lexical. Se usar, a dimensão tem de ser 1024.

Não definir na demo: `ENABLE_PYTHON_SANDBOX` (executa código gerado por LLM), `AI_ALLOW_INSECURE_TLS`, `FORCE_SECURE_COOKIE` (já é implícito em produção).

### 2.5 Seed e primeiro administrador
O seed e o `admin:create` rodam da sua máquina, apontando para o banco do Neon (URL direta):

```bash
export DATABASE_URL="<url direta do Neon>"
npx prisma migrate deploy        # se ainda não rodou no build
npm run db:seed                  # usuários e dados de demonstração
npm run admin:create -- --email voce@dominio.com --name "Seu Nome" --password "senha-forte"
```

Não use `prisma migrate dev` contra esse banco: por drift do pgvector ele gera `DROP`s espúrios. Em produção é sempre `migrate deploy`.

### 2.6 O que o modo demo expõe
Com `NEXT_PUBLIC_DEMO_MODE=true`, a tela de login mostra os atalhos com matrícula e senha dos usuários do seed (admin `ADM001`/`admin123`, professor `PROF001`/`prof123`, aluno `202601001`/`aluno123`). Qualquer visitante vira administrador da demo. Consequências:
- Os dados da demo são públicos e podem ser alterados ou apagados por qualquer pessoa.
- Cada visitante gasta sua cota de IA (Groq) e armazenamento.
- Não crie o administrador real com as senhas do seed. Se quiser, apague ou troque a senha do usuário `admin@soberania.edu.br` depois da apresentação.

## 3. Alternativa: Railway (5 linhas)

1. Crie um projeto no Railway, adicione o serviço PostgreSQL com pgvector (template "pgvector") ou use o Neon.
2. Adicione um serviço a partir do repositório; o Railway usa o `Dockerfile` da raiz.
3. Defina as mesmas variáveis da seção 2.4, mais `SEED_DEMO=true` na primeira subida (o entrypoint roda `migrate deploy` e o seed), e `NEXT_PUBLIC_DEMO_MODE` como *build variable*.
4. Com disco persistente, monte um volume em `/app/storage` e mantenha `STORAGE_PROVIDER=local`; sem volume, use R2.
5. Gere o domínio público nas configurações de rede do serviço (porta 3000).

## 4. Checklist pós-deploy

- [ ] A página `/login` carrega e mostra os atalhos de demo (se habilitado).
- [ ] Login como professor, aluno e admin funciona (cookie de sessão persistente após recarregar).
- [ ] Upload de um PDF/DOCX pequeno como professor; o material aparece como processado.
- [ ] Como aluno, em uma sessão de aula, fazer uma pergunta à tutora sobre o conteúdo do material.
- [ ] A resposta chega sem erro 503 (um 429 do Groq vira 503 para o usuário; tente de novo após alguns segundos).
- [ ] As citações da resposta apontam para o material correto.
- [ ] Logs da Vercel sem erros de Prisma (`vector` inexistente, `DATABASE_URL`) nem de R2.

## 5. Custos mensais estimados

Valores aproximados em USD, sujeitos a mudança; confira as páginas de preço atuais antes de decidir.

| Item | Faixa |
| --- | --- |
| Vercel Hobby | 0 (uso não comercial, limites baixos de tempo de função) |
| Vercel Pro | cerca de 20 por membro |
| Neon Free | 0 (armazenamento e horas de computação limitados; escala a zero) |
| Neon Launch | cerca de 5 a 20, conforme uso |
| Groq | 0 no plano gratuito (com limites de taxa) ou pago por token; para uma demo, normalmente poucos dólares |
| Cloudflare R2 | 0 a poucos dólares (10 GB gratuitos) |

Demo mínima viável: cerca de 0 a 10 por mês. Com Vercel Pro e Neon Launch: cerca de 25 a 50. Todos os números são estimativas.

## 6. O que NÃO fazer na demo pública

- Não use dados reais de alunos, professores ou instituição (LGPD). Use apenas o seed ou dados fictícios.
- Não coloque chaves em variáveis `NEXT_PUBLIC_*`: elas vão para o bundle do navegador. `AI_API_KEY`, `R2_*` e `AUTH_SECRET` ficam só no servidor.
- Não commite `.env`.
- Não deixe `ENABLE_PYTHON_SANDBOX=true`.
- Não reutilize a senha do administrador de demo em contas reais.
- Não aponte a demo para o banco de produção de uma instituição.
- Não use `NEXT_PUBLIC_AGENDA_IGNORE_TIME_WINDOW=true` em uma instalação real.
- Considere limitar o gasto no painel da Groq e alertas de uso na Vercel/Neon.
