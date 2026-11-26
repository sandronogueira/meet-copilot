import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PRIVACY_POLICY, formatPolicyDate, privacyPolicyMissing } from '@/lib/privacy'

// Política de privacidade do site e da extensão do Chrome.
//
// Cada afirmação desta página descreve o que o código faz hoje. Ao mudar o que é
// coletado, guardado ou enviado a terceiros, mude este texto e a data em
// lib/privacy.ts. Se a mudança for na extensão, suba também o CONSENT_VERSION em
// apps/extension/consent.js, para o aviso aparecer de novo.

export const metadata: Metadata = {
  title: 'Política de privacidade · Meet Copilot',
  description:
    'Quais dados o Meet Copilot coleta, para que usa, com quem compartilha e como pedir a exclusão.',
}

const LIMITED_USE_URL = 'https://developer.chrome.com/docs/webstore/program-policies/limited-use'

interface Processor {
  name: string
  receives: string
  purpose: string
}

// Serviços de outras empresas que recebem dados, conforme o código de hoje:
// stt/GroqWhisperProvider.ts, lib/llm-router.ts (motor), lib/supabase e o login com Google.
const PROCESSORS: Processor[] = [
  {
    name: 'Groq',
    receives:
      'Trechos de áudio da reunião. Trechos do texto da conversa e do seu contexto, quando o modelo de IA em uso é da Groq.',
    purpose: 'Transcrever o áudio e gerar sugestões.',
  },
  {
    name: 'Anthropic',
    receives: 'Trechos do texto da conversa e do seu contexto.',
    purpose: 'Gerar sugestões, checagens, relatório e proposta.',
  },
  {
    name: 'NVIDIA',
    receives: 'Trechos do texto da conversa e do seu contexto, quando o modelo de IA em uso é da NVIDIA.',
    purpose: 'Gerar sugestões.',
  },
  {
    name: 'Supabase',
    receives: 'Dados da conta, bases de conhecimento, transcrições e conteúdos gerados.',
    purpose: 'Banco de dados, login e guarda de arquivos.',
  },
  {
    name: 'Vercel',
    receives: 'Os acessos ao site.',
    purpose: 'Hospedagem do site.',
  },
  {
    name: 'Google',
    receives: 'Nome, e-mail e foto de perfil, se você entrar com o Google. Seu endereço IP, ao carregar as fontes de letra do site.',
    purpose: 'Login e fontes de letra.',
  },
]

