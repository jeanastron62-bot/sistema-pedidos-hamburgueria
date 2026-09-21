import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { createLog } from '../../utils/logger';
import { encryptToken } from '../../utils/tokenCrypto';
import { JwtPayload } from '../../middleware/auth';
import { ConnectWhatsappInput } from './whatsapp.schema';

// FASE 15.3 -- NÃO TESTADO AO VIVO, e não dá pra testar: o `code` do Embedded
// Signup é de uso único e só existe num fluxo real, com a dona e o celular do
// trailer presentes. O que está provado por execução é o comportamento de
// erro (ver docs/verificacoes/2026-08-27-fase-15.3-onboarding-exchange.txt).
// O caminho feliz só será exercido na operação de conexão de verdade.
const GRAPH_VERSION = 'v21.0';

// Evento de sucesso da VARIANTE de coexistência (não o FINISH padrão do
// Embedded Signup). É por ele que se sabe que o fluxo que rodou foi o de
// número que já tem o app WhatsApp Business instalado.
const COEXISTENCE_FINISH_EVENT = 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING';

// Descrição de erro do Graph SEM o corpo da resposta. O corpo pode ecoar o que
// foi enviado -- e o que é enviado na troca inclui client_secret e code. Só
// status e os campos de erro que a Meta documenta saem daqui, e é isto que vai
// tanto pro log quanto pra resposta ao painel.
function describeGraphError(status: number, result: any): string {
  const err = result?.error ?? {};
  const partes: string[] = [`HTTP ${status}`];
  if (err.type) partes.push(String(err.type));
  if (err.code !== undefined) partes.push(`code=${err.code}`);
  if (err.error_subcode !== undefined) partes.push(`subcode=${err.error_subcode}`);
  if (err.message) partes.push(String(err.message));
  return partes.join(' | ');
}

async function readJson(response: Response): Promise<any> {
  // Erro de gateway/proxy volta em HTML, não JSON -- .json() lançaria e a
  // exceção real (o status) se perderia atrás de um SyntaxError.
  return response.json().catch(() => ({}));
}

// META_APP_ID/META_APP_SECRET garantidos presentes aqui -- único chamador
// (connectBusinessAccount) valida antes de chegar neste ponto.
async function exchangeCodeForToken(code: string): Promise<string> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`);
  url.searchParams.set('client_id', env.META_APP_ID!);
  url.searchParams.set('client_secret', env.META_APP_SECRET!);
  url.searchParams.set('code', code);

  // url.toString() carrega client_secret e code: nunca logar, nunca devolver.
  const response = await fetch(url.toString());
  const result = await readJson(response);
  if (!response.ok || !result.access_token) {
    const detalhe = describeGraphError(response.status, result);
    console.error('[WHATSAPP_ONBOARDING_EXCHANGE_FAILED]', { graph: detalhe });
    throw { status: 502, message: `Falha ao trocar o código por token no Graph API (${detalhe}).` };
  }
  return result.access_token as string;
}

async function fetchWabaPhoneNumber(wabaId: string, accessToken: string, expectedPhoneNumberId?: string) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/phone_numbers`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const result = await readJson(response);
  if (!response.ok || !result.data?.length) {
    const detalhe = describeGraphError(response.status, result);
    console.error('[WHATSAPP_ONBOARDING_PHONE_LOOKUP_FAILED]', { wabaId, graph: detalhe });
    throw { status: 502, message: `Falha ao buscar números da WABA ${wabaId} (${detalhe}).` };
  }

  // Uma WABA pode ter mais de um número -- é o caso concreto aqui: o número de
  // teste da Meta já vive nesta WABA, e o do trailer entra ao lado dele.
  // Pegar result.data[0] é escolher por ordem de listagem: se o de teste vier
  // primeiro, o bot passa a responder pelo número errado EM SILÊNCIO.
  const numbers: Array<{ id?: string }> = result.data;
  let phone: any;
  if (expectedPhoneNumberId) {
    // O id vem do sessionInfo (frontend), mas não é acreditado: só serve pra
    // escolher dentro da lista que a API devolveu com o token recém-trocado.
    phone = numbers.find((n) => n.id === expectedPhoneNumberId);
    if (!phone) {
      throw {
        status: 502,
        message: `O Embedded Signup informou o número ${expectedPhoneNumberId}, que não está na WABA ${wabaId}. Conexão abortada -- conectar outro número faria o bot responder pelo número errado.`,
      };
    }
  } else if (numbers.length === 1) {
    phone = numbers[0];
  } else {
    throw {
      status: 409,
      message: `A WABA ${wabaId} tem ${numbers.length} números e o fluxo de conexão não informou qual foi conectado. Conexão abortada de propósito: escolher por ordem de listagem arrisca ligar o bot ao número de teste.`,
    };
  }

  return {
    phoneNumberId: phone.id as string,
    displayPhoneNumber: (phone.display_phone_number as string | undefined) ?? null,
    verifiedName: (phone.verified_name as string | undefined) ?? null,
  };
}

