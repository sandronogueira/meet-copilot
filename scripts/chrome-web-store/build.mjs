#!/usr/bin/env node
// Empacota a extensão para a Chrome Web Store.
//
// A fonte (apps/extension) NÃO é alterada: o manifest da loja é gerado aqui, na hora de
// empacotar. O zip manual (apps/web/public/downloads/meet-copilot-extension.zip) segue
// saindo da fonte como sempre.
//
// O que muda no pacote da loja em relação à fonte:
//   1. sem as permissões de host de desenvolvimento (localhost)
//   2. sem a permissão "tabs" (ver STORE_DROPPED_PERMISSIONS)
//   3. com os ícones que a loja exige (16, 32, 48 e 128 px)
//   4. descrição curta que descreve o produto (a loja recusa ficha que não descreve)
//   5. sem o README (documentação interna)
//
// Os arquivos de código (.js e .html) vão byte a byte iguais aos da fonte.
//
// Uso: node scripts/chrome-web-store/build.mjs
// Saída: dist/chrome-web-store/meet-copilot-loja-<versão>.zip (e a pasta de mesmo nome)

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')
const SRC = join(ROOT, 'apps/extension')
const ICONS = join(HERE, 'icons')
const OUT = join(ROOT, 'dist/chrome-web-store')
const PACKAGE_PREFIX = 'meet-copilot-loja-'

const ICON_SIZES = [16, 32, 48, 128]

// Descrição curta da ficha (vem do manifest). Limite da loja: 132 caracteres.
const STORE_DESCRIPTION =
  'Copiloto de IA para reuniões no Google Meet: transcreve a conversa e sugere perguntas e respostas em tempo real.'

// Limites publicados em developer.chrome.com (conferidos em 2026-11-25).
const MAX_NAME = 75
const MAX_DESCRIPTION = 132

const DEV_HOST = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])([:/]|$)/

// Meia-risca (0x2013) e travessão (0x2014), escritos pelo código para o arquivo não conter os sinais.
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

// Permissões da fonte que NÃO vão para a loja.
// "tabs": a loja exige pedir o mínimo e pode recusar quem pede a mais. O único uso é ler o
// endereço da aba ativa para saber se é uma reunião do Meet (panel.js), e a permissão de site
// https://meet.google.com/* já entrega isso. Teste de 2026-11-25 no Chromium 145: sem "tabs" a
// extensão continua vendo o endereço da aba do Meet e deixa de ver endereço e título das outras
// abas. O aviso de instalação não muda. Para voltar atrás, esvazie esta lista.
const STORE_DROPPED_PERMISSIONS = ['tabs']

/** Devolve o manifest que vai para a loja, a partir do manifest da fonte. */
export function toStoreManifest(source) {
  const iconPath = (size) => `icons/icon-${size}.png`
  return {
    ...source,
    description: STORE_DESCRIPTION,
    icons: Object.fromEntries(ICON_SIZES.map((size) => [size, iconPath(size)])),
    action: {
      ...source.action,
      default_icon: { 16: iconPath(16), 32: iconPath(32) },
    },
    permissions: (source.permissions ?? []).filter((name) => !STORE_DROPPED_PERMISSIONS.includes(name)),
    host_permissions: (source.host_permissions ?? []).filter((host) => !DEV_HOST.test(host)),
  }
}

function fail(message) {
  console.error(`\nERRO: ${message}\n`)
  process.exit(1)
}

