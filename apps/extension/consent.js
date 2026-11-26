// Meet Copilot: autorização do usuário para a captura de áudio.
//
// Fonte única, carregada pelo painel (panel.html) e pelo service worker (background.js).
// A Chrome Web Store exige mostrar o que é coletado e para quê, e obter o aceite do
// usuário, antes de coletar. O aviso que o usuário lê está em panel.html (#consent).
//
// A autorização fica em chrome.storage.local, na chave "consent":
//   { version: 1, acceptedAt: "2026-11-26T12:00:00.000Z" }

// Suba este número sempre que o aviso mudar o que é coletado, para onde vai ou para
// que serve. Quem já aceitou a versão anterior verá o aviso de novo.
const CONSENT_VERSION = 1
const CONSENT_KEY = 'consent'

const mcConsent = {
  VERSION: CONSENT_VERSION,

  /** Devolve a autorização válida para a versão atual do aviso, ou null. */
  async read() {
    const stored = await chrome.storage.local.get(CONSENT_KEY)
    const consent = stored[CONSENT_KEY]
    return consent && consent.version === CONSENT_VERSION ? consent : null
  },

  /** Registra o aceite. Chamar só a partir do clique do usuário no botão de aceite. */
  async grant() {
    const consent = { version: CONSENT_VERSION, acceptedAt: new Date().toISOString() }
    await chrome.storage.local.set({ [CONSENT_KEY]: consent })
    return consent
  },

  /** Retira a autorização. A próxima captura só começa depois de um novo aceite. */
  async revoke() {
    await chrome.storage.local.remove(CONSENT_KEY)
  },
}
