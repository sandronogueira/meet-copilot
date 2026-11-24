import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * Leitura de site para as bases de conhecimento.
 *
 * Cumpre a promessa "vamos ler o site": baixa a página informada + algumas
 * páginas internas que costumam explicar o negócio (sobre, serviços, planos…),
 * tira o HTML e devolve texto puro. Esse texto vai para documents.meta.raw_text,
 * que é o que o engine injeta no contexto do copiloto (mesmo caminho do upload
 * de arquivo em lib/extract-text.ts).
 *
 * Sem dependência nova: fetch + regex bastam para TEXTO (não renderizamos esse
 * HTML em lugar nenhum). Sites montados só por JavaScript voltam quase vazios —
 * nesse caso devolvemos erro com a saída ("cole o conteúdo em Texto livre").
 */

const MAX_HTML_BYTES = 1_500_000
const MAX_REDIRECTS = 3
const MAIN_PAGE_TIMEOUT_MS = 6_000
const EXTRA_PAGE_TIMEOUT_MS = 4_000
const MAX_EXTRA_PAGES = 4
// O engine injeta no máximo ~9.000 caracteres de contexto por reunião (somando
// todos os documentos da base). O site inteiro fica em ~7.000 para sobrar
// espaço para o perfil e os demais documentos.
const MAIN_PAGE_CHARS = 3_000
const EXTRA_PAGE_CHARS = 1_000
const MIN_USEFUL_CHARS = 80

export type SiteTextResult = { ok: true; text: string; pages: number } | { ok: false; error: string }

// ── Proteção SSRF ────────────────────────────────────────────────────────────
// A URL vem do usuário e quem faz a requisição é o NOSSO servidor: nunca buscar
// endereços internos (loopback, rede privada, metadata de nuvem).