// Confirmação da coexistência NA FONTE. O nome do evento de sessão diz qual
// fluxo o popup rodou; isto diz o que a Meta de fato registrou do outro lado.
// Os dois podem divergir -- e quando divergem, é sinal de que a conexão não
// ficou de pé, que é exatamente o que ninguém quer descobrir depois, com o
// bot no ar e o celular da dona já mexido.
async function fetchPhoneNumberStatus(phoneNumberId: string, accessToken: string) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}?fields=is_on_biz_app,platform_type`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const result = await readJson(response);
  if (!response.ok) {
    const detalhe = describeGraphError(response.status, result);
    console.error('[WHATSAPP_ONBOARDING_STATUS_FAILED]', { phoneNumberId, graph: detalhe });
    throw { status: 502, message: `Falha ao confirmar o status do número ${phoneNumberId} (${detalhe}).` };
  }
  // null != false: null é "a Meta não devolveu o campo", false é "a Meta disse
  // que não". Achatar os dois em false esconderia um campo que sumiu da API.
  return {
    isOnBizApp: typeof result.is_on_biz_app === 'boolean' ? (result.is_on_biz_app as boolean) : null,
    platformType: typeof result.platform_type === 'string' ? (result.platform_type as string) : null,
  };
}

async function subscribeAppToWaba(wabaId: string, accessToken: string): Promise<void> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/subscribed_apps`;
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    const detalhe = describeGraphError(response.status, await readJson(response));
    console.error('[WHATSAPP_ONBOARDING_SUBSCRIBE_FAILED]', { wabaId, graph: detalhe });
    throw { status: 502, message: `Falha ao assinar os webhooks da WABA ${wabaId} (${detalhe}).` };
  }
}

