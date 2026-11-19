-- ============================================================================
-- SAWYAN ECOSYSTEM — Stage 7 Extension: World GeoNames Live Search RPC
-- ============================================================================
-- Searches world cities & districts across all 168 seeded countries in
-- sawyan.geonames_locations with GIN Trigram index support and Arabic priority.
-- ============================================================================

CREATE OR REPLACE FUNCTION sawyan.search_geonames_locations(
    p_country_code  CHAR(2),
    p_query         TEXT    DEFAULT '',
    p_admin1_filter TEXT    DEFAULT NULL,
    p_kind          VARCHAR DEFAULT 'all', -- 'all' | 'cities' | 'districts'
    p_limit         INT     DEFAULT 60
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_cc        CHAR(2);
    v_q         TEXT;
    v_adm       TEXT;
    v_kind      VARCHAR(20);
    v_lim       INT;
    v_rows      JSONB;
    v_total_cnt BIGINT := 0;
BEGIN
    v_cc   := upper(trim(COALESCE(p_country_code, 'EG')));
    v_q    := trim(COALESCE(p_query, ''));
    v_adm  := NULLIF(trim(COALESCE(p_admin1_filter, '')), '');
    v_kind := lower(trim(COALESCE(p_kind, 'all')));
    IF v_kind NOT IN ('all', 'cities', 'districts') THEN
        v_kind := 'all';
    END IF;
    v_lim := LEAST(GREATEST(COALESCE(p_limit, 60), 1), 150);

    SELECT COUNT(*)
      INTO v_total_cnt
      FROM sawyan.geonames_locations
     WHERE country_code = v_cc;

    SELECT COALESCE(jsonb_agg(row_to_json(res)::jsonb), '[]'::jsonb)
      INTO v_rows
      FROM (
          SELECT g.geoname_id,
                 g.country_code,
                 g.admin1_name,
                 g.city_name,
                 g.asciiname,
                 g.latitude,
                 g.longitude,
                 (COALESCE(g.alternate_names, '') LIKE '%__GEO_DISTRICT__%') AS is_district
            FROM sawyan.geonames_locations g
           WHERE g.country_code = v_cc
             AND (
                 v_adm IS NULL
                 OR lower(COALESCE(g.admin1_name, '')) = lower(v_adm)
                 OR lower(COALESCE(g.admin1_name, '')) LIKE '%' || lower(v_adm) || '%'
                 OR lower(COALESCE(g.search_vector, '')) LIKE '%' || lower(v_adm) || '%'
             )
             AND (
                 v_kind = 'all'
                 OR (v_kind = 'cities' AND COALESCE(g.alternate_names, '') NOT LIKE '%__GEO_DISTRICT__%')
                 OR (v_kind = 'districts' AND (
                     COALESCE(g.alternate_names, '') LIKE '%__GEO_DISTRICT__%'
                     OR (v_adm IS NOT NULL AND lower(COALESCE(g.admin1_name, '')) = lower(v_adm))
                 ))
             )
             AND (
                 v_q = ''
                 OR g.search_vector ILIKE '%' || v_q || '%'
                 OR g.city_name ILIKE '%' || v_q || '%'
                 OR g.asciiname ILIKE '%' || v_q || '%'
             )
           ORDER BY
             CASE WHEN COALESCE(g.alternate_names, '') LIKE '%__CURATED_AR__%' THEN 0 ELSE 1 END,
             CASE WHEN COALESCE(g.alternate_names, '') LIKE '%__GEO_DISTRICT__%' AND v_kind = 'districts' THEN 0
                  WHEN COALESCE(g.alternate_names, '') NOT LIKE '%__GEO_BULK__%' AND v_kind = 'cities' THEN 0
                  ELSE 1 END,
             g.city_name ASC
           LIMIT v_lim
      ) res;

    RETURN jsonb_build_object(
        'country_code', v_cc,
        'total_in_country', v_total_cnt,
        'results', COALESCE(v_rows, '[]'::jsonb)
    );
END;
$$;

REVOKE ALL ON FUNCTION sawyan.search_geonames_locations(CHAR, TEXT, TEXT, VARCHAR, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sawyan.search_geonames_locations(CHAR, TEXT, TEXT, VARCHAR, INT) TO anon, authenticated, service_role;
