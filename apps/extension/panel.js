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
  setup: document.getElementById('setup'),
  selBase: document.getElementById('sel-base'),
  selExpert: document.getElementById('sel-expert'),
}

let appOrigin = DEFAULT_APP_ORIGIN
// Engine da reunião ativa — o Encerrar avisa o servidor para liberar a sessão
// (sem isso a reunião ficava "in_call" para sempre e vazava memória no engine).
let activeEngine = null

chrome.storage.local.get('appOrigin').then(({ appOrigin: saved }) => {
  if (saved) appOrigin = saved // override p/ dev: chrome.storage.local.set({appOrigin:'http://localhost:3000'})
  void loadOptions()
})

// Pré-reunião: bases + clones para escolher o contexto (ou começar no escuro).
// Fail-soft: sem login/erro, os selects somem e o fluxo antigo continua valendo.
async function loadOptions() {
  try {
    const res = await fetch(`${appOrigin}/api/extension/bootstrap`, { credentials: 'include' })
    if (!res.ok) return
    const json = await res.json()
    if (!json.ok) return
    const { bases, experts, activeExpertId, defaultBaseId } = json.data

    el.selBase.innerHTML = ''
    for (const b of bases) {
      const opt = document.createElement('option')
      opt.value = b.id
      opt.textContent = b.is_default ? `${b.name} (padrão)` : b.name
      if (b.id === defaultBaseId) opt.selected = true
      el.selBase.appendChild(opt)
    }
    const dark = document.createElement('option')
    dark.value = ''
    dark.textContent = 'Começar no escuro (sem base)'
    el.selBase.appendChild(dark)

    el.selExpert.innerHTML = ''
    for (const e of experts) {
      const opt = document.createElement('option')
      opt.value = e.id
      opt.textContent = e.category ? `${e.name} — ${e.category}` : e.name
      if (e.id === activeExpertId) opt.selected = true
      el.selExpert.appendChild(opt)
    }

    if (bases.length > 0 || experts.length > 0) el.setup.classList.add('on')
  } catch {
    // sem rede/login — segue sem seletores
  }
}

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
    // usuário pode ter logado depois que o painel abriu — tenta carregar as opções
    if (!el.setup.classList.contains('on')) await loadOptions()

    const tab = await activeTab()
    if (!tab?.url || !tab.url.includes('meet.google.com/')) {
      setStatus('Abra a aba da reunião do Google Meet e tente de novo.')
      el.start.disabled = false
      return
    }

    // Microfone: a permissão é da ORIGEM DA EXTENSÃO (não do meet.google.com),
    // e o side panel não exibe o prompt — então checamos e, se faltar, abrimos
    // uma página da extensão em aba normal, onde o prompt funciona.
    let micOk = false
    try {
      const st = await navigator.permissions.query({ name: 'microphone' })
      micOk = st.state === 'granted'
    } catch {}
    if (!micOk) {
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true })
        for (const t of mic.getTracks()) t.stop()
        micOk = true
      } catch {}
    }
    if (!micOk) {
      chrome.tabs.create({ url: chrome.runtime.getURL('mic-permission.html') })
      setStatus(
        'Abri uma aba para você PERMITIR o microfone da extensão. Permita lá, volte à aba do Meet e clique em Iniciar de novo.',
      )
      el.start.disabled = false
      return
    }

    const payload = { meetingUrl: tab.url.split('?')[0] }
    if (el.setup.classList.contains('on')) {
      // '' = "no escuro" (null explícito) · uuid = base escolhida
      payload.contextBaseId = el.selBase.value === '' ? null : el.selBase.value
      if (el.selExpert.value) payload.expertId = el.selExpert.value
    }

    const res = await fetch(`${appOrigin}/api/extension/start`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
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
    activeEngine = { url: ingestUrl.replace(/\/ingest$/, ''), token: ingestToken }

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
  // avisa o engine para liberar a sessão e marcar a reunião como encerrada —
  // fail-soft: o stop local NUNCA depende da resposta do servidor
  if (activeEngine) {
    fetch(`${activeEngine.url}/end?token=${encodeURIComponent(activeEngine.token)}`, {
      method: 'POST',
    }).catch(() => {})
    activeEngine = null
  }
  await chrome.runtime.sendMessage({ target: 'background', type: 'STOP_CAPTURE' })
  el.frame.src = 'about:blank'
  el.frame.style.display = 'none'
  el.home.classList.remove('hidden')
  el.stop.classList.add('hidden')
  el.start.disabled = false
  setStatus('Copiloto encerrado.')
})
