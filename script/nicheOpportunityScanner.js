import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import got from 'got';
import PQueue from 'p-queue';

const GOOGLE_TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const OVERPASS_URL = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), 'script', 'output', 'niche-opportunity-scanner');

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
  'places.regularOpeningHours',
  'nextPageToken',
].join(',');

const DEFAULT_NJ_AREAS = [
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

const DEFAULT_ECONOMICS = {
  ticket: 3,
  repeat: 3,
  urgency: 3,
  margin: 3,
  b2b: 2,
};

const DEFAULT_ENTRY = {
  startup: 3,
  regulation: 2,
  liability: 3,
  skill: 3,
};

const DEFAULT_CATALOG = [
  catalogItem({
    name: 'Wheelchair ramp installation and repair',
    sector: 'senior and accessibility',
    queries: ['wheelchair ramp installation', 'handicap ramp contractor', 'home accessibility ramp repair'],
    economics: { ticket: 4, repeat: 2, urgency: 4, margin: 4, b2b: 2 },
    entry: { startup: 3, regulation: 3, liability: 4, skill: 4 },
    demandSignals: ['aging homeowners', 'post-surgery discharge needs', 'ADA-adjacent home modifications'],
  }),
  catalogItem({
    name: 'Grab bar installation',
    sector: 'senior and accessibility',
    queries: ['grab bar installation', 'bathroom safety bar installer', 'senior home safety modifications'],
    economics: { ticket: 3, repeat: 2, urgency: 3, margin: 4, b2b: 2 },
    entry: { startup: 2, regulation: 2, liability: 3, skill: 3 },
    demandSignals: ['aging-in-place demand', 'fall prevention', 'small urgent home projects'],
  }),
  catalogItem({
    name: 'Stair lift installation and repair',
    sector: 'senior and accessibility',
    queries: ['stair lift installation', 'stairlift repair', 'chair lift installation'],
    economics: { ticket: 5, repeat: 3, urgency: 4, margin: 4, b2b: 2 },
    entry: { startup: 4, regulation: 3, liability: 4, skill: 4 },
    demandSignals: ['aging homes', 'mobility needs', 'high-ticket equipment service'],
  }),
  catalogItem({
    name: 'Senior home safety audit',
    sector: 'senior and accessibility',
    queries: ['senior home safety assessment', 'aging in place home assessment', 'fall prevention home assessment'],
    economics: { ticket: 3, repeat: 2, urgency: 3, margin: 4, b2b: 3 },
    entry: { startup: 1, regulation: 2, liability: 3, skill: 3 },
    demandSignals: ['family caregiver decisions', 'Medicare-adjacent referrals', 'bundled modification upsells'],
  }),
  catalogItem({
    name: 'Commercial kitchen hood cleaning',
    sector: 'commercial maintenance',
    queries: ['commercial kitchen hood cleaning', 'restaurant hood cleaning', 'exhaust hood cleaning'],
    economics: { ticket: 4, repeat: 5, urgency: 4, margin: 4, b2b: 5 },
    entry: { startup: 4, regulation: 4, liability: 4, skill: 4 },
    demandSignals: ['recurring compliance', 'restaurant operations', 'night service windows'],
  }),
  catalogItem({
    name: 'Grease trap cleaning',
    sector: 'commercial maintenance',
    queries: ['grease trap cleaning', 'grease interceptor cleaning', 'restaurant grease trap service'],
    economics: { ticket: 4, repeat: 5, urgency: 5, margin: 4, b2b: 5 },
    entry: { startup: 4, regulation: 4, liability: 4, skill: 4 },
    demandSignals: ['required restaurant maintenance', 'recurring route density', 'emergency odor/blockage calls'],
  }),
  catalogItem({
    name: 'Ice machine cleaning and repair',
    sector: 'commercial equipment',
    queries: ['commercial ice machine cleaning', 'ice machine repair', 'restaurant ice machine service'],
    economics: { ticket: 4, repeat: 4, urgency: 4, margin: 4, b2b: 5 },
    entry: { startup: 3, regulation: 3, liability: 3, skill: 4 },
    demandSignals: ['restaurants', 'medical offices', 'recurring sanitation'],
  }),
  catalogItem({
    name: 'Commercial refrigeration repair',
    sector: 'commercial equipment',
    queries: ['commercial refrigeration repair', 'walk in cooler repair', 'restaurant refrigeration repair'],
    economics: { ticket: 5, repeat: 4, urgency: 5, margin: 4, b2b: 5 },
    entry: { startup: 4, regulation: 4, liability: 4, skill: 5 },
    demandSignals: ['urgent spoilage risk', 'high-ticket B2B repairs', 'recurring maintenance contracts'],
  }),
  catalogItem({
    name: 'Restaurant equipment repair',
    sector: 'commercial equipment',
    queries: ['restaurant equipment repair', 'commercial oven repair', 'commercial dishwasher repair'],
    economics: { ticket: 4, repeat: 4, urgency: 5, margin: 4, b2b: 5 },
    entry: { startup: 4, regulation: 3, liability: 4, skill: 5 },
    demandSignals: ['restaurant downtime', 'repair before replacement', 'maintenance contracts'],
  }),
  catalogItem({
    name: 'Fire extinguisher inspection and recharge',
    sector: 'compliance maintenance',
    queries: ['fire extinguisher inspection', 'fire extinguisher recharge', 'fire protection service'],
    economics: { ticket: 3, repeat: 5, urgency: 4, margin: 4, b2b: 5 },
    entry: { startup: 3, regulation: 5, liability: 4, skill: 4 },
    demandSignals: ['inspection requirements', 'multi-location customers', 'annual recurring service'],
  }),
  catalogItem({
    name: 'Backflow testing',
    sector: 'compliance maintenance',
    queries: ['backflow testing', 'backflow preventer testing', 'certified backflow tester'],
    economics: { ticket: 3, repeat: 5, urgency: 4, margin: 4, b2b: 4 },
    entry: { startup: 2, regulation: 5, liability: 4, skill: 4 },
    demandSignals: ['municipal compliance', 'annual tests', 'commercial property needs'],
  }),
  catalogItem({
    name: 'Dryer vent cleaning',
    sector: 'home maintenance',
    queries: ['dryer vent cleaning', 'dryer duct cleaning', 'clothes dryer vent service'],
    economics: { ticket: 3, repeat: 4, urgency: 4, margin: 4, b2b: 2 },
    entry: { startup: 2, regulation: 1, liability: 3, skill: 2 },
    demandSignals: ['fire risk', 'condo and townhouse density', 'repeat annual service'],
  }),
  catalogItem({
    name: 'Radon testing and mitigation',
    sector: 'home health and safety',
    queries: ['radon testing', 'radon mitigation', 'radon remediation contractor'],
    economics: { ticket: 4, repeat: 2, urgency: 4, margin: 4, b2b: 3 },
    entry: { startup: 3, regulation: 5, liability: 4, skill: 4 },
    demandSignals: ['home sales', 'health risk', 'basement-heavy housing stock'],
  }),
  catalogItem({
    name: 'Crawl space encapsulation',
    sector: 'home maintenance',
    queries: ['crawl space encapsulation', 'crawlspace moisture control', 'crawl space vapor barrier'],
    economics: { ticket: 5, repeat: 2, urgency: 3, margin: 4, b2b: 2 },
    entry: { startup: 3, regulation: 2, liability: 4, skill: 4 },
    demandSignals: ['moisture problems', 'older homes', 'high-ticket remediation'],
  }),
  catalogItem({
    name: 'Pool leak detection',
    sector: 'home maintenance',
    queries: ['pool leak detection', 'swimming pool leak repair', 'pool pressure testing'],
    economics: { ticket: 4, repeat: 2, urgency: 4, margin: 4, b2b: 2 },
    entry: { startup: 3, regulation: 2, liability: 3, skill: 4 },
    demandSignals: ['seasonal pool markets', 'water loss urgency', 'specialized equipment'],
  }),
  catalogItem({
    name: 'Irrigation repair',
    sector: 'property maintenance',
    queries: ['irrigation repair', 'sprinkler system repair', 'lawn sprinkler repair'],
    economics: { ticket: 3, repeat: 4, urgency: 3, margin: 4, b2b: 3 },
    entry: { startup: 2, regulation: 2, liability: 3, skill: 3 },
    demandSignals: ['seasonal recurring service', 'homeowner convenience', 'commercial landscaping support'],
  }),
  catalogItem({
    name: 'Fence repair',
    sector: 'property maintenance',
    queries: ['fence repair', 'wood fence repair', 'vinyl fence repair'],
    economics: { ticket: 3, repeat: 2, urgency: 3, margin: 3, b2b: 2 },
    entry: { startup: 2, regulation: 2, liability: 2, skill: 3 },
    demandSignals: ['storm damage', 'pet containment', 'small jobs large contractors ignore'],
  }),
  catalogItem({
    name: 'Parking lot striping',
    sector: 'commercial property',
    queries: ['parking lot striping', 'line striping contractor', 'parking lot marking'],
    economics: { ticket: 4, repeat: 4, urgency: 3, margin: 4, b2b: 5 },
    entry: { startup: 3, regulation: 2, liability: 3, skill: 3 },
    demandSignals: ['property maintenance budgets', 'ADA markings', 'recurring repaint cycles'],
  }),
  catalogItem({
    name: 'Pavement crack sealing',
    sector: 'commercial property',
    queries: ['pavement crack sealing', 'asphalt crack repair', 'parking lot crack filling'],
    economics: { ticket: 4, repeat: 3, urgency: 3, margin: 4, b2b: 4 },
    entry: { startup: 3, regulation: 2, liability: 3, skill: 3 },
    demandSignals: ['winter damage', 'parking lots', 'preventive maintenance'],
  }),
  catalogItem({
    name: 'Dumpster pad cleaning',
    sector: 'commercial property',
    queries: ['dumpster pad cleaning', 'dumpster area pressure washing', 'commercial dumpster cleaning'],
    economics: { ticket: 3, repeat: 5, urgency: 4, margin: 4, b2b: 5 },
    entry: { startup: 3, regulation: 2, liability: 3, skill: 2 },
    demandSignals: ['odor complaints', 'restaurant and retail recurring service', 'property manager pain'],
  }),
  catalogItem({
    name: 'Graffiti removal',
    sector: 'commercial property',
    queries: ['graffiti removal', 'graffiti cleaning service', 'commercial graffiti removal'],
    economics: { ticket: 3, repeat: 3, urgency: 4, margin: 4, b2b: 4 },
    entry: { startup: 2, regulation: 2, liability: 3, skill: 2 },
    demandSignals: ['urgent brand/property issue', 'municipal and commercial buyers', 'specialty cleaning'],
  }),
  catalogItem({
    name: 'Emergency board up service',
    sector: 'property emergency',
    queries: ['emergency board up service', 'board up service', 'window board up service'],
    economics: { ticket: 4, repeat: 2, urgency: 5, margin: 4, b2b: 3 },
    entry: { startup: 3, regulation: 2, liability: 4, skill: 3 },
    demandSignals: ['storms', 'break-ins', 'after-hours urgency'],
  }),
  catalogItem({
    name: 'Estate cleanout',
    sector: 'specialty cleaning',
    queries: ['estate cleanout', 'house cleanout service', 'estate junk removal'],
    economics: { ticket: 4, repeat: 2, urgency: 4, margin: 3, b2b: 2 },
    entry: { startup: 3, regulation: 1, liability: 3, skill: 2 },
    demandSignals: ['probate and downsizing', 'urgent real estate timelines', 'large one-off jobs'],
  }),
  catalogItem({
    name: 'Hoarding cleanup',
    sector: 'specialty cleaning',
    queries: ['hoarding cleanup', 'hoarder house cleaning', 'extreme cleaning service'],
    economics: { ticket: 5, repeat: 2, urgency: 4, margin: 4, b2b: 2 },
    entry: { startup: 3, regulation: 3, liability: 4, skill: 4 },
    demandSignals: ['high pain', 'family decision makers', 'limited qualified providers'],
  }),
  catalogItem({
    name: 'Biohazard cleanup',
    sector: 'specialty cleaning',
    queries: ['biohazard cleanup', 'crime scene cleanup', 'trauma cleanup service'],
    economics: { ticket: 5, repeat: 2, urgency: 5, margin: 5, b2b: 3 },
    entry: { startup: 4, regulation: 5, liability: 5, skill: 5 },
    demandSignals: ['urgent high-stakes cleanup', 'insurance and property manager buyers', 'limited tolerance for poor service'],
  }),
  catalogItem({
    name: 'Pet waste removal subscription',
    sector: 'pet services',
    queries: ['pet waste removal', 'dog poop pickup service', 'pooper scooper service'],
    economics: { ticket: 2, repeat: 5, urgency: 2, margin: 4, b2b: 2 },
    entry: { startup: 1, regulation: 1, liability: 2, skill: 1 },
    demandSignals: ['recurring household convenience', 'route density', 'low startup cost'],
  }),
  catalogItem({
    name: 'Mobile pet grooming',
    sector: 'pet services',
    queries: ['mobile pet grooming', 'mobile dog groomer', 'mobile cat grooming'],
    economics: { ticket: 3, repeat: 5, urgency: 3, margin: 4, b2b: 1 },
    entry: { startup: 4, regulation: 2, liability: 3, skill: 4 },
    demandSignals: ['repeat pet care', 'convenience premium', 'capacity-constrained providers'],
  }),
  catalogItem({
    name: 'In-home dog training',
    sector: 'pet services',
    queries: ['in home dog training', 'private dog trainer', 'puppy training at home'],
    economics: { ticket: 4, repeat: 3, urgency: 3, margin: 4, b2b: 1 },
    entry: { startup: 1, regulation: 1, liability: 3, skill: 4 },
    demandSignals: ['new pet owners', 'behavior problems', 'premium local trust'],
  }),
  catalogItem({
    name: 'Baby gear rental and cleaning',
    sector: 'family services',
    queries: ['baby gear rental', 'crib rental', 'stroller rental service'],
    economics: { ticket: 3, repeat: 3, urgency: 3, margin: 3, b2b: 2 },
    entry: { startup: 3, regulation: 2, liability: 4, skill: 2 },
    demandSignals: ['traveling families', 'shore and vacation rentals', 'cleanliness trust'],
  }),
  catalogItem({
    name: 'Car seat installation service',
    sector: 'family services',
    queries: ['car seat installation service', 'child passenger safety technician', 'car seat check'],
    economics: { ticket: 2, repeat: 2, urgency: 3, margin: 4, b2b: 2 },
    entry: { startup: 1, regulation: 3, liability: 4, skill: 3 },
    demandSignals: ['new parents', 'safety anxiety', 'low provider visibility'],
  }),
  catalogItem({
    name: 'Mobile notary and loan signing',
    sector: 'local professional services',
    queries: ['mobile notary', 'loan signing agent', 'notary public mobile'],
    economics: { ticket: 2, repeat: 3, urgency: 4, margin: 4, b2b: 3 },
    entry: { startup: 1, regulation: 3, liability: 2, skill: 2 },
    demandSignals: ['urgent document needs', 'real estate closings', 'low startup cost'],
  }),
  catalogItem({
    name: 'Apostille and document courier',
    sector: 'local professional services',
    queries: ['apostille service', 'document courier service', 'apostille courier'],
    economics: { ticket: 3, repeat: 3, urgency: 4, margin: 4, b2b: 3 },
    entry: { startup: 1, regulation: 2, liability: 2, skill: 2 },
    demandSignals: ['immigration and international documents', 'time-sensitive filings', 'multilingual markets'],
  }),
  catalogItem({
    name: 'Translation and interpretation service',
    sector: 'local professional services',
    queries: ['translation service', 'interpreter service', 'certified translation'],
    economics: { ticket: 3, repeat: 4, urgency: 3, margin: 4, b2b: 4 },
    entry: { startup: 1, regulation: 2, liability: 3, skill: 4 },
    demandSignals: ['immigrant communities', 'legal and medical appointments', 'business paperwork'],
  }),
  catalogItem({
    name: 'Document scanning and shredding pickup',
    sector: 'small business services',
    queries: ['document scanning service', 'mobile shredding service', 'paper scanning service'],
    economics: { ticket: 3, repeat: 4, urgency: 3, margin: 3, b2b: 5 },
    entry: { startup: 3, regulation: 2, liability: 3, skill: 2 },
    demandSignals: ['small office cleanup', 'compliance-sensitive documents', 'recurring pickup routes'],
  }),
  catalogItem({
    name: 'Small business IT support',
    sector: 'small business services',
    queries: ['small business IT support', 'managed IT services small business', 'computer support for business'],
    economics: { ticket: 4, repeat: 5, urgency: 5, margin: 4, b2b: 5 },
    entry: { startup: 1, regulation: 1, liability: 3, skill: 5 },
    demandSignals: ['recurring retainers', 'urgent downtime', 'local trust'],
  }),
  catalogItem({
    name: 'POS system setup and support',
    sector: 'small business services',
    queries: ['POS system setup', 'restaurant POS support', 'retail POS installation'],
    economics: { ticket: 4, repeat: 4, urgency: 5, margin: 4, b2b: 5 },
    entry: { startup: 1, regulation: 1, liability: 3, skill: 4 },
    demandSignals: ['retail and restaurant operations', 'implementation pain', 'support retainers'],
  }),
  catalogItem({
    name: 'Office printer repair',
    sector: 'small business services',
    queries: ['office printer repair', 'copier repair service', 'printer service technician'],
    economics: { ticket: 3, repeat: 4, urgency: 4, margin: 3, b2b: 5 },
    entry: { startup: 2, regulation: 1, liability: 2, skill: 4 },
    demandSignals: ['office downtime', 'older equipment', 'recurring service routes'],
  }),
  catalogItem({
    name: 'Security camera installation',
    sector: 'property technology',
    queries: ['security camera installation', 'CCTV installation', 'surveillance camera installer'],
    economics: { ticket: 4, repeat: 3, urgency: 4, margin: 4, b2b: 4 },
    entry: { startup: 2, regulation: 3, liability: 3, skill: 4 },
    demandSignals: ['home and small business security', 'upgrade cycles', 'maintenance support'],
  }),
  catalogItem({
    name: 'Smart home setup for seniors',
    sector: 'property technology',
    queries: ['smart home setup for seniors', 'smart home installation', 'Alexa setup service'],
    economics: { ticket: 3, repeat: 3, urgency: 2, margin: 4, b2b: 2 },
    entry: { startup: 1, regulation: 1, liability: 2, skill: 3 },
    demandSignals: ['aging-in-place convenience', 'family buyers', 'simple technical help'],
  }),
  catalogItem({
    name: 'EV charger installation',
    sector: 'electrical and vehicle',
    queries: ['EV charger installation', 'home EV charger installer', 'Tesla charger installation'],
    economics: { ticket: 4, repeat: 2, urgency: 3, margin: 3, b2b: 3 },
    entry: { startup: 3, regulation: 5, liability: 4, skill: 5 },
    demandSignals: ['EV adoption', 'homeowner upgrades', 'permit-dependent jobs'],
  }),
  catalogItem({
    name: 'Generator maintenance',
    sector: 'electrical and vehicle',
    queries: ['generator maintenance', 'standby generator service', 'Generac generator service'],
    economics: { ticket: 4, repeat: 5, urgency: 4, margin: 4, b2b: 3 },
    entry: { startup: 3, regulation: 3, liability: 4, skill: 4 },
    demandSignals: ['storm risk', 'annual service', 'high trust requirement'],
  }),
  catalogItem({
    name: 'Mobile wheel repair',
    sector: 'vehicle services',
    queries: ['mobile wheel repair', 'rim repair', 'curb rash repair'],
    economics: { ticket: 3, repeat: 3, urgency: 3, margin: 4, b2b: 3 },
    entry: { startup: 3, regulation: 1, liability: 3, skill: 4 },
    demandSignals: ['urban curb damage', 'dealer relationships', 'mobile convenience'],
  }),
  catalogItem({
    name: 'Windshield chip repair',
    sector: 'vehicle services',
    queries: ['windshield chip repair', 'mobile windshield repair', 'auto glass chip repair'],
    economics: { ticket: 2, repeat: 3, urgency: 4, margin: 4, b2b: 2 },
    entry: { startup: 2, regulation: 1, liability: 3, skill: 2 },
    demandSignals: ['same-day convenience', 'insurance-adjacent claims', 'low-ticket volume'],
  }),
  catalogItem({
    name: 'Mobile bicycle repair',
    sector: 'vehicle and recreation',
    queries: ['mobile bicycle repair', 'bike repair service', 'bicycle mechanic mobile'],
    economics: { ticket: 2, repeat: 4, urgency: 2, margin: 3, b2b: 2 },
    entry: { startup: 1, regulation: 1, liability: 2, skill: 3 },
    demandSignals: ['commuter and recreation demand', 'seasonal route service', 'low startup cost'],
  }),
  catalogItem({
    name: 'Mobile knife sharpening',
    sector: 'specialty repair',
    queries: ['mobile knife sharpening', 'knife sharpening service', 'scissor sharpening service'],
    economics: { ticket: 2, repeat: 4, urgency: 2, margin: 4, b2b: 4 },
    entry: { startup: 1, regulation: 1, liability: 2, skill: 3 },
    demandSignals: ['restaurants', 'salons', 'home cooks', 'route density'],
  }),
  catalogItem({
    name: 'Sewing machine repair',
    sector: 'specialty repair',
    queries: ['sewing machine repair', 'industrial sewing machine repair', 'serger repair'],
    economics: { ticket: 3, repeat: 3, urgency: 2, margin: 4, b2b: 3 },
    entry: { startup: 1, regulation: 1, liability: 2, skill: 4 },
    demandSignals: ['few specialty technicians', 'home hobbyists', 'small apparel businesses'],
  }),
  catalogItem({
    name: 'Aquarium maintenance',
    sector: 'specialty home and office',
    queries: ['aquarium maintenance', 'fish tank cleaning service', 'commercial aquarium service'],
    economics: { ticket: 3, repeat: 5, urgency: 3, margin: 4, b2b: 3 },
    entry: { startup: 2, regulation: 1, liability: 2, skill: 3 },
    demandSignals: ['recurring care', 'office lobbies', 'specialized trust'],
  }),
  catalogItem({
    name: 'Office plant maintenance',
    sector: 'specialty home and office',
    queries: ['office plant maintenance', 'interior plant service', 'plant care service'],
    economics: { ticket: 3, repeat: 5, urgency: 2, margin: 4, b2b: 5 },
    entry: { startup: 2, regulation: 1, liability: 1, skill: 2 },
    demandSignals: ['recurring office service', 'low urgency but sticky accounts', 'route density'],
  }),
  catalogItem({
    name: 'CPR and BLS training',
    sector: 'training and certification',
    queries: ['CPR training', 'BLS certification', 'first aid training'],
    economics: { ticket: 3, repeat: 4, urgency: 3, margin: 4, b2b: 4 },
    entry: { startup: 1, regulation: 3, liability: 3, skill: 3 },
    demandSignals: ['workplace compliance', 'healthcare renewals', 'group classes'],
  }),
  catalogItem({
    name: 'Mobile phlebotomy',
    sector: 'health services',
    queries: ['mobile phlebotomy', 'blood draw at home', 'mobile lab draw'],
    economics: { ticket: 3, repeat: 4, urgency: 4, margin: 3, b2b: 4 },
    entry: { startup: 2, regulation: 5, liability: 5, skill: 5 },
    demandSignals: ['homebound patients', 'clinical partnerships', 'regulated recurring service'],
  }),
  catalogItem({
    name: 'Laundry pickup and delivery',
    sector: 'consumer convenience',
    queries: ['laundry pickup and delivery', 'wash and fold pickup', 'laundry delivery service'],
    economics: { ticket: 2, repeat: 5, urgency: 3, margin: 3, b2b: 2 },
    entry: { startup: 2, regulation: 1, liability: 2, skill: 1 },
    demandSignals: ['repeat convenience', 'dense towns', 'route operations'],
  }),
  catalogItem({
    name: 'Diaper cleaning service',
    sector: 'consumer convenience',
    queries: ['cloth diaper service', 'diaper cleaning service', 'diaper laundry service'],
    economics: { ticket: 2, repeat: 5, urgency: 3, margin: 3, b2b: 1 },
    entry: { startup: 3, regulation: 2, liability: 3, skill: 2 },
    demandSignals: ['new parents', 'recurring subscription', 'eco-conscious households'],
  }),
  catalogItem({
    name: 'Mailbox and post installation',
    sector: 'home maintenance',
    queries: ['mailbox installation', 'mailbox post replacement', 'mailbox repair service'],
    economics: { ticket: 2, repeat: 1, urgency: 3, margin: 3, b2b: 1 },
    entry: { startup: 1, regulation: 1, liability: 1, skill: 1 },
    demandSignals: ['snowplow damage', 'small handyman jobs', 'low startup cost'],
  }),
];

function parseArgs(argv) {
  const args = {
    mode: 'all',
    source: 'google',
    catalog: 'default',
    categories: [],
    categoriesFile: '',
    categoryLimit: 25,
    queryLimit: 1,
    location: 'New Jersey',
    profile: 'single',
    areas: [],
    gridStep: 0.35,
    pageSize: 20,
    maxPagesPerSearch: 1,
    searchConcurrency: 2,
    requestDelayMs: 300,
    outDir: DEFAULT_OUTPUT_DIR,
    input: '',
    dryRun: false,
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
      case 'catalog':
        args.catalog = value;
        break;
      case 'categories':
        args.categories = splitList(value);
        break;
      case 'categoriesFile':
        args.categoriesFile = path.resolve(process.cwd(), value);
        break;
      case 'categoryLimit':
        args.categoryLimit = Number(value);
        break;
      case 'queryLimit':
        args.queryLimit = Number(value);
        break;
      case 'location':
        args.location = value;
        break;
      case 'profile':
        args.profile = value;
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
      case 'requestDelayMs':
        args.requestDelayMs = Number(value);
        break;
      case 'out':
      case 'outDir':
        args.outDir = path.resolve(process.cwd(), value);
        break;
      case 'input':
        args.input = path.resolve(process.cwd(), value);
        break;
      case 'dryRun':
        args.dryRun = parseBoolean(value);
        break;
      case 'help':
      case 'h':
        args.help = true;
        break;
      default:
        throw new Error(`Unknown option: --${key}`);
    }
  }

  if (!['search', 'analyze', 'all'].includes(args.mode)) {
    throw new Error('--mode must be one of: search, analyze, all');
  }
  if (!['google', 'osm'].includes(args.source)) {
    throw new Error('--source must be one of: google, osm');
  }
  if (!['single', 'quick', 'grid'].includes(args.profile)) {
    throw new Error('--profile must be one of: single, quick, grid');
  }
  if (!['default'].includes(args.catalog)) {
    throw new Error('--catalog must be: default');
  }

  args.categoryLimit = normalizeInteger(args.categoryLimit, 0, 10000, 25);
  args.queryLimit = normalizeInteger(args.queryLimit, 1, 20, 1);
  args.pageSize = normalizeInteger(args.pageSize, 1, 20, 20);
  args.maxPagesPerSearch = normalizeInteger(args.maxPagesPerSearch, 1, 3, 1);
  args.searchConcurrency = normalizeInteger(args.searchConcurrency, 1, 10, 2);
  args.requestDelayMs = normalizeInteger(args.requestDelayMs, 0, 60000, 300);

  if (!Number.isFinite(args.gridStep) || args.gridStep <= 0) {
    throw new Error('--gridStep must be a positive number');
  }

  return args;
}

