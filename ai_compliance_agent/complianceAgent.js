import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { google } from 'googleapis';
import { MongoClient } from 'mongodb';
import OpenAI from 'openai';
import { htmlToText } from 'html-to-text';
import cron from 'node-cron';

console.log('[BOOT] complianceAgent.js loaded from', import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const envPath = path.resolve(__dirname, '../.env');
console.log('ENV path ->', envPath, 'exists?', fs.existsSync(envPath));

const result = dotenv.config({ path: envPath, override: true, debug: true });

if (result.error) {
  console.error('dotenv error:', result.error);
} else {
}




/* =====================
   Config
===================== */
const {
  GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET,
  GMAIL_REFRESH_TOKEN,
  DATABASE_URL,
  GMAIL_USER,
  ALLOWED_SENDERS, // comma-separated list
  MONGODB_URI,
  MONGODB_DB,
  OPENAI_API_KEY,
  CRON_SCHEDULE, // e.g. "*/2 * * * *" every 2 minutes
  LOOKBACK_DAYS = '7'
} = process.env;

// — термины упаковки, которые исключаем из BOM (регистронезависимо)
const PACKAGING_TERMS = [
  'label','sticker',
  'carton','box','tray','insert',
  'bag','sachet','pouch','polybag','wrap',
  'package','packaging','ctn','pkc','pkg','lbl','lab','pch','sach','wrp', 'pad', 'ptn', 'PARTITION'
];
// единый регэксп для Mongo
const PACKAGING_PATTERN = `\\b(?:${PACKAGING_TERMS.join('|')})\\b`;

if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN || !GMAIL_USER) {
  console.error('Missing Gmail OAuth env vars. Please set GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN/GMAIL_USER');
  process.exit(1);
}
if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY');
  process.exit(1);
}

const allowedSenders = (ALLOWED_SENDERS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

/* =====================
   Gmail client (OAuth2)
===================== */
const oAuth2Client = new google.auth.OAuth2({
  clientId: GMAIL_CLIENT_ID,
  clientSecret: GMAIL_CLIENT_SECRET,
});
oAuth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });
const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

/* =====================
   Mongo
===================== */

// --- Mongo env handling (поддержка MONGODB_URI или DATABASE_URL) ---
const RAW_MONGO = MONGODB_URI || DATABASE_URL;
if (!RAW_MONGO) {
  console.error('Missing MongoDB connection string. Set MONGODB_URI or DATABASE_URL');
  process.exit(1);
}

// Если MONGODB_DB не задано — пробуем вытащить имя БД из URL (.../<dbName>?...)
function extractDbName(uri) {
  const m = uri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?\/]+)(?:\?|$)/i);
  return m?.[1] || null;
}
const DB_NAME = MONGODB_DB || extractDbName(RAW_MONGO) || 'cloud_compliance';

/* =====================
   Mongo
===================== */
const mongoClient = new MongoClient(RAW_MONGO, { serverSelectionTimeoutMS: 8000 });
let db, materialsCol, documentsCol, processedEmailsCol, bomCol, regulatoryCol;


/* =====================
   OpenAI (Responses API + Structured Output)
===================== */
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const extractionSchema = {
  // это имя используем только для справки
  name: 'EmailExtraction',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      intent: { type: 'string', description: 'Short description of what the sender wants' },
      parts: {
        type: 'array',
        description: 'Unique part numbers requested or mentioned',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            partNumber: { type: 'string' }        // <-- только обязательное поле
          },
          required: ['partNumber']                 // <-- теперь required покрывает все properties
        }
      },
      regulations: {
        type: 'array',
        description: 'Requested/mentioned regulations or standards',
        items: { type: 'string' }
      },
      dueDate: { type: 'string', description: 'Any explicit deadline text if present' },
      attachmentsHint: { type: 'boolean', description: 'True if the email references attachments' }
    },
    required: ['intent', 'parts']
  }
};
async function markThreadAsRead(threadId) {
  try {
    await gmail.users.threads.modify({
      userId: 'me',
      id: threadId,
      requestBody: { removeLabelIds: ['UNREAD'] }
    });
  } catch (e) {
    console.error('[MARK THREAD READ ERROR]', e?.response?.data || e.message || e);
  }
}