export async function connectBusinessAccount(input: ConnectWhatsappInput, user: JwtPayload) {
  // Opcionais no envSchema de propósito (ver env.ts) -- checados aqui, no
  // único ponto de entrada desta funcionalidade, não no boot do servidor.
  if (!env.META_APP_ID || !env.META_APP_SECRET || !env.WHATSAPP_TOKEN_ENCRYPTION_KEY) {
    throw {
      status: 501,
      message:
        'Conexão de WhatsApp ainda não configurada neste ambiente (faltam META_APP_ID / META_APP_SECRET / WHATSAPP_TOKEN_ENCRYPTION_KEY).',
    };
  }

  const { code, wabaId } = input;
  const isCoexistence = input.sessionInfo?.event === COEXISTENCE_FINISH_EVENT;

  // O token de negócio nasce e morre dentro desta função na forma legível:
  // cifrado antes de encostar no banco (tokenCrypto, AES-256-GCM), nunca
  // devolvido ao painel, nunca logado, nem dentro de objeto de erro.
  const accessToken = await exchangeCodeForToken(code);

  // Nunca confiar no phoneNumberId/nome que o FRONTEND alega -- busca de
  // verdade na API, usando o token recém-trocado, que só tem acesso ao que
  // foi de fato concedido nesta conexão.
  const { phoneNumberId, displayPhoneNumber, verifiedName } = await fetchWabaPhoneNumber(
    wabaId,
    accessToken,
    input.sessionInfo?.data?.phone_number_id
  );
  const { isOnBizApp, platformType } = await fetchPhoneNumberStatus(phoneNumberId, accessToken);

  const account = await prisma.whatsappBusinessAccount.upsert({
    where: { wabaId },
    update: {
      phoneNumberId,
      displayPhoneNumber,
      verifiedName,
      accessToken: encryptToken(accessToken),
      isCoexistence,
      isOnBizApp,
      platformType,
      active: true,
      connectedByName: user.username,
    },
    create: {
      wabaId,
      phoneNumberId,
      displayPhoneNumber,
      verifiedName,
      accessToken: encryptToken(accessToken),
      isCoexistence,
      isOnBizApp,
      platformType,
      connectedByName: user.username,
    },
  });

  // Assinatura de webhook DEPOIS de gravar, de propósito -- e é o único passo
  // nesta ordem. O `code` já foi consumido a esta altura e não volta: se a
  // assinatura falhasse antes da gravação, o token válido iria junto pro lixo
  // e o Embedded Signup teria que ser refeito do zero, com a dona e o celular
  // do trailer de novo. Gravado, a assinatura é uma chamada idempotente que
  // pode ser repetida com o token que já está salvo.
  await subscribeAppToWaba(wabaId, accessToken);

  await createLog(prisma, {
    userId: user.userId,
    username: user.username,
    action: 'WHATSAPP_ONBOARDED',
    details: { wabaId, phoneNumberId, isOnBizApp, platformType, isCoexistence, role: user.role },
  });

  // Allowlist explícita, não "tudo menos o token": campo novo no model não
  // vaza por esquecimento. displayPhone e phoneNumberId são o que a tela
  // precisa mostrar -- o phoneNumberId é o valor colado no Railway logo em
  // seguida, e ir buscá-lo no Postgres no meio da operação não é opção.
  return {
    id: account.id,
    wabaId: account.wabaId,
    phoneNumberId: account.phoneNumberId,
    displayPhone: account.displayPhoneNumber,
    verifiedName: account.verifiedName,
    isOnBizApp: account.isOnBizApp,
    platformType: account.platformType,
    isCoexistence: account.isCoexistence,
    active: account.active,
  };
}

export async function getActiveBusinessAccount() {
  const account = await prisma.whatsappBusinessAccount.findFirst({ where: { active: true } });
  if (!account) return null;
  return {
    id: account.id,
    wabaId: account.wabaId,
    phoneNumberId: account.phoneNumberId,
    displayPhone: account.displayPhoneNumber,
    verifiedName: account.verifiedName,
    isOnBizApp: account.isOnBizApp,
    platformType: account.platformType,
    isCoexistence: account.isCoexistence,
    active: account.active,
  };
}

export async function disconnectBusinessAccount(id: number, user: JwtPayload) {
  const account = await prisma.whatsappBusinessAccount.update({
    where: { id },
    data: { active: false },
  });

  await createLog(prisma, {
    userId: user.userId,
    username: user.username,
    action: 'WHATSAPP_WABA_DISCONNECTED',
    details: { wabaId: account.wabaId, role: user.role },
  });

  return {
    id: account.id,
    wabaId: account.wabaId,
    phoneNumberId: account.phoneNumberId,
    displayPhone: account.displayPhoneNumber,
    verifiedName: account.verifiedName,
    isOnBizApp: account.isOnBizApp,
    platformType: account.platformType,
    isCoexistence: account.isCoexistence,
    active: account.active,
  };
}
