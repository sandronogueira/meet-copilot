/**
 * Sem travessão em texto gerado pela IA.
 *
 * Travessão é vício de escrita de modelo de linguagem e entrega que o texto
 * veio de IA. Regra do produto: não aparece em texto nenhum. Duas camadas:
 *  1. REGRA_SEM_TRAVESSAO entra nos prompts (o modelo já escreve sem).
 *  2. semTravessao() limpa a saída de forma determinística (garantia, porque
 *     instrução de estilo o modelo às vezes ignora).
 *
 * Os caracteres aparecem só como \u2014 (travessão) e \u2013 (meia-risca) para
 * este arquivo também ficar limpo.
 */

export const REGRA_SEM_TRAVESSAO =
  'Estilo de escrita: nunca use travessão nem meia-risca em nenhum texto. Use vírgula, dois-pontos ou ponto final.'

/** Troca travessões por pontuação comum, sem deixar vírgula sobrando. */
export function semTravessao(text: string): string {
  return (
    text
      // faixa numérica: "10\u201320" vira "10 a 20"
      .replace(/(\d)\s*[\u2014\u2013]\s*(\d)/g, '$1 a $2')
      // travessão abrindo a linha (marcador de lista ou de fala): some
      .replace(/^[ \t]*[\u2014\u2013][ \t]*/gm, '')
      // travessão fechando a linha: some
      .replace(/[ \t]*[\u2014\u2013][ \t]*$/gm, '')
      // no meio da frase: vira vírgula, a não ser que já haja pontuação colada
      .replace(
        /([,;:.!?])?\s*[\u2014\u2013]\s*([.!?;:,])?/g,
        (_match, antes: string | undefined, depois: string | undefined) =>
          antes ? `${antes} ` : (depois ?? ', '),
      )
  )
}

/** Aplica semTravessao em todo texto de um objeto (listas e objetos aninhados). */
export function semTravessaoEmTudo<T>(value: T): T {
  if (typeof value === 'string') return semTravessao(value) as T
  if (Array.isArray(value)) return value.map((item) => semTravessaoEmTudo(item)) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, semTravessaoEmTudo(item)]),
    ) as T
  }
  return value
}
