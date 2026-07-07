// Meet Copilot — offscreen document
// Captura 2 trilhas: ABA (= prospect/participantes) e MIC (= o usuário).
// Grava em ciclos de 15s (cada blob é um webm completo e decodável) e só
// envia ciclos COM VOZ (VAD por RMS) — silêncio não vira alucinação no Whisper.

const CYCLE_MS = 15000
const VOICE_RMS_THRESHOLD = 0.015 // pico de RMS mínimo para considerar que houve fala

let running = false
let config = null
let startedAt = 0
let tabStream = null
let micStream = null
let cyclers = []
let audioCtx = null

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.target !== 'offscreen') return
  if (msg.type === 'OFFSCREEN_START') start(msg)
  if (msg.type === 'OFFSCREEN_STOP') stop()
})

async function start({ streamId, ingestUrl, ingestToken }) {
  if (running) return
  config = { ingestUrl, ingestToken }
  startedAt = Date.now()
  audioCtx = new AudioContext()

  // áudio da aba do Meet (todos os outros participantes)
  tabStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId },
    },
  })

  // IMPORTANTE: capturar a aba silencia o áudio dela para o usuário —
  // reencaminhamos para a saída para ele continuar ouvindo a reunião.
  audioCtx.createMediaStreamSource(tabStream).connect(audioCtx.destination)

  // microfone (a voz do próprio usuário) — permissão já concedida pelo painel
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch (e) {
    console.warn('[mc] sem permissão de microfone — capturando só a aba', e)
  }

  running = true
  cyclers = [
    cycleRecorder(tabStream, 'tab'),
    micStream ? cycleRecorder(micStream, 'mic') : null,
  ].filter(Boolean)
}

// Medidor de voz: retorna função que lê o pico de RMS desde a última leitura.
function voiceMeter(stream) {
  const analyser = audioCtx.createAnalyser()
  analyser.fftSize = 2048
  audioCtx.createMediaStreamSource(stream).connect(analyser)
  const buf = new Float32Array(analyser.fftSize)
  let peak = 0
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(buf)
    let sum = 0
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
    const rms = Math.sqrt(sum / buf.length)
    if (rms > peak) peak = rms
  }, 150)
  return {
    consumePeak() {
      const p = peak
      peak = 0
      return p
    },
    dispose() {
      clearInterval(timer)
    },
  }
}

function cycleRecorder(stream, track) {
  const meter = voiceMeter(stream)
  let recorder = null

  const startCycle = () => {
    recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
    const chunkStartedMs = Date.now() - startedAt
    recorder.ondataavailable = (e) => {
      const peak = meter.consumePeak()
      if (!e.data || e.data.size === 0) return
      if (peak < VOICE_RMS_THRESHOLD) {
        console.log(`[mc] ${track}: ciclo silencioso (rms ${peak.toFixed(4)}) — descartado`)
        return
      }
      upload(e.data, track, chunkStartedMs)
    }
    recorder.start()
  }

  const interval = setInterval(() => {
    if (!running) return
    if (recorder && recorder.state === 'recording') recorder.stop()
    startCycle()
  }, CYCLE_MS)

  startCycle()

  return {
    interval,
    meter,
    get recorder() {
      return recorder
    },
  }
}

async function upload(blob, track, startedMs) {
  if (!config) return
  const url = `${config.ingestUrl}?token=${encodeURIComponent(config.ingestToken)}&track=${track}&startedMs=${startedMs}`
  try {
    await fetch(url, { method: 'POST', headers: { 'content-type': 'audio/webm' }, body: blob })
  } catch (e) {
    console.error('[mc] upload falhou (fail-soft):', e)
  }
}

function stop() {
  running = false
  for (const c of cyclers) {
    clearInterval(c.interval)
    c.meter?.dispose()
    try {
      if (c.recorder && c.recorder.state === 'recording') c.recorder.stop()
    } catch {}
  }
  cyclers = []
  for (const s of [tabStream, micStream]) {
    if (s) for (const t of s.getTracks()) t.stop()
  }
  tabStream = micStream = null
  if (audioCtx) {
    audioCtx.close().catch(() => {})
    audioCtx = null
  }
}
