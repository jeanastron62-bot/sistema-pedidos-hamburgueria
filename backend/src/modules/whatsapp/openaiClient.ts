import { env } from '../../config/env';
import { TOOLS } from './tools';

export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface OpenAIChatCompletion {
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: OpenAIToolCall[];
    };
  }>;
}

// Mensagens simples (histórico persistido) e as duas mensagens extras que a
// segunda chamada precisa pra fechar o round-trip de tool call: o eco da
// decisão do modelo (role assistant + tool_calls) e o resultado da função
// (role tool, casado pelo tool_call_id). Ver whatsapp.controller.ts.
export type ChatMessage =
  | { role: 'user' | 'assistant'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls: OpenAIToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export async function callOpenAI(
  systemPrompt: string,
  history: ChatMessage[]
): Promise<OpenAIChatCompletion> {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY não configurado neste ambiente -- bot do WhatsApp indisponível.');
  }
  const body: Record<string, unknown> = {
    model: env.OPENAI_MODEL,
    messages: [{ role: 'system', content: systemPrompt }, ...history],
    tools: TOOLS,
  };

  // Modelo gpt-5 recusa com 400 o esforço de raciocínio padrão (que ele
  // aplica sozinho quando o parâmetro é omitido) combinado com function
  // tools -- por isso vai explicitamente zerado, e não removido.
  //
  // Condicionado ao modelo de propósito: modelos que não são de raciocínio
  // (o .env local roda gpt-4o-mini) rejeitam reasoning_effort com o mesmo
  // 400, ou seja, mandar sempre trocaria um erro pelo outro.
  if (env.OPENAI_MODEL?.startsWith('gpt-5')) {
    body.reasoning_effort = 'none';
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`OpenAI respondeu ${response.status}: ${await response.text()}`);
  }

  return response.json();
}
