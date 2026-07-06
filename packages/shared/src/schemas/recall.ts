import { z } from 'zod'

/**
 * Payloads do Recall.ai (realtime_endpoints via WSS).
 * Schemas tolerantes (looseObject): o shape do Recall evolui entre versões —
 * campos extras não podem quebrar o parse (mesmo princípio do denise-transcriber).
 */

const recallWord = z.looseObject({
  text: z.string(),
  start_timestamp: z.looseObject({ relative: z.number() }).optional(),
  end_timestamp: z.looseObject({ relative: z.number() }).optional(),
})

const recallParticipant = z.looseObject({
  id: z.union([z.string(), z.number()]).optional(),
  name: z.string().nullish(),
  is_host: z.boolean().optional(),
})

export const recallRealtimeEventSchema = z.looseObject({
  event: z.string(), // 'transcript.data' | 'transcript.partial_data' | ...
  data: z.looseObject({
    data: z.looseObject({
      words: z.array(recallWord).default([]),
      participant: recallParticipant.optional(),
    }),
    bot: z.looseObject({ id: z.string().optional() }).optional(),
  }),
})

export type RecallRealtimeEvent = z.infer<typeof recallRealtimeEventSchema>

/** Segmento normalizado — formato interno único, independente do provider STT. */
export interface TranscriptSegmentInput {
  speakerLabel: string
  text: string
  startedMs: number
  endedMs: number
  isFinal: boolean
}

/** Converte um evento realtime do Recall no segmento interno. Retorna null se vazio. */
export function normalizeRecallEvent(event: RecallRealtimeEvent): TranscriptSegmentInput | null {
  const words = event.data.data.words
  if (words.length === 0) return null

  const text = words.map((w) => w.text).join(' ').trim()
  if (text.length === 0) return null

  const first = words[0]!
  const last = words[words.length - 1]!

  return {
    speakerLabel: event.data.data.participant?.name ?? 'Desconhecido',
    text,
    startedMs: Math.round((first.start_timestamp?.relative ?? 0) * 1000),
    endedMs: Math.round((last.end_timestamp?.relative ?? last.start_timestamp?.relative ?? 0) * 1000),
    isFinal: event.event === 'transcript.data',
  }
}
