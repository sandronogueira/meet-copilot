// Página dedicada para conceder o microfone à ORIGEM DA EXTENSÃO.
// (O prompt não aparece dentro do side panel — aqui, numa aba normal, aparece.)

const btn = document.getElementById('btn')
const status = document.getElementById('status')

async function ask() {
  status.textContent = ''
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    for (const t of stream.getTracks()) t.stop()
    status.textContent = 'Pronto! Pode fechar esta aba, voltar à reunião e clicar em Iniciar.'
    status.className = 'ok'
    btn.textContent = 'Permissão concedida'
    btn.disabled = true
  } catch (e) {
    status.textContent =
      'Permissão negada. Clique no ícone de microfone ou cadeado na barra de endereço, escolha Permitir e tente de novo.'
    status.className = 'err'
  }
}

btn.addEventListener('click', ask)
// tenta automaticamente ao abrir (alguns Chromes mostram o prompt direto)
ask()
