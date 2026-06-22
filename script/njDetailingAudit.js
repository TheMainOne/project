import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import got from 'got';
import * as cheerio from 'cheerio';
import PQueue from 'p-queue';
import OpenAI from 'openai';

const GOOGLE_TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const OVERPASS_URL = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), 'script', 'output', 'nj-detailing-audit');

const DEFAULT_TERMS = [
  'auto detailing',
  'car detailing',
  'mobile car detailing',
  'ceramic coating',
  'paint correction',
  'car wash detailing',
];

const QUICK_AREAS = [
  'Atlantic County NJ',
  'Bergen County NJ',
  'Burlington County NJ',
  'Camden County NJ',
  'Cape May County NJ',
  'Cumberland County NJ',
  'Essex County NJ',
  'Gloucester County NJ',
  'Hudson County NJ',
  'Hunterdon County NJ',
  'Mercer County NJ',
  'Middlesex County NJ',
  'Monmouth County NJ',
  'Morris County NJ',
  'Ocean County NJ',
  'Passaic County NJ',
  'Salem County NJ',
  'Somerset County NJ',
  'Sussex County NJ',
  'Union County NJ',
  'Warren County NJ',
];

const NJ_BOUNDS = {
  minLat: 38.92,
  maxLat: 41.36,
  minLng: -75.58,
  maxLng: -73.88,
};

const SEARCH_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.postalAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.businessStatus',
  'places.primaryType',
  'places.types',
  'places.websiteUri',
  'places.googleMapsUri',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.pureServiceAreaBusiness',
  'nextPageToken',
].join(',');

const OSM_DETAILING_OVERPASS_REGEX = 'detail|detailing|ceramic coating|paint correction|auto spa';
const OSM_BROAD_OVERPASS_REGEX =
  'detail|detailing|ceramic coating|paint correction|auto spa|car spa|hand wash|car wash';
const OSM_DETAILING_MATCHER = /(^|[^a-z])detail(?:ing)?([^a-z]|$)|ceramic coating|paint correction|auto spa/i;
const OSM_BROAD_MATCHER =
  /(^|[^a-z])detail(?:ing)?([^a-z]|$)|ceramic coating|paint correction|auto spa|car spa|hand wash|car wash/i;

const USER_AGENT =
  process.env.USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';
const OSM_USER_AGENT =
  process.env.OSM_USER_AGENT ||
  'nj-detailing-audit/1.0 (local OpenStreetMap research; contact: local-runner)';

const BOOKING_HOSTS = [
  'acuityscheduling.com',
  'booksy.com',
  'calendly.com',
  'detailbookie.com',
  'glossgenius.com',
  'housecallpro.com',
  'orbisx.ca',
  'square.site',
  'squareup.com',
  'urable.com',
];

const SCORE_WEIGHTS = {
  technical: 0.2,
  modernity: 0.2,
  attractiveness: 0.2,
  conversion: 0.25,
  content: 0.15,
};

function parseArgs(argv) {
  const args = {
    mode: 'all',
    source: 'google',
    osmFilter: 'detailing',
    profile: 'quick',
    outDir: DEFAULT_OUTPUT_DIR,
    terms: DEFAULT_TERMS,
    areas: QUICK_AREAS,
    gridStep: 0.22,
    pageSize: 20,
    maxPagesPerSearch: 3,
    searchConcurrency: 2,
    auditConcurrency: 3,
    requestDelayMs: 300,
    websiteLimit: 0,
    render: false,
    screenshots: false,
    ai: false,
    aiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    input: '',
    help: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const raw = argv[i];
    if (!raw.startsWith('--')) continue;
    const [key, inlineValue] = raw.slice(2).split('=');
    const next = argv[i + 1];
    const value = inlineValue ?? (!next || next.startsWith('--') ? 'true' : next);
    if (inlineValue === undefined && next && !next.startsWith('--')) i += 1;

    switch (key) {
      case 'mode':
        args.mode = value;
        break;
      case 'source':
        args.source = value;
        break;
      case 'osmFilter':
        args.osmFilter = value;
        break;
      case 'profile':
        args.profile = value;
        break;
      case 'out':
      case 'outDir':
        args.outDir = path.resolve(process.cwd(), value);
        break;
      case 'input':
        args.input = path.resolve(process.cwd(), value);
        break;
      case 'terms':
        args.terms = splitList(value);
        break;
      case 'areas':
        args.areas = splitList(value);
        break;
      case 'gridStep':
        args.gridStep = Number(value);
        break;
      case 'pageSize':
        args.pageSize = Number(value);
        break;
      case 'maxPagesPerSearch':
        args.maxPagesPerSearch = Number(value);
        break;
      case 'searchConcurrency':
        args.searchConcurrency = Number(value);
        break;
      case 'auditConcurrency':
        args.auditConcurrency = Number(value);
        break;
      case 'requestDelayMs':
        args.requestDelayMs = Number(value);
        break;
      case 'websiteLimit':
        args.websiteLimit = Number(value);
        break;
      case 'render':
        args.render = value === 'true';
        break;
      case 'screenshots':
        args.screenshots = value === 'true';
        if (args.screenshots) args.render = true;
        break;
      case 'ai':
        args.ai = value === 'true';
        break;
      case 'aiModel':
        args.aiModel = value;
        break;
      case 'help':
      case 'h':
        args.help = true;
        break;
      default:
        throw new Error(`Unknown option: --${key}`);
    }
  }

  if (!['search', 'audit', 'all'].includes(args.mode)) {
    throw new Error('--mode must be one of: search, audit, all');
  }
  if (!['google', 'osm'].includes(args.source)) {
    throw new Error('--source must be one of: google, osm');
  }
  if (!['detailing', 'broad'].includes(args.osmFilter)) {
    throw new Error('--osmFilter must be one of: detailing, broad');
  }
  if (!['quick', 'grid'].includes(args.profile)) {
    throw new Error('--profile must be one of: quick, grid');
  }
  if (!Number.isFinite(args.gridStep) || args.gridStep <= 0) {
    throw new Error('--gridStep must be a positive number');
  }
  args.pageSize = clamp(Math.trunc(args.pageSize), 1, 20);
  args.maxPagesPerSearch = clamp(Math.trunc(args.maxPagesPerSearch), 1, 3);
  args.searchConcurrency = clamp(Math.trunc(args.searchConcurrency), 1, 10);
  args.auditConcurrency = clamp(Math.trunc(args.auditConcurrency), 1, 10);

  return args;
}