/** Lê largura e altura do cabeçalho de um PNG. */
function pngSize(file) {
  const bytes = readFileSync(file)
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  if (!isPng) fail(`${relative(ROOT, file)} não é um PNG`)
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

function listFiles(dir, base = dir) {
  return readdirSync(dir)
    .flatMap((name) => {
      const full = join(dir, name)
      return statSync(full).isDirectory() ? listFiles(full, base) : [relative(base, full)]
    })
    .sort()
}

function check(manifest, stage) {
  const text = JSON.stringify(manifest)
  if (manifest.manifest_version !== 3) fail('a loja só aceita Manifest V3')
  if (!/^\d+(\.\d+){0,3}$/.test(manifest.version ?? '')) fail(`versão inválida: ${manifest.version}`)
  if (manifest.name.length > MAX_NAME) fail(`nome com ${manifest.name.length} caracteres (máximo ${MAX_NAME})`)
  if (manifest.description.length > MAX_DESCRIPTION) {
    fail(`descrição com ${manifest.description.length} caracteres (máximo ${MAX_DESCRIPTION})`)
  }
  if (DASHES.test(manifest.name + manifest.description)) fail('nome ou descrição com travessão')
  if (/localhost|127\.0\.0\.1/.test(text)) fail('sobrou endereço de desenvolvimento no manifest')

  const referenced = [
    manifest.background?.service_worker,
    manifest.side_panel?.default_path,
    ...(manifest.content_scripts ?? []).flatMap((entry) => entry.js ?? []),
    ...Object.values(manifest.icons ?? {}),
    ...Object.values(manifest.action?.default_icon ?? {}),
  ].filter(Boolean)
  for (const file of referenced) {
    if (!existsSync(join(stage, file))) fail(`o manifest cita ${file}, que não está no pacote`)
  }

  for (const size of ICON_SIZES) {
    const { width, height } = pngSize(join(stage, manifest.icons[size]))
    if (width !== size || height !== size) fail(`ícone de ${size} px está com ${width}x${height}`)
  }
}

function main() {
  const source = JSON.parse(readFileSync(join(SRC, 'manifest.json'), 'utf8'))
  const manifest = toStoreManifest(source)
  const name = `${PACKAGE_PREFIX}${manifest.version}`
  const stage = join(OUT, name)
  const zip = join(OUT, `${name}.zip`)

  // Só pode existir um pacote na pasta de saída: apaga os de versões anteriores,
  // para ninguém enviar à loja um zip antigo por engano.
  mkdirSync(OUT, { recursive: true })
  for (const entry of readdirSync(OUT)) {
    if (entry.startsWith(PACKAGE_PREFIX)) rmSync(join(OUT, entry), { recursive: true, force: true })
  }
  mkdirSync(stage, { recursive: true })

  cpSync(SRC, stage, {
    recursive: true,
    filter: (path) => {
      const file = relative(SRC, path)
      return !file.split('/').some((part) => part.startsWith('.')) && file !== 'README.md'
    },
  })
  mkdirSync(join(stage, 'icons'), { recursive: true })
  for (const size of ICON_SIZES) {
    const icon = join(ICONS, `icon-${size}.png`)
    if (!existsSync(icon)) fail(`falta o ícone ${relative(ROOT, icon)}`)
    cpSync(icon, join(stage, 'icons', `icon-${size}.png`))
  }
  writeFileSync(join(stage, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

  check(manifest, stage)

  // -X: sem atributos extras do macOS. O manifest.json fica na raiz do zip.
  execFileSync('zip', ['-X', '-r', '-q', zip, '.', '-x', '*.DS_Store'], { cwd: stage })

  const removed = (source.host_permissions ?? []).filter((host) => !manifest.host_permissions.includes(host))
  console.log(`Pacote da loja: ${relative(ROOT, zip)} (${statSync(zip).size} bytes)`)
  console.log(`Pasta para conferência: ${relative(ROOT, stage)}`)
  console.log(`Versão: ${manifest.version}`)
  console.log(`Descrição (${manifest.description.length}/${MAX_DESCRIPTION}): ${manifest.description}`)
  console.log(`Permissões: ${manifest.permissions.join(', ')}`)
  console.log(`Sites: ${manifest.host_permissions.join(', ')}`)
  console.log(`Sites de desenvolvimento retirados: ${removed.join(', ') || 'nenhum'}`)
  const dropped = (source.permissions ?? []).filter((name) => !manifest.permissions.includes(name))
  console.log(`Permissões da fonte que não vão para a loja: ${dropped.join(', ') || 'nenhuma'}`)
  console.log(`Arquivos (${listFiles(stage).length}): ${listFiles(stage).join(', ')}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
