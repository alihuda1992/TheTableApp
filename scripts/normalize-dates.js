#!/usr/bin/env node
// normalize-dates.js
// Normalizes visit_date in the restaurants table to YYYY-MM-DD format.
//
// Requires a Supabase SERVICE ROLE key (bypasses RLS so all users' rows
// are covered). NEVER commit that key — pass it via environment variable.
//
// USAGE:
//   SUPABASE_SERVICE_KEY=your_service_role_key node scripts/normalize-dates.js
//   SUPABASE_SERVICE_KEY=... node scripts/normalize-dates.js --dry-run
//
// The --dry-run flag prints what would change without writing anything.

const SUPABASE_URL = 'https://aaonztikuwpkgzgruylt.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const DRY_RUN      = process.argv.includes('--dry-run');

if (!SERVICE_KEY) {
  console.error('Error: set the SUPABASE_SERVICE_KEY environment variable.');
  console.error('  export SUPABASE_SERVICE_KEY="your_service_role_key_here"');
  process.exit(1);
}

// ── Date parser ──────────────────────────────────────────────────────────────
// Returns a YYYY-MM-DD string, or null if the input can't be parsed.
// For month-only inputs ("May 2025") returns the first of that month.

const MONTHS = {
  january:1, february:2, march:3, april:4, may:5, june:6,
  july:7, august:8, september:9, october:10, november:11, december:12,
  jan:1, feb:2, mar:3, apr:4, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
};

function pad(n) { return String(n).padStart(2, '0'); }

function toISO(year, month, day = 1) {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (isNaN(d)) return null;
  // Guard against months rolling over (e.g. Feb 31)
  if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

function parseDate(raw) {
  if (!raw) return null;
  const s = raw.trim();

  // Already ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // "Month YYYY" → first of month
  const mY = s.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (mY) {
    const m = MONTHS[mY[1].toLowerCase()];
    if (m) return toISO(+mY[2], m, 1);
  }

  // "Month DD(,) YYYY" or "Month D YYYY"
  const mDY = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (mDY) {
    const m = MONTHS[mDY[1].toLowerCase()];
    if (m) return toISO(+mDY[3], m, +mDY[2]);
  }

  // "DD Month YYYY"
  const dMY = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (dMY) {
    const m = MONTHS[dMY[2].toLowerCase()];
    if (m) return toISO(+dMY[3], m, +dMY[1]);
  }

  // "MM/YYYY" → first of month
  const mmYY = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (mmYY) return toISO(+mmYY[2], +mmYY[1], 1);

  // "MM/DD/YYYY"
  const mmDDYYYY = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mmDDYYYY) return toISO(+mmDDYYYY[3], +mmDDYYYY[1], +mmDDYYYY[2]);

  // "YYYY" year-only → first of year
  if (/^\d{4}$/.test(s)) return toISO(+s, 1, 1);

  return null;
}

// ── Supabase REST helpers ────────────────────────────────────────────────────

const headers = {
  apikey:        SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer:         'return=minimal',
};

async function fetchAllRestaurants() {
  // PostgREST returns max 1000 rows by default; add a hard limit well above any
  // realistic dataset. Adjust if needed.
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/restaurants?select=id,visit_date&visit_date=not.is.null&limit=10000`,
    { headers }
  );
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function updateVisitDate(id, iso) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/restaurants?id=eq.${id}`,
    { method: 'PATCH', headers, body: JSON.stringify({ visit_date: iso }) }
  );
  if (!res.ok) throw new Error(`Update failed for ${id}: ${res.status} ${await res.text()}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}\n`);

  const rows = await fetchAllRestaurants();
  console.log(`Fetched ${rows.length} restaurants with a visit_date.\n`);

  const results = { already_ok: [], will_update: [], unparseable: [] };

  for (const row of rows) {
    const { id, visit_date } = row;
    if (!visit_date) continue;

    const iso = parseDate(visit_date);

    if (iso === visit_date) {
      results.already_ok.push({ id, visit_date });
    } else if (iso) {
      results.will_update.push({ id, original: visit_date, normalized: iso });
    } else {
      results.unparseable.push({ id, visit_date });
    }
  }

  // Report
  console.log(`Already normalized : ${results.already_ok.length}`);
  console.log(`Will update        : ${results.will_update.length}`);
  console.log(`Unparseable        : ${results.unparseable.length}\n`);

  if (results.will_update.length) {
    console.log('── Changes' + (DRY_RUN ? ' (dry run)' : '') + ' ──────────────────────');
    for (const r of results.will_update) {
      console.log(`  ${r.original.padEnd(30)} → ${r.normalized}`);
    }
    console.log('');
  }

  if (results.unparseable.length) {
    console.log('── Unparseable (manual fix needed) ──────────────────────');
    for (const r of results.unparseable) {
      console.log(`  id=${r.id}  visit_date="${r.visit_date}"`);
    }
    console.log('');
  }

  if (DRY_RUN) {
    console.log('Dry run complete — no changes written.');
    return;
  }

  if (results.will_update.length === 0) {
    console.log('Nothing to update.');
    return;
  }

  console.log('Applying updates…');
  let ok = 0;
  let fail = 0;
  for (const r of results.will_update) {
    try {
      await updateVisitDate(r.id, r.normalized);
      ok++;
    } catch (err) {
      console.error(`  FAILED ${r.id}: ${err.message}`);
      fail++;
    }
  }
  console.log(`\nDone: ${ok} updated, ${fail} failed.`);
}

main().catch(err => { console.error(err); process.exit(1); });
