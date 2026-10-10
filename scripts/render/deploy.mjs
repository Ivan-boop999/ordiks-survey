// Деплой Ордикс Обследование на Render (free) — API (Docker) + статика webapp.
// Ключи читаются из C:\temp\ordiks-survey-deploy\ (не в репозитории!).
// Запуск: node scripts/render/deploy.mjs [--create] [--update-envs] [--trigger]
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const SECRETS_DIR = 'C:/temp/ordiks-survey-deploy';
const OWNER_ID = 'tea-d9tmirfqj5pc73fvnu70';
const REPO = 'https://github.com/Ivan-boop999/ordiks-survey';
const BRANCH = 'master';
const API_NAME = 'ordiks-survey-api';
const WEB_NAME = 'ordiks-survey';
const API_URL = `https://${API_NAME}.onrender.com`;
const WEB_URL = `https://${WEB_NAME}.onrender.com`;

const apiKey = readFileSync(resolve(SECRETS_DIR, 'render-api-key'), 'utf8').trim();
const jwtSecret = readFileSync(resolve(SECRETS_DIR, 'jwt-secret'), 'utf8').trim();
const databaseUrl = readFileSync(resolve(SECRETS_DIR, 'neon-db-url'), 'utf8').trim();
const b2 = {};
for (const line of readFileSync('C:/temp/prommarket-deploy/b2.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) b2[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const apiSpec = {
  type: 'web_service',
  name: API_NAME,
  ownerId: OWNER_ID,
  repo: REPO,
  branch: BRANCH,
  autoDeploy: 'yes',
  serviceDetails: {
    runtime: 'docker',
    plan: 'free',
    dockerfilePath: './Dockerfile',
    dockerContext: './',
    healthCheckPath: '/health/ready',
  },
  envVars: [
    { key: 'NODE_ENV', value: 'production' },
    { key: 'TRUST_PROXY', value: 'true' },
    { key: 'TRUSTED_PROXY_CLIENT_IP_HEADER', value: 'x-forwarded-for' },
    { key: 'TRUSTED_PROXY_CLIENT_IP_POSITION', value: 'first' },
    { key: 'COOKIE_SECURE', value: 'true' },
    { key: 'EMAIL_DELIVERY', value: 'disabled' },
    { key: 'RATE_LIMIT_STORE', value: 'memory' },
    { key: 'DATABASE_URL', value: databaseUrl },
    { key: 'JWT_SECRET', value: jwtSecret },
    { key: 'WEBAPP_ORIGIN', value: WEB_URL },
    { key: 'DEMO_SEED_ALLOWED', value: '1' },
    { key: 'DEMO_SEED_PASSWORD', value: 'ordiks-demo' },
    { key: 'PRIVATE_STORAGE_DRIVER', value: 's3' },
    { key: 'PRIVATE_STORAGE_REGION', value: b2.PRIVATE_STORAGE_REGION || 'us-west-004' },
    { key: 'PRIVATE_STORAGE_BUCKET', value: b2.PRIVATE_STORAGE_BUCKET },
    { key: 'PRIVATE_STORAGE_ENDPOINT', value: b2.PRIVATE_STORAGE_ENDPOINT },
    { key: 'PRIVATE_STORAGE_ACCESS_KEY_ID', value: b2.PRIVATE_STORAGE_ACCESS_KEY_ID },
    { key: 'PRIVATE_STORAGE_SECRET_ACCESS_KEY', value: b2.PRIVATE_STORAGE_SECRET_ACCESS_KEY },
    { key: 'PRIVATE_STORAGE_FORCE_PATH_STYLE', value: 'true' },
    { key: 'PRIVATE_STORAGE_ALLOW_REMOTE_ENDPOINT', value: 'true' },
    { key: 'PRIVATE_STORAGE_UPLOAD_MAX_BYTES', value: '52428800' },
  ],
};

const webSpec = {
  type: 'static_site',
  name: WEB_NAME,
  ownerId: OWNER_ID,
  repo: REPO,
  branch: BRANCH,
  autoDeploy: 'yes',
  routes: [{ type: 'rewrite', source: '/*', destination: '/index.html' }],
  serviceDetails: {
    buildCommand: 'npm i -g bun && bun install --filter @ordiks-survey/webapp && cd webapp && bun run build',
    publishPath: './webapp/dist',
  },
  envVars: [
    { key: 'VITE_API_URL', value: API_URL },
    { key: 'VITE_DEMO_HINTS', value: '1' },
    { key: 'VITE_DEMO_PASSWORD', value: 'ordiks-demo' },
  ],
};

const outDir = resolve(SECRETS_DIR, 'render');
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'create-api.json'), JSON.stringify(apiSpec, null, 2));
writeFileSync(resolve(outDir, 'create-web.json'), JSON.stringify(webSpec, null, 2));

const args = process.argv.slice(2);
const headers = { Accept: 'application/json', Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

async function call(method, path, body) {
  const res = await fetch(`https://api.render.com/v1${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

if (args.includes('--create')) {
  for (const [label, spec] of [['API', apiSpec], ['WEB', webSpec]]) {
    const r = await call('POST', '/services', spec);
    console.log(`CREATE ${label}: ${r.status}`, r.status < 300 ? (r.json?.service?.id ?? r.json?.id ?? '') : JSON.stringify(r.json).slice(0, 400));
    if (r.json?.id || r.json?.service?.id) {
      writeFileSync(resolve(outDir, `id-${label.toLowerCase()}.txt`), String(r.json?.id ?? r.json?.service?.id));
    }
  }
} else if (args.includes('--trigger')) {
  for (const label of ['api', 'web']) {
    const idFile = resolve(outDir, `id-${label}.txt`);
    if (!existsSync(idFile)) { console.log(`нет id для ${label} — сначала --create`); continue; }
    const id = readFileSync(idFile, 'utf8').trim();
    const dep = label === 'api' ? apiSpec : webSpec;
    const r = await call('POST', `/services/${id}/deploys`, { clearCache: 'do_not_clear' });
    console.log(`TRIGGER ${label}: ${r.status}`);
  }
} else if (args.includes('--status')) {
  const list = await call('GET', '/services?limit=20');
  for (const s of list.json ?? []) {
    if (s.name === API_NAME || s.name === WEB_NAME) {
      console.log(s.name, s.id, s.serviceDetails?.url ?? '', s.activeDeployment?.status ?? 'no-deploy');
      writeFileSync(resolve(outDir, `id-${s.name === API_NAME ? 'api' : 'web'}.txt`), s.id);
    }
  }
} else {
  console.log('Спеки записаны в', outDir);
  console.log('Использование: node scripts/render/deploy.mjs --create | --status | --trigger');
}