async function classifyAndExtractWithOpenAI(subject, body) {
  const sys = `You are an assistant that classifies and extracts data from customer e-mails.

• If the e-mail IS a compliance request that refers to
  * specific part numbers (products, SKUs, items)
  * certification / regulatory questions
  then return JSON with:
    {
      "category": "compliance",
      "partNumbers": ["string", ...],
      "question": "string",
      "regulations": ["string", ...],
      "dueDate": "YYYY-MM-DD" // or null
    }

• If the e-mail is about ANYTHING ELSE (sales inquiry, shipping, invoice, personal message, etc.)
  return JSON with:
    {
      "category": "other",
      "summary": "one-sentence description of what the sender wants"
    }

Strict rules:
– Output ONLY valid minified JSON (no comments, no Markdown).
– Keys must appear exactly as specified.
– Do not include additional keys.`;

  const user = `Subject: ${subject || '(no subject)'}\n\nBody:\n${body || ''}`;

  const resp = await openai.responses.create({
    model: 'gpt-5-nano',      // важно: mini, не nano
    input: [
      { role: 'system', content: sys },
      { role: 'user',   content: user }
    ]
  });

  const jsonStr = (resp.output_text || '').trim();

  // Дебаг-вывод — чтобы видеть, что реально пришло от модели
  if (process.env.DEBUG_OPENAI_DUMP === 'true') {
    console.log('[OPENAI output_text]', jsonStr.slice(0, 2000));
  }

  if (!jsonStr) {
    throw new Error('OpenAI returned empty output_text');
  }

  let data;
  try {
    data = JSON.parse(jsonStr);
  } catch (e) {
    // Жёстко: падаем, никаких fallback'ов
    throw new Error(`OpenAI returned invalid JSON: ${e.message}. Raw: ${jsonStr.slice(0, 500)}`);
  }

  // Мини-валидация схемы (корневой уровень)
  if (data.category === 'compliance') {
    const allowed = ['category','partNumbers','question','regulations','dueDate'];
    const keys = Object.keys(data);
    if (!keys.every(k => allowed.includes(k)) || !allowed.every(k => keys.includes(k))) {
      throw new Error(`Schema mismatch for "compliance": keys=${keys.join(',')}`);
    }
    if (!Array.isArray(data.partNumbers) || !Array.isArray(data.regulations)) {
      throw new Error('Schema mismatch: "partNumbers" and "regulations" must be arrays');
    }
    if (!(typeof data.question === 'string')) {
      throw new Error('Schema mismatch: "question" must be string');
    }
    if (!(typeof data.dueDate === 'string' || data.dueDate === null)) {
      throw new Error('Schema mismatch: "dueDate" must be string or null');
    }
  } else if (data.category === 'other') {
    const allowed = ['category','summary'];
    const keys = Object.keys(data);
    if (!keys.every(k => allowed.includes(k)) || !allowed.every(k => keys.includes(k))) {
      throw new Error(`Schema mismatch for "other": keys=${keys.join(',')}`);
    }
    if (!(typeof data.summary === 'string')) {
      throw new Error('Schema mismatch: "summary" must be string');
    }
  } else {
    throw new Error(`Schema mismatch: unexpected category "${data.category}"`);
  }

  return data;
}





/* =====================
   Gmail Utilities
===================== */
function buildSearchQuery() {
  const parts = [
    'label:inbox',
    'is:unread',
    `newer_than:${LOOKBACK_DAYS}d`
  ];
  if (allowedSenders.length) {
    const froms = allowedSenders.map(e => `from:${e}`).join(' OR ');
    parts.push(`(${froms})`);
  }
  return parts.join(' ');
}

async function listUnreadMessages() {
  const q = buildSearchQuery();
  const res = await gmail.users.messages.list({ userId: 'me', q, maxResults: 10 });
  return res.data.messages || [];
}