function splitList(value) {
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function printHelp() {
  console.log(`
NJ detailing business finder and website auditor

Usage:
  node script/njDetailingAudit.js --mode all --profile quick
  node script/njDetailingAudit.js --mode search --source osm
  node script/njDetailingAudit.js --mode search --source osm --osmFilter broad
  node script/njDetailingAudit.js --mode search --profile grid --gridStep 0.18
  node script/njDetailingAudit.js --mode audit --input script/output/nj-detailing-audit/places.json --render true --screenshots true

Required for Google search:
  GOOGLE_MAPS_API_KEY=...

Optional for AI notes:
  OPENAI_API_KEY=...

Options:
  --mode search|audit|all            Search Places, audit existing places, or both. Default: all
  --source google|osm                google = Places API, osm = free OpenStreetMap Overpass. Default: google
  --osmFilter detailing|broad         detailing = explicit detailing signals; broad also includes car washes. Default: detailing
  --profile quick|grid               quick = NJ counties; grid = NJ bounding-box cells. Default: quick
  --terms "a,b,c"                    Search terms. Default includes detailing, ceramic coating, paint correction
  --areas "Bergen County NJ,..."     Areas for quick profile
  --gridStep 0.22                    Degree step for grid profile. Smaller is more coverage and more API calls
  --maxPagesPerSearch 3              Google Text Search pages per query. Max useful value: 3
  --searchConcurrency 2              Parallel Places requests
  --auditConcurrency 3               Parallel website audits
  --websiteLimit 25                  Limit audited websites for testing. 0 = no limit
  --render true                      Use Playwright for rendered pages
  --screenshots true                 Save homepage screenshots. Implies --render true
  --ai true                          Add optional AI summary/recommendations
  --out path                         Output directory
`);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  await fs.mkdir(args.outDir, { recursive: true });

  let places = [];
  if (args.mode === 'search' || args.mode === 'all') {
    places = await findPlaces(args);
    await writePlacesOutputs(args.outDir, places);
  }

  if (args.mode === 'audit' || args.mode === 'all') {
    if (!places.length) {
      const input = args.input || path.join(args.outDir, 'places.json');
      places = JSON.parse(stripBom(await fs.readFile(input, 'utf8')));
    }

    const audits = await auditPlaces(places, args);
    await writeAuditOutputs(args.outDir, places, audits);
  }
}

async function findPlaces(args) {
  if (args.source === 'osm') {
    return findOsmPlaces(args);
  }
  return findGooglePlaces(args);
}

async function findGooglePlaces(args) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GOOGLE_MAPS_API_KEY in environment or .env');
  }

  const jobs = buildSearchJobs(args);
  const queue = new PQueue({
    concurrency: args.searchConcurrency,
    interval: Math.max(args.requestDelayMs, 1),
    intervalCap: args.searchConcurrency,
  });
  const placesById = new Map();
  let completed = 0;

  console.log(`Search jobs: ${jobs.length}. Estimated max Places requests: ${jobs.length * args.maxPagesPerSearch}`);

  await Promise.all(
    jobs.map((job) =>
      queue.add(async () => {
        const found = await runTextSearchJob(job, args, apiKey);
        for (const place of found) {
          if (!isNewJerseyPlace(place, job)) continue;
          const normalized = normalizeGooglePlace(place, job);
          const previous = placesById.get(normalized.placeId);
          placesById.set(normalized.placeId, mergePlace(previous, normalized));
        }
        completed += 1;
        if (completed % 10 === 0 || completed === jobs.length) {
          console.log(`Search progress: ${completed}/${jobs.length}; unique NJ places: ${placesById.size}`);
        }
      }),
    ),
  );

  return [...placesById.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function findOsmPlaces(args) {
  const query = buildOverpassQuery(args);
  console.log(`OSM Overpass search: New Jersey; filter: ${args.osmFilter}; endpoint: ${OVERPASS_URL}`);

  const response = await got
    .post(OVERPASS_URL, {
      body: new URLSearchParams({ data: query }).toString(),
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: '*/*',
        'user-agent': OSM_USER_AGENT,
      },
      responseType: 'text',
      timeout: { request: 180000 },
      retry: {
        limit: 1,
        methods: ['POST'],
        statusCodes: [408, 429, 500, 502, 503, 504],
      },
    })
    .catch((error) => {
      const detail = error.response?.body ? JSON.stringify(error.response.body) : error.message;
      throw new Error(`OSM Overpass search failed: ${detail}`);
    });

  const data = JSON.parse(response.body || '{}');
  const elements = data.elements || [];
  const placesById = new Map();

  for (const element of elements) {
    if (!isLikelyDetailingOsmElement(element, args)) continue;
    const normalized = normalizeOsmPlace(element, args);
    if (!normalized.name) continue;
    const previous = placesById.get(normalized.placeId);
    placesById.set(normalized.placeId, mergePlace(previous, normalized));
  }

  const places = [...placesById.values()].sort((a, b) => a.name.localeCompare(b.name));
  console.log(`OSM elements: ${elements.length}; matched places: ${places.length}`);
  return places;
}

