// Copiado literalmente de docs/BOT-WHATSAPP-PROMPT.md, seção 2 --
// não alterar nenhum schema. strict:true exige additionalProperties:false e
// todo campo do properties listado em required (opcional = anyOf com null,
// continua "required"). Nenhuma keyword de validação de valor (minimum,
// pattern etc.) -- não é reforçada pelo modelo e pode rejeitar a requisição.
export const TOOLS = [
  {
    "type": "function",
    "function": {
      "name": "criar_pedido",
      "description": "Cria um pedido confirmado no Sistema de Pedidos Trailer. Só chamar depois que o cliente confirmou explicitamente o resumo completo do pedido.",
      "strict": true,
      "parameters": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "tipo": { "type": "string", "enum": ["RETIRADA", "DELIVERY"] },
          "nome_cliente": {
            "type": "string",
            "description": "Nome pra chamar na retirada ou identificar na entrega"
          },
          "bairro": {
            "anyOf": [{ "type": "string" }, { "type": "null" }],
            "description": "Nome exato do bairro, obrigatório (não-null) se tipo=DELIVERY. null se tipo=RETIRADA."
          },
          "endereco": {
            "anyOf": [{ "type": "string" }, { "type": "null" }],
            "description": "Endereço completo, obrigatório (não-null) se tipo=DELIVERY. null se tipo=RETIRADA."
          },
          "itens": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "nome_item": { "type": "string", "description": "Nome exato do item no cardápio fornecido" },
                "quantidade": {
                  "type": "integer",
                  "description": "Número inteiro positivo. O servidor sempre revalida — nunca confie cegamente neste valor."
                },
                "escolha_obrigatoria": {
                  "anyOf": [{ "type": "string" }, { "type": "null" }],
                  "description": "Preencher só se o item tiver requiredChoice no cardápio (ex: sabor de queijo, tipo de molho). null se o item não exigir escolha."
                },
                "adicionais": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "properties": {
                      "nome_adicional": { "type": "string" },
                      "quantidade": { "type": "integer" }
                    },
                    "required": ["nome_adicional", "quantidade"]
                  }
                },
                "observacoes": { "anyOf": [{ "type": "string" }, { "type": "null" }] }
              },
              "required": ["nome_item", "quantidade", "escolha_obrigatoria", "adicionais", "observacoes"]
            }
          },
          "forma_pagamento": { "type": "string", "enum": ["DINHEIRO", "PIX", "CREDITO", "DEBITO"] },
          "valor_pago_dinheiro": {
            "anyOf": [{ "type": "number" }, { "type": "null" }],
            "description": "Obrigatório (não-null) só se forma_pagamento=DINHEIRO. É a nota que o cliente vai entregar, não o troco em si."
          },
          "bairro_confirmado_pelo_cliente": {
            "anyOf": [{ "type": "boolean" }, { "type": "null" }],
            "description": "true só se esta função já retornou erro de divergência de bairro/endereço nesta conversa e o cliente confirmou de novo o bairro que já tinha informado. null na primeira tentativa. Nunca chamar de novo com true sem o cliente ter confirmado explicitamente."
          },
          "cliente_confirmou_resumo": {
            "type": "boolean",
            "description": "true SÓ se você já mostrou o resumo completo (itens, acréscimos, taxa e total) numa mensagem anterior e o cliente respondeu confirmando (sim, pode fechar, confirmo). false em qualquer outro caso. O backend recusa a criação quando é false."
          }
        },
        "required": ["tipo", "nome_cliente", "bairro", "endereco", "itens", "forma_pagamento", "valor_pago_dinheiro", "bairro_confirmado_pelo_cliente", "cliente_confirmou_resumo"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "consultar_pedido_ativo",
      "description": "Consulta o(s) pedido(s) em aberto do cliente atual. Pode retornar mais de um pedido — ver seção 2.1.",
      "strict": true,
      "parameters": { "type": "object", "additionalProperties": false, "properties": {}, "required": [] }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "transferir_para_humano",
      "description": "Passa a conversa para um atendente humano e SILENCIA o bot. Chamar SÓ nos quatro casos do enum de motivo. NÃO chamar pra pergunta fora do assunto (curiosidade, papo genérico) nem por falta de informação do cliente (bairro/endereço/item que ele ainda não disse) -- nesses casos pergunte ou desvie e continue o atendimento. Depois de chamar, não responda mais nada nesta conversa.",
      "strict": true,
      "parameters": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "motivo": {
            "type": "string",
            "description": "BAIRRO_FORA_DA_LISTA: o cliente informou um bairro que não está na lista atendida (não use quando ele apenas ainda não disse o bairro -- nesse caso pergunte). PEDIDO_AGENDADO: cliente quer agendar. RECLAMACAO: reclamação ou problema com pedido já feito. CLIENTE_PEDIU_ATENDENTE: o cliente pediu explicitamente para falar com uma pessoa.",
            "enum": ["BAIRRO_FORA_DA_LISTA", "PEDIDO_AGENDADO", "RECLAMACAO", "CLIENTE_PEDIU_ATENDENTE"]
          },
          "resumo": {
            "type": "string",
            "description": "Uma frase pro atendente entender o contexto sem ler a conversa toda."
          }
        },
        "required": ["motivo", "resumo"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "cancelar_pedido_ativo",
      "description": "Cancela um pedido específico do cliente atual, identificado por número. Só é aceito pelo backend se o pedido ainda estiver aguardando preparo — a checagem é atômica (ver seção 2.1).",
      "strict": true,
      "parameters": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "numero_pedido": { "type": "integer", "description": "Obtido via consultar_pedido_ativo antes de cancelar." },
          "motivo": { "type": "string" }
        },
        "required": ["numero_pedido", "motivo"]
      }
    }
  }
];
