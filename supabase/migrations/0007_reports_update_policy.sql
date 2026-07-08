-- ============================================================================
-- Meet Copilot — policy de UPDATE em reports
-- A tela Registro da Sessão permite editar o resumo executivo; sem esta
-- policy o UPDATE via client autenticado afetava 0 linhas em silêncio.
-- ============================================================================

create policy rp_update on reports for update
  using (app.is_member(workspace_id))
  with check (app.is_member(workspace_id));