function buildOverpassQuery(args) {
  const regex = args.osmFilter === 'broad' ? OSM_BROAD_OVERPASS_REGEX : OSM_DETAILING_OVERPASS_REGEX;
  const broadCarWashClause = args.osmFilter === 'broad' ? '  nwr["amenity"="car_wash"](area.nj);\n' : '';

  return `
[out:json][timeout:180];
area["ISO3166-2"="US-NJ"][admin_level=4]->.nj;
(
${broadCarWashClause}  nwr["name"~"${regex}",i](area.nj);
  nwr["description"~"${regex}",i](area.nj);
  nwr["service"~"${regex}",i](area.nj);
  nwr["operator"~"${regex}",i](area.nj);
  nwr["brand"~"${regex}",i](area.nj);
  nwr["service:vehicle:detailing"](area.nj);
  nwr["shop"="car_repair"]["service:vehicle:detailing"](area.nj);
);
out center tags;
`.trim();
}

function buildSearchJobs(args) {
  if (args.profile === 'quick') {
    return args.terms.flatMap((term) =>
      args.areas.map((area) => ({
        term,
        label: area,
        body: {
          textQuery: `${term} in ${area}`,
          pageSize: args.pageSize,
          includePureServiceAreaBusinesses: true,
          languageCode: 'en',
          regionCode: 'US',
        },
      })),
    );
  }

  const cells = [];
  for (let lat = NJ_BOUNDS.minLat; lat < NJ_BOUNDS.maxLat; lat += args.gridStep) {
    for (let lng = NJ_BOUNDS.minLng; lng < NJ_BOUNDS.maxLng; lng += args.gridStep) {
      cells.push({
        low: { latitude: roundCoord(lat), longitude: roundCoord(lng) },
        high: {
          latitude: roundCoord(Math.min(lat + args.gridStep, NJ_BOUNDS.maxLat)),
          longitude: roundCoord(Math.min(lng + args.gridStep, NJ_BOUNDS.maxLng)),
        },
      });
    }
  }

  return args.terms.flatMap((term) =>
    cells.map((cell, index) => ({
      term,
      label: `grid-${index + 1}`,
      body: {
        textQuery: term,
        pageSize: args.pageSize,
        includePureServiceAreaBusinesses: true,
        languageCode: 'en',
        regionCode: 'US',
        locationRestriction: { rectangle: cell },
      },
    })),
  );
}

function roundCoord(value) {
  return Number(value.toFixed(6));
}

async function runTextSearchJob(job, args, apiKey) {
  const results = [];
  let pageToken = '';

  for (let page = 1; page <= args.maxPagesPerSearch; page += 1) {
    const body = pageToken ? { ...job.body, pageToken } : job.body;
    const response = await got
      .post(GOOGLE_TEXT_SEARCH_URL, {
        json: body,
        responseType: 'json',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': apiKey,
          'x-goog-fieldmask': SEARCH_FIELD_MASK,
        },
        timeout: { request: 20000 },
        retry: {
          limit: 2,
          methods: ['POST'],
          statusCodes: [408, 429, 500, 502, 503, 504],
        },
      })
      .catch((error) => {
        const detail = error.response?.body ? JSON.stringify(error.response.body) : error.message;
        throw new Error(`Places search failed for "${job.term}" / "${job.label}": ${detail}`);
      });

    const data = response.body || {};
    for (const place of data.places || []) {
      results.push(place);
    }

    pageToken = data.nextPageToken || '';
    if (!pageToken) break;
    await sleep(250);
  }

  return results;
}

function isNewJerseyPlace(place, job) {
  const region = place.postalAddress?.administrativeArea;
  if (region) return region.toUpperCase() === 'NJ';

  const address = place.formattedAddress || '';
  if (/\bNJ\b|New Jersey/i.test(address)) return true;

  // Pure service-area businesses often omit address/location fields in Places.
  // If the search itself was restricted to NJ counties/grid cells, keep them.
  return Boolean(place.pureServiceAreaBusiness && /\bNJ\b|New Jersey|grid-/i.test(job.label));
}

function normalizeGooglePlace(place, job) {
  return {
    placeId: place.id,
    source: 'google',
    sourceUrl: place.googleMapsUri || '',
    name: place.displayName?.text || '',
    address: place.formattedAddress || '',
    phone: place.nationalPhoneNumber || place.internationalPhoneNumber || '',
    website: place.websiteUri || '',
    googleMapsUrl: place.googleMapsUri || '',
    rating: place.rating ?? '',
    reviewCount: place.userRatingCount ?? '',
    businessStatus: place.businessStatus || '',
    primaryType: place.primaryType || '',
    types: place.types || [],
    pureServiceAreaBusiness: Boolean(place.pureServiceAreaBusiness),
    latitude: place.location?.latitude ?? '',
    longitude: place.location?.longitude ?? '',
    matchedTerms: [job.term],
    matchedAreas: [job.label],
  };
}

