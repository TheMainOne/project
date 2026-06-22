# NJ Detailing Audit

Find New Jersey auto detailing businesses through Google Places Text Search or the free OpenStreetMap Overpass API, then audit each listed website for modernity, visual/content signals, and conversion features.

## Setup

For Google Places search, add a Google Maps Platform Places API key to `.env`:

```env
GOOGLE_MAPS_API_KEY=your_google_places_key
```

Optional AI notes:

```env
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4o-mini
```

## Commands

Free OpenStreetMap search without a Google key:

```bash
npm run audit:nj-detailing -- --mode search --source osm
```

Free OpenStreetMap search plus website audit:

```bash
npm run audit:nj-detailing -- --mode all --source osm
```

Broader OpenStreetMap search that also includes generic car washes:

```bash
npm run audit:nj-detailing -- --mode search --source osm --osmFilter broad
```

Quick county-based search plus website audit:

```bash
npm run audit:nj-detailing -- --mode all --source google --profile quick
```

Broader grid search. This uses more Places API calls:

```bash
npm run audit:nj-detailing -- --mode all --source google --profile grid --gridStep 0.18
```

Test only the first 20 websites and save screenshots:

```bash
npm run audit:nj-detailing -- --mode all --source google --profile quick --websiteLimit 20 --render true --screenshots true
```

Run only the website audit after a previous search:

```bash
npm run audit:nj-detailing -- --mode audit --input script/output/nj-detailing-audit/places.json
```

## Outputs

The default output folder is:

```text
script/output/nj-detailing-audit/
```

Files:

- `places.json` / `places.csv`: raw deduplicated search results.
- `audits.json`: detailed website audit objects.
- `report.json` / `report.csv`: joined business + website score report.
- `screenshots/`: homepage screenshots when `--screenshots true` is used.

## Notes

Google Text Search returns a limited number of ranked results per query, so no Google-based script can honestly guarantee every business in New Jersey. The script improves coverage by combining several detailing search terms with either all NJ counties or a geographic grid, then deduplicates by Google place ID.

OpenStreetMap search is free and does not require a key, but coverage is usually weaker than Google Maps because it depends on community-entered business tags. By default, OSM mode searches explicit detailing signals such as detailing-related names/descriptions and `service:vehicle:detailing` tags, then deduplicates by OSM element ID. Use `--osmFilter broad` if you also want generic `amenity=car_wash` results. Public Overpass requests can take 1-3 minutes for all of New Jersey.

Fields such as website, phone, rating, and review count can affect Google Places billing. For large runs, start with `--websiteLimit` and review Google Maps Platform quota/cost settings first.
