// Meet Copilot — service worker (MV3)
// Papel: abrir o side panel, criar o offscreen document e repassar o
// streamId da aba para a captura. O trabalho pesado fica no offscreen.

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})
})

async function ensureOffscreen() {
  const has = await chrome.offscreen.hasDocument?.()
  if (has) return
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Capturar áudio da aba do Meet e do microfone para transcrição da reunião',
  })
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'background') return

  if (msg.type === 'START_CAPTURE') {
    // streamId já foi obtido no painel (contexto invocado) — só liga o offscreen
    ;(async () => {
      try {
        await ensureOffscreen()
        await chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'OFFSCREEN_START',
          streamId: msg.streamId,
          ingestUrl: msg.ingestUrl,
          ingestToken: msg.ingestToken,
        })
        sendResponse({ ok: true })
      } catch (e) {
        sendResponse({ ok: false, error: String(e) })
      }
    })()
    return true // resposta assíncrona
  }

  if (msg.type === 'STOP_CAPTURE') {
    ;(async () => {
      try {
        await chrome.runtime.sendMessage({ target: 'offscreen', type: 'OFFSCREEN_STOP' })
      } catch {
        // offscreen pode já ter fechado
      }
      try {
        await chrome.offscreen.closeDocument()
      } catch {}
      sendResponse({ ok: true })
    })()
    return true
  }
})