function isLikelyDetailingOsmElement(element, args) {
  const tags = element.tags || {};
  const text = Object.entries(tags)
    .filter(([key]) => /^(name|description|service|operator|brand|shop|amenity|service:vehicle:detailing)/i.test(key))
    .map(([, value]) => String(value))
    .join(' ');

  if (tags['service:vehicle:detailing']) return true;
  if (args.osmFilter === 'broad' && tags.amenity === 'car_wash') return true;
  const matcher = args.osmFilter === 'broad' ? OSM_BROAD_MATCHER : OSM_DETAILING_MATCHER;
  return matcher.test(text);
}

function normalizeOsmPlace(element, args) {
  const tags = element.tags || {};
  const center = getOsmCenter(element);
  const sourceUrl = `https://www.openstreetmap.org/${element.type}/${element.id}`;
  const matchedTerms = detectOsmMatchedTerms(tags, args);

  return {
    placeId: `osm:${element.type}/${element.id}`,
    source: 'osm',
    sourceUrl,
    name: tags.name || tags.brand || tags.operator || '',
    address: formatOsmAddress(tags),
    phone: firstTruthy(tags['contact:phone'], tags.phone, tags['contact:mobile'], tags.mobile),
    website: normalizeWebsiteUrl(firstTruthy(tags['contact:website'], tags.website, tags.url)),
    googleMapsUrl: '',
    rating: '',
    reviewCount: '',
    businessStatus: '',
    primaryType: getOsmPrimaryType(tags),
    types: getOsmTypes(tags),
    pureServiceAreaBusiness: false,
    latitude: center.latitude,
    longitude: center.longitude,
    matchedTerms: matchedTerms.length ? matchedTerms : ['OpenStreetMap match'],
    matchedAreas: ['New Jersey'],
  };
}

function getOsmCenter(element) {
  return {
    latitude: element.lat ?? element.center?.lat ?? '',
    longitude: element.lon ?? element.center?.lon ?? '',
  };
}

function formatOsmAddress(tags) {
  const line1 = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  const city = tags['addr:city'] || tags['addr:town'] || tags['addr:village'] || '';
  const state = tags['addr:state'] || 'NJ';
  const postcode = tags['addr:postcode'] || '';
  return [line1, [city, state, postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

function firstTruthy(...values) {
  return values.find((value) => String(value || '').trim()) || '';
}

function getOsmPrimaryType(tags) {
  if (tags.amenity === 'car_wash') return 'car_wash';
  if (tags['service:vehicle:detailing']) return 'auto_detailing';
  if (tags.shop) return `shop:${tags.shop}`;
  if (tags.amenity) return `amenity:${tags.amenity}`;
  return 'openstreetmap_place';
}

function getOsmTypes(tags) {
  return unique(
    [
      tags.amenity ? `amenity=${tags.amenity}` : '',
      tags.shop ? `shop=${tags.shop}` : '',
      tags.service ? `service=${tags.service}` : '',
      tags['service:vehicle:detailing'] ? `service:vehicle:detailing=${tags['service:vehicle:detailing']}` : '',
    ].filter(Boolean),
  );
}

function detectOsmMatchedTerms(tags, args) {
  const text = Object.values(tags || {}).join(' ').toLowerCase();
  const matches = (args.terms || []).filter((term) => text.includes(String(term).toLowerCase()));
  if (/(^|[^a-z])detail(?:ing)?([^a-z]|$)/i.test(text)) matches.push('detailing');
  if (/ceramic coating/i.test(text)) matches.push('ceramic coating');
  if (/paint correction/i.test(text)) matches.push('paint correction');
  if (/auto spa/i.test(text)) matches.push('auto spa');
  if (args.osmFilter === 'broad' && tags.amenity === 'car_wash') matches.push('car wash');
  if (tags['service:vehicle:detailing']) matches.push('detailing');
  return unique(matches.length ? matches : ['OpenStreetMap detailing signal']);
}

function mergePlace(previous, current) {
  if (!previous) return current;
  return {
    ...previous,
    ...Object.fromEntries(Object.entries(current).filter(([, value]) => hasValue(value))),
    matchedTerms: unique([...previous.matchedTerms, ...current.matchedTerms]),
    matchedAreas: unique([...previous.matchedAreas, ...current.matchedAreas]),
    types: unique([...(previous.types || []), ...(current.types || [])]),
  };
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && value !== '';
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

async function auditPlaces(places, args) {
  const withSites = places.filter((place) => place.website);
  const targets = args.websiteLimit > 0 ? withSites.slice(0, args.websiteLimit) : withSites;
  const queue = new PQueue({ concurrency: args.auditConcurrency });
  const audits = [];
  let completed = 0;

  const browserState = await createBrowserState(args);
  const aiClient = args.ai && process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

  console.log(`Website audit targets: ${targets.length}/${places.length}`);
  if (args.ai && !aiClient) {
    console.log('AI audit skipped: OPENAI_API_KEY is not set.');
  }

  try {
    await Promise.all(
      targets.map((place) =>
        queue.add(async () => {
          const audit = await auditWebsite(place, args, browserState, aiClient);
          audits.push(audit);
          completed += 1;
          if (completed % 10 === 0 || completed === targets.length) {
            console.log(`Audit progress: ${completed}/${targets.length}`);
          }
        }),
      ),
    );
  } finally {
    await browserState?.browser?.close().catch(() => {});
  }

  const noWebsiteAudits = places
    .filter((place) => !place.website)
    .map((place) => ({
      placeId: place.placeId,
      website: '',
      reachable: false,
      totalScore: 0,
      leadAngle: 'No website listed in source profile',
      scores: emptyScores(),
      findings: ['No website found in the source search result.'],
      recommendations: ['Build or claim a modern website with services, prices, gallery, booking CTA, and local SEO basics.'],
    }));

  return [...audits, ...noWebsiteAudits].sort((a, b) => {
    const scoreDelta = (a.totalScore || 0) - (b.totalScore || 0);
    if (scoreDelta !== 0) return scoreDelta;
    return String(a.website || '').localeCompare(String(b.website || ''));
  });
}

async function createBrowserState(args) {
  if (!args.render) return null;

  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1440, height: 1200 },
    });
    return { browser, context };
  } catch (error) {
    console.log(`Playwright render disabled: ${error.message}`);
    return null;
  }
}

