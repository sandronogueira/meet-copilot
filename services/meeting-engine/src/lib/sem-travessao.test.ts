import { test } from 'node:test'
import assert from 'node:assert/strict'
import { REGRA_SEM_TRAVESSAO, semTravessao, semTravessaoEmTudo } from './sem-travessao'

// Rodar: `bun run test` (raiz do monorepo).
const T = '\u2014' // travessão
const N = '\u2013' // meia-risca

test('travessão no meio da frase vira vírgula', () => {
  assert.equal(
    semTravessao(`O cliente quer previsibilidade ${T} hoje depende de indicação.`),
    'O cliente quer previsibilidade, hoje depende de indicação.',
  )
  assert.equal(semTravessao(`Meta do semestre${T}dobrar o faturamento`), 'Meta do semestre, dobrar o faturamento')
})

test('faixa numérica vira "a"', () => {
  assert.equal(semTravessao(`Investimento de R$ 5.000${N}8.000 por mês`), 'Investimento de R$ 5.000 a 8.000 por mês')
  assert.equal(semTravessao(`Contrato 2026 ${T} 2027`), 'Contrato 2026 a 2027')
})

test('travessão abrindo ou fechando a linha some', () => {
  assert.equal(semTravessao(`${T} Enviar proposta\n${T} Agendar retorno`), 'Enviar proposta\nAgendar retorno')
  assert.equal(semTravessao(`Fica para a próxima reunião ${T}`), 'Fica para a próxima reunião')
})

test('não deixa vírgula sobrando quando já existe pontuação colada', () => {
  assert.equal(semTravessao(`Fechamos ${T}. Próximo passo`), 'Fechamos. Próximo passo')
  assert.equal(semTravessao(`Ok, ${T} seguimos assim`), 'Ok, seguimos assim')
})

test('hífen comum e texto sem travessão não mudam', () => {
  const texto = 'Pós-venda por e-mail, de segunda a sexta, das 10-18h. Valor: R$ 1.500,00.'
  assert.equal(semTravessao(texto), texto)
})

test('semTravessaoEmTudo limpa objetos aninhados e preserva o que não é texto', () => {
  const proposta = {
    engineVersion: 1,
    clienteNome: `Clínica Exemplo ${T} unidade Centro`,
    sections: [
      { id: 'hero', headline: `Mais pacientes ${T} sem depender de indicação`, validadeDias: 14, ativo: true },
      { id: 'escopo', itens: [{ titulo: `Tráfego pago ${N} Meta e Google`, descricao: null }] },
    ],
  }
  const limpa = semTravessaoEmTudo(proposta)
  assert.deepEqual(limpa, {
    engineVersion: 1,
    clienteNome: 'Clínica Exemplo, unidade Centro',
    sections: [
      { id: 'hero', headline: 'Mais pacientes, sem depender de indicação', validadeDias: 14, ativo: true },
      { id: 'escopo', itens: [{ titulo: 'Tráfego pago, Meta e Google', descricao: null }] },
    ],
  })
  assert.doesNotMatch(JSON.stringify(limpa), /[\u2014\u2013]/)
})

test('a regra que vai para os prompts não contém o próprio travessão', () => {
  assert.doesNotMatch(REGRA_SEM_TRAVESSAO, /[\u2014\u2013]/)
})