function printHelp() {
  console.log(`
Niche opportunity scanner

Find local business categories where demand signals exist, visible competitors are weak,
and the category may be practical for a personal launch.

Usage:
  node script/nicheOpportunityScanner.js --dryRun true
  node script/nicheOpportunityScanner.js --source google --location "New Jersey" --categoryLimit 20
  node script/nicheOpportunityScanner.js --source google --profile quick --areas "Bergen County NJ,Essex County NJ" --categoryLimit 10
  node script/nicheOpportunityScanner.js --source osm --location "New Jersey" --categoryLimit 10
  node script/nicheOpportunityScanner.js --mode analyze --input script/output/niche-opportunity-scanner/places.json

Required for Google search:
  GOOGLE_MAPS_API_KEY=...

Options:
  --mode search|analyze|all          Search places, analyze existing places, or both. Default: all
  --source google|osm                Google Places or free OpenStreetMap Overpass. Default: google
  --categories "a,b,c"               Custom category names instead of the built-in catalog
  --categoriesFile path              JSON array of strings or category objects
  --categoryLimit 25                 Limit categories scanned. 0 = all selected categories
  --queryLimit 1                     Queries used per category. Higher = broader but more requests
  --location "New Jersey"            Location for single-profile text searches
  --profile single|quick|grid        single = one location; quick = areas list; grid = NJ cells
  --areas "Bergen County NJ,..."     Areas for quick profile. Defaults to all NJ counties
  --gridStep 0.35                    Degree step for NJ grid profile
  --pageSize 20                      Places page size. Max useful value: 20
  --maxPagesPerSearch 1              Google pages per query. Max useful value: 3
  --searchConcurrency 2              Parallel search requests
  --requestDelayMs 300               Queue pacing interval
  --out path                         Output directory
  --dryRun true                      Print planned jobs without network calls

Outputs:
  categories.json / categories.csv   Ranked opportunity categories
  places.json / places.csv           Deduplicated source listings by category
  search-stats.json / .csv           Query-level result counts and errors
  report.md                          Short top-candidate report
`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const categories = await loadCategories(args);
  const areas = buildSearchAreas(args);
  const jobs = buildSearchJobs(args, categories, areas);

  if (args.dryRun) {
    printDryRun(args, categories, areas, jobs);
    return;
  }

  await fs.mkdir(args.outDir, { recursive: true });

  let places = [];
  let searchStats = [];
  if (args.mode === 'search' || args.mode === 'all') {
    ({ places, searchStats } = await findPlaces(args, jobs));
    await writeSearchOutputs(args.outDir, places, searchStats);
  }

  if (args.mode === 'analyze' || args.mode === 'all') {
    if (!places.length) {
      const input = args.input || path.join(args.outDir, 'places.json');
      places = JSON.parse(stripBom(await fs.readFile(input, 'utf8')));
      searchStats = await readOptionalJson(path.join(path.dirname(input), 'search-stats.json'), []);
    }

    const summaries = analyzeCategories(categories, places, searchStats, areas);
    await writeAnalysisOutputs(args.outDir, summaries, places);
    printTopCandidates(summaries);
  }
}

async function loadCategories(args) {
  let rawCategories;

  if (args.categoriesFile) {
    const parsed = JSON.parse(stripBom(await fs.readFile(args.categoriesFile, 'utf8')));
    rawCategories = Array.isArray(parsed) ? parsed : parsed.categories;
    if (!Array.isArray(rawCategories)) {
      throw new Error('--categoriesFile must contain a JSON array or an object with a categories array');
    }
  } else if (args.categories.length) {
    rawCategories = args.categories;
  } else {
    rawCategories = DEFAULT_CATALOG;
  }

  const normalized = rawCategories.map((item, index) => normalizeCategory(item, index));
  return args.categoryLimit > 0 ? normalized.slice(0, args.categoryLimit) : normalized;
}

function normalizeCategory(item, index) {
  if (typeof item === 'string') {
    const name = item.trim();
    return {
      id: slugify(name) || `category-${index + 1}`,
      name,
      sector: 'custom',
      queries: [name],
      economics: { ...DEFAULT_ECONOMICS },
      entry: { ...DEFAULT_ENTRY },
      demandSignals: [],
    };
  }

  const name = String(item.name || item.category || '').trim();
  if (!name) {
    throw new Error(`Category at index ${index} is missing a name`);
  }

  return {
    id: item.id || slugify(name) || `category-${index + 1}`,
    name,
    sector: item.sector || 'custom',
    queries: unique([...(item.queries || []), name]).map(String).map((value) => value.trim()).filter(Boolean),
    osmKeywords: unique(item.osmKeywords || []),
    economics: normalizeScoreSet(item.economics, DEFAULT_ECONOMICS),
    entry: normalizeScoreSet(item.entry, DEFAULT_ENTRY),
    demandSignals: unique(item.demandSignals || []),
    notes: item.notes || '',
  };
}

function normalizeScoreSet(input = {}, defaults = {}) {
  const result = { ...defaults, ...input };
  for (const key of Object.keys(result)) {
    result[key] = clamp(Number(result[key] ?? defaults[key] ?? 3), 1, 5);
  }
  return result;
}

function buildSearchAreas(args) {
  if (args.profile === 'quick') {
    const areas = args.areas.length ? args.areas : DEFAULT_NJ_AREAS;
    return areas.map((label) => ({ label, type: 'area' }));
  }

  if (args.profile === 'grid') {
    const cells = [];
    let index = 1;
    for (let lat = NJ_BOUNDS.minLat; lat < NJ_BOUNDS.maxLat; lat += args.gridStep) {
      for (let lng = NJ_BOUNDS.minLng; lng < NJ_BOUNDS.maxLng; lng += args.gridStep) {
        cells.push({
          label: `grid-${index}`,
          type: 'grid',
          bounds: {
            south: roundCoord(lat),
            west: roundCoord(lng),
            north: roundCoord(Math.min(lat + args.gridStep, NJ_BOUNDS.maxLat)),
            east: roundCoord(Math.min(lng + args.gridStep, NJ_BOUNDS.maxLng)),
          },
        });
        index += 1;
      }
    }
    return cells;
  }

  return [{ label: args.location, type: 'single' }];
}

function buildSearchJobs(args, categories, areas) {
  const jobs = [];
  for (const category of categories) {
    const queries = category.queries.slice(0, args.queryLimit);
    for (const query of queries) {
      for (const area of areas) {
        jobs.push({
          source: args.source,
          category,
          query,
          area,
          googleBody: buildGoogleSearchBody(args, query, area),
        });
      }
    }
  }
  return jobs;
}

function buildGoogleSearchBody(args, query, area) {
  if (area.type === 'grid') {
    return {
      textQuery: query,
      pageSize: args.pageSize,
      includePureServiceAreaBusinesses: true,
      languageCode: 'en',
      regionCode: 'US',
      locationRestriction: {
        rectangle: {
          low: { latitude: area.bounds.south, longitude: area.bounds.west },
          high: { latitude: area.bounds.north, longitude: area.bounds.east },
        },
      },
    };
  }

  return {
    textQuery: `${query} in ${area.label}`,
    pageSize: args.pageSize,
    includePureServiceAreaBusinesses: true,
    languageCode: 'en',
    regionCode: 'US',
  };
}

function printDryRun(args, categories, areas, jobs) {
  console.log('Dry run only. No network calls were made.');
  console.log(`Source: ${args.source}`);
  console.log(`Categories: ${categories.length}`);
  console.log(`Areas: ${areas.length}`);
  console.log(`Queries per category: ${Math.min(args.queryLimit, Math.max(...categories.map((item) => item.queries.length)))}`);
  console.log(`Search jobs: ${jobs.length}`);
  console.log(`Estimated max Google Places requests: ${args.source === 'google' ? jobs.length * args.maxPagesPerSearch : 0}`);
  console.log('');
  console.log('First categories:');
  for (const category of categories.slice(0, 10)) {
    console.log(`- ${category.name}: ${category.queries.slice(0, args.queryLimit).join(' | ')}`);
  }
}

async function findPlaces(args, jobs) {
  if (args.source === 'google' && !process.env.GOOGLE_MAPS_API_KEY) {
    throw new Error('Missing GOOGLE_MAPS_API_KEY in environment or .env');
  }

  const queue = new PQueue({
    concurrency: args.searchConcurrency,
    interval: Math.max(args.requestDelayMs, 1),
    intervalCap: args.searchConcurrency,
  });

  const placesByKey = new Map();
  const searchStats = [];
  let completed = 0;

  console.log(`Search jobs: ${jobs.length}. Source: ${args.source}.`);

  await Promise.all(
    jobs.map((job) =>
      queue.add(async () => {
        try {
          const { rawPlaces, stats } =
            args.source === 'google' ? await runGoogleJob(job, args) : await runOsmJob(job, args);

          for (const rawPlace of rawPlaces) {
            const normalized =
              args.source === 'google' ? normalizeGooglePlace(rawPlace, job) : normalizeOsmPlace(rawPlace, job);
            if (!normalized.name) continue;

            const key = getPlaceDedupeKey(normalized);
            placesByKey.set(key, mergePlace(placesByKey.get(key), normalized));
          }

          searchStats.push(stats);
        } catch (error) {
          searchStats.push({
            categoryId: job.category.id,
            categoryName: job.category.name,
            sector: job.category.sector,
            source: args.source,
            query: job.query,
            area: job.area.label,
            resultCount: 0,
            pagesRequested: 0,
            saturated: false,
            error: error.message,
          });
          console.log(`Search job failed: ${job.category.name} / ${job.area.label}: ${error.message}`);
        }

        completed += 1;
        if (completed % 10 === 0 || completed === jobs.length) {
          console.log(`Search progress: ${completed}/${jobs.length}; unique category-place rows: ${placesByKey.size}`);
        }
      }),
    ),
  );

  const places = [...placesByKey.values()].sort(comparePlaces);
  return { places, searchStats: searchStats.sort(compareSearchStats) };
}

async function runGoogleJob(job, args) {
  const rawPlaces = [];
  let pageToken = '';
  let pagesRequested = 0;
  let saturated = false;

  for (let page = 1; page <= args.maxPagesPerSearch; page += 1) {
    const body = pageToken ? { ...job.googleBody, pageToken } : job.googleBody;
    const response = await got.post(GOOGLE_TEXT_SEARCH_URL, {
      json: body,
      responseType: 'json',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': process.env.GOOGLE_MAPS_API_KEY,
        'x-goog-fieldmask': SEARCH_FIELD_MASK,
      },
      timeout: { request: 25000 },
      retry: {
        limit: 2,
        methods: ['POST'],
        statusCodes: [408, 429, 500, 502, 503, 504],
      },
    });

    pagesRequested += 1;
    const data = response.body || {};
    rawPlaces.push(...(data.places || []));

    pageToken = data.nextPageToken || '';
    saturated = Boolean(pageToken && page === args.maxPagesPerSearch);
    if (!pageToken) break;
    await sleep(300);
  }

  return {
    rawPlaces,
    stats: {
      categoryId: job.category.id,
      categoryName: job.category.name,
      sector: job.category.sector,
      source: 'google',
      query: job.query,
      area: job.area.label,
      resultCount: rawPlaces.length,
      pagesRequested,
      saturated,
      error: '',
    },
  };
}

