-- Vídeos de torneo generados (copia ligera para WhatsApp/descarga). Bucket PRIVADO: se entrega con URL firmada desde el servidor.
-- Aditiva y sin RLS de lectura pública: solo la clave de servicio escribe y firma. Sin borrados automáticos.
-- Plan Free: archivo máx. 50 MB; aquí 20 MB y solo mp4.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('tournament-videos','tournament-videos',false,20971520,array['video/mp4'])
on conflict (id) do nothing;
