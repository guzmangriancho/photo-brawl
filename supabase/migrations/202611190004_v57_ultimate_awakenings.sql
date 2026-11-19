-- PHOTO BRAWL V57 — ULTIMATE / DESPERTAR
-- Apply AFTER V51, V53, V55, V56. No changes to historical ELO/trophies.
-- Trusted milestones: fighter_progress.best_trophies >=1000 OR wins >=15.
-- In ranked the budget remains 100 and the six mechanics/passive/archetype are fixed.
BEGIN;
CREATE TABLE IF NOT EXISTS public.fighter_ultimate_forms (
 fighter_id uuid PRIMARY KEY REFERENCES public.fighters(id) ON DELETE CASCADE,
 owner_id uuid NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
 design jsonb NOT NULL CHECK(jsonb_typeof(design)='object' AND pg_column_size(design)<16000),
 portrait_path text NOT NULL, sheet_path text NOT NULL,
 public_portrait_path text, public_sheet_path text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ultimate_public_pair CHECK((public_portrait_path IS NULL)=(public_sheet_path IS NULL)),
 CONSTRAINT ultimate_private_paths CHECK(
   left(portrait_path,length(owner_id::text)+1)=owner_id::text||'/' AND
   left(sheet_path,length(owner_id::text)+1)=owner_id::text||'/'),
 CONSTRAINT ultimate_public_paths CHECK(
   public_portrait_path IS NULL OR (
     left(public_portrait_path,length(owner_id::text)+1)=owner_id::text||'/' AND
     left(public_sheet_path,length(owner_id::text)+1)=owner_id::text||'/'))
);
CREATE INDEX IF NOT EXISTS fighter_ultimate_owner_idx ON public.fighter_ultimate_forms(owner_id);
ALTER TABLE public.fighter_ultimate_forms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fighter_ultimate_forms FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.fighter_ultimate_forms TO authenticated;
DROP POLICY IF EXISTS "Leer ultimate propio o publicado" ON public.fighter_ultimate_forms;
CREATE POLICY "Leer ultimate propio o publicado" ON public.fighter_ultimate_forms FOR SELECT TO authenticated
 USING (owner_id=(SELECT auth.uid()) OR EXISTS (
  SELECT 1 FROM public.fighters f WHERE f.id=fighter_id AND f.is_public AND
   public_portrait_path IS NOT NULL AND public_sheet_path IS NOT NULL));
-- Clients CANNOT insert/update/delete ranks or Ultimate rows directly.

CREATE OR REPLACE FUNCTION public.pb_save_ultimate_form(
 p_local_id text,p_design jsonb,p_portrait_path text,p_sheet_path text,
 p_public_portrait_path text DEFAULT NULL,p_public_sheet_path text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE f public.fighters%ROWTYPE; pr public.fighter_progress%ROWTYPE;
        k text; keyname text; mechanic text; n int; total int:=0;
BEGIN
 IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Inicia sesión.'; END IF;
 SELECT * INTO f FROM public.fighters
  WHERE owner_id=(SELECT auth.uid()) AND local_id=p_local_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'El luchador no pertenece a tu cuenta o no está sincronizado.'; END IF;
 SELECT * INTO pr FROM public.fighter_progress WHERE fighter_id=f.id;
 IF pr.fighter_id IS NULL OR (pr.best_trophies<1000 AND pr.wins<15) THEN
  RAISE EXCEPTION 'Despertar bloqueado: 1000 copas máximas o 15 victorias ranked.';
 END IF;
 IF p_design IS NULL OR jsonb_typeof(p_design)<>'object' OR pg_column_size(p_design)>16000
   OR nullif(trim(p_design->>'fighterName'),'') IS NULL OR length(p_design->>'fighterName')>20
   OR p_design->>'archetype' IS DISTINCT FROM f.archetype
   OR p_design->>'passiveTrait' IS DISTINCT FROM f.fighter_data->>'passiveTrait' THEN
  RAISE EXCEPTION 'La evolución debe conservar arquetipo/pasiva y tener un nombre válido.';
 END IF;
 IF jsonb_typeof(p_design->'stats')<>'object' THEN RAISE EXCEPTION 'Stats Ultimate inválidas.'; END IF;
 FOREACH k IN ARRAY ARRAY['hp','speed','power','technique'] LOOP
  IF jsonb_typeof(p_design->'stats'->k)<>'number' OR
   (p_design->'stats'->>k) !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Stats no enteras.'; END IF;
  n:=(p_design->'stats'->>k)::int;
  IF n<15 OR n>35 THEN RAISE EXCEPTION 'Stats fuera de 15..35.'; END IF;
  total:=total+n;
 END LOOP;
 IF total<>100 THEN RAISE EXCEPTION 'Ultimate no permite más de 100 puntos.'; END IF;
 FOREACH k IN ARRAY ARRAY['lightNormal','heavyNormal','specialNeutral','specialForward','specialUp','ultimateSuper'] LOOP
  keyname:=CASE k WHEN 'lightNormal' THEN 'style' WHEN 'heavyNormal' THEN 'style' ELSE 'mechanic' END;
  mechanic:=f.fighter_data->'moveset'->k->>keyname;
  IF mechanic IS NULL OR p_design->'moveset'->k->>keyname IS DISTINCT FROM mechanic
    OR nullif(trim(p_design->'moveset'->k->>'name'),'') IS NULL THEN
   RAISE EXCEPTION 'Ultimate no puede cambiar las mecánicas de combate (%).',k;
  END IF;
 END LOOP;
 FOREACH k IN ARRAY ARRAY['light','heavy'] LOOP
  IF (f.fighter_data->'animationDirection'->k->>'strikingLimb') IS NOT NULL
   AND p_design->'animationDirection'->k->>'strikingLimb'
     IS DISTINCT FROM f.fighter_data->'animationDirection'->k->>'strikingLimb'
   THEN RAISE EXCEPTION 'La animación no puede cambiar el miembro de ataque.';
  END IF;
 END LOOP;
 IF length(p_portrait_path)>350 OR length(p_sheet_path)>350 OR
   left(p_portrait_path,length(f.owner_id::text||'/'||f.id::text||'/')) <> f.owner_id::text||'/'||f.id::text||'/' OR
   left(p_sheet_path,length(f.owner_id::text||'/'||f.id::text||'/')) <> f.owner_id::text||'/'||f.id::text||'/' OR
   p_portrait_path NOT LIKE '%/portrait.png' OR p_sheet_path NOT LIKE '%/sheet.png' THEN
  RAISE EXCEPTION 'Rutas Ultimate privadas inválidas.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='fighter-private' AND name=p_portrait_path)
   OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='fighter-private' AND name=p_sheet_path) THEN
  RAISE EXCEPTION 'Sube ambas imágenes privadas antes de guardar.';
 END IF;
 IF (p_public_portrait_path IS NULL)<>(p_public_sheet_path IS NULL) THEN
  RAISE EXCEPTION 'Deben existir ambas imágenes públicas.';
 END IF;
 IF p_public_portrait_path IS NOT NULL THEN
  IF NOT f.is_public OR p_public_portrait_path IS DISTINCT FROM p_portrait_path OR
     p_public_sheet_path IS DISTINCT FROM p_sheet_path OR
     NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='fighter-public' AND name=p_public_portrait_path) OR
     NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='fighter-public' AND name=p_public_sheet_path) THEN
   RAISE EXCEPTION 'No se puede publicar una evolución de un luchador privado.';
  END IF;
 END IF;
 INSERT INTO public.fighter_ultimate_forms
 (fighter_id,owner_id,design,portrait_path,sheet_path,public_portrait_path,public_sheet_path)
 VALUES (f.id,f.owner_id,p_design,p_portrait_path,p_sheet_path,p_public_portrait_path,p_public_sheet_path)
 ON CONFLICT(fighter_id) DO UPDATE SET
  owner_id=EXCLUDED.owner_id,design=EXCLUDED.design,
  portrait_path=EXCLUDED.portrait_path,sheet_path=EXCLUDED.sheet_path,
  public_portrait_path=EXCLUDED.public_portrait_path,public_sheet_path=EXCLUDED.public_sheet_path,
  updated_at=now();