async function runOsmJob(job, args) {
  const query = buildOverpassQuery(job);
  const response = await got.post(OVERPASS_URL, {
    body: new URLSearchParams({ data: query }).toString(),
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: '*/*',
      'user-agent': process.env.OSM_USER_AGENT || 'niche-opportunity-scanner/1.0 (local market research)',
    },
    responseType: 'text',
    timeout: { request: 120000 },
    retry: {
      limit: 1,
      methods: ['POST'],
      statusCodes: [408, 429, 500, 502, 503, 504],
    },
  });

  const data = JSON.parse(response.body || '{}');
  const elements = (data.elements || []).filter((element) => isLikelyOsmElement(element, job));

  return {
    rawPlaces: elements,
    stats: {
      categoryId: job.category.id,
      categoryName: job.category.name,
      sector: job.category.sector,
      source: 'osm',
      query: job.query,
      area: job.area.label,
      resultCount: elements.length,
      pagesRequested: 1,
      saturated: false,
      error: '',
    },
  };
}

function buildOverpassQuery(job) {
  const regex = buildOsmRegex(job.category, job.query);
  const selector = buildOsmSpatialSelector(job.area);
  const areaSetup = job.area.bounds ? '' : `${buildOsmAreaClause(job.area)}\n`;

  return `
[out:json][timeout:120];
${areaSetup}(
  nwr["name"~"${regex}",i]${selector};
  nwr["description"~"${regex}",i]${selector};
  nwr["operator"~"${regex}",i]${selector};
  nwr["brand"~"${regex}",i]${selector};
  nwr["shop"~"${regex}",i]${selector};
  nwr["amenity"~"${regex}",i]${selector};
  nwr["craft"~"${regex}",i]${selector};
  nwr["office"~"${regex}",i]${selector};
  nwr["healthcare"~"${regex}",i]${selector};
  nwr["service"~"${regex}",i]${selector};
);
out center tags;
`.trim();
}

