-- V55 · Corrección de identidades en dos partidas históricas (sin cambiar ELO ni copas).
-- Ejecutar DESPUÉS de PHOTO_BRAWL_V55_MIGRACION_HISTORIAL.sql.
-- Seguro ante reejecuciones idénticas; falla si detecta valores diferentes.
BEGIN;
DO $$
DECLARE r record; actual record; user_id uuid; fighter_rec record; expected_host uuid; expected_guest uuid;
BEGIN
 FOR r IN SELECT * FROM (VALUES
  ('d589966f-eb0f-451d-a6fb-05c4a28d375b'::uuid,'ferby7','custom_1794951021864_95v4yddj','FERBYRAVERO'),
  ('d589966f-eb0f-451d-a6fb-05c4a28d375b'::uuid,'guzmangriancho','custom_1794949999089_re3cw61z','RUINA REX'),
  ('346e07b2-9fc4-42f4-b9ab-799749d55197'::uuid,'guzmangriancho','custom_1794949999089_re3cw61z','RUINA REX'),
  ('346e07b2-9fc4-42f4-b9ab-799749d55197'::uuid,'luis','custom_1794908158328_9d5b95oa','FLORBOMBÍN')
 ) AS v(match_id,username,local_id,name) LOOP
   SELECT id INTO STRICT user_id FROM public.player_profiles WHERE username=r.username;
   IF NOT EXISTS (SELECT 1 FROM public.ranked_matches m WHERE m.match_id=r.match_id AND user_id IN (m.host_id,m.guest_id)) THEN
     RAISE EXCEPTION 'Jugador % no participa en %',r.username,r.match_id;
   END IF;
   SELECT f.id,f.fighter_name INTO STRICT fighter_rec FROM public.fighters f
    WHERE f.owner_id=user_id AND f.local_id=r.local_id;
   SELECT * INTO actual FROM public.ranked_match_fighters x
    WHERE x.match_id=r.match_id AND x.account_id=user_id;
   IF FOUND THEN
      IF actual.fighter_local_id<>r.local_id THEN
        RAISE EXCEPTION 'Registro de personaje diferente ya existente para % en %',r.username,r.match_id;
      END IF;
   ELSE
      INSERT INTO public.ranked_match_fighters(match_id,account_id,fighter_local_id,fighter_name)
      VALUES(r.match_id,user_id,r.local_id,r.name);
   END IF;
 END LOOP;
END $$;
SELECT p.username,h.match_id,h.fighter_name,h.fighter_local_id
FROM public.ranked_match_fighters h JOIN public.player_profiles p ON p.id=h.account_id
WHERE h.match_id IN ('d589966f-eb0f-451d-a6fb-05c4a28d375b','346e07b2-9fc4-42f4-b9ab-799749d55197')
ORDER BY h.match_id,p.username;
COMMIT;
