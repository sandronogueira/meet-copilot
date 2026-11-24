import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  decodeEntities,
  htmlToLines,
  isPrivateAddress,
  pickInternalLinks,
  readSiteText,
  siteDocumentFields,
} from './site-text'

// Rodar: `bun run test` (raiz do monorepo).
// A rede é simulada trocando o fetch global; os hosts são IPs públicos literais
// para a checagem de endereço passar sem consultar DNS de verdade.

const SITE = 'http://93.184.216.34'
const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

function page(body: string, title = 'Acme'): Response {
  return new Response(
    `<html><head><title>${title}</title><style>.x{color:red}</style></head><body>${body}</body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } },
  )
}

/** Troca o fetch por um site de mentira; devolve a lista de URLs buscadas. */
function mockSite(pages: Record<string, Response>): string[] {
  const calls: string[] = []
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    return pages[url] ?? new Response('não encontrado', { status: 404 })
  }) as typeof fetch
  return calls
}

const LONG = 'A Acme ajuda clínicas a venderem mais com atendimento consultivo e acompanhamento de perto do início ao fim.'

test('isPrivateAddress bloqueia endereços internos e libera os públicos', () => {
  for (const ip of [
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    'isso-nao-e-ip',
  ]) {
    assert.equal(isPrivateAddress(ip), true, `${ip} deveria ser bloqueado`)
  }
  for (const ip of ['8.8.8.8', '93.184.216.34', '172.32.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
    assert.equal(isPrivateAddress(ip), false, `${ip} deveria ser liberado`)
  }
})

test('decodeEntities converte acentos e não decodifica duas vezes', () => {
  assert.equal(decodeEntities('Solu&ccedil;&otilde;es &amp; servi&#231;os &#x41;'), 'Soluções & serviços A')
  assert.equal(decodeEntities('&amp;lt;b&amp;gt;'), '&lt;b&gt;')
  assert.equal(decodeEntities('&desconhecida;'), '&desconhecida;')
})

test('htmlToLines tira scripts/estilos e separa blocos em linhas', () => {
  const { title, lines } = htmlToLines(`
    <html><head><title> Acme &mdash; Consultoria </title>
    <meta name="description" content="Consultoria para cl&iacute;nicas"></head>
    <body><script>var segredo = 1</script><style>p{}</style>
    <!-- comentário -->
    <h1>Quem somos</h1><p>Atendemos <b>clínicas</b> desde 2015.</p>
    <ul><li>Planejamento</li><li>Execução</li></ul></body></html>`)
  assert.equal(title, 'Acme — Consultoria')
  assert.deepEqual(lines, [
    'Consultoria para clínicas',
    'Quem somos',
    'Atendemos clínicas desde 2015.',
    'Planejamento',
    'Execução',
  ])
})

test('pickInternalLinks escolhe só páginas do mesmo site que explicam o negócio', () => {
  const links = pickInternalLinks(
    `<a href="/sobre">Sobre</a> <a href="/sobre/">Sobre de novo</a> <a href="/blog/post-1">Blog</a>
     <a href="https://outro.com/servicos">Fora</a> <a href="/servicos?utm=1#topo">Serviços</a>
     <a href="/planos.pdf">PDF</a> <a href="#contato">Âncora</a> <a href="/cases">Cases</a>`,
    new URL(`${SITE}/`),
  )
  assert.deepEqual(
    links.map((u) => u.pathname),
    ['/sobre', '/servicos', '/cases'],
  )
  assert.equal(pickInternalLinks('<a href="/sobre">a</a><a href="/servicos">b</a>', new URL(`${SITE}/`), 1).length, 1)
})

test('readSiteText lê a página inicial + páginas internas e não repete o menu', async () => {
  const menu =
    '<nav><a href="/sobre">Sobre a empresa</a><a href="/servicos">Nossos serviços</a></nav>' +
    '<header><p>Fale com a Acme pelo WhatsApp</p></header>'
  const calls = mockSite({
    [`${SITE}/`]: page(`${menu}<h1>Acme Consultoria</h1><p>${LONG}</p>`),
    [`${SITE}/sobre`]: page(`${menu}<p>Fundada em 2015 em Fortaleza, com mais de duzentas clínicas atendidas no Nordeste.</p>`, 'Sobre'),
    [`${SITE}/servicos`]: page(`${menu}<p>Diagnóstico comercial, treinamento de equipe e gestão de tráfego pago para clínicas.</p>`, 'Serviços'),
  })

  const result = await readSiteText(`${SITE}/`)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.pages, 3)
  assert.deepEqual(calls.sort(), [`${SITE}/`, `${SITE}/servicos`, `${SITE}/sobre`])
  assert.match(result.text, /^# Acme\n/)
  assert.match(result.text, /## Sobre \(\/sobre\)\nFundada em 2015/)
  assert.match(result.text, /## Serviços \(\/servicos\)\nDiagnóstico comercial/)
  // o menu (<nav>) não entra no texto; a faixa repetida em todas as páginas entra uma vez só
  assert.doesNotMatch(result.text, /Sobre a empresa/)
  assert.equal(result.text.split('Fale com a Acme pelo WhatsApp').length - 1, 1)
  assert.doesNotMatch(result.text, /color:red/)
})

test('readSiteText segue funcionando quando uma página interna falha', async () => {
  mockSite({
    [`${SITE}/`]: page(`<a href="/sobre">Sobre</a><p>${LONG}</p>`),
    // /sobre não existe → 404
  })
  const result = await readSiteText(`${SITE}/`)
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.pages, 1)
})

test('readSiteText recusa endereços internos sem fazer nenhuma requisição', async () => {
  const calls = mockSite({})
  for (const url of [
    'http://127.0.0.1/',
    'http://localhost:3000/',
    'http://169.254.169.254/latest/meta-data',
    'http://192.168.0.10/',
    'http://[::1]/',
    'ftp://93.184.216.34/',
    'http://93.184.216.34:8080/',
    'http://usuario:senha@93.184.216.34/',
    'sem-protocolo.com.br',
  ]) {
    const result = await readSiteText(url)
    assert.equal(result.ok, false, `${url} deveria ser recusado`)
  }
  assert.deepEqual(calls, [])
})

test('readSiteText não segue redirecionamento para endereço interno', async () => {
  const calls = mockSite({
    [`${SITE}/`]: new Response(null, { status: 302, headers: { location: 'http://10.0.0.5/admin' } }),
  })
  const result = await readSiteText(`${SITE}/`)
  assert.equal(result.ok, false)
  assert.deepEqual(calls, [`${SITE}/`])
})

test('readSiteText segue redirecionamento público (ex.: http → www)', async () => {
  mockSite({
    [`${SITE}/`]: new Response(null, { status: 301, headers: { location: 'http://93.184.216.35/inicio' } }),
    'http://93.184.216.35/inicio': page(`<p>${LONG}</p>`),
  })
  const result = await readSiteText(`${SITE}/`)
  assert.equal(result.ok, true)
})

test('readSiteText explica quando não dá para ler', async () => {
  mockSite({
    [`${SITE}/vazio`]: page('<div id="root"></div><script>montaTudo()</script>'),
    [`${SITE}/arquivo`]: new Response('%PDF-1.7', { headers: { 'content-type': 'application/pdf' } }),
  })

  const vazio = await readSiteText(`${SITE}/vazio`)
  assert.equal(vazio.ok, false)
  if (!vazio.ok) assert.match(vazio.error, /Texto livre/)

  const arquivo = await readSiteText(`${SITE}/arquivo`)
  assert.equal(arquivo.ok, false)
  if (!arquivo.ok) assert.match(arquivo.error, /arquivo/)

  const sumiu = await readSiteText(`${SITE}/nao-existe`)
  assert.equal(sumiu.ok, false)
  if (!sumiu.ok) assert.match(sumiu.error, /404/)
})

test('siteDocumentFields: sucesso vira pronto com texto; erro guarda o motivo sem tocar em meta', () => {
  const ready = siteDocumentFields({ ok: true, text: 'conteúdo', pages: 2 })
  assert.equal(ready.status, 'ready')
  assert.equal(ready.error_detail, null)
  assert.equal('meta' in ready && ready.meta.raw_text, 'conteúdo')
  assert.equal('meta' in ready && ready.meta.pages_read, 2)

  const failed = siteDocumentFields({ ok: false, error: 'fora do ar' })
  assert.deepEqual(failed, { status: 'error', error_detail: 'fora do ar' })
})