function buildOsmAreaClause(area) {
  if (/\bnew jersey\b|\bNJ\b/i.test(area.label)) {
    return 'area["ISO3166-2"="US-NJ"][admin_level=4]->.searchArea;';
  }

  const name = area.label.replace(/\bNJ\b/gi, '').trim();
  return `area["name"="${escapeOverpassString(name)}"]["boundary"="administrative"]->.searchArea;`;
}

function buildOsmSpatialSelector(area) {
  if (!area.bounds) return '(area.searchArea)';
  return `(${area.bounds.south},${area.bounds.west},${area.bounds.north},${area.bounds.east})`;
}

function buildOsmRegex(category, query) {
  const keywords = unique([query, category.name, ...(category.osmKeywords || [])])
    .map((value) => String(value).trim())
    .filter((value) => value.length >= 3)
    .slice(0, 8);

  return keywords.map(escapeOverpassRegex).join('|') || escapeOverpassRegex(query);
}

function isLikelyOsmElement(element, job) {
  const tags = element.tags || {};
  const text = Object.entries(tags)
    .filter(([key]) => /^(name|description|operator|brand|shop|amenity|craft|office|healthcare|service)/i.test(key))
    .map(([, value]) => String(value))
    .join(' ');

  if (!text.trim()) return false;
  const pattern = new RegExp(buildOsmRegex(job.category, job.query), 'i');
  return pattern.test(text);
}