/** true para endereços que o servidor não deve buscar a pedido do usuário. */
export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip)
  if (version === 4) {
    const [a = 0, b = 0] = ip.split('.').map(Number)
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // link-local / metadata de nuvem
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224 // multicast + reservado
    )
  }
  if (version === 6) {
    const x = ip.toLowerCase()
    if (x === '::' || x === '::1') return true
    // IPv4 embutido em IPv6 (::ffff:127.0.0.1 ou ::ffff:7f00:1)
    const mapped = /^::ffff:(.+)$/.exec(x)?.[1]
    if (mapped) {
      if (isIP(mapped) === 4) return isPrivateAddress(mapped)
      const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(mapped)
      if (hex) {
        const hi = parseInt(hex[1]!, 16)
        const lo = parseInt(hex[2]!, 16)
        return isPrivateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`)
      }
      return true
    }
    return (
      /^f[cd]/.test(x) || // fc00::/7 — rede privada
      /^fe[89ab]/.test(x) || // fe80::/10 — link-local
      x.startsWith('ff') || // multicast
      x.startsWith('64:ff9b:') // NAT64 — pode apontar para IPv4 interno
    )
  }
  return true // não é IP: recusa por segurança
}

/** Devolve a mensagem de recusa, ou null se a URL pode ser buscada. */
async function refusalFor(url: URL): Promise<string | null> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return 'Use um endereço que comece com https://'
  }
  if (url.username || url.password || (url.port && url.port !== '80' && url.port !== '443')) {
    return 'Esse endereço não pode ser lido. Use o endereço público do site.'
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || /\.(localhost|local|internal|lan)$/.test(host)) {
    return 'Esse endereço não é um site público.'
  }
  let addresses: string[]
  try {
    addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address)
  } catch {
    return 'Não encontramos esse site. Confira se o endereço está certo.'
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    return 'Esse endereço não é um site público.'
  }
  return null
}

// ── Download ────────────────────────────────────────────────────────────────

type PageResult = { ok: true; html: string; finalUrl: URL } | { ok: false; error: string }

async function readCapped(res: Response): Promise<Uint8Array> {
  const reader = res.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let size = 0
  while (size < MAX_HTML_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.length
  }
  if (size >= MAX_HTML_BYTES) await reader.cancel().catch(() => undefined)
  return Buffer.concat(chunks).subarray(0, MAX_HTML_BYTES)
}

/** Sites brasileiros antigos ainda servem ISO-8859-1 — respeita o charset declarado. */
function decodeBody(bytes: Uint8Array, contentType: string): string {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType)?.[1]
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 2048))
  const fromMeta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1]
  for (const label of [fromHeader, fromMeta]) {
    if (!label) continue
    try {
      return new TextDecoder(label).decode(bytes)
    } catch {
      // rótulo de charset desconhecido — tenta o próximo
    }
  }
  return new TextDecoder('utf-8').decode(bytes)
}

async function fetchPage(start: URL, timeoutMs: number): Promise<PageResult> {
  const signal = AbortSignal.timeout(timeoutMs)
  let url = start
  try {
    // redirect manual: cada salto é revalidado contra a lista de endereços proibidos
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const refusal = await refusalFor(url)
      if (refusal) return { ok: false, error: refusal }

      const res = await fetch(url, {
        redirect: 'manual',
        signal,
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; MeetCopilot/1.0)',
          accept: 'text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8',
          'accept-language': 'pt-BR,pt;q=0.9,en;q=0.5',
        },
      })

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location')
        await res.body?.cancel().catch(() => undefined)
        if (!location) return { ok: false, error: 'O site redirecionou para um endereço inválido.' }
        url = new URL(location, url)
        continue
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined)
        return { ok: false, error: `O site respondeu com erro (${res.status}). Confira o endereço.` }
      }
      const contentType = res.headers.get('content-type') ?? ''
      if (contentType && !/text\/html|application\/xhtml|text\/plain/i.test(contentType)) {
        await res.body?.cancel().catch(() => undefined)
        return {
          ok: false,
          error: 'Esse endereço é um arquivo, não uma página. Envie o arquivo pela aba "Arquivo".',
        }
      }
      return { ok: true, html: decodeBody(await readCapped(res), contentType), finalUrl: url }
    }
    return { ok: false, error: 'O site redirecionou vezes demais.' }
  } catch (e) {
    if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      return { ok: false, error: 'O site demorou demais para responder. Tente de novo em instantes.' }
    }
    return { ok: false, error: 'Não foi possível abrir o site. Confira se o endereço está certo.' }
  }
}

// ── HTML → texto ────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  agrave: 'à', Agrave: 'À', acirc: 'â', ecirc: 'ê', ocirc: 'ô',
  Acirc: 'Â', Ecirc: 'Ê', Ocirc: 'Ô', atilde: 'ã', otilde: 'õ',
  Atilde: 'Ã', Otilde: 'Õ', ccedil: 'ç', Ccedil: 'Ç', uuml: 'ü', ntilde: 'ñ',
  ordm: 'º', ordf: 'ª', deg: '°', ndash: '–', mdash: '—', hellip: '…',
  laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  bull: '•', middot: '·', copy: '©', reg: '®', trade: '™', euro: '€',
}

/** Uma passada só — evita decodificar duas vezes (&amp;lt; vira &lt;, não <). */
export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1]?.toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' '
    }
    return ENTITIES[body] ?? ENTITIES[body.toLowerCase()] ?? whole
  })
}

/** Título da página + linhas de texto visível (sem scripts, estilos e marcação). */
export function htmlToLines(html: string): { title: string; lines: string[] } {
  const clean = (s: string) => decodeEntities(s).replace(/\s+/g, ' ').trim()
  const title = clean(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '')
  const description = clean(
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html)?.[1] ??
      /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i.exec(html)?.[1] ??
      '',
  )

  // <nav> sai junto: menu é ruído (os links dele são aproveitados por pickInternalLinks)
  const body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|head|nav)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(br|hr)\b[^>]*>/gi, '\n')
    .replace(
      /<\/(p|div|section|article|header|footer|main|aside|nav|li|ul|ol|h[1-6]|tr|table|blockquote|figcaption|dd|dt)\s*>/gi,
      '\n',
    )
    .replace(/<[^>]+>/g, ' ')

  // \u0000 quebra jsonb no Postgres (mesmo cuidado do extract-text)
  const raw = decodeEntities(body)
    .replace(/\u0000/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  return { title, lines: description ? [description, ...raw] : raw }
}

/** Menus e rodapés repetem as mesmas linhas — fica só a primeira ocorrência. */
function takeNewLines(lines: string[], seen: Set<string>): string[] {
  const out: string[] = []
  for (const line of lines) {
    const key = line.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(line)
  }
  return out
}

const LINK_HINTS =
  /(sobre|quem-somos|about|empresa|servic|solu|produto|product|plano|preco|pricing|case|cliente|portfolio|diferencia|o-que-fazemos|como-funciona)/i

/** Páginas internas que costumam explicar o negócio, na ordem em que aparecem. */
export function pickInternalLinks(html: string, pageUrl: URL, max = MAX_EXTRA_PAGES): URL[] {
  const picked = new Map<string, URL>()
  // âncoras (#topo) e parâmetros (?utm=) são descartados mais abaixo, pela URL já montada
  for (const match of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*["']([^"']+)["']/gi)) {
    let url: URL
    try {
      url = new URL(decodeEntities(match[1]!.trim()), pageUrl)
    } catch {
      continue
    }
    if (url.origin !== pageUrl.origin) continue
    url.hash = ''
    url.search = ''
    const key = url.pathname.replace(/\/+$/, '')
    if (key === pageUrl.pathname.replace(/\/+$/, '')) continue
    if (/\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4|docx?|xlsx?)$/i.test(key)) continue
    if (!LINK_HINTS.test(key) || picked.has(key)) continue
    picked.set(key, url)
    if (picked.size >= max) break
  }
  return [...picked.values()]
}

// ── API pública ─────────────────────────────────────────────────────────────

/** Lê o site e devolve texto pronto para documents.meta.raw_text. Nunca lança. */
export async function readSiteText(rawUrl: string): Promise<SiteTextResult> {
  let start: URL
  try {
    start = new URL(rawUrl.trim())
  } catch {
    return { ok: false, error: 'Endereço inválido. Inclua https://' }
  }

  const main = await fetchPage(start, MAIN_PAGE_TIMEOUT_MS)
  if (!main.ok) return main

  const seen = new Set<string>()
  const mainParsed = htmlToLines(main.html)
  const mainText = takeNewLines(mainParsed.lines, seen).join('\n')
  if (mainText.length < MIN_USEFUL_CHARS) {
    return {
      ok: false,
      error:
        'Abrimos o site, mas quase não havia texto para ler (alguns sites só montam o conteúdo no navegador). Cole o conteúdo na aba "Texto livre".',
    }
  }

  // Páginas extras em paralelo e fail-soft: se uma falhar, as outras seguem.
  const extras = await Promise.all(
    pickInternalLinks(main.html, main.finalUrl).map(async (url) => {
      const page = await fetchPage(url, EXTRA_PAGE_TIMEOUT_MS)
      return page.ok ? { path: page.finalUrl.pathname, ...htmlToLines(page.html) } : null
    }),
  )

  const sections = [`# ${mainParsed.title || start.hostname}\n${mainText.slice(0, MAIN_PAGE_CHARS)}`]
  for (const extra of extras) {
    if (!extra) continue
    const text = takeNewLines(extra.lines, seen).join('\n')
    if (text.length < MIN_USEFUL_CHARS) continue
    sections.push(`## ${extra.title || extra.path} (${extra.path})\n${text.slice(0, EXTRA_PAGE_CHARS)}`)
  }

  return { ok: true, text: sections.join('\n\n'), pages: sections.length }
}

/**
 * Campos de `documents` que refletem o resultado da leitura.
 * No erro NÃO mexe em `meta`: uma releitura que falha não apaga texto já lido.
 */
export function siteDocumentFields(
  result: SiteTextResult,
):
  | { status: 'ready'; error_detail: null; meta: { raw_text: string; pages_read: number; read_at: string } }
  | { status: 'error'; error_detail: string } {
  return result.ok
    ? {
        status: 'ready',
        error_detail: null,
        meta: { raw_text: result.text, pages_read: result.pages, read_at: new Date().toISOString() },
      }
    : { status: 'error', error_detail: result.error }
}
