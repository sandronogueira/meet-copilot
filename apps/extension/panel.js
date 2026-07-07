// Meet Copilot — side panel
// Fluxo: aba ativa é um Meet? → POST /api/extension/start (cookies do domínio
// via host_permissions) → carrega o war room no iframe + inicia a captura.

const DEFAULT_APP_ORIGIN = 'https://meet.2020agency.co'

const el = {
  home: document.getElementById('home'),
  frame: document.getElementById('frame'),
  start: document.getElementById('btn-start'),
  stop: document.getElementById('btn-stop'),
  login: document.getElementById('btn-login'),
  status: document.getElementById('status'),
}

let appOrigin = DEFAULT_APP_ORIGIN

chrome.storage.local.get('appOrigin').then(({ appOrigin: saved }) => {
  if (saved) appOrigin = saved // override p/ dev: chrome.storage.local.set({appOrigin:'http://localhost:3000'})
})

function setStatus(msg) {
  el.status.textContent = msg ?? ''
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab
}

el.login.addEventListener('click', () => {
  chrome.tabs.create({ url: `${appOrigin}/login` })
})

el.start.addEventListener('click', async () => {
  setStatus('Conectando…')
  el.start.disabled = true
  el.login.classList.add('hidden')

  try {
    const tab = await activeTab()
    if (!tab?.url || !tab.url.includes('meet.google.com/')) {
      setStatus('Abra a aba da reunião do Google Meet e tente de novo.')
      el.start.disabled = false
      return
    }

    // Permissão do microfone precisa ser concedida AQUI (o offscreen não
    // consegue exibir o prompt — sem isso a sua voz não é transcrita).
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true })
      for (const t of mic.getTracks()) t.stop() // só queríamos a permissão
    } catch (e) {
      setStatus(
        'Preciso do seu microfone para transcrever a SUA voz. Clique no cadeado/ícone de permissões do painel e permita o microfone, depois tente de novo.',
      )
      el.start.disabled = false
      return
    }

    const res = await fetch(`${appOrigin}/api/extension/start`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ meetingUrl: tab.url.split('?')[0] }),
    })

    if (res.status === 401) {
      setStatus('Você precisa entrar na sua conta primeiro.')
      el.login.classList.remove('hidden')
      el.start.disabled = false
      return
    }

    const json = await res.json()
    if (!json.ok) {
      setStatus(json.error?.message ?? 'Não foi possível iniciar.')
      el.start.disabled = false
      return
    }

    const { ingestUrl, ingestToken, panelUrl } = json.data

    // A captura roda no service worker, que herda o activeTab do clique no ícone.
    const captura = await chrome.runtime.sendMessage({
      target: 'background',
      type: 'START_CAPTURE',
      tabId: tab.id,
      ingestUrl,
      ingestToken,
    })
    if (!captura?.ok) {
      const err = String(captura?.error ?? '')
      if (/invoked|activeTab|cannot be captured|autorizada/i.test(err)) {
        setStatus(
          'Para liberar o áudio: com a aba da chamada do Meet à frente, clique no ÍCONE do Meet Copilot na barra do Chrome (é isso que autoriza a aba) e clique em Iniciar de novo.',
        )
      } else {
        setStatus(`Falha ao iniciar a captura: ${err || 'desconhecida'}`)
      }
      el.start.disabled = false
      return
    }

    el.frame.src = panelUrl
    el.frame.style.display = 'block'
    el.home.classList.add('hidden')
    el.stop.classList.remove('hidden')
  } catch (e) {
    setStatus(`Erro: ${String(e)}`)
    el.start.disabled = false
  }
})

el.stop.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ target: 'background', type: 'STOP_CAPTURE' })
  el.frame.src = 'about:blank'
  el.frame.style.display = 'none'
  el.home.classList.remove('hidden')
  el.stop.classList.add('hidden')
  el.start.disabled = false
  setStatus('Copiloto encerrado.')
})
