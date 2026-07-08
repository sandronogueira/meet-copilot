import type { TranscriptSegmentInput } from '@meet-copilot/shared'

export interface BufferedSegment extends TranscriptSegmentInput {
  seq: number
}

const GAP_TURN_MS = 2_000

/**
 * Janela deslizante da transcrição de UMA reunião.
 * Vive em memória no ator da sessão; re-hidratável do Postgres em reconexão.
 */
export class TranscriptBuffer {
  private segments: BufferedSegment[] = []
  private seq = 0
  wordsSinceLastTick = 0

  append(input: TranscriptSegmentInput): BufferedSegment {
    const seg: BufferedSegment = { ...input, seq: ++this.seq }
    this.segments.push(seg)
    this.wordsSinceLastTick += input.text.split(/\s+/).length
    return seg
  }

  /** Fim de turno: trocou o speaker OU silêncio > 2s desde o último segmento. */
  isTurnEnd(next: TranscriptSegmentInput): boolean {
    const last = this.segments[this.segments.length - 1]
    if (!last) return false
    if (last.speakerLabel !== next.speakerLabel) return true
    return next.startedMs - last.endedMs > GAP_TURN_MS
  }

  markTicked(): void {
    this.wordsSinceLastTick = 0
  }

  /**
   * Reidratação pós-restart: repõe os segmentos recentes vindos do Postgres.
   * Só age em buffer vazio (evita duplicar em reconexão do Recall no meio da
   * sessão). `seq` continua do máximo carregado — sem colisão com o banco.
   * `wordsSinceLastTick` permanece 0: material antigo não deve disparar tick.
   */
  hydrate(segs: BufferedSegment[]): boolean {
    if (this.segments.length > 0 || segs.length === 0) return false
    this.segments = segs
    this.seq = segs.reduce((max, s) => Math.max(max, s.seq), 0)
    return true
  }

  /**
   * Janela recente formatada para o prompt ("Speaker: fala"), limitada por
   * caracteres (~4 chars/token). Transcrição é INPUT NÃO CONFIÁVEL — o chamador
   * é responsável pelo fencing no prompt.
   */
  window(maxChars = 10_000): string {
    const lines: string[] = []
    let total = 0
    for (let i = this.segments.length - 1; i >= 0; i--) {
      const seg = this.segments[i]!
      const line = `${seg.speakerLabel}: ${seg.text}`
      total += line.length + 1
      if (total > maxChars) break
      lines.unshift(line)
    }
    return lines.join('\n')
  }

  get size(): number {
    return this.segments.length
  }

  get lastSeq(): number {
    return this.seq
  }
}