function decodeBase64Url(data) {
  const buff = Buffer.from((data || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  return buff.toString('utf8');
}

function findHeader(headers, name) {
  return headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
}

function extractTextFromPayload(payload) {
  // Prefer text/plain; fallback to text/html; fallback to body.data
  const stack = [payload];
  let html = '', text = '';
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    if (node.mimeType === 'text/plain' && node.body?.data) {
      text += decodeBase64Url(node.body.data) + '\n';
    } else if (node.mimeType === 'text/html' && node.body?.data) {
      html += decodeBase64Url(node.body.data) + '\n';
    }
    (node.parts || []).forEach(p => stack.push(p));
  }
  if (!text && html) text = htmlToText(html, { wordwrap: 120 });
  if (!text && payload?.body?.data) text = decodeBase64Url(payload.body.data);
  return { text, html };
}

async function getMessage(id) {
  const res = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
  return res.data;
}

async function markAsRead(id) {
  await gmail.users.messages.modify({ userId: 'me', id, requestBody: { removeLabelIds: ['UNREAD'] } });
}

async function addLabel(id, labelName) {
  // Ensure label exists (create or get)
  const { data } = await gmail.users.labels.list({ userId: 'me' });
  const existing = data.labels?.find(l => l.name === labelName);
  let labelId = existing?.id;
  if (!labelId) {
    const created = await gmail.users.labels.create({ userId: 'me', requestBody: { name: labelName, labelListVisibility: 'labelShow', messageListVisibility: 'show' } });
    labelId = created.data.id;
  }
  await gmail.users.messages.modify({ userId: 'me', id, requestBody: { addLabelIds: [labelId] } });
}

async function sendReply({ threadId, subject, to, body, inReplyTo = null, references = null }) {
  // GMAIL_USER должен быть ПОЛНЫМ адресом твоей учётки Gmail (например, "mybot@gmail.com")
  // Опционально можно сделать красивое имя: 'DWK Compliance <mybot@gmail.com>'
  const FROM = process.env.GMAIL_USER;

  const lines = [];
  lines.push(`From: ${FROM}`);
  lines.push(`To: ${to}`);
  lines.push(`Subject: Re: ${subject}`);
  lines.push('MIME-Version: 1.0');
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  // для сохранения треда полезно добавить эти два заголовка, если есть
  if (inReplyTo)  lines.push(`In-Reply-To: ${inReplyTo}`);
  if (references) lines.push(`References: ${references}${inReplyTo ? ` ${inReplyTo}` : ''}`);
  lines.push('');               // пустая строка отделяет заголовки от тела
  lines.push(body);

  const raw = Buffer
    .from(lines.join('\r\n'), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw, threadId }   // threadId удерживает ответ в существующем треде
  });
}

// Умеет находить (ref:...:ref) и ref:...:ref (без скобок),
// игнорирует zero-width символы, ищет в subject+text+html
function findSalesforceRef({ subject = '', text = '', html = '' } = {}) {
  const hay = [subject, text, html]
    .filter(Boolean)
    .join('\n')
    // убираем zero-width и BOM
    .replace(/[\u200B-\u200D\uFEFF]/g, '');

  // 1) С приоритетом возвращаем вариант уже в скобках — "как в оригинале"
  const m1 = hay.match(/\((\s*ref:[A-Za-z0-9.!_\-]+:ref\s*)\)/i);
  if (m1) return `(${m1[1].trim()})`;

  // 2) Без скобок — оборачиваем сами
  const m2 = hay.match(/\bref:[A-Za-z0-9.!_\-]+:ref\b/i);
  if (m2) return `(${m2[0]})`;

  return null;
}


