#!/usr/bin/env node
// Ingesta de una issue de telemetría: extrae el bloque ```json del cuerpo, lo valida contra
// schema/telemetry-schema.json y lo guarda en <proyecto>/<versión>/<timestamp>-<issue>/report.json.
// El cuerpo de la issue es entrada NO confiable: aquí solo se lee del fichero del evento (nunca se interpola
// en un shell) y la ruta de salida se construye únicamente con campos ya validados por el schema.
// Salida: escribe `status=ok|invalid` y `message_file=<ruta>` en $GITHUB_OUTPUT (o por stdout si no existe).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema', 'telemetry-schema.json'), 'utf8'));
const MAX_BODY = 10_000;
const PROJECT = { private: 'lefebvriano-holder', public: 'lefebvriano-holder-public' };

// Subconjunto de JSON Schema (idéntico al validate() de plugins/lf/scripts/telemetry.mjs del arnés).
export function validate(value, schema = SCHEMA, at = '$') {
  const err = [];
  if ('const' in schema && value !== schema.const) err.push(`${at}: debe ser ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) err.push(`${at}: valor fuera de ${JSON.stringify(schema.enum)}`);
  if (schema.type === 'integer' && !Number.isInteger(value)) err.push(`${at}: debe ser entero`);
  if (schema.type === 'string' && typeof value !== 'string') err.push(`${at}: debe ser texto`);
  if (schema.type === 'object' && (value === null || typeof value !== 'object' || Array.isArray(value))) err.push(`${at}: debe ser objeto`);
  if (err.length) return err;
  if (typeof value === 'string' && schema.pattern && !new RegExp(schema.pattern).test(value)) err.push(`${at}: no casa con ${schema.pattern}`);
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) err.push(`${at}: menor que ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) err.push(`${at}: mayor que ${schema.maximum}`);
  }
  if (schema.type === 'object') {
    const props = schema.properties ?? {};
    for (const k of schema.required ?? []) if (!(k in value)) err.push(`${at}.${k}: falta`);
    for (const [k, v] of Object.entries(value)) {
      if (k in props) err.push(...validate(v, props[k], `${at}.${k}`));
      else if (schema.additionalProperties === false) err.push(`${at}.${k}: clave fuera de la lista blanca`);
    }
  }
  return err;
}

// Devuelve { ok, errors, report, file } sin escribir nada.
export function parseIssue(issue) {
  const body = String(issue?.body ?? '');
  if (body.length > MAX_BODY) return { ok: false, errors: [`cuerpo de más de ${MAX_BODY} caracteres`] };
  const m = body.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!m) return { ok: false, errors: ['no hay bloque ```json en el cuerpo'] };
  let report;
  try { report = JSON.parse(m[1]); } catch (e) { return { ok: false, errors: [`JSON inválido: ${e.message}`] }; }
  const errors = validate(report);
  if (errors.length) return { ok: false, errors };
  const stamp = report.period.to.replace(/[-:]/g, '').replace(/\.\d+/, '');
  const number = Number(issue.number);
  if (!Number.isInteger(number) || number < 1) return { ok: false, errors: ['número de issue inválido'] };
  const file = path.join(PROJECT[report.variant], report.plugin_version, `${stamp}-${number}`, 'report.json');
  return { ok: true, errors: [], report, file };
}

function main() {
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const out = process.env.GITHUB_OUTPUT;
  const emit = (k, v) => (out ? fs.appendFileSync(out, `${k}=${v}\n`) : console.log(`${k}=${v}`));
  const tmp = process.env.RUNNER_TEMP || process.env.TMPDIR || '/tmp';
  const messageFile = path.join(tmp, 'ingest-message.md');
  const r = parseIssue(event.issue);
  if (!r.ok) {
    fs.writeFileSync(messageFile, `No se ha podido ingerir este informe:\n\n${r.errors.map((e) => `- ${e}`).join('\n')}\n\nGenera uno válido con \`/lf:telemetry preview\`.\n`);
    emit('status', 'invalid');
    emit('message_file', messageFile);
    return;
  }
  const dest = path.join(ROOT, r.file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(r.report, null, 2) + '\n');
  fs.writeFileSync(messageFile, `Informe ingerido en \`${r.file}\`. Gracias.\n`);
  emit('status', 'ok');
  emit('file', r.file);
  emit('message_file', messageFile);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
