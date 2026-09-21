import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(10),
  JWT_EXPIRES_IN: z.string().default('10h'),
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  TZ: z.string().default('America/Sao_Paulo'),
  // TUDO do bot de WhatsApp/OpenAI abaixo é OPCIONAL de propósito.
  //
  // Regra que vale pra este bloco inteiro: o bot ainda não está no ar, e uma
  // funcionalidade não-lançada NUNCA pode derrubar o cardápio público e os
  // pedidos, que é o que paga a conta. Exigir essas variáveis no boot foi o
  // que tirou a produção do ar (Railway: "Application failed to respond") --
  // o processo se recusava a subir inteiro por falta de credencial de uma
  // parte do sistema que ninguém tinha ligado ainda.
  //
  // Cada uma é checada no seu ponto de uso real, com erro claro:
  //   META_APP_SECRET      -> whatsapp.service.ts (isValidSignature)
  //   META_VERIFY_TOKEN    -> whatsapp.controller.ts (verify)
  //   OPENAI_API_KEY       -> openaiClient.ts (callOpenAI)
  //   META_ACCESS_TOKEN /
  //   META_PHONE_NUMBER_ID -> sendMessage.ts (resolveSendCredentials)
  //   META_APP_ID /
  //   WHATSAPP_TOKEN_ENCRYPTION_KEY -> embeddedSignup.service.ts, tokenCrypto.ts
  //
  // Ao ligar o bot em produção, preencher todas no Railway -- a ausência
  // deixa de ser silenciosa no primeiro webhook que chegar.
  META_APP_SECRET: z.string().min(10).optional(),
  META_VERIFY_TOKEN: z.string().min(6).optional(),
  OPENAI_API_KEY: z.string().min(10).optional(),
  OPENAI_MODEL: z.string().default('gpt-5.1-mini'),
  // Base da Graph API. O padrão é a produção; existe como variável só pra
  // permitir apontar pra um stub local e provar o caminho de envio ponta a
  // ponta sem chamar a Meta (Fase 17.2). Nunca setar em produção.
  META_GRAPH_BASE_URL: z.string().url().default('https://graph.facebook.com/v21.0'),
  META_ACCESS_TOKEN: z.string().min(10).optional(),
  META_PHONE_NUMBER_ID: z.string().min(5).optional(),
  // Fase 15 -- Embedded Signup (Tech Provider). Mesma regra do bloco acima.
  META_APP_ID: z.string().min(5).optional(),
  WHATSAPP_TOKEN_ENCRYPTION_KEY: z.string().min(40).optional()
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Configuração de ambiente inválida:', _env.error.format());
  process.exit(1);
}

export const env = _env.data;

process.env.TZ = env.TZ;
