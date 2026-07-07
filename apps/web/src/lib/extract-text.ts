import { extractText as unpdfExtract, getDocumentProxy } from 'unpdf'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'

const MAX_CHARS = 40_000

export type ExtractResult = { ok: true; text: string } | { ok: false; error: string }

/**
 * Extrai texto de um arquivo enviado às bases de conhecimento.
 * O texto vai para documents.meta.raw_text — é o que o engine injeta no
 * contexto do copiloto durante a reunião.
 */
export async function extractTextFromFile(filename: string, buf: Buffer): Promise<ExtractResult> {
  const ext = (filename.split('.').pop() ?? '').toLowerCase()
  try {
    switch (ext) {
      case 'pdf': {
        const pdf = await getDocumentProxy(new Uint8Array(buf))
        const { text } = await unpdfExtract(pdf, { mergePages: true })
        return finish(text, 'PDF sem texto extraível (pode ser digitalizado/imagem)')
      }
      case 'docx': {
        const { value } = await mammoth.extractRawText({ buffer: buf })
        return finish(value, 'DOCX sem texto extraível')
      }
      case 'doc':
        return {
          ok: false,
          error: 'Formato .doc (Word antigo) não é suportado — salve como .docx e envie de novo.',
        }
      case 'xlsx':
      case 'xls':
      case 'csv': {
        const wb = XLSX.read(buf, { type: 'buffer' })
        const text = wb.SheetNames.map((name) => {
          const sheet = wb.Sheets[name]
          if (!sheet) return ''
          const csv = XLSX.utils.sheet_to_csv(sheet).trim()
          return csv ? `## Aba: ${name}\n${csv}` : ''
        })
          .filter(Boolean)
          .join('\n\n')
        return finish(text, 'Planilha vazia')
      }
      case 'md':
      case 'markdown':
      case 'txt':
        return finish(buf.toString('utf-8'), 'Arquivo de texto vazio')
      default:
        return {
          ok: false,
          error: `Formato .${ext} não suportado. Envie PDF, DOCX, XLSX, CSV, MD ou TXT.`,
        }
    }
  } catch (e) {
    return { ok: false, error: `Falha ao ler o arquivo: ${e instanceof Error ? e.message : 'erro desconhecido'}` }
  }
}

function finish(text: string, emptyMessage: string): ExtractResult {
  // \u0000 quebra jsonb no Postgres; normaliza quebras de linha exageradas
  const clean = text.replace(/\u0000/g, '').replace(/\n{4,}/g, '\n\n\n').trim()
  if (clean.length < 10) return { ok: false, error: emptyMessage }
  return { ok: true, text: clean.slice(0, MAX_CHARS) }
}
