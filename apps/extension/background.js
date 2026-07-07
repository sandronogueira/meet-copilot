// Meet Copilot — service worker (MV3)
// Papel: abrir o side panel PELO clique no ícone (gesto que concede activeTab),
// obter o streamId da aba nesse contexto e ligar o offscreen para capturar.

chrome.runtime.onInstalled.addListener(() => {
  // NÃO abrir o painel automaticamente: precisamos do onClicked para que o
  // Chrome conceda activeTab à aba (sem isso, tabCapture falha com "not invoked").
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {})
})

// Clique no ícone da extensão = invocação → concede activeTab para ESTA aba.
chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (tab?.id != null) await chrome.sidePanel.open({ tabId: tab.id })
  } catch (e) {
    console.error('[mc] sidePanel.open falhou:', e)
  }
  if (tab?.id != null) {
    await chrome.storage.session.set({ grantedTabId: tab.id, grantedUrl: tab.url || '' })
  }
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
    ;(async () => {
      try {
        // A aba concedida veio do clique no ícone (onClicked acima).
        const { grantedTabId } = await chrome.storage.session.get('grantedTabId')
        const targetTabId = grantedTabId ?? msg.tabId
        if (targetTabId == null) {
          throw new Error('Sem aba autorizada. Clique no ícone do Meet Copilot a partir da aba do Meet.')
        }
        // getMediaStreamId no service worker, logo após a invocação: activeTab válido.
        const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId })
        await ensureOffscreen()
        await chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'OFFSCREEN_START',
          streamId,
          ingestUrl: msg.ingestUrl,
          ingestToken: msg.ingestToken,
        })
        sendResponse({ ok: true })
      } catch (e) {
        sendResponse({ ok: false, error: String(e && e.message ? e.message : e) })
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
