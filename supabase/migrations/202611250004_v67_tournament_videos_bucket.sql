-- Vídeos de torneo generados (copia ligera para WhatsApp/descarga). Bucket PRIVADO: se entrega con URL firmada desde el servidor.
-- Aditiva y sin RLS de lectura pública: solo la clave de servicio escribe y firma. Sin borrados automáticos.
-- Plan Free: archivo máx. 50 MB; aquí 20 MB y solo mp4.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('tournament-videos','tournament-videos',false,20971520,array['video/mp4'])
on conflict (id) do nothing;

-- Estado de cada vídeo pedido. Solo el servidor (clave de servicio) lee y escribe: sin acceso para anon ni authenticated.
create table if not exists public.tournament_videos (
  tournament_id uuid primary key references public.tournaments(id) on delete cascade,
  day_no int not null check (day_no between 1 and 999),
  status text not null default 'queued' check (status in ('queued','ready','failed')),
  requested_by uuid,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tournament_videos enable row level security;
revoke all on public.tournament_videos from anon, authenticated;