function normalizeGooglePlace(place, job) {
  return {
    categoryId: job.category.id,
    categoryName: job.category.name,
    sector: job.category.sector,
    source: 'google',
    sourcePlaceId: place.id || '',
    sourceUrl: place.googleMapsUri || '',
    name: place.displayName?.text || '',
    address: place.formattedAddress || '',
    phone: place.nationalPhoneNumber || place.internationalPhoneNumber || '',
    website: normalizeWebsiteUrl(place.websiteUri || ''),
    rating: toNumberOrBlank(place.rating),
    reviewCount: toNumberOrBlank(place.userRatingCount),
    businessStatus: place.businessStatus || '',
    primaryType: place.primaryType || '',
    types: place.types || [],
    pureServiceAreaBusiness: Boolean(place.pureServiceAreaBusiness),
    latitude: place.location?.latitude ?? '',
    longitude: place.location?.longitude ?? '',
    openingHours: formatOpeningHours(place.regularOpeningHours),
    matchedQueries: [job.query],
    matchedAreas: [job.area.label],
  };
}

function normalizeOsmPlace(element, job) {
  const tags = element.tags || {};
  const center = getOsmCenter(element);

  return {
    categoryId: job.category.id,
    categoryName: job.category.name,
    sector: job.category.sector,
    source: 'osm',
    sourcePlaceId: `${element.type}/${element.id}`,
    sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    name: tags.name || tags.brand || tags.operator || '',
    address: formatOsmAddress(tags),
    phone: firstTruthy(tags['contact:phone'], tags.phone, tags['contact:mobile'], tags.mobile),
    website: normalizeWebsiteUrl(firstTruthy(tags['contact:website'], tags.website, tags.url)),
    rating: '',
    reviewCount: '',
    businessStatus: '',
    primaryType: getOsmPrimaryType(tags),
    types: getOsmTypes(tags),
    pureServiceAreaBusiness: false,
    latitude: center.latitude,
    longitude: center.longitude,
    openingHours: tags.opening_hours || '',
    matchedQueries: [job.query],
    matchedAreas: [job.area.label],
  };
}

