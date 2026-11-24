-- 0011: tira o travessao das perguntas de exemplo dos clones nativos.
--
-- Travessao e vicio de escrita de IA; regra do produto: nao aparece em texto
-- nenhum. As perguntas de exemplo de dois clones (seed da 0002) ainda tinham.
-- chr(8212) e o proprio caractere, escrito assim para este arquivo ficar limpo.
-- Idempotente: so toca as linhas que ainda tem o caractere.

update sales_experts
set sample_questions = replace(
      replace(
        sample_questions::text,
        ' ' || chr(8212) || ' ou só sentem',
        ', ou só sentem'
      ),
      ' ' || chr(8212) || ' receita nova',
      ': receita nova'
    )::jsonb
where sample_questions::text like '%' || chr(8212) || '%';
