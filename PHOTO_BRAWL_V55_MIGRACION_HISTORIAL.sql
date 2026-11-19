-- V55: historial verificable de luchadores en clasificatorias.
-- Requiere migraciones V51 y V53. No modifica ELO ni copas.
BEGIN;

CREATE TABLE IF NOT EXISTS public.ranked_match_fighters (
 match_id uuid NOT NULL,
 account_id uuid NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
 fighter_local_id text NOT NULL,
 fighter_name text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(match_id,account_id),
 CONSTRAINT pb_fighter_local_id_valid CHECK(length(fighter_local_id) BETWEEN 1 AND 100)
);
CREATE INDEX IF NOT EXISTS ranked_match_fighters_account_idx ON public.ranked_match_fighters(account_id,match_id);
ALTER TABLE public.ranked_match_fighters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ranked_match_fighters FROM public,anon,authenticated;
-- Solo el backend y funciones controladas pueden leer el registro completo.

-- V51 ya inserta un evento por usuario y combate durante la misma transacción
-- que registra el ELO. Este trigger toma una instantánea del personaje para
-- preservar el nombre utilizado incluso si posteriormente cambia.
CREATE OR REPLACE FUNCTION public.pb_capture_ranked_fighter()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_local text; v_name text;
BEGIN
 SELECT f.local_id,f.fighter_name INTO v_local,v_name
 FROM public.fighters f WHERE f.id=NEW.fighter_id AND f.owner_id=NEW.account_id;
 IF v_local IS NULL THEN
   RAISE EXCEPTION 'No se puede almacenar el luchador de la clasificatoria %',NEW.match_id;
 END IF;
 INSERT INTO public.ranked_match_fighters(match_id,account_id,fighter_local_id,fighter_name)
 VALUES(NEW.match_id,NEW.account_id,v_local,v_name)
 ON CONFLICT(match_id,account_id) DO NOTHING;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pb_capture_ranked_fighter_on_event ON public.fighter_progress_events;
CREATE TRIGGER pb_capture_ranked_fighter_on_event AFTER INSERT ON public.fighter_progress_events
FOR EACH ROW EXECUTE FUNCTION public.pb_capture_ranked_fighter();
REVOKE ALL ON FUNCTION public.pb_capture_ranked_fighter() FROM PUBLIC,anon,authenticated;

-- Recuperar identidades disponibles de eventos V51 ya registrados.
INSERT INTO public.ranked_match_fighters(match_id,account_id,fighter_local_id,fighter_name,recorded_at)
SELECT e.match_id,e.account_id,f.local_id,f.fighter_name,e.played_at
FROM public.fighter_progress_events e
JOIN public.fighters f ON f.id=e.fighter_id AND f.owner_id=e.account_id
ON CONFLICT(match_id,account_id) DO NOTHING;

-- Consulta acotada al usuario autenticado contra un usuario elegido.
-- Los registros de partidas sin personaje histórico muestran NULL, nunca inventan uno.
CREATE OR REPLACE FUNCTION public.pb_head_to_head(p_other uuid)
RETURNS TABLE(match_id uuid,played_at timestamptz,mode text,result text,
              my_fighter text,other_fighter text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE me uuid;
BEGIN
 me:=auth.uid();
 IF me IS NULL THEN RAISE EXCEPTION 'Autenticación requerida'; END IF;
 IF p_other IS NULL OR p_other=me THEN RETURN; END IF;
 RETURN QUERY
 WITH records AS (
  SELECT m.match_id,m.played_at,'1V1'::text mode,
    CASE WHEN m.winner_id=me THEN 'VICTORIA' ELSE 'DERROTA' END::text result
  FROM public.ranked_matches m
  WHERE (m.host_id=me AND m.guest_id=p_other) OR (m.guest_id=me AND m.host_id=p_other)
  UNION ALL
  SELECT g.match_id,g.played_at,g.mode,
   (CASE WHEN g.mode='2V2' THEN
     CASE WHEN g.winning_team IS NULL THEN 'EMPATE'
       WHEN (i.pos%2=1 AND g.winning_team='RED') OR (i.pos%2=0 AND g.winning_team='BLUE')
       THEN 'VICTORIA' ELSE 'DERROTA' END
    ELSE CASE WHEN g.places[i.pos]=g.places[j.pos] THEN 'EMPATE'
              WHEN g.places[i.pos]<g.places[j.pos] THEN 'VICTORIA' ELSE 'DERROTA' END
   END)::text
  FROM public.group_ranked_matches g
  CROSS JOIN LATERAL generate_subscripts(g.player_ids,1) AS i(pos)
  CROSS JOIN LATERAL generate_subscripts(g.player_ids,1) AS j(pos)
  WHERE g.player_ids[i.pos]=me AND g.player_ids[j.pos]=p_other
    AND (g.mode='FREE_FOR_ALL' OR i.pos%2<>j.pos%2)
 )
 SELECT r.match_id,r.played_at,r.mode,r.result, mine.fighter_name,theirs.fighter_name
 FROM records r
 LEFT JOIN public.ranked_match_fighters mine ON mine.match_id=r.match_id AND mine.account_id=me
 LEFT JOIN public.ranked_match_fighters theirs ON theirs.match_id=r.match_id AND theirs.account_id=p_other
 ORDER BY r.played_at DESC,r.match_id DESC LIMIT 50;
END;
$$;
REVOKE ALL ON FUNCTION public.pb_head_to_head(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pb_head_to_head(uuid) TO authenticated;
COMMIT;