async function auditWebsite(place, args, browserState, aiClient) {
  const started = Date.now();
  const website = normalizeWebsiteUrl(place.website);
  const baseAudit = {
    placeId: place.placeId,
    website,
    reachable: false,
    finalUrl: '',
    statusCode: '',
    loadMs: '',
    screenshotPath: '',
    scores: emptyScores(),
    totalScore: 0,
    leadAngle: '',
    findings: [],
    recommendations: [],
    detectedFeatures: {},
    error: '',
  };

  try {
    const pageData = browserState
      ? await fetchRenderedWebsite(website, args, browserState, place)
      : await fetchStaticWebsite(website);

    const internalPages = await fetchImportantInternalPages(pageData, args);
    const allPages = [pageData, ...internalPages];
    const audit = scoreWebsite(place, allPages, Date.now() - started);

    if (aiClient) {
      audit.ai = await createAiAudit(aiClient, args, place, audit, pageData).catch((error) => ({
        error: error.message,
      }));
    }

    return {
      ...baseAudit,
      ...audit,
      screenshotPath: pageData.screenshotPath || '',
    };
  } catch (error) {
    return {
      ...baseAudit,
      error: error.message,
      leadAngle: 'Website exists but could not be audited automatically',
      findings: [`Audit failed: ${error.message}`],
      recommendations: ['Manually verify website availability, SSL, redirects, and whether the Google profile links to the correct site.'],
    };
  }
}

function normalizeWebsiteUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

async function fetchStaticWebsite(url) {
  const started = Date.now();
  const response = await got(url, {
    headers: { 'user-agent': USER_AGENT },
    timeout: { request: 20000 },
    followRedirect: true,
    throwHttpErrors: false,
    retry: { limit: 1 },
  });

  return {
    url,
    finalUrl: response.url,
    statusCode: response.statusCode,
    loadMs: Date.now() - started,
    html: response.body || '',
    text: htmlToText(response.body || ''),
    links: extractLinks(response.url, response.body || ''),
    screenshotPath: '',
  };
}