function analyzeCategories(categories, places, searchStats, areas) {
  const placesByCategory = groupBy(places, (place) => place.categoryId);
  const statsByCategory = groupBy(searchStats, (stat) => stat.categoryId);

  return categories
    .map((category) => {
      const categoryPlaces = placesByCategory.get(category.id) || [];
      const categoryStats = statsByCategory.get(category.id) || [];
      const metrics = calculateMetrics(category, categoryPlaces, categoryStats, areas);
      const scores = scoreCategory(category, metrics);

      return {
        categoryId: category.id,
        categoryName: category.name,
        sector: category.sector,
        queries: category.queries,
        demandSignals: category.demandSignals,
        ...metrics,
        ...scores,
        reasonSummary: buildReasonSummary(metrics, scores),
      };
    })
    .sort((a, b) => b.opportunityScore - a.opportunityScore || b.dataConfidence - a.dataConfidence)
    .map((summary, index) => ({ rank: index + 1, ...summary }));
}

function calculateMetrics(category, places, searchStats, areas) {
  const activePlaces = places.filter((place) => place.businessStatus !== 'CLOSED_PERMANENTLY');
  const ratings = activePlaces.map((place) => Number(place.rating)).filter(Number.isFinite);
  const reviewCounts = activePlaces.map((place) => Number(place.reviewCount)).filter(Number.isFinite);
  const totalReviews = sum(reviewCounts);
  const weightedRating = totalReviews
    ? sum(activePlaces.map((place) => Number(place.rating) * Number(place.reviewCount)).filter(Number.isFinite)) /
      totalReviews
    : '';

  const searchedAreas = unique((searchStats.length ? searchStats : areas).map((item) => item.area || item.label));
  const areasWithResults = unique(
    (searchStats.length ? searchStats.filter((stat) => stat.resultCount > 0).map((stat) => stat.area) : places.flatMap((place) => place.matchedAreas)),
  );
  const areaGaps = searchedAreas.filter((area) => !areasWithResults.includes(area));
  const saturatedJobs = searchStats.filter((stat) => stat.saturated).length;
  const errorJobs = searchStats.filter((stat) => stat.error).length;

  const competitorCount = activePlaces.length;
  const reviewedCompetitorCount = reviewCounts.filter((count) => count > 0).length;
  const ratedCompetitorCount = ratings.length;
  const noWebsiteCount = activePlaces.filter((place) => !place.website).length;
  const noPhoneCount = activePlaces.filter((place) => !place.phone).length;
  const lowRatingCount = activePlaces.filter((place) => Number.isFinite(Number(place.rating)) && Number(place.rating) < 4.2).length;
  const thinReviewCount = activePlaces.filter((place) => !Number.isFinite(Number(place.reviewCount)) || Number(place.reviewCount) < 15).length;
  const strongCompetitors = activePlaces.filter(
    (place) => Number(place.rating) >= 4.6 && Number(place.reviewCount) >= 75 && place.website,
  );

  const searchedAreaCount = searchedAreas.length;
  const areaCoverage = searchedAreaCount ? areasWithResults.length / searchedAreaCount : 0;
  const resultSaturationRatio = searchStats.length ? saturatedJobs / searchStats.length : 0;
  const errorRatio = searchStats.length ? errorJobs / searchStats.length : 0;
  const sourceConfidenceBase = activePlaces.some((place) => place.source === 'google') ? 55 : 30;
  const reviewCoverage = competitorCount ? reviewedCompetitorCount / competitorCount : 0;
  const dataConfidence = clamp(
    sourceConfidenceBase +
      normalizeLog(competitorCount + 1, 2, 50) * 15 +
      reviewCoverage * 20 +
      Math.min(searchedAreaCount, 10) * 1.5 -
      errorRatio * 35,
    5,
    100,
  );

  return {
    competitorCount,
    searchedAreaCount,
    areasWithResultsCount: areasWithResults.length,
    areaCoverage: round(areaCoverage),
    areaGapRatio: round(1 - areaCoverage),
    areaGaps,
    avgRating: ratings.length ? round(average(ratings)) : '',
    weightedRating: weightedRating === '' ? '' : round(weightedRating),
    ratedCompetitorCount,
    reviewedCompetitorCount,
    totalReviews,
    medianReviewCount: reviewCounts.length ? round(median(reviewCounts)) : '',
    reviewsPerCompetitor: competitorCount ? round(totalReviews / competitorCount) : 0,
    noWebsiteRatio: competitorCount ? round(noWebsiteCount / competitorCount) : 1,
    noPhoneRatio: competitorCount ? round(noPhoneCount / competitorCount) : 1,
    lowRatingRatio: ratedCompetitorCount ? round(lowRatingCount / ratedCompetitorCount) : 0,
    thinReviewRatio: competitorCount ? round(thinReviewCount / competitorCount) : 1,
    strongCompetitorCount: strongCompetitors.length,
    strongCompetitorRatio: competitorCount ? round(strongCompetitors.length / competitorCount) : 0,
    resultSaturationRatio: round(resultSaturationRatio),
    errorRatio: round(errorRatio),
    dataConfidence: round(dataConfidence),
    ticketPotential: category.economics.ticket,
    repeatPotential: category.economics.repeat,
    urgencyPotential: category.economics.urgency,
    marginPotential: category.economics.margin,
    b2bPotential: category.economics.b2b,
    startupComplexity: category.entry.startup,
    regulationComplexity: category.entry.regulation,
    liabilityRisk: category.entry.liability,
    skillComplexity: category.entry.skill,
  };
}

function scoreCategory(category, metrics) {
  const demandScore = scoreDemand(category, metrics);
  const serviceGapScore = scoreServiceGap(metrics);
  const qualityWeaknessScore = scoreQualityWeakness(metrics);
  const economicsScore = scoreEconomics(category);
  const entryFitScore = scoreEntryFit(category);
  const competitionIntensityScore = scoreCompetitionIntensity(metrics);
  const complexityRiskScore = scoreComplexityRisk(category);

  let opportunityScore =
    demandScore * 0.28 +
    serviceGapScore * 0.24 +
    qualityWeaknessScore * 0.18 +
    economicsScore * 0.18 +
    entryFitScore * 0.12 -
    competitionIntensityScore * 0.18 -
    complexityRiskScore * 0.08;

  if (metrics.competitorCount === 0) opportunityScore -= 18;
  if (metrics.dataConfidence < 35) opportunityScore -= 10;
  if (demandScore < 25) opportunityScore -= 10;

  opportunityScore = clamp(opportunityScore, 0, 100);

  return {
    demandScore: round(demandScore),
    serviceGapScore: round(serviceGapScore),
    qualityWeaknessScore: round(qualityWeaknessScore),
    economicsScore: round(economicsScore),
    entryFitScore: round(entryFitScore),
    competitionIntensityScore: round(competitionIntensityScore),
    complexityRiskScore: round(complexityRiskScore),
    opportunityScore: round(opportunityScore),
    opportunityTier: tierForScore(opportunityScore, metrics.dataConfidence),
  };
}

function scoreDemand(category, metrics) {
  const reviewSignal = normalizeLog(metrics.totalReviews, 10, 3000) * 40;
  const medianReviewSignal = normalizeRange(Number(metrics.medianReviewCount) || 0, 5, 80) * 18;
  const coverageSignal = metrics.areaCoverage * 20;
  const saturationSignal = metrics.resultSaturationRatio * 12;
  const urgencySignal = scoreFive(category.economics.urgency) * 0.1;

  if (!metrics.reviewedCompetitorCount) {
    return clamp(metrics.competitorCount * 6 + coverageSignal + urgencySignal, 0, 55);
  }

  return clamp(reviewSignal + medianReviewSignal + coverageSignal + saturationSignal + urgencySignal, 0, 100);
}

