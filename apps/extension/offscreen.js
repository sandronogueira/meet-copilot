// Meet Copilot — offscreen document
// Captura 2 trilhas: ABA (= prospect/participantes) e MIC (= o usuário).
// Grava em ciclos de 15s (cada blob é um webm completo e decodável — o
// timeslice do MediaRecorder gera chunks sem header a partir do segundo)
// e envia cada ciclo para o /ingest do meeting-engine.

const CYCLE_MS = 15000

let running = false
let config = null
let startedAt = 0
let tabStream = null
let micStream = null
let cyclers = []

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.target !== 'offscreen') return
  if (msg.type === 'OFFSCREEN_START') start(msg)
  if (msg.type === 'OFFSCREEN_STOP') stop()
})

async function start({ streamId, ingestUrl, ingestToken }) {
  if (running) return
  config = { ingestUrl, ingestToken }
  startedAt = Date.now()

  // áudio da aba do Meet (todos os outros participantes)
  tabStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId },
    },
  })

  // IMPORTANTE: capturar a aba silencia o áudio dela para o usuário —
  // reencaminhamos para a saída para ele continuar ouvindo a reunião.
  const ctx = new AudioContext()
  ctx.createMediaStreamSource(tabStream).connect(ctx.destination)

  // microfone (a voz do próprio usuário)
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

function cycleRecorder(stream, track) {
  let recorder = null
  const interval = setInterval(() => {
    if (!running) return
    if (recorder && recorder.state === 'recording') recorder.stop()
    recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
    const chunkStartedMs = Date.now() - startedAt
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) upload(e.data, track, chunkStartedMs)
    }
    recorder.start()
  }, CYCLE_MS)

  // primeiro ciclo imediato
  recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
  const firstStart = Date.now() - startedAt
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) upload(e.data, track, firstStart)
  }
  recorder.start()
  setTimeout(() => {
    if (recorder.state === 'recording') recorder.stop()
  }, CYCLE_MS)

  return { interval, get recorder() { return recorder } }
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
    try {
      if (c.recorder && c.recorder.state === 'recording') c.recorder.stop()
    } catch {}
  }
  cyclers = []
  for (const s of [tabStream, micStream]) {
    if (s) for (const t of s.getTracks()) t.stop()
  }
  tabStream = micStream = null
}