function renderCompliance(bomWithCompliance) {
  const lines = [];
  for (const m of bomWithCompliance) {
    lines.push(`Material ${m.material}:`);
    if (!m.components?.length) { lines.push('  · (no components found)'); continue; }

    for (const c of m.components) {
      lines.push(`  · ${c.material} — ${c.description || ''} (supplier: ${c.supplier || '-'})`);
      const entries = Object.entries(c.compliance || {});
      if (!entries.length) { lines.push('     – (no regulatory mapping)'); continue; }

      for (const [regKey, info] of entries) {
        if (info.status === 'covered_material') {
          const exp = info.expiresOn ? `; exp: ${new Date(info.expiresOn).toISOString().slice(0,10)}` : '';
          lines.push(`     – ${regKey}: ✔ covered (material-specific)${exp}${info.evidenceUrl ? ` [evidence] ${info.evidenceUrl}` : ''}`);
        } else if (info.status === 'covered_supplier') {
          const exp = info.expiresOn ? `; exp: ${new Date(info.expiresOn).toISOString().slice(0,10)}` : '';
          lines.push(`     – ${regKey}: ✔ covered (supplier-wide)${exp}${info.evidenceUrl ? ` [evidence] ${info.evidenceUrl}` : ''}`);
        } else if (info.status === 'expired') {
          const exp = info.expiresOn ? ` on ${new Date(info.expiresOn).toISOString().slice(0,10)}` : '';
          lines.push(`     – ${regKey}: ⚠ expired${exp}${info.evidenceUrl ? ` [evidence] ${info.evidenceUrl}` : ''}`);
        } else {
          lines.push(`     – ${regKey}: ✖ missing`);
        }
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}



// async function debugFindRawMaterials(ids = []) {
//   const q = ids.map(x => String(x).trim());
//   const sample = await bomCol.find(
//     { $expr: { $in: [{ $toString: '$Material' }, q] } },
//     { projection: { _id:0, Material:1, Component:1, ItemTextLine:1, Name:1 }, limit: 5 }
//   ).toArray();
// }
// Возвращает [{ material: "209547", components: [{ material, description, supplier }] }, ...]
async function fetchBomForMaterials(partNumbers = []) {
  if (!partNumbers.length) return [];

  const wanted = partNumbers.map(x => String(x).trim());

  const pipeline = [
    // Нормализуем типы к строкам
    {
      $addFields: {
        Material_str:  { $toString: '$Material' },
        Component_str: { $toString: '$Component' },
        ItemTextLine_s: { $ifNull: ['$ItemTextLine', ''] },
        Name_s:         { $ifNull: ['$Name', ''] }
      }
    },
    // Только запрошенные материалы
    { $match: { Material_str: { $in: wanted } } },

    // Исключаем упаковку по описанию (регистронезависимо)
    // Вариант с $regexMatch — корректно работает с опциями
    {
      $match: {
        $expr: {
          $not: {
            $regexMatch: {
              input: '$ItemTextLine_s',
              regex: PACKAGING_PATTERN, // <— строка, НЕ RegExp
              options: 'i'
            }
          }
        }
      }
    },

    // Отсортируем, чтобы выдача была стабильной (сначала по Material, потом по Component)
    { $sort: { Material_str: 1, Component_str: 1 } },

    // Схлопнем дубликаты одной пары Material-Component
    {
      $group: {
        _id: { material: '$Material_str', component: '$Component_str' },
        description: { $last: '$ItemTextLine_s' },
        supplier:    { $last: '$Name_s' }
      }
    },

    // Сформируем массив components на каждый материал
    {
      $group: {
        _id: '$_id.material',
        components: {
          $push: {
            material:    '$_id.component',
            description: '$description',
            supplier:    '$supplier'
          }
        }
      }
    },

    // Итоговая проекция
    { $project: { _id: 0, material: '$_id', components: 1 } }
  ];

  const rows = await bomCol.aggregate(pipeline).toArray();

  const byMat = new Map(rows.map(r => [r.material, r]));
  return wanted.map(m => byMat.get(m) || { material: m, components: [] });
}

// boms: [{ material, components:[{material, description, supplier}]}]
// regsFromAI: массив строк из extraction.regulations
function sameCode(a = '', b = '') {
  // нормализация кодов материала/компонента (убираем пробелы, регистр)
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

// boms: [{ material, components:[{material, description, supplier}]}]
// regsFromAI: массив строк из extraction.regulations
async function checkRegulatoryForComponents(boms, regsFromAI = []) {
  const requestedKeys = [...new Set(regsFromAI.map(canonicalizeReg))];
  const patterns = requestedKeys.map(regKeyToPattern); // regex-строки без флагов
  if (!patterns.length) {
    return boms.map(b => ({
      material: b.material,
      components: b.components.map(c => ({ ...c, compliance: {} }))
    }));
  }

  // Сбор всех поставщиков из BOM
  const suppliers = new Set();
  for (const b of boms) for (const c of b.components) if (c.supplier) suppliers.add(c.supplier);

  // Поднимем все релевантные документы по каждому поставщику (по regs)
  const bySupplierDocs = new Map();
  for (const sup of suppliers) {
    const supplierRegexes = buildSupplierRegexes(sup); // из предыдущего шага
    const docs = await regulatoryCol.find({
      $and: [
        { $or: supplierRegexes.map(r => ({ supplierName: { $regex: r, $options: 'i' } })) },
        { $or: patterns.map(p => ({ regulations: { $elemMatch: { $regex: p, $options: 'i' } } })) }
      ]
    }, {
      projection: {
        supplierName: 1,
        regulations: 1,
        effectiveFrom: 1,
        expiresOn: 1,
        evidenceUrl: 1,
        scopeType: 1,
        scopeValue: 1
      }
    }).toArray();
    bySupplierDocs.set(sup, docs);
  }

  const now = new Date();

  // Для каждого компонента определим покрытие по каждой регуляции:
  const out = [];
  for (const b of boms) {
    const comps = [];

    for (const comp of b.components) {
      const docs = bySupplierDocs.get(comp.supplier) || [];
      const compliance = {};

      for (let i = 0; i < requestedKeys.length; i++) {
        const key = requestedKeys[i];
        const pat = patterns[i];
        const rx = new RegExp(pat, 'i');

        // 1) Сначала ищем материал-специфичные документы, scopeType ~ "material"
        const matDoc = docs.find(d => {
          if (!Array.isArray(d.regulations) || !d.scopeType) return false;
          if (!rx.test(d.regulations.join(' '))) return false;

          const st = String(d.scopeType).toLowerCase();
          if (!st.includes('material') && !st.includes('part') && !st.includes('component')) return false;

          // scopeValue может быть строкой, числом, массивом — приведём к массиву строк
          const sv = Array.isArray(d.scopeValue) ? d.scopeValue : (d.scopeValue != null ? [d.scopeValue] : []);
          return sv.some(v => sameCode(v, comp.material));
        });

        // 2) Если нет, ищем supplier-wide
        const supDoc = matDoc ? null : docs.find(d => {
          if (!Array.isArray(d.regulations)) return false;
          if (!rx.test(d.regulations.join(' '))) return false;
          const st = String(d.scopeType || '').toLowerCase();
          return st.includes('supplier'); // supplier_wide
        });

        const hit = matDoc || supDoc;

        if (!hit) {
          compliance[key] = { status: 'missing' };
          continue;
        }

        // Проверка срока
        const expired = hit.expiresOn ? (new Date(hit.expiresOn) < now) : false;

        compliance[key] = {
          status: expired ? 'expired'
                          : (matDoc ? 'covered_material' : 'covered_supplier'),
          evidenceUrl: hit.evidenceUrl || null,
          effectiveFrom: hit.effectiveFrom || null,
          expiresOn: hit.expiresOn || null,
          scopeType: hit.scopeType || null,
          scopeValue: hit.scopeValue ?? null
        };
      }

      comps.push({ ...comp, compliance });
    }

    out.push({ material: b.material, components: comps });
  }

  return out;
}





/* =====================
   Domain Logic
===================== */
function normalizeReg(name = '') {
  const s = name.toLowerCase();
  if (s.includes('reach')) return 'REACH';
  if (s.includes('rohs')) return 'RoHS';
  if (s.includes('tsca')) return 'TSCA';
  if (s.includes('pfas')) return 'PFAS';
  if (s.includes('prop')) return 'Prop 65';
  if (s.includes('iec 62474')) return 'IEC 62474';
  if (s.includes('cmrt') || s.includes('conflict mineral')) return 'CMRT';
  if (s.match(/\b660\b/)) return 'USP <660>';
  if (s.match(/\b87\b/)) return 'USP <87>';
  if (s.match(/\b88\b/)) return 'USP <88>';
  if (s.includes('eudr')) return 'EUDR';
  if (s.includes('bse') || s.includes('tse')) return 'BSE/TSE';
  return name;
}

function escRe(s='') { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Ключ → regex-строка (БЕЗ флагов). Легко расширять.
function regKeyToPattern(key) {
  switch (key) {
    case 'bse_tse':      return '(?:bse[^a-z0-9]*tse|tse[^a-z0-9]*bse)'; // BSE_TSE, BSE/TSE, BSE TSE
    case 'reach':        return '(?:\\beu\\s*reach\\b|\\breach\\b)';
    case 'prop65':       return '(?:proposition\\s*65|prop\\s*65|prop65)';
    case 'rohs':         return '\\brohs\\b';
    case 'pfas':         return '\\bpfas\\b';
    case 'nitrosamines': return 'nitrosamine';
    case 'phthalates':   return 'phthalate';
    case 'allergens':    return 'allergen';
    case 'coneg':        return '(?:\\bconeg\\b|packaging\\s*heavy\\s*metals)';
    case 'eu_pop':       return '(?:\\beu\\s*pop\\b|persistent\\s*organic\\s*pollutants)';
    case 'latex':        return '\\blatex\\b';
    default:             return escRe(key);
  }
}

// юр. суффиксы/мусорные слова, которые выкидываем из названия
const LEGAL_STOPWORDS = new Set([
  'inc','inc.','llc','l.l.c.','gmbh','ag','kg','sa','s.a.','ltd','ltd.','limited',
  'corp','corp.','corporation','company','co','co.','usa','u.s.a.','u.s.',
  'packaging','rigid','pharmaceutical','usa,','llc.', 'inc,'
]);

function normalizeSupplierName(s = '') {
  // нижний регистр, убрать пунктуацию → слова, убрать стоп-слова → склеить
  return String(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .filter(w => w && !LEGAL_STOPWORDS.has(w))
    .join(' ')
    .trim();
}

// Карта алиасов брендов (можно расширять)
const SUPPLIER_ALIASES = {
  amcor: ['amcor', 'alcan'],        // Alcan — старый бренд Amcor
  alcan: ['amcor', 'alcan'],
  gerresheimer: ['gerresheimer'],
  schott: ['schott'],
  piramal: ['piramal', 'PGP'],
  // добавляй по мере встречаемости
};

function buildSupplierRegexes(rawName = '') {
  const norm = normalizeSupplierName(rawName);   // "amcor rigid packaging usa llc" -> "amcor"
  const parts = norm.split(' ').filter(Boolean);
  const core = parts[0] || norm;                 // берём «ядро» (первое содержательное слово)

  const candidates = new Set([norm, core]);
  const aliasList = SUPPLIER_ALIASES[core];
  if (aliasList) aliasList.forEach(a => candidates.add(a));

  // из кандидатов собираем паттерны для Mongo ($regex как строка)
  // пример: "\bamcor\b", "\balcan\b", "\bamcor rigid\b"
  return [...candidates].map(c => `\\b${escRe(c)}\\b`);
}


// Канонизация названий из OpenAI → наши ключи
function canonicalizeReg(name='') {
  const s = name.toLowerCase();
  if (s.includes('reach')) return 'reach';
  if (s.includes('rohs'))  return 'rohs';
  if (s.includes('prop') && s.includes('65')) return 'prop65';
  if (s.includes('pfas')) return 'pfas';
  if (s.includes('bse') || s.includes('tse')) return 'bse_tse';
  if (s.includes('nitros')) return 'nitrosamines';
  if (s.includes('phthal')) return 'phthalates';
  if (s.includes('allergen')) return 'allergens';
  if (s.includes('coneg')) return 'coneg';
  if (s.includes('pop')) return 'eu_pop';
  if (s.includes('latex')) return 'latex';
  return s.replace(/\s+/g,' ').trim(); // дефолт
}


async function fetchComplianceForParts(parts) {
  // Example Mongo shape assumptions:
  // materials: { partNumber, description, regulatoryCompliance: [{ name, status, lastUpdated, documents: [docId] }], supplier, ... }
  // documents: { _id, type, title, url, contentType, expiryDate, relatedParts: [partNumber], regulations: [name] }
  const pns = parts.map(p => p.partNumber);
  const uniquePNs = [...new Set(pns)];

  const materials = await materialsCol.find({ partNumber: { $in: uniquePNs } }).toArray();
  const byPN = new Map(materials.map(m => [m.partNumber, m]));

  const results = [];
  for (const pn of uniquePNs) {
    const m = byPN.get(pn);
    if (!m) {
      results.push({ partNumber: pn, found: false });
      continue;
    }
    const comp = (m.regulatoryCompliance || []).map(rc => ({
      name: normalizeReg(rc.name),
      status: rc.status,
      lastUpdated: rc.lastUpdated,
      documents: rc.documents || []
    }));
    // Fetch doc metadata if needed
    let docs = [];
    const docIds = comp.flatMap(c => c.documents).filter(Boolean);
    if (docIds.length) {
      docs = await documentsCol.find({ _id: { $in: docIds } }).project({ title: 1, url: 1, type: 1, expiryDate: 1, regulations: 1 }).toArray();
    }
    results.push({ partNumber: pn, found: true, description: m.description, supplier: m.supplier, compliance: comp, documents: docs });
  }
  return results;
}

function composeReplyBody({ sender, intent, parts, regulations, lookups, threadLink }) {
  const lines = [];
  lines.push(`Hi ${sender || ''},`);
  lines.push('');
  lines.push('Thanks for your request. Here is a quick summary:');
  if (regulations?.length) lines.push(`• Regulations mentioned: ${regulations.map(normalizeReg).join(', ')}`);
  lines.push('');
  lines.push('Part results:');
  for (const r of lookups) {
    if (!r.found) {
      lines.push(`- ${r.partNumber}: not found in our database.`);
      continue;
    }
    lines.push(`- ${r.partNumber} — ${r.description || ''}`);
    if (r.compliance?.length) {
      for (const c of r.compliance) {
        const status = c.status ? `: ${c.status}` : '';
        lines.push(`   · ${c.name}${status}${c.lastUpdated ? ` (updated ${new Date(c.lastUpdated).toISOString().slice(0,10)})` : ''}`);
      }
    } else {
      lines.push('   · No compliance records on file.');
    }
    if (r.documents?.length) {
      lines.push('   · Documents:');
      for (const d of r.documents) {
        lines.push(`     - ${d.type || 'Doc'}: ${d.title || d.url || d._id}${d.expiryDate ? ` (exp. ${new Date(d.expiryDate).toISOString().slice(0,10)})` : ''}`);
      }
    }
  }
  lines.push('');
  lines.push('');
  return lines.join('\n');
}

/* =====================
   Processing pipeline
===================== */

async function processOneMessage(msg) {
  const full = await getMessage(msg.id);
  const headers = full.payload?.headers || [];
  const subject = findHeader(headers, 'Subject') || '(no subject)';
  const from = findHeader(headers, 'From');
  const replyToHdr = findHeader(headers, 'Reply-To');
const messageId = findHeader(headers, 'Message-ID') || findHeader(headers, 'Message-Id');
const references = findHeader(headers, 'References');
  const threadId = full.threadId;
const fromEmail = (from.match(/<([^>]+)>/)?.[1] || from).toLowerCase().trim();
const replyToEmail = (replyToHdr?.match(/<([^>]+)>/)?.[1] || replyToHdr || fromEmail).toLowerCase().trim();


const { text, html } = extractTextFromPayload(full.payload || {});
const sfRef = findSalesforceRef({ subject, text, html });


  // 1) ТОЛЬКО OpenAI → строгий JSON, БЕЗ fallback
  let extraction;
  try {
    extraction = await classifyAndExtractWithOpenAI(subject, text || '');
    console.log('[OPENAI JSON]', extraction);     // ← это и есть данные от OpenAI
  } catch (e) {
    console.error('[OPENAI ERROR]', e?.response?.data || e?.message || e);
    await addLabel(msg.id, 'AutoError: OpenAI');
    return { skipped: true, reason: 'openai error' };
  }


  // === НИЖЕ — ПРОДАКШН-ЛОГИКА (включишь, когда будешь готов) ===

  // Если это не запрос на комплаенс — просто пометим и выйдем
  if (extraction.category !== 'compliance') {
    await addLabel(msg.id, 'AutoSkip: NonCompliance');
    return { skipped: true, reason: 'non_compliance' };
  }

  // Преобразуем к тому формату, который ждёт твой поиск по БД
    const requestedMaterials = (extraction.partNumbers || [])
  .map(s => String(s || '').trim())
  .filter(Boolean);

  const regulations = (extraction.regulations || []).map(normalizeReg);
const boms = await fetchBomForMaterials(requestedMaterials);
console.log('[BOM]', JSON.stringify(boms, null, 2));
const regsFromAI = extraction.regulations || [];
const bomWithCompliance = await checkRegulatoryForComponents(boms, regsFromAI);
console.log('[REG CHECK]', JSON.stringify(bomWithCompliance, null, 2));

  if (process.env.DEBUG_DRY_RUN === 'true') {
    // Ничего не отправляем/не помечаем — только отмечаем, что посмотрели
    await addLabel(msg.id, 'AutoSkip: DryRun');
    return { observed: true };
  }


  // Поиск в Mongo
  const partsForCompliance = requestedMaterials.map(pn => ({ partNumber: pn }));
  const lookups = await fetchComplianceForParts(partsForCompliance);
  console.log('[LOOKUPS]', lookups.map(x => ({ partNumber: x.partNumber, found: x.found })));

function renderBomCompact(boms) {
  const out = ['BOM (filtered):'];
  for (const b of boms) {
    out.push(`"Material" ${b.material}`);
    if (!b.components?.length) {
      out.push('  · (no components found)');
      continue;
    }
    // компакт: материал — описание [поставщик]
    for (const c of b.components) {
      const desc = c.description ? ` — ${c.description}` : '';
      const sup  = c.supplier ? ` [${c.supplier}]` : '';
      out.push(`  · ${c.material}${desc}${sup}`);
    }
  }
  return out.join('\n');
}

function renderCoverageCompact(bomWithCompliance) {
  const out = ['Regulatory coverage:'];
  for (const m of bomWithCompliance) {
    if (!m.components?.length) continue;
    out.push(`Material ${m.material}`);
    for (const c of m.components) {
      // соберём пары "REACH: covered_supplier; RoHS: missing"
      const pairs = [];
      for (const [key, info] of Object.entries(c.compliance || {})) {
        let tag;
        if (info.status === 'covered_material') tag = 'covered(material)';
        else if (info.status === 'covered_supplier') tag = 'covered(supplier)';
        else if (info.status === 'expired') tag = 'expired';
        else tag = 'missing';

        const exp = info.expiresOn ? `, exp ${new Date(info.expiresOn).toISOString().slice(0,10)}` : '';
        pairs.push(`${key.toUpperCase()}: ${tag}${exp}`);
      }
      const statusLine = pairs.length ? pairs.join('; ') : '(no mapping)';
      const desc = c.description ? ` — ${c.description}` : '';
      out.push(`  · ${c.material}${desc} → ${statusLine}`);
    }
  }
  return out.join('\n');
}


const sfRefLine = sfRef ? `\n${sfRef}\n` : '';
  // Формируем ответ: используем extraction.question вместо старого intent
const replyBody =
  composeReplyBody({
    sender: fromEmail.split('@')[0],
    intent: extraction.question || 'Compliance question',
    parts: requestedMaterials.map(pn => ({ partNumber: pn })),
    regulations: regsFromAI.map(normalizeReg),
    lookups: [],
  })
  + '\n\n' + renderBomCompact(boms)                 
  + '\n\n' + renderCoverageCompact(bomWithCompliance) 
  + sfRefLine; 

  try {
    await sendReply({
  threadId,
  subject,
  to: replyToEmail,              // <-- не всегда равен From
  body: replyBody,
  inReplyTo: messageId || null,  // <-- для корректного threading
  references: references || null
});
    // помечаем весь тред прочитанным
    await gmail.users.threads.modify({
      userId: 'me',
      id: threadId,
      requestBody: { removeLabelIds: ['UNREAD'] }
    });
    await addLabel(msg.id, 'AutoReplied: ComplianceBot');
  } catch (e) {
    console.error('[SEND/MARK ERROR]', e?.response?.data || e);
    await addLabel(msg.id, 'AutoError: SendOrMark');
  }

  await processedEmailsCol.updateOne(
    { messageId: msg.id },
    { $set: { messageId: msg.id, processedAt: new Date(), from: fromEmail, subject } },
    { upsert: true }
  );

  return { replied: true };
}



async function tick() {
  const msgs = await listUnreadMessages();
  console.log('[GMAIL FOUND]', msgs.length);

  let handled = 0, skippedSeen = 0, failed = 0;

  for (const m of msgs) {
    const seen = await processedEmailsCol.findOne({ messageId: m.id });
    if (seen) { skippedSeen++; continue; }

    try {
      await processOneMessage(m);
      handled++;
    } catch (e) {
      failed++;
      console.error('Processing error:', e);
      try { await addLabel(m.id, 'AutoError: Pipeline'); } catch {}
    }
  }

  console.log(`[PIPE] handled=${handled} skipped_seen=${skippedSeen} failed=${failed} total=${msgs.length}`);
}



/* =====================
   Bootstrap
===================== */
// ... твой код выше

async function main() {
  await mongoClient.connect();
  db = mongoClient.db(DB_NAME);
  materialsCol = db.collection('materials');
  documentsCol = db.collection('documents');
  processedEmailsCol = db.collection('processedEmails');
  bomCol = db.collection('items');
  regulatoryCol = db.collection('regulatory');

  const useInternalCron = process.env.USE_INTERNAL_CRON === 'true';
  if (useInternalCron) {
    const schedule = process.env.CRON_SCHEDULE || '*/1 * * * *';
    console.log('Starting internal scheduler:', schedule);
    cron.schedule(schedule, () => {
      console.log(`[${new Date().toISOString()}] Gmail tick...`);
      tick().catch(err => console.error('Tick failed:', err));
    });

    // при внутреннем cron — сразу один прогон и остаемся жить
    await tick();
  } else {
    // внешний cron: один прогон и выходим
    console.log('External cron mode: running single tick...');
    await tick();
    await mongoClient.close();
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});


main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

