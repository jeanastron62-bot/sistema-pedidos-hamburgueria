import type { ChatMessage, OpenAIChatCompletion } from './openaiClient';

// Fase 16 -- quantas vezes o modelo pode chamar função antes de ser obrigado a
// responder em texto. Três é folga pro caminho legítimo mais longo que existe
// hoje (consultar_pedido_ativo -> cancelar_pedido_ativo -> confirmar) sem
// deixar o modelo girar pra sempre gastando chamada de API.
export const MAX_TOOL_ROUNDS = 3;

// O modelo às vezes escreve os argumentos da função em `content` em vez de
// chamar a função de verdade -- foi assim que um cliente recebeu
// {"motivo":"BAIRRO_FORA_DA_LISTA","resumo":"..."} como mensagem no WhatsApp.
// Não dá pra distinguir isso de um JSON legítimo, e não precisa: o bot nunca
// tem motivo pra mandar JSON, bloco de código ou array pro cliente.
export function looksLikeJsonPayload(text: string): boolean {
  const t = text.trim();
  return t.startsWith('{') || t.startsWith('[') || t.startsWith('```');
}

type ParsedArgs =
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; erro: string };

// JSON.parse direto no arguments derrubava o turno inteiro quando o modelo
// mandava algo malformado: a exceção subia até o catch da receive() e o
// cliente recebia "problema técnico". Argumento ilegível é problema do
// modelo, e o jeito de resolver é contar isso PRA ELE -- que aí corrige e
// chama de novo -- não abortar a conversa.
function parseToolArgs(raw: string): ParsedArgs {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, erro: 'Os argumentos da função não puderam ser lidos (JSON inválido). Chame a função de novo com os argumentos corretos.' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, erro: 'Os argumentos da função precisam ser um objeto. Chame a função de novo.' };
  }
  return { ok: true, args: parsed as Record<string, unknown> };
}

export interface ToolLoopResult {
  replyText: string;
  // Toda função chamada em TODAS as rodadas, não só na primeira -- é por aqui
  // que o controller sabe se transferir_para_humano rolou, e ela pode ter
  // acontecido na segunda rodada.
  calledTools: string[];
  lastCompletion: OpenAIChatCompletion;
  // true = estourou MAX_TOOL_ROUNDS e o modelo AINDA queria chamar função.
  exhausted: boolean;
}

// Fase 16 -- o loop de tool calling tinha exatamente uma rodada: chamava as
// funções, mandava os resultados de volta e usava o `content` do que voltasse.
// Se essa segunda resposta viesse com tool_calls em vez de texto (o que o
// modelo faz o tempo todo depois de uma recusa -- ele tenta outra função), o
// content vinha null, o texto ficava vazio e o cliente recebia "Tive um
// problema técnico agora, já te retorno" sem que nada tivesse falhado.
// Determinístico: enquanto a intenção continuasse no histórico, toda mensagem
// seguinte repetia o mesmo erro.
export async function runToolLoop(params: {
  systemPrompt: string;
  history: ChatMessage[];
  callModel: (systemPrompt: string, messages: ChatMessage[]) => Promise<OpenAIChatCompletion>;
  dispatch: (name: string, args: Record<string, unknown>) => Promise<string>;
}): Promise<ToolLoopResult> {
  const { systemPrompt, history, callModel, dispatch } = params;

  const messages: ChatMessage[] = [...history];
  const calledTools: string[] = [];

  let completion = await callModel(systemPrompt, messages);
  let choice = completion.choices[0].message;
  let rounds = 0;

  while (choice.tool_calls?.length && rounds < MAX_TOOL_ROUNDS) {
    rounds += 1;

    // Todas as tool_calls da rodada, não só a primeira: o protocolo exige uma
    // mensagem role:'tool' por tool_call_id declarado, e faltar uma deixa o
    // turno seguinte sem como fechar em texto.
    const toolResults: ChatMessage[] = [];
    for (const call of choice.tool_calls) {
      calledTools.push(call.function.name);
      const parsed = parseToolArgs(call.function.arguments);
      const content = parsed.ok
        ? await dispatch(call.function.name, parsed.args)
        : JSON.stringify({ sucesso: false, erro: parsed.erro });
      toolResults.push({ role: 'tool', tool_call_id: call.id, content });
    }

    messages.push(
      { role: 'assistant', content: choice.content, tool_calls: choice.tool_calls },
      ...toolResults
    );

    completion = await callModel(systemPrompt, messages);
    choice = completion.choices[0].message;
  }

  return {
    replyText: choice.content ?? '',
    calledTools,
    lastCompletion: completion,
    exhausted: Boolean(choice.tool_calls?.length),
  };
}