function scoreServiceGap(metrics) {
  const competitorsPerArea = metrics.searchedAreaCount ? metrics.competitorCount / metrics.searchedAreaCount : metrics.competitorCount;
  let scarcityScore;

  if (metrics.competitorCount === 0) scarcityScore = 45;
  else if (competitorsPerArea <= 0.35) scarcityScore = 92;
  else if (competitorsPerArea <= 0.75) scarcityScore = 82;
  else if (competitorsPerArea <= 1.5) scarcityScore = 68;
  else if (competitorsPerArea <= 3) scarcityScore = 48;
  else if (competitorsPerArea <= 6) scarcityScore = 28;
  else scarcityScore = 12;

  return clamp(scarcityScore * 0.65 + metrics.areaGapRatio * 25 + metrics.noWebsiteRatio * 10, 0, 100);
}

function scoreQualityWeakness(metrics) {
  const ratingPain =
    metrics.avgRating === ''
      ? 15
      : metrics.avgRating < 4
        ? 45
        : metrics.avgRating < 4.3
          ? 30
          : metrics.avgRating < 4.55
            ? 16
            : 4;

  return clamp(
    ratingPain +
      metrics.lowRatingRatio * 25 +
      metrics.noWebsiteRatio * 25 +
      metrics.noPhoneRatio * 10 +
      metrics.thinReviewRatio * 10,
    0,
    100,
  );
}

function scoreEconomics(category) {
  return clamp(
    scoreFive(category.economics.ticket) * 0.35 +
      scoreFive(category.economics.repeat) * 0.25 +
      scoreFive(category.economics.urgency) * 0.15 +
      scoreFive(category.economics.margin) * 0.15 +
      scoreFive(category.economics.b2b) * 0.1,
    0,
    100,
  );
}

function scoreEntryFit(category) {
  return clamp(
    100 -
      scoreFive(category.entry.startup) * 0.35 -
      scoreFive(category.entry.regulation) * 0.25 -
      scoreFive(category.entry.liability) * 0.2 -
      scoreFive(category.entry.skill) * 0.2,
    0,
    100,
  );
}

function scoreCompetitionIntensity(metrics) {
  const countSignal = normalizeRange(metrics.competitorCount, 5, 80) * 30;
  const strongSignal = metrics.strongCompetitorRatio * 35;
  const ratingSignal = metrics.weightedRating === '' ? 0 : normalizeRange(metrics.weightedRating, 4.3, 4.8) * 20;
  const saturationSignal = metrics.resultSaturationRatio * 15;

  return clamp(countSignal + strongSignal + ratingSignal + saturationSignal, 0, 100);
}

function scoreComplexityRisk(category) {
  return clamp(
    scoreFive(category.entry.startup) * 0.25 +
      scoreFive(category.entry.regulation) * 0.3 +
      scoreFive(category.entry.liability) * 0.25 +
      scoreFive(category.entry.skill) * 0.2,
    0,
    100,
  );
}

function buildReasonSummary(metrics, scores) {
  const reasons = [];

  if (scores.demandScore >= 65) reasons.push('visible demand');
  else if (scores.demandScore < 30) reasons.push('demand needs validation');

  if (scores.serviceGapScore >= 70) reasons.push('low visible supply');
  if (scores.qualityWeaknessScore >= 55) reasons.push('weak competitor/listing quality');
  if (scores.economicsScore >= 70) reasons.push('attractive monetization profile');
  if (scores.entryFitScore < 35) reasons.push('harder personal launch');
  if (scores.competitionIntensityScore >= 60) reasons.push('strong competitors present');
  if (metrics.dataConfidence < 45) reasons.push('low data confidence');

  return reasons.length ? reasons.join('; ') : 'balanced but not obviously underserved';
}

async function writeSearchOutputs(outDir, places, searchStats) {
  await fs.mkdir(outDir, { recursive: true });
  await writeJson(path.join(outDir, 'places.json'), places);
  await writeCsv(path.join(outDir, 'places.csv'), places, PLACE_COLUMNS);
  await writeJson(path.join(outDir, 'search-stats.json'), searchStats);
  await writeCsv(path.join(outDir, 'search-stats.csv'), searchStats, SEARCH_STATS_COLUMNS);

  console.log(`Wrote ${places.length} category-place rows to ${path.join(outDir, 'places.json')}`);
}

async function writeAnalysisOutputs(outDir, summaries, places) {
  await fs.mkdir(outDir, { recursive: true });
  await writeJson(path.join(outDir, 'categories.json'), summaries);
  await writeCsv(path.join(outDir, 'categories.csv'), summaries, CATEGORY_COLUMNS);
  await fs.writeFile(path.join(outDir, 'report.md'), buildMarkdownReport(summaries, places), 'utf8');

  console.log(`Wrote ranked category report to ${path.join(outDir, 'categories.csv')}`);
}

