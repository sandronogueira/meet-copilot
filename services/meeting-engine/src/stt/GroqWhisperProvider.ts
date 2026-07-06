import { ok, err, type ModuleOutput } from '@meet-copilot/shared'
import type { STTProvider, STTResult } from './STTProvider'

/**
 * Groq Whisper (whisper-large-v3) — mesmo padrão do denise-transcriber.
 * Batch por chunk (~15s): custo zero no free tier, latência de bloco.
 */
export class GroqWhisperProvider implements STTProvider {
  readonly name = 'groq_whisper_large_v3'

  constructor(private apiKey: string) {}

  async transcribeChunk(
    audio: Buffer,
    mimeType: string,
    language: string,
  ): Promise<ModuleOutput<STTResult>> {
    const form = new FormData()
    const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('wav') ? 'wav' : 'webm'
    form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType }), `chunk.${ext}`)
    form.append('model', 'whisper-large-v3')
    form.append('language', language.split('-')[0] ?? 'pt')
    form.append('response_format', 'json')

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}` },
      body: form,
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return err('GROQ_STT', `Groq respondeu ${res.status}`, body.slice(0, 300))
    }

    const json = (await res.json()) as { text?: string }
    return ok({ text: (json.text ?? '').trim() })
  }
}
