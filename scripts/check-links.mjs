#!/usr/bin/env node
/**
 * Verifica, sem navegador, se todo link interno usado em src/app e src/components
 * (href=, router.push/replace, location.href, redirect(), `href: '...'`, ROUTES/API_ROUTES)
 * corresponde a um page.tsx ou route.ts existente em src/app.
 * Route groups "(x)" são transparentes; segmentos "[id]" casam com qualquer valor.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const APP = join(ROOT, 'src/app');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

// 1. rotas existentes
const existing = [];
for (const file of walk(APP)) {
  const base = file.split(sep).pop();
  if (base !== 'page.tsx' && base !== 'route.ts') continue;
  const segs = relative(APP, file)
    .split(sep)
    .slice(0, -1)
    .filter((s) => !/^\(.*\)$/.test(s));
  existing.push({ segs });
}

function segMatches(pattern, value) {
  return /^\[.*\]$/.test(pattern) || pattern === value || value === '*';
}

function exists(link, prefix) {
  const segs = link.split('/').filter(Boolean);
  return existing.some((r) => {
    if (prefix ? r.segs.length < segs.length : r.segs.length !== segs.length) return false;
    return segs.every((s, i) => segMatches(r.segs[i], s));
  });
}

// 2. links usados
const found = new Map(); // link -> { files, prefix }
function add(link, file, prefix = false) {
  const clean = link.split('#')[0].split('?')[0].replace(/\$\{[^}]*\}/g, '*');
  if (!clean.startsWith('/') || clean.startsWith('//') || clean === '/') return;
  const key = clean.replace(/\/$/, '');
  const cur = found.get(key) ?? { files: new Set(), prefix };
  cur.files.add(relative(ROOT, file));
  found.set(key, cur);
}

const patterns = [
  /href=\s*["'`]([^"'`]+)["'`]/g,
  /href=\{\s*["'`]([^"'`]+)["'`]\s*\}/g,
  /href:\s*["'`]([^"'`]+)["'`]/g,
  /router\.(?:push|replace)\(\s*["'`]([^"'`]+)["'`]/g,
  /(?:window\.)?location\.href\s*=\s*["'`]([^"'`]+)["'`]/g,
  /\bredirect\(\s*["'`]([^"'`]+)["'`]/g,
];

const sources = [...walk(APP), ...walk(join(ROOT, 'src/components'))].filter((f) =>
  /\.(tsx?|jsx?)$/.test(f)
);
for (const file of sources) {
  const text = readFileSync(file, 'utf8');
  for (const re of patterns) for (const m of text.matchAll(re)) add(m[1], file);
}

// 3. valores de ROUTES / API_ROUTES (API_ROUTES são prefixos)
const routesFile = join(ROOT, 'src/lib/constants/routes.ts');
const routeValues = [];
const routesText = readFileSync(routesFile, 'utf8');
for (const [, name, body] of routesText.matchAll(
  /export const (ROUTES|API_ROUTES) = \{([\s\S]*?)\} as const/g
)) {
  for (const m of body.matchAll(/:\s*'([^']+)'/g)) {
    const value = m[1].replace(/\[[^\]]+\]/g, '*');
    if (name === 'API_ROUTES') add(value.replace(/\/$/, ''), routesFile, true);
    else routeValues.push(value);
  }
}
// Entradas de ROUTES que só servem de prefixo na matriz de RBAC (ex.: /classroom, que só
// tem /classroom/[id]) são tratadas como prefixo quando existe outra entrada ROUTES abaixo delas.
for (const value of routeValues) {
  const isSection = routeValues.some((o) => o !== value && o.startsWith(`${value}/`));
  add(value, routesFile, isSection && !exists(value, false));
}

const unmatched = [];
for (const [link, { files, prefix }] of found) {
  if (!exists(link, prefix)) unmatched.push({ link, files: [...files] });
}

console.log(`Links verificados: ${found.size}`);
if (unmatched.length) {
  console.error('Links sem page.tsx/route.ts correspondente:');
  for (const u of unmatched) console.error(`  ${u.link}  <- ${u.files.join(', ')}`);
  process.exit(1);
}
console.log('OK: nenhum link morto.');
