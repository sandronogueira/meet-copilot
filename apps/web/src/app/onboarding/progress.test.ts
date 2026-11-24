import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSavedProfile, isOnboardingStep, resolveInitialStep } from './progress'

// Rodar: `bun run test` (raiz do monorepo).

test('resolveInitialStep: sem Perfil salvo começa do Perfil', () => {
  assert.equal(resolveInitialStep({}), 'perfil')
  assert.equal(resolveInitialStep(null), 'perfil')
  assert.equal(resolveInitialStep(undefined), 'perfil')
  assert.equal(resolveInitialStep('lixo'), 'perfil')
  // etapa registrada sem Perfil salvo não vale: as seguintes dependem dele
  assert.equal(resolveInitialStep({ step: 'clones' }), 'perfil')
  assert.equal(resolveInitialStep({ perfil: 'true', step: 'clones' }), 'perfil')
})

test('resolveInitialStep: com Perfil salvo abre na etapa seguinte (critério de aceite P1-1)', () => {
  assert.equal(resolveInitialStep({ perfil: true }), 'conhecimento')
  assert.equal(resolveInitialStep({ perfil: true, step: 'etapa-que-nao-existe' }), 'conhecimento')
  // chaves do assistente antigo (step1..5) convivem sem atrapalhar
  assert.equal(resolveInitialStep({ perfil: true, step1: { ok: true } }), 'conhecimento')
})

test('resolveInitialStep: retoma exatamente a etapa em que o usuário estava', () => {
  assert.equal(resolveInitialStep({ perfil: true, step: 'clones' }), 'clones')
  assert.equal(resolveInitialStep({ perfil: true, step: 'config' }), 'config')
  // voltou ao Perfil por conta própria → reabre lá (com os campos preenchidos)
  assert.equal(resolveInitialStep({ perfil: true, step: 'perfil' }), 'perfil')
})

test('isOnboardingStep aceita só as quatro etapas', () => {
  assert.equal(isOnboardingStep('conhecimento'), true)
  assert.equal(isOnboardingStep('Conhecimento'), false)
  assert.equal(isOnboardingStep(2), false)
})

test('buildSavedProfile devolve os campos já salvos para preencher o formulário', () => {
  const saved = buildSavedProfile({
    salesProfile: {
      methodology: 'SPIN',
      tone: 'Formal',
      objections: ['"Tá caro"', '"Vou pensar"'],
      icp: 'Clínicas de estética com duas ou mais unidades',
    },
    profileDocMeta: { raw_text: 'Agência de marketing para clínicas.', segment: 'agência de marketing' },
    siteUrl: 'https://exemplo.com.br',
  })
  assert.deepEqual(saved, {
    siteUrl: 'https://exemplo.com.br',
    description: 'Agência de marketing para clínicas.',
    segment: 'agência de marketing',
    methodology: 'SPIN',
    tone: 'Formal',
    objections: ['"Tá caro"', '"Vou pensar"'],
    icp: 'Clínicas de estética com duas ou mais unidades',
  })
})

test('buildSavedProfile: conta nova (nada salvo) cai nos padrões do formulário', () => {
  assert.deepEqual(buildSavedProfile({ salesProfile: undefined, profileDocMeta: null, siteUrl: null }), {
    siteUrl: '',
    description: '',
    segment: '',
    methodology: 'Consultiva',
    tone: 'Equilibrado',
    objections: [],
    icp: '',
  })
})

test('buildSavedProfile tolera dados fora do formato sem quebrar', () => {
  const saved = buildSavedProfile({
    salesProfile: { methodology: 42, objections: ['ok', 7, null], icp: ['lista'] },
    profileDocMeta: 'texto solto',
    siteUrl: undefined,
  })
  assert.equal(saved.methodology, 'Consultiva')
  assert.deepEqual(saved.objections, ['ok'])
  assert.equal(saved.icp, '')
  assert.equal(saved.description, '')
})