END;
$$;
REVOKE ALL ON FUNCTION public.pb_save_ultimate_form(text,jsonb,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pb_save_ultimate_form(text,jsonb,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.pb_publish_ultimate_art(
 p_local_id text,p_public_portrait_path text,p_public_sheet_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE f public.fighters%ROWTYPE;
BEGIN
 SELECT * INTO f FROM public.fighters WHERE owner_id=(SELECT auth.uid()) AND local_id=p_local_id FOR UPDATE;
 IF NOT FOUND OR NOT f.is_public THEN RAISE EXCEPTION 'Publica primero el luchador original.'; END IF;
 IF length(p_public_portrait_path)>350 OR length(p_public_sheet_path)>350 OR
  left(p_public_portrait_path,length(f.owner_id::text||'/'||f.id::text||'/')) <> f.owner_id::text||'/'||f.id::text||'/' OR
  left(p_public_sheet_path,length(f.owner_id::text||'/'||f.id::text||'/')) <> f.owner_id::text||'/'||f.id::text||'/' OR
  p_public_portrait_path NOT LIKE '%/portrait.png' OR p_public_sheet_path NOT LIKE '%/sheet.png' OR
  NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='fighter-public' AND name=p_public_portrait_path) OR
  NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='fighter-public' AND name=p_public_sheet_path) THEN
  RAISE EXCEPTION 'Faltan imágenes Ultimate públicas válidas.';
 END IF;
 UPDATE public.fighter_ultimate_forms SET public_portrait_path=p_public_portrait_path,
  public_sheet_path=p_public_sheet_path,updated_at=now()
 WHERE fighter_id=f.id AND owner_id=(SELECT auth.uid());
 IF NOT FOUND THEN RAISE EXCEPTION 'No existe una evolución guardada.'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.pb_publish_ultimate_art(text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pb_publish_ultimate_art(text,text,text) TO authenticated;

-- Hiding/transferring a fighter also hides the public Ultimate metadata and URLs.
CREATE OR REPLACE FUNCTION public.pb_hide_ultimate_on_fighter_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF new.owner_id IS DISTINCT FROM old.owner_id THEN
  DELETE FROM public.fighter_ultimate_forms WHERE fighter_id=new.id;
 ELSIF old.is_public AND NOT new.is_public THEN
  UPDATE public.fighter_ultimate_forms SET public_portrait_path=NULL,
    public_sheet_path=NULL,updated_at=now() WHERE fighter_id=new.id;
 END IF;
 RETURN new;
END;
$$;
DROP TRIGGER IF EXISTS pb_hide_ultimate_on_change ON public.fighters;
CREATE TRIGGER pb_hide_ultimate_on_change AFTER UPDATE OF is_public,owner_id ON public.fighters
FOR EACH ROW EXECUTE FUNCTION public.pb_hide_ultimate_on_fighter_change();
COMMIT;
