-- ============================================================================
-- Meet Copilot — buckets de Storage para uploads
-- Uploads acontecem SEMPRE via server action com service_role (bypassa RLS),
-- por isso não há policies de INSERT para clientes.
-- avatars é público (a galeria de clones carrega a foto por URL pública);
-- context-docs é privado (originais dos documentos das bases).
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('avatars', 'avatars', true, 5242880)          -- 5MB
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit)
values ('context-docs', 'context-docs', false, 15728640)  -- 15MB
on conflict (id) do nothing;