function buildMarkdownReport(summaries, places) {
  const lines = [];
  lines.push('# Niche Opportunity Scanner Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Category-place rows analyzed: ${places.length}`);
  lines.push('');
  lines.push('## Top Candidates');
  lines.push('');

  for (const summary of summaries.slice(0, 15)) {
    lines.push(
      `${summary.rank}. **${summary.categoryName}** - ${summary.opportunityScore}/100 (${summary.opportunityTier}, confidence ${summary.dataConfidence}/100)`,
    );
    lines.push(`   - Why: ${summary.reasonSummary}`);
    lines.push(
      `   - Market: ${summary.competitorCount} visible competitors, ${summary.totalReviews} reviews, avg rating ${summary.avgRating || 'n/a'}, no-website ratio ${formatPercent(summary.noWebsiteRatio)}`,
    );
    lines.push(
      `   - Scores: demand ${summary.demandScore}, gap ${summary.serviceGapScore}, quality weakness ${summary.qualityWeaknessScore}, competition ${summary.competitionIntensityScore}`,
    );
    if (summary.areaGaps?.length) {
      lines.push(`   - Area gaps: ${summary.areaGaps.slice(0, 8).join(', ')}${summary.areaGaps.length > 8 ? ', ...' : ''}`);
    }
    lines.push('');
  }

  lines.push('## Interpretation');
  lines.push('');
  lines.push('- High opportunity means the category has some demand evidence, visible service gaps, and/or weak current competitors.');
  lines.push('- Low confidence means the category needs manual validation before business decisions.');
  lines.push('- Google results are stronger for ratings/reviews; OSM is free but usually sparse for commercial listings.');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function printTopCandidates(summaries) {
  console.log('');
  console.log('Top opportunity candidates:');
  for (const summary of summaries.slice(0, 10)) {
    console.log(
      `${summary.rank}. ${summary.categoryName} - ${summary.opportunityScore}/100 (${summary.opportunityTier}, confidence ${summary.dataConfidence}/100): ${summary.reasonSummary}`,
    );
  }
}

function catalogItem(item) {
  return {
    id: item.id || slugify(item.name),
    name: item.name,
    sector: item.sector,
    queries: item.queries || [item.name],
    osmKeywords: item.osmKeywords || [],
    economics: normalizeScoreSet(item.economics, DEFAULT_ECONOMICS),
    entry: normalizeScoreSet(item.entry, DEFAULT_ENTRY),
    demandSignals: item.demandSignals || [],
    notes: item.notes || '',
  };
}

function getPlaceDedupeKey(place) {
  const stableId = place.sourcePlaceId ? `${place.source}:${place.sourcePlaceId}` : '';
  if (stableId) return `${place.categoryId}:${stableId}`;

  return `${place.categoryId}:${slugify(place.name)}:${slugify(place.address)}`;
}

function mergePlace(previous, current) {
  if (!previous) return current;

  return {
    ...previous,
    ...Object.fromEntries(Object.entries(current).filter(([, value]) => hasValue(value))),
    matchedQueries: unique([...(previous.matchedQueries || []), ...(current.matchedQueries || [])]),
    matchedAreas: unique([...(previous.matchedAreas || []), ...(current.matchedAreas || [])]),
    types: unique([...(previous.types || []), ...(current.types || [])]),
  };
}

function comparePlaces(a, b) {
  return (
    String(a.categoryName).localeCompare(String(b.categoryName)) ||
    String(a.name).localeCompare(String(b.name)) ||
    String(a.address).localeCompare(String(b.address))
  );
}

function compareSearchStats(a, b) {
  return (
    String(a.categoryName).localeCompare(String(b.categoryName)) ||
    String(a.area).localeCompare(String(b.area)) ||
    String(a.query).localeCompare(String(b.query))
  );
}

function formatOpeningHours(hours) {
  if (!hours?.weekdayDescriptions?.length) return '';
  return hours.weekdayDescriptions.join(' | ');
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
  const state = tags['addr:state'] || '';
  const postcode = tags['addr:postcode'] || '';
  return [line1, [city, state, postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

function getOsmPrimaryType(tags) {
  if (tags.shop) return `shop:${tags.shop}`;
  if (tags.amenity) return `amenity:${tags.amenity}`;
  if (tags.craft) return `craft:${tags.craft}`;
  if (tags.office) return `office:${tags.office}`;
  if (tags.healthcare) return `healthcare:${tags.healthcare}`;
  return 'openstreetmap_place';
}

function getOsmTypes(tags) {
  return unique(
    [
      tags.shop ? `shop=${tags.shop}` : '',
      tags.amenity ? `amenity=${tags.amenity}` : '',
      tags.craft ? `craft=${tags.craft}` : '',
      tags.office ? `office=${tags.office}` : '',
      tags.healthcare ? `healthcare=${tags.healthcare}` : '',
      tags.service ? `service=${tags.service}` : '',
    ].filter(Boolean),
  );
}

function normalizeWebsiteUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function firstTruthy(...values) {
  return values.find((value) => String(value || '').trim()) || '';
}

function groupBy(values, keyFn) {
  const map = new Map();
  for (const value of values || []) {
    const key = keyFn(value);
    const group = map.get(key) || [];
    group.push(value);
    map.set(key, group);
  }
  return map;
}

function splitList(value) {
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBoolean(value) {
  return ['true', '1', 'yes', 'y'].includes(String(value).toLowerCase());
}

function normalizeInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return clamp(Math.trunc(number), min, max);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 2) {
  if (!Number.isFinite(Number(value))) return value;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function roundCoord(value) {
  return Number(value.toFixed(6));
}

function average(values) {
  return values.length ? sum(values) / values.length : 0;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function normalizeRange(value, min, max) {
  if (max <= min) return 0;
  return clamp((Number(value) - min) / (max - min), 0, 1);
}

function normalizeLog(value, min, max) {
  const safeValue = Math.max(Number(value) || 0, 0);
  const safeMin = Math.max(Number(min) || 1, 1);
  const safeMax = Math.max(Number(max) || safeMin + 1, safeMin + 1);
  return normalizeRange(Math.log10(safeValue + 1), Math.log10(safeMin + 1), Math.log10(safeMax + 1));
}

function scoreFive(value) {
  return normalizeRange(Number(value) || 3, 1, 5) * 100;
}

function tierForScore(score, confidence) {
  if (confidence < 35) return 'validate manually';
  if (score >= 75) return 'strong candidate';
  if (score >= 60) return 'watchlist';
  if (score >= 45) return 'needs validation';
  return 'weak signal';
}

function formatPercent(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function toNumberOrBlank(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : '';
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && value !== '';
}

function unique(values) {
  return [...new Set((values || []).filter((value) => value !== undefined && value !== null && String(value).trim() !== ''))];
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 90);
}

function escapeOverpassString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeOverpassRegex(value) {
  return escapeOverpassString(String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}

function stripBom(value) {
  return String(value).replace(/^\uFEFF/, '');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readOptionalJson(filePath, fallback) {
  try {
    return JSON.parse(stripBom(await fs.readFile(filePath, 'utf8')));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function writeCsv(filePath, rows, columns) {
  const header = columns.map((column) => column.header).join(',');
  const lines = rows.map((row) => columns.map((column) => toCsvValue(readColumn(row, column.key))).join(','));
  await fs.writeFile(filePath, `${[header, ...lines].join('\n')}\n`, 'utf8');
}

function readColumn(row, key) {
  const value = row[key];
  if (Array.isArray(value)) return value.join('; ');
  return value ?? '';
}

function toCsvValue(value) {
  const raw = String(value ?? '');
  if (!/[",\n\r]/.test(raw)) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

const PLACE_COLUMNS = [
  { key: 'categoryId', header: 'category_id' },
  { key: 'categoryName', header: 'category_name' },
  { key: 'sector', header: 'sector' },
  { key: 'source', header: 'source' },
  { key: 'sourcePlaceId', header: 'source_place_id' },
  { key: 'name', header: 'name' },
  { key: 'address', header: 'address' },
  { key: 'phone', header: 'phone' },
  { key: 'website', header: 'website' },
  { key: 'rating', header: 'rating' },
  { key: 'reviewCount', header: 'review_count' },
  { key: 'businessStatus', header: 'business_status' },
  { key: 'primaryType', header: 'primary_type' },
  { key: 'types', header: 'types' },
  { key: 'pureServiceAreaBusiness', header: 'pure_service_area_business' },
  { key: 'latitude', header: 'latitude' },
  { key: 'longitude', header: 'longitude' },
  { key: 'openingHours', header: 'opening_hours' },
  { key: 'matchedQueries', header: 'matched_queries' },
  { key: 'matchedAreas', header: 'matched_areas' },
  { key: 'sourceUrl', header: 'source_url' },
];

const SEARCH_STATS_COLUMNS = [
  { key: 'categoryId', header: 'category_id' },
  { key: 'categoryName', header: 'category_name' },
  { key: 'sector', header: 'sector' },
  { key: 'source', header: 'source' },
  { key: 'query', header: 'query' },
  { key: 'area', header: 'area' },
  { key: 'resultCount', header: 'result_count' },
  { key: 'pagesRequested', header: 'pages_requested' },
  { key: 'saturated', header: 'saturated' },
  { key: 'error', header: 'error' },
];

const CATEGORY_COLUMNS = [
  { key: 'rank', header: 'rank' },
  { key: 'categoryId', header: 'category_id' },
  { key: 'categoryName', header: 'category_name' },
  { key: 'sector', header: 'sector' },
  { key: 'opportunityScore', header: 'opportunity_score' },
  { key: 'opportunityTier', header: 'opportunity_tier' },
  { key: 'dataConfidence', header: 'data_confidence' },
  { key: 'demandScore', header: 'demand_score' },
  { key: 'serviceGapScore', header: 'service_gap_score' },
  { key: 'qualityWeaknessScore', header: 'quality_weakness_score' },
  { key: 'economicsScore', header: 'economics_score' },
  { key: 'entryFitScore', header: 'entry_fit_score' },
  { key: 'competitionIntensityScore', header: 'competition_intensity_score' },
  { key: 'complexityRiskScore', header: 'complexity_risk_score' },
  { key: 'competitorCount', header: 'competitor_count' },
  { key: 'searchedAreaCount', header: 'searched_area_count' },
  { key: 'areasWithResultsCount', header: 'areas_with_results_count' },
  { key: 'areaCoverage', header: 'area_coverage' },
  { key: 'areaGapRatio', header: 'area_gap_ratio' },
  { key: 'avgRating', header: 'avg_rating' },
  { key: 'weightedRating', header: 'weighted_rating' },
  { key: 'ratedCompetitorCount', header: 'rated_competitor_count' },
  { key: 'reviewedCompetitorCount', header: 'reviewed_competitor_count' },
  { key: 'totalReviews', header: 'total_reviews' },
  { key: 'medianReviewCount', header: 'median_review_count' },
  { key: 'reviewsPerCompetitor', header: 'reviews_per_competitor' },
  { key: 'noWebsiteRatio', header: 'no_website_ratio' },
  { key: 'noPhoneRatio', header: 'no_phone_ratio' },
  { key: 'lowRatingRatio', header: 'low_rating_ratio' },
  { key: 'thinReviewRatio', header: 'thin_review_ratio' },
  { key: 'strongCompetitorCount', header: 'strong_competitor_count' },
  { key: 'strongCompetitorRatio', header: 'strong_competitor_ratio' },
  { key: 'resultSaturationRatio', header: 'result_saturation_ratio' },
  { key: 'errorRatio', header: 'error_ratio' },
  { key: 'ticketPotential', header: 'ticket_potential' },
  { key: 'repeatPotential', header: 'repeat_potential' },
  { key: 'urgencyPotential', header: 'urgency_potential' },
  { key: 'marginPotential', header: 'margin_potential' },
  { key: 'b2bPotential', header: 'b2b_potential' },
  { key: 'startupComplexity', header: 'startup_complexity' },
  { key: 'regulationComplexity', header: 'regulation_complexity' },
  { key: 'liabilityRisk', header: 'liability_risk' },
  { key: 'skillComplexity', header: 'skill_complexity' },
  { key: 'reasonSummary', header: 'reason_summary' },
  { key: 'areaGaps', header: 'area_gaps' },
  { key: 'queries', header: 'queries' },
  { key: 'demandSignals', header: 'demand_signals' },
];

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
