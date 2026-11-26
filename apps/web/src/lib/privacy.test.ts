import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { formatPolicyDate, isPrivacyPolicyReady, privacyPolicyMissing, PRIVACY_POLICY } from './privacy'

// Rodar: `bun run test` (raiz do monorepo).

const completa = {
  updatedAt: '2026-11-26',
  controllerName: 'Empresa Exemplo',
  contactEmail: 'contato@exemplo.com',
  approvedOn: '2026-11-27',
}

test('política sem responsável, sem contato e sem aprovação não pode ser publicada', () => {
  const vazia = { ...completa, controllerName: '', contactEmail: '', approvedOn: '' }
  assert.equal(isPrivacyPolicyReady(vazia), false)
  assert.equal(privacyPolicyMissing(vazia).length, 3)
})

test('política com responsável, contato e aprovação pode ser publicada', () => {
  assert.equal(isPrivacyPolicyReady(completa), true)
  assert.deepEqual(privacyPolicyMissing(completa), [])
})

test('sem a aprovação do dono a política completa continua fora do ar', () => {
  for (const approvedOn of ['', '   ', 'sim', '27/11/2026']) {
    const semAprovacao = { ...completa, approvedOn }
    assert.equal(isPrivacyPolicyReady(semAprovacao), false)
    assert.deepEqual(privacyPolicyMissing(semAprovacao), ['a aprovação do texto pelo responsável'])
  }
})

test('e-mail malformado ou só com espaços conta como faltando', () => {
  for (const contactEmail of ['contato', 'contato@', '@exemplo.com', '   ', 'a b@exemplo.com']) {
    assert.deepEqual(privacyPolicyMissing({ ...completa, contactEmail }), ['o e-mail de contato'])
  }
  assert.deepEqual(privacyPolicyMissing({ ...completa, controllerName: ' ' }), [
    'o nome de quem responde pelos dados',
  ])
})

test('a data aparece por extenso e não muda com o fuso', () => {
  assert.equal(formatPolicyDate('2026-11-26'), '26 de novembro de 2026')
  assert.equal(formatPolicyDate('2027-01-01'), '1 de janeiro de 2027')
  assert.equal(formatPolicyDate('2027-03-09'), '9 de março de 2027')
  assert.throws(() => formatPolicyDate('26/11/2026'))
  assert.throws(() => formatPolicyDate('2026-13-01'))
})

test('a data registrada na política é válida', () => {
  assert.doesNotThrow(() => formatPolicyDate(PRIVACY_POLICY.updatedAt))
})

test('os textos de privacidade que as pessoas leem não têm travessão', () => {
  // Meia-risca (0x2013) e travessão (0x2014), montados pelo código para este arquivo não conter os sinais.
  const dashes = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
  const files = [
    '../app/privacidade/page.tsx',
    '../../../extension/panel.html',
    '../../../extension/consent.js',
  ]
  for (const file of files) {
    const text = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')
    assert.doesNotMatch(text, dashes, `travessão em ${file}`)
  }
})
