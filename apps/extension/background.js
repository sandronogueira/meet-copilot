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
        // Prioriza a ABA ATUAL (reunião em curso); usa a concedida pelo último
        // clique no ícone como fallback. A autorização do Chrome é POR ABA.
        const { grantedTabId } = await chrome.storage.session.get('grantedTabId')
        let streamId = null
        for (const tabId of [msg.tabId, grantedTabId].filter((t) => t != null)) {
          try {
            streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId })
            break
          } catch {
            // tenta o próximo candidato
          }
        }
        if (!streamId) {
          throw new Error(
            'Extension has not been invoked: clique no ícone do Meet Copilot NESTA aba da reunião para autorizar, e depois Iniciar de novo.',
          )
        }
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
