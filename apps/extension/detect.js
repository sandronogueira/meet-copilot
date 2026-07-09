// Content script que roda em meet.2020agency.co: anuncia à web app que a
// extensão ESTÁ instalada, para o dashboard trocar o convite de instalação
// por uma confirmação. Roda em document_start — o atributo já está no <html>
// antes do React montar. Também dispara um evento, caso a extensão carregue
// depois da página.
const VERSION = chrome.runtime.getManifest().version
try {
  document.documentElement.setAttribute('data-meet-copilot', VERSION)
  window.dispatchEvent(new CustomEvent('meet-copilot-present', { detail: { version: VERSION } }))
} catch {
  // fail-soft: nunca quebrar a página do app por causa da detecção
}
