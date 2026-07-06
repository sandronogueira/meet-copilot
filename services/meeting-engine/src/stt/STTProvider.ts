import type { ModuleOutput } from '@meet-copilot/shared'

export interface STTResult {
  text: string
}

/**
 * Interface plugável de STT (decisão do plano: Groq grátis agora,
 * Deepgram streaming como upgrade "modo instantâneo").
 */
export interface STTProvider {
  readonly name: string
  transcribeChunk(audio: Buffer, mimeType: string, language: string): Promise<ModuleOutput<STTResult>>
}
