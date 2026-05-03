-- normalize-dates.sql
-- Normalizes visit_date in the restaurants table to ISO YYYY-MM-DD format.
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste this file → Run
--   Runs as superuser, so RLS is bypassed — all users' rows are covered.
--
-- THE SCRIPT IS TWO STEPS:
--   Step 1 (SELECT) — dry-run preview, shows every row that would change.
--   Step 2 (DO block) — the actual update; commented out by default.
--   Review step 1, then uncomment step 2 and run again.
--
-- FORMATS HANDLED:
--   "May 2025"          → 2025-05-01  (month-only → first of month)
--   "May 15, 2025"      → 2025-05-15
--   "May 15 2025"       → 2025-05-15
--   "15 May 2025"       → 2025-05-15
--   "05/2025"           → 2025-05-01
--   "05/15/2025"        → 2025-05-15
--   "YYYY-MM-DD"        → unchanged (already correct)
--   Anything else       → left alone, listed as 'unparseable'
--
-- SAFE TO RE-RUN: rows that already match YYYY-MM-DD are skipped.
-- ============================================================


-- ── STEP 1: DRY RUN (always run this first) ─────────────────

WITH parsed AS (
  SELECT
    id,
    user_id,
    name,
    visit_date AS original,
    CASE
      -- Already ISO — no change needed
      WHEN visit_date ~ '^\d{4}-\d{2}-\d{2}$'
        THEN visit_date

      -- "Month YYYY" e.g. "May 2025" → first of month
      WHEN visit_date ~* '^[a-z]+ \d{4}$'
        THEN to_char(to_date(visit_date, 'FMMonth YYYY'), 'YYYY-MM-DD')

      -- "Month D(D)(,) YYYY" e.g. "May 5, 2025" / "May 15 2025"
      WHEN visit_date ~* '^[a-z]+ \d{1,2},? \d{4}$'
        THEN to_char(
               to_date(regexp_replace(visit_date, ',', '', 'g'), 'FMMonth FMDD YYYY'),
               'YYYY-MM-DD')

      -- "D(D) Month YYYY" e.g. "15 May 2025"
      WHEN visit_date ~* '^\d{1,2} [a-z]+ \d{4}$'
        THEN to_char(to_date(visit_date, 'FMDD FMMonth YYYY'), 'YYYY-MM-DD')

      -- "MM/YYYY" e.g. "05/2025" → first of month
      WHEN visit_date ~ '^\d{1,2}/\d{4}$'
        THEN to_char(to_date('01/' || visit_date, 'DD/MM/YYYY'), 'YYYY-MM-DD')

      -- "MM/DD/YYYY" e.g. "05/15/2025"
      WHEN visit_date ~ '^\d{1,2}/\d{1,2}/\d{4}$'
        THEN to_char(to_date(visit_date, 'MM/DD/YYYY'), 'YYYY-MM-DD')

      -- "YYYY" year-only e.g. "2025" → first of year
      WHEN visit_date ~ '^\d{4}$'
        THEN visit_date || '-01-01'

      ELSE NULL -- unparseable
    END AS normalized
  FROM restaurants
  WHERE visit_date IS NOT NULL
    AND visit_date <> ''
)
SELECT
  id,
  user_id,
  name,
  original,
  normalized           AS would_become,
  CASE
    WHEN original = normalized THEN 'already_ok'
    WHEN normalized IS NULL    THEN 'unparseable — manual fix needed'
    ELSE                            'will_update'
  END                  AS status
FROM parsed
ORDER BY status, original;


-- ── STEP 2: APPLY MIGRATION ──────────────────────────────────
-- Review the preview above, then uncomment this block and run.

/*
DO $$
DECLARE
  r   RECORD;
  d   DATE;
  iso TEXT;
BEGIN
  FOR r IN
    SELECT id, visit_date
    FROM   restaurants
    WHERE  visit_date IS NOT NULL
      AND  visit_date <> ''
      AND  visit_date !~ '^\d{4}-\d{2}-\d{2}$'
    ORDER  BY id
  LOOP
    d := NULL;

    BEGIN
      IF    r.visit_date ~* '^[a-z]+ \d{4}$' THEN
        d := to_date(r.visit_date, 'FMMonth YYYY');

      ELSIF r.visit_date ~* '^[a-z]+ \d{1,2},? \d{4}$' THEN
        d := to_date(regexp_replace(r.visit_date, ',', '', 'g'), 'FMMonth FMDD YYYY');

      ELSIF r.visit_date ~* '^\d{1,2} [a-z]+ \d{4}$' THEN
        d := to_date(r.visit_date, 'FMDD FMMonth YYYY');

      ELSIF r.visit_date ~ '^\d{1,2}/\d{4}$' THEN
        d := to_date('01/' || r.visit_date, 'DD/MM/YYYY');

      ELSIF r.visit_date ~ '^\d{1,2}/\d{1,2}/\d{4}$' THEN
        d := to_date(r.visit_date, 'MM/DD/YYYY');

      ELSIF r.visit_date ~ '^\d{4}$' THEN
        d := to_date(r.visit_date || '-01-01', 'YYYY-MM-DD');
      END IF;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Row %: could not parse "%", skipping. Error: %', r.id, r.visit_date, SQLERRM;
    END;

    IF d IS NOT NULL THEN
      iso := to_char(d, 'YYYY-MM-DD');
      UPDATE restaurants SET visit_date = iso WHERE id = r.id;
      RAISE NOTICE 'Row %: "%" → "%"', r.id, r.visit_date, iso;
    ELSE
      RAISE WARNING 'Row %: "%s" is unparseable — skipped', r.id, r.visit_date;
    END IF;
  END LOOP;

  RAISE NOTICE 'Done. Run the Step 1 SELECT again to verify.';
END;
$$;
*/