export default function PrivacidadePage() {
  const missing = privacyPolicyMissing()
  // Política sem responsável, sem contato ou sem aprovação não vai ao ar (ver lib/privacy.ts).
  if (missing.length > 0 && process.env.NODE_ENV === 'production') notFound()
  const missingText = new Intl.ListFormat('pt-BR', { style: 'long', type: 'conjunction' }).format(missing)

  const controller = PRIVACY_POLICY.controllerName.trim()
  const email = PRIVACY_POLICY.contactEmail.trim()
  const contact = email ? <a href={`mailto:${email}`}>{email}</a> : <mark>e-mail a informar</mark>

  return (
    <main className="legal">
      <Link href="/" className="brand-mark">
        <span className="brand-dot" /> Meet Copilot
      </Link>

      {missing.length > 0 ? (
        <p className="legal-draft">
          Rascunho. Falta {missingText}. Enquanto isso, esta página não aparece no site publicado.
        </p>
      ) : null}

      <header>
        <p className="kicker">Privacidade</p>
        <h1 className="display">Política de privacidade</h1>
        <p>Última atualização: {formatPolicyDate(PRIVACY_POLICY.updatedAt)}</p>
        <p>
          Esta página explica quais dados o Meet Copilot coleta, para que usa, com quem compartilha
          e como você pede a exclusão. Ela vale para o site meet.2020agency.co e para a extensão
          Meet Copilot do Google Chrome.
        </p>
      </header>

      <section className="panel legal-summary">
        <h2>Em poucas palavras</h2>
        <ul>
          <li>
            A extensão só captura áudio depois que você autoriza e clica em Iniciar. Ela para
            quando você clica em Encerrar.
          </li>
          <li>
            O áudio serve para transcrever a conversa e não fica guardado. Ficam guardados o texto
            da conversa e o que o copiloto gera a partir dele.
          </li>
          <li>
            Não vendemos seus dados, não usamos seus dados para publicidade e não usamos
            ferramentas de rastreamento.
          </li>
          <li>Você pode pedir a exclusão dos seus dados quando quiser.</li>
        </ul>
      </section>

      <section>
        <h2>1. Quem responde pelos seus dados</h2>
        <p>
          O Meet Copilot é oferecido por{' '}
          {controller ? <strong>{controller}</strong> : <mark>nome a informar</mark>}, que decide
          como os dados descritos aqui são tratados. Para qualquer assunto de privacidade, escreva
          para {contact}.
        </p>
      </section>

      <section>
        <h2>2. Quais dados coletamos</h2>

        <h3>Dados da sua conta</h3>
        <p>
          Nome, e-mail e senha. A senha é guardada pelo serviço de login em formato protegido, que
          não permite a leitura. Se você entrar com o Google, recebemos do Google o seu nome, o seu
          e-mail e a sua foto de perfil.
        </p>

        <h3>O que você cadastra</h3>
        <p>
          O perfil do seu negócio, as bases de conhecimento (arquivos, endereços de sites e
          textos) e os clones que você criar. Se você preferir usar a sua própria conta de IA,
          guardamos também a sua chave da Anthropic, em formato cifrado.
        </p>

        <h3>Dados das reuniões, enviados pela extensão</h3>
        <ul>
          <li>
            O áudio da aba da reunião do Google Meet, com a voz dos participantes, e o áudio do seu
            microfone. A captura acontece só entre o clique em Iniciar e o clique em Encerrar, em
            trechos de cerca de 15 segundos, e só são enviados os trechos em que há fala.
          </li>
          <li>O endereço da reunião.</li>
          <li>
            A base de conhecimento e o clone que você escolher e o contexto que você digitar no
            painel.
          </li>
        </ul>

        <h3>O que o copiloto gera</h3>
        <p>
          A transcrição em texto, as sugestões de perguntas e respostas, as checagens de fatos, o
          relatório da reunião e a proposta comercial.
        </p>

        <h3>Dados técnicos</h3>
        <p>
          Cookies necessários para manter você conectado. Registros de uso do produto, como a
          quantidade de reuniões e o consumo de IA, para mostrar o seu consumo e aplicar os limites
          do plano. Registros técnicos dos servidores, como endereço IP, data e hora de acesso,
          mantidos pelos serviços de hospedagem.
        </p>
      </section>

      <section>
        <h2>3. O que a extensão do Chrome faz e o que não faz</h2>
        <ul>
          <li>
            Antes da primeira captura, a extensão mostra um aviso e só continua se você concordar.
          </li>
          <li>
            Captura apenas o áudio da aba em que você clicou no ícone do Meet Copilot e o áudio do
            seu microfone. Não captura vídeo, tela nem o conteúdo das páginas.
          </li>
          <li>
            Não acompanha a sua navegação. Ela só confere o endereço da aba aberta no momento em
            que você clica em Iniciar, para confirmar que é uma reunião do Google Meet.
          </li>
          <li>
            Guarda no seu navegador apenas a data em que você autorizou, a aba autorizada e a
            reunião em andamento. Os dados da reunião em andamento são apagados quando o Chrome é
            fechado.
          </li>
          <li>
            Ao instalar, o Chrome mostra o aviso "Ler e mudar seus dados em qualquer site". É o
            texto padrão do Chrome para qualquer extensão que captura o áudio de uma aba.
          </li>
          <li>
            Para retirar a autorização, abra o painel da extensão, clique em "Privacidade e
            autorização" e depois em "Retirar autorização". Você também pode remover a extensão do
            Chrome.
          </li>
        </ul>
      </section>

      <section>
        <h2>4. Para que usamos os dados</h2>
        <ul>
          <li>Transcrever a reunião e mostrar sugestões enquanto ela acontece.</li>
          <li>Gerar o relatório e a proposta depois da reunião.</li>
          <li>Manter a sua conta, o seu histórico e as suas bases de conhecimento.</li>
          <li>
            Manter o serviço funcionando e seguro, o que inclui encontrar falhas e impedir abuso.
          </li>
        </ul>
        <p>
          Tratamos esses dados para prestar o serviço que você contratou e, no caso da captura de
          áudio pela extensão, com a sua autorização. Não vendemos seus dados, não usamos seus
          dados para publicidade e não treinamos modelos de inteligência artificial com eles.
        </p>
      </section>

      <section>
        <h2>5. Com quem compartilhamos</h2>
        <p>
          Para funcionar, o Meet Copilot usa serviços de outras empresas. Cada um recebe apenas o
          necessário para a sua tarefa:
        </p>
        <div className="legal-table">
          <table>
            <thead>
              <tr>
                <th>Serviço</th>
                <th>O que recebe</th>
                <th>Para quê</th>
              </tr>
            </thead>
            <tbody>
              {PROCESSORS.map((p) => (
                <tr key={p.name}>
                  <td>{p.name}</td>
                  <td data-label="O que recebe">{p.receives}</td>
                  <td data-label="Para quê">{p.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ marginTop: '1rem' }}>
          O áudio e o texto passam por um servidor de aplicação nosso, em hospedagem contratada,
          que os encaminha a esses serviços. Se você cadastrar a sua própria chave da Anthropic, as
          chamadas de IA do seu espaço de trabalho usam a sua conta na Anthropic.
        </p>
        <p>
          Esses serviços podem guardar e processar dados fora do Brasil. Também podemos
          compartilhar dados quando a lei ou uma ordem de autoridade exigir.
        </p>
      </section>

      <section>
        <h2>6. Uso Limitado da Chrome Web Store</h2>
        <p>
          O uso das informações recebidas pela extensão Meet Copilot segue a{' '}
          <a href={LIMITED_USE_URL} target="_blank" rel="noreferrer">
            Política de Dados do Usuário da Chrome Web Store
          </a>
          , incluindo os requisitos de Uso Limitado. Na prática:
        </p>
        <ul>
          <li>
            Usamos os dados só para oferecer e melhorar a função da extensão, que é ser um copiloto
            de reuniões.
          </li>
          <li>
            Só repassamos dados a outras empresas quando é necessário para essa função, para
            cumprir a lei ou para proteger contra fraude e abuso.
          </li>
          <li>
            Não usamos nem repassamos dados para publicidade, para revendedores de dados nem para
            avaliação de crédito.
          </li>
          <li>
            Ninguém da nossa equipe lê as suas transcrições ou os seus conteúdos, a não ser que
            você autorize (por exemplo, em um atendimento de suporte), que seja necessário por
            segurança (por exemplo, para investigar abuso) ou que a lei exija.
          </li>
        </ul>
      </section>

      <section>
        <h2>7. Por quanto tempo guardamos</h2>
        <ul>
          <li>
            <strong>Áudio:</strong> não guardamos. Cada trecho é enviado para transcrição e
            descartado em seguida pelo nosso servidor.
          </li>
          <li>
            <strong>Transcrições, sugestões, relatórios e propostas:</strong> ficam na sua conta
            enquanto ela existir ou até você pedir a exclusão.
          </li>
          <li>
            <strong>Bases de conhecimento, clones e chave de IA:</strong> você mesmo apaga pelo
            site quando quiser.
          </li>
          <li>
            <strong>Conta:</strong> para encerrar a conta e apagar todos os dados, escreva para{' '}
            {contact}.
          </li>
        </ul>
      </section>

      <section>
        <h2>8. Seus direitos</h2>
        <p>A Lei Geral de Proteção de Dados (LGPD) garante a você o direito de:</p>
        <ul>
          <li>saber se tratamos dados seus e ter acesso a eles;</li>
          <li>corrigir dados incompletos ou errados;</li>
          <li>pedir a exclusão dos seus dados;</li>
          <li>pedir uma cópia dos seus dados para levar a outro serviço;</li>
          <li>saber com quem os seus dados foram compartilhados;</li>
          <li>retirar a autorização que você deu.</li>
        </ul>
        <p>
          Para exercer qualquer um deles, escreva para {contact}. Você também pode apresentar uma
          reclamação à Autoridade Nacional de Proteção de Dados (ANPD).
        </p>
      </section>

      <section>
        <h2>9. Outras pessoas na reunião</h2>
        <p>
          A transcrição inclui a fala das outras pessoas da reunião. Quem usa o Meet Copilot é
          responsável por avisar os participantes de que a conversa está sendo transcrita e por ter
          a concordância deles quando a lei exigir.
        </p>
        <p>
          Se você participou de uma reunião transcrita com o Meet Copilot e quer saber mais ou
          pedir a exclusão, fale com quem conduziu a reunião ou escreva para {contact}.
        </p>
      </section>

      <section>
        <h2>10. Segurança</h2>
        <ul>
          <li>Todo envio de dados usa conexão criptografada (HTTPS).</li>
          <li>Cada conta só enxerga os dados do seu próprio espaço de trabalho.</li>
          <li>A chave de IA que você cadastra fica guardada em formato cifrado.</li>
        </ul>
        <p>
          Nenhum sistema é totalmente seguro. Se acontecer um incidente que possa causar risco ou
          dano relevante a você, avisaremos você e a ANPD, como a lei determina.
        </p>
      </section>

      <section>
        <h2>11. Mudanças nesta política</h2>
        <p>
          Quando esta política mudar, atualizamos esta página e a data no topo. Se a mudança
          alterar o que a extensão coleta ou para que os dados são usados, a extensão pede a sua
          autorização de novo.
        </p>
      </section>

      <section lang="en">
        <h2>English summary</h2>
        <p>
          Meet Copilot is a real-time meeting assistant for Google Meet. It has a web app
          (meet.2020agency.co) and a Chrome extension.
        </p>
        <p>
          <strong>What the extension collects.</strong> After the user accepts the in-product
          notice and clicks Start, the extension captures the audio of the Google Meet tab and of
          the user's microphone until the user clicks End. Audio segments are sent over HTTPS to
          our server and to a speech-to-text provider (Groq). We do not store the audio. We store,
          in the user's account, the transcript text, the content generated from it (suggestions,
          fact checks, report and proposal), the meeting URL and the context typed by the user.
          Excerpts of the transcript are sent to AI providers (Anthropic, Groq or NVIDIA) to
          generate the suggestions. Data is stored with Supabase and the web app is hosted on
          Vercel.
        </p>
        <p>
          <strong>What we do not do.</strong> We do not sell user data, we do not use it for
          advertising or to determine creditworthiness, and we do not use it to train AI models.
          The extension does not track browsing activity and does not read page content.
        </p>
        <p>
          <strong>Limited Use.</strong> The use of information received from Google APIs will
          adhere to the{' '}
          <a href={LIMITED_USE_URL} target="_blank" rel="noreferrer">
            Chrome Web Store User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
        <p>
          <strong>Deletion and contact.</strong> Users can ask for access to or deletion of their
          data at any time by writing to {contact}.
        </p>
      </section>

      <footer>
        <Link href="/">Voltar para a página inicial</Link>
      </footer>
    </main>
  )
}