async function fetchRenderedWebsite(url, args, browserState, place) {
  const started = Date.now();
  const page = await browserState.context.newPage();
  try {
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    const html = await page.content();
    const text = await page.locator('body').innerText({ timeout: 5000 }).catch(() => htmlToText(html));
    const links = await page
      .locator('a[href]')
      .evaluateAll((anchors) =>
        anchors
          .map((anchor) => anchor.href)
          .filter(Boolean)
          .slice(0, 1000),
      )
      .catch(() => extractLinks(page.url(), html));

    let screenshotPath = '';
    if (args.screenshots) {
      const screenshotDir = path.join(args.outDir, 'screenshots');
      await fs.mkdir(screenshotDir, { recursive: true });
      screenshotPath = path.join(screenshotDir, `${safeFileName(place.name || place.placeId)}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
    }

    return {
      url,
      finalUrl: page.url(),
      statusCode: response?.status() || '',
      loadMs: Date.now() - started,
      html,
      text,
      links,
      screenshotPath,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

function safeFileName(value) {
  const base = String(value || 'site')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
  return base || crypto.randomUUID();
}

async function fetchImportantInternalPages(homePage, args) {
  const homepageUrl = homePage.finalUrl || homePage.url;
  const important = chooseImportantLinks(homepageUrl, homePage.links).slice(0, 4);
  const pages = [];

  for (const url of important) {
    try {
      const page = await fetchStaticWebsite(url);
      pages.push(page);
      await sleep(args.requestDelayMs);
    } catch {
      // Non-critical supporting pages should not fail the whole audit.
    }
  }

  return pages;
}

function chooseImportantLinks(baseUrl, links) {
  let origin = '';
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return [];
  }

  const scored = [];
  for (const link of links || []) {
    let parsed;
    try {
      parsed = new URL(link, baseUrl);
    } catch {
      continue;
    }
    if (parsed.origin !== origin) continue;
    const url = parsed.toString().split('#')[0];
    const haystack = `${parsed.pathname} ${parsed.search}`.toLowerCase();
    let score = 0;
    if (/service|detailing|ceramic|coating|paint|wash/.test(haystack)) score += 5;
    if (/price|package|membership/.test(haystack)) score += 4;
    if (/gallery|portfolio|before|after|work/.test(haystack)) score += 4;
    if (/book|schedule|appointment|quote|contact/.test(haystack)) score += 3;
    if (score > 0) scored.push({ url, score });
  }

  return unique(
    scored
      .sort((a, b) => b.score - a.score)
      .map((item) => item.url),
  );
}

function scoreWebsite(place, pages, totalLoadMs) {
  const home = pages[0];
  const combinedHtml = pages.map((page) => page.html || '').join('\n\n');
  const combinedText = pages.map((page) => page.text || '').join('\n\n');
  const $ = cheerio.load(home.html || '');
  const lowerHtml = combinedHtml.toLowerCase();
  const lowerText = combinedText.toLowerCase();
  const allLinks = unique(pages.flatMap((page) => page.links || []));

  const features = detectFeatures($, lowerHtml, lowerText, allLinks, home);
  const scores = {
    technical: scoreTechnical(features, home, totalLoadMs),
    modernity: scoreModernity(features),
    attractiveness: scoreAttractiveness(features),
    conversion: scoreConversion(features),
    content: scoreContent(features),
  };
  const totalScore = Math.round(
    Object.entries(SCORE_WEIGHTS).reduce((sum, [key, weight]) => sum + scores[key] * weight, 0),
  );

  const { findings, recommendations, leadAngle } = buildNarrative(place, features, scores, totalScore);

  return {
    placeId: place.placeId,
    website: home.url,
    reachable: true,
    finalUrl: home.finalUrl,
    statusCode: home.statusCode,
    loadMs: totalLoadMs,
    totalScore,
    scores,
    leadAngle,
    findings,
    recommendations,
    detectedFeatures: features,
  };
}

function detectFeatures($, lowerHtml, lowerText, links, home) {
  const title = $('title').first().text().trim();
  const metaDescription = $('meta[name="description"]').attr('content') || '';
  const viewport = $('meta[name="viewport"]').attr('content') || '';
  const imgCount = $('img').length;
  const largeImages = $('img')
    .toArray()
    .filter((img) => {
      const width = Number($(img).attr('width') || 0);
      const height = Number($(img).attr('height') || 0);
      const src = $(img).attr('src') || '';
      return width >= 500 || height >= 300 || /hero|banner|gallery|portfolio|before|after/i.test(src);
    }).length;
  const telLinks = links.filter((link) => link.startsWith('tel:'));
  const mailLinks = links.filter((link) => link.startsWith('mailto:'));
  const externalLinks = links.filter((link) => /^https?:\/\//i.test(link));
  const bookingLinks = externalLinks.filter((link) => BOOKING_HOSTS.some((host) => link.toLowerCase().includes(host)));
  const socialLinks = externalLinks.filter((link) =>
    /facebook\.com|instagram\.com|tiktok\.com|youtube\.com|linkedin\.com|x\.com|twitter\.com/i.test(link),
  );
  const oldTech = [];
  if (/flash|swfobject|\.swf\b/.test(lowerHtml)) oldTech.push('Flash/SWF');
  if (/<table[\s>][\s\S]{0,500}?(navigation|layout|menu)/.test(lowerHtml)) oldTech.push('table layout markers');
  if (/bootstrap(?:\.min)?\.css\?ver=3|bootstrap\/3\./.test(lowerHtml)) oldTech.push('Bootstrap 3 marker');
  if (/jquery[-.](?:1\.|2\.)/.test(lowerHtml)) oldTech.push('old jQuery marker');
  if (/wixstatic|squarespace|webflow|shopify|wordpress|wp-content|framer|godaddy|weebly/.test(lowerHtml)) {
    oldTech.push('site builder/CMS marker');
  }

  const copyrightYears = [...lowerText.matchAll(/(?:copyright|©)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  const newestCopyrightYear = copyrightYears.length ? Math.max(...copyrightYears) : null;

  return {
    title,
    hasTitle: title.length > 5,
    hasMetaDescription: metaDescription.trim().length > 40,
    hasViewport: /width=device-width|initial-scale/i.test(viewport),
    isHttps: /^https:\/\//i.test(home.finalUrl || home.url),
    statusOk: Number(home.statusCode) >= 200 && Number(home.statusCode) < 400,
    imgCount,
    largeImages,
    hasHeroVisual: largeImages > 0 || /hero|banner|background-image|video/.test(lowerHtml),
    hasVideo: /<video|youtube\.com|vimeo\.com/.test(lowerHtml),
    usesModernCss: /display:\s*(flex|grid)|@media|clamp\(|var\(--|\.webp|srcset=/.test(lowerHtml),
    hasCustomFonts: /fonts\.googleapis|font-face|typekit|fonts\.adobe/.test(lowerHtml),
    hasLogo: /logo/.test(lowerHtml),
    oldTech,
    newestCopyrightYear,
    hasPhone: /\(?\b\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(lowerText) || telLinks.length > 0,
    hasTelLink: telLinks.length > 0,
    hasEmail: mailLinks.length > 0 || /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(lowerText),
    hasContactForm: /<form[\s>]/.test(lowerHtml) && /name|email|phone|message|contact|quote/.test(lowerHtml),
    hasBooking: bookingLinks.length > 0 || /book now|schedule now|schedule online|appointment|request appointment/.test(lowerText),
    hasQuoteCta: /get (a )?quote|request (a )?quote|free estimate|estimate|call now|text us|book now|schedule/.test(lowerText),
    hasServices: /services|detailing package|interior detail|exterior detail|ceramic coating|paint correction|wash and wax/.test(lowerText),
    hasPricing: /pricing|prices|packages|\$\s?\d+|starting at|starts at/.test(lowerText),
    hasGallery: /gallery|portfolio|before\s*(\/|and|&)?\s*after|our work|recent work/.test(lowerText) || imgCount >= 8,
    hasReviews: /review|reviews|testimonial|testimonials|google rating|stars/.test(lowerText),
    hasMapOrAddress: /google maps|maps\.google|directions|\bNJ\b|new jersey/.test(lowerHtml + lowerText),
    hasHours: /hours|open|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?/.test(
      lowerText,
    ),
    hasSchema: /application\/ld\+json|LocalBusiness|AutoRepair|AutomotiveBusiness|CarWash/.test(lowerHtml),
    hasSocial: socialLinks.length > 0,
    socialLinks: socialLinks.slice(0, 8),
    bookingLinks: bookingLinks.slice(0, 5),
    pageCount: pagesCountFromHtml(lowerHtml),
    wordCount: lowerText.split(/\s+/).filter(Boolean).length,
  };
}

function pagesCountFromHtml(lowerHtml) {
  const hrefMatches = lowerHtml.match(/href=/g) || [];
  return hrefMatches.length;
}

function scoreTechnical(features, home, totalLoadMs) {
  let score = 0;
  if (features.statusOk) score += 15;
  if (features.isHttps) score += 20;
  if (features.hasViewport) score += 20;
  if (features.hasTitle) score += 10;
  if (features.hasMetaDescription) score += 10;
  if (features.hasSchema) score += 10;
  if (Number(home.loadMs || totalLoadMs) < 2500) score += 10;
  else if (Number(home.loadMs || totalLoadMs) < 5000) score += 5;
  if (features.oldTech.length) score -= Math.min(15, features.oldTech.length * 5);
  return clamp(Math.round(score), 0, 100);
}

function scoreModernity(features) {
  let score = 20;
  if (features.usesModernCss) score += 20;
  if (features.hasViewport) score += 15;
  if (features.hasCustomFonts) score += 10;
  if (features.hasHeroVisual) score += 15;
  if (features.hasSchema) score += 5;
  if (features.newestCopyrightYear && features.newestCopyrightYear >= new Date().getFullYear() - 1) score += 10;
  if (features.oldTech.includes('Flash/SWF')) score -= 25;
  if (features.oldTech.includes('old jQuery marker')) score -= 10;
  if (features.oldTech.includes('Bootstrap 3 marker')) score -= 8;
  return clamp(Math.round(score), 0, 100);
}

function scoreAttractiveness(features) {
  let score = 10;
  if (features.hasHeroVisual) score += 25;
  if (features.largeImages >= 2) score += 15;
  if (features.imgCount >= 8) score += 15;
  if (features.hasGallery) score += 15;
  if (features.hasVideo) score += 8;
  if (features.hasLogo) score += 5;
  if (features.hasCustomFonts) score += 5;
  if (features.oldTech.length) score -= Math.min(18, features.oldTech.length * 6);
  return clamp(Math.round(score), 0, 100);
}

function scoreConversion(features) {
  let score = 0;
  if (features.hasPhone) score += 15;
  if (features.hasTelLink) score += 10;
  if (features.hasQuoteCta) score += 20;
  if (features.hasBooking) score += 25;
  if (features.hasContactForm) score += 15;
  if (features.hasMapOrAddress) score += 5;
  if (features.hasHours) score += 5;
  if (features.hasReviews) score += 5;
  return clamp(Math.round(score), 0, 100);
}

function scoreContent(features) {
  let score = 0;
  if (features.hasServices) score += 25;
  if (features.hasPricing) score += 20;
  if (features.hasGallery) score += 20;
  if (features.hasReviews) score += 15;
  if (features.wordCount >= 600) score += 10;
  else if (features.wordCount >= 250) score += 5;
  if (features.hasSocial) score += 5;
  if (features.hasHours) score += 5;
  return clamp(Math.round(score), 0, 100);
}

function buildNarrative(place, features, scores, totalScore) {
  const findings = [];
  const recommendations = [];

  if (!features.hasViewport) {
    findings.push('No clear mobile viewport tag detected.');
    recommendations.push('Add/repair responsive mobile layout; most local-service traffic will be mobile.');
  }
  if (!features.hasBooking) {
    findings.push('No obvious online booking flow detected.');
    recommendations.push('Add a visible Book Now or Schedule Online flow using a detailing-friendly booking tool.');
  }
  if (!features.hasQuoteCta) {
    findings.push('No strong quote/call/schedule CTA detected.');
    recommendations.push('Place a primary CTA in the hero, sticky mobile header, and service sections.');
  }
  if (!features.hasPricing) {
    findings.push('No pricing/packages signal detected.');
    recommendations.push('Publish starting prices or packages for interior, exterior, ceramic coating, and paint correction.');
  }
  if (!features.hasGallery) {
    findings.push('No strong gallery/before-after signal detected.');
    recommendations.push('Add a before/after gallery with real vehicles and captions for local SEO.');
  }
  if (!features.hasReviews) {
    findings.push('No testimonial/review signal detected.');
    recommendations.push('Embed Google reviews or add testimonials near conversion sections.');
  }
  if (!features.hasSchema) {
    findings.push('No LocalBusiness structured data detected.');
    recommendations.push('Add LocalBusiness/AutomotiveBusiness schema with NAP, geo, hours, and service area.');
  }
  if (features.oldTech.length) {
    findings.push(`Older implementation markers detected: ${features.oldTech.join(', ')}.`);
    recommendations.push('Modernize frontend dependencies and visual system before increasing paid traffic.');
  }
  if (totalScore >= 75) {
    findings.push('Website has a comparatively strong automated audit score.');
  }
  if (!findings.length) {
    findings.push('No major automated issues detected.');
  }

  let leadAngle = 'General website improvement opportunity';
  if (totalScore < 35) leadAngle = 'High-priority redesign / conversion rebuild lead';
  else if (!features.hasBooking || !features.hasQuoteCta) leadAngle = 'Conversion and booking upgrade lead';
  else if (!features.hasGallery || !features.hasPricing) leadAngle = 'Content and trust upgrade lead';
  else if (scores.technical < 55) leadAngle = 'Technical SEO / mobile performance lead';
  else if (scores.attractiveness < 55) leadAngle = 'Visual refresh lead';

  if (place.rating && Number(place.rating) >= 4.5 && totalScore < 60) {
    leadAngle = 'Strong Google reputation but weak website presence';
  }

  return { findings, recommendations: unique(recommendations).slice(0, 8), leadAngle };
}

function emptyScores() {
  return {
    technical: 0,
    modernity: 0,
    attractiveness: 0,
    conversion: 0,
    content: 0,
  };
}

async function createAiAudit(aiClient, args, place, audit, pageData) {
  const prompt = {
    business: {
      name: place.name,
      address: place.address,
      rating: place.rating,
      reviewCount: place.reviewCount,
      website: audit.website,
    },
    automatedAudit: {
      totalScore: audit.totalScore,
      scores: audit.scores,
      detectedFeatures: audit.detectedFeatures,
      findings: audit.findings,
      recommendations: audit.recommendations,
    },
    homepageTextSample: String(pageData.text || '').slice(0, 3500),
  };

  const completion = await aiClient.chat.completions.create({
    model: args.aiModel,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You are a practical website auditor for local auto detailing businesses. Return concise JSON only.',
      },
      {
        role: 'user',
        content:
          'Evaluate this detailing business website for modernity, attractiveness, conversion, and missing features. Return JSON with keys: summary, ideal_pitch, top_issues, quick_wins, redesign_priority from 1 to 5.\n\n' +
          JSON.stringify(prompt),
      },
    ],
  });

  return JSON.parse(completion.choices?.[0]?.message?.content || '{}');
}

function htmlToText(html) {
  const $ = cheerio.load(html || '');
  $('script,style,noscript,svg').remove();
  return $('body').text().replace(/\s+/g, ' ').trim();
}

function extractLinks(baseUrl, html) {
  const $ = cheerio.load(html || '');
  const links = [];
  $('a[href]').each((_, anchor) => {
    const href = $(anchor).attr('href');
    if (!href) return;
    if (/^(tel:|mailto:)/i.test(href)) {
      links.push(href);
      return;
    }
    try {
      links.push(new URL(href, baseUrl).toString());
    } catch {
      // Ignore malformed links.
    }
  });
  return unique(links);
}

async function writePlacesOutputs(outDir, places) {
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'places.json'), JSON.stringify(places, null, 2));
  await fs.writeFile(path.join(outDir, 'places.csv'), toCsv(places, PLACE_COLUMNS));
  console.log(`Wrote ${places.length} places to ${outDir}`);
}

async function writeAuditOutputs(outDir, places, audits) {
  const auditsByPlaceId = new Map(audits.map((audit) => [audit.placeId, audit]));
  const rows = places.map((place) => {
    const audit = auditsByPlaceId.get(place.placeId) || {};
    return flattenRow(place, audit);
  });

  await fs.writeFile(path.join(outDir, 'audits.json'), JSON.stringify(audits, null, 2));
  await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(rows, null, 2));
  await fs.writeFile(path.join(outDir, 'report.csv'), toCsv(rows, REPORT_COLUMNS));
  console.log(`Wrote ${rows.length} report rows to ${outDir}`);
}

const PLACE_COLUMNS = [
  'placeId',
  'source',
  'sourceUrl',
  'name',
  'address',
  'phone',
  'website',
  'googleMapsUrl',
  'rating',
  'reviewCount',
  'businessStatus',
  'primaryType',
  'types',
  'pureServiceAreaBusiness',
  'latitude',
  'longitude',
  'matchedTerms',
  'matchedAreas',
];

const REPORT_COLUMNS = [
  ...PLACE_COLUMNS,
  'totalScore',
  'technicalScore',
  'modernityScore',
  'attractivenessScore',
  'conversionScore',
  'contentScore',
  'leadAngle',
  'reachable',
  'finalUrl',
  'statusCode',
  'loadMs',
  'screenshotPath',
  'findings',
  'recommendations',
  'hasBooking',
  'hasPricing',
  'hasGallery',
  'hasReviews',
  'hasContactForm',
  'hasSchema',
  'error',
];

function flattenRow(place, audit) {
  const scores = audit.scores || emptyScores();
  const features = audit.detectedFeatures || {};
  return {
    ...place,
    totalScore: audit.totalScore ?? '',
    technicalScore: scores.technical ?? '',
    modernityScore: scores.modernity ?? '',
    attractivenessScore: scores.attractiveness ?? '',
    conversionScore: scores.conversion ?? '',
    contentScore: scores.content ?? '',
    leadAngle: audit.leadAngle || '',
    reachable: audit.reachable ?? '',
    finalUrl: audit.finalUrl || '',
    statusCode: audit.statusCode || '',
    loadMs: audit.loadMs || '',
    screenshotPath: audit.screenshotPath || '',
    findings: (audit.findings || []).join(' | '),
    recommendations: (audit.recommendations || []).join(' | '),
    hasBooking: features.hasBooking ?? '',
    hasPricing: features.hasPricing ?? '',
    hasGallery: features.hasGallery ?? '',
    hasReviews: features.hasReviews ?? '',
    hasContactForm: features.hasContactForm ?? '',
    hasSchema: features.hasSchema ?? '',
    error: audit.error || '',
  };
}

function toCsv(rows, columns) {
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(
      columns
        .map((column) => {
          const value = row[column];
          if (Array.isArray(value)) return csvEscape(value.join('; '));
          if (value && typeof value === 'object') return csvEscape(JSON.stringify(value));
          return csvEscape(value ?? '');
        })
        .join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

function csvEscape(value) {
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function stripBom(text) {
  return String(text || '').replace(/^\uFEFF/, '');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
