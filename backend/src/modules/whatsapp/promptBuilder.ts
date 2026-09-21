import { getConfig } from '../config/config.service';
import { listItems } from '../menu/menu.service';
import { listNeighborhoods } from '../neighborhoods/neighborhoods.service';
import { isDeliveryTimeBlocked } from '../../utils/deliveryWindow';
import { isEffectivelyOpen } from '../../utils/trailerSchedule';
import { SYSTEM_PROMPT_TEMPLATE } from './systemPromptTemplate';

// `now` é opcional e só existe pra permitir teste com horário simulado (ex.:
// verificar o comportamento do prompt/modelo depois das 18h sem esperar o
// relógio real chegar lá) -- mesmo padrão já usado em isEffectivelyOpen/
// isDeliveryTimeBlocked. Nenhum chamador de produção passa esse argumento;
// o webhook real (whatsapp.controller.ts) sempre usa o horário de verdade.
// deliveryGraceUntil vem da conversa (WhatsappConversation) -- é o que faz o
// bot ainda oferecer delivery entre 00:00 e 00:10 pra quem já estava falando
// antes da meia-noite. Sem isso o prompt diria "não" e o cliente perderia a
// tolerância que criar_pedido concederia, cada um respondendo uma coisa.
export async function buildSystemPrompt(
  now: Date = new Date(),
  deliveryGraceUntil: Date | null = null
): Promise<string> {
  const config = await getConfig();
  const rawMenu = await listItems(false);
  const rawNeighborhoods = (await listNeighborhoods()).filter((n: any) => n.active);

  // listItems/listNeighborhoods retornam o model Prisma inteiro (confirmado
  // na 14.0) -- inclui archived/createdAt/updatedAt, que não servem pro
  // modelo e só custam token à toa. Mapeie só o que o system prompt precisa,
  // e converta Decimal pra number explicitamente (Prisma.Decimal não
  // serializa como número puro num JSON.stringify direto).
  const menu = rawMenu.map((item: any) => ({
    name: item.name,
    category: item.category,
    price: Number(item.price),
    description: item.description,
    ingredients: item.ingredients,
    requiredChoice: item.requiredChoice,
    available: item.available,
  }));

  const neighborhoods = rawNeighborhoods.map((n: any) => ({
    name: n.name,
    deliveryFee: Number(n.deliveryFee),
  }));

  // replaceAll, não replace -- {{CONTATO_TELEFONE}} aparece duas vezes no
  // template (seções "Estado agora" e "Cancelamento"); replace() trocaria só
  // a primeira e deixaria a segunda literal na resposta final.
  return SYSTEM_PROMPT_TEMPLATE
    .replaceAll('{{TRAILER_ABERTO}}', isEffectivelyOpen(config, now) ? 'aberto' : 'fechado')
    .replaceAll('{{HORA_ATUAL}}', now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))
    .replaceAll('{{DELIVERY_AINDA_PERMITIDO}}', config.deliveryActive && !isDeliveryTimeBlocked(config, now, deliveryGraceUntil) ? 'sim' : 'não')
    .replaceAll('{{CONTATO_TELEFONE}}', config.contactPhone ?? '')
    .replaceAll('{{AVISO_DO_DIA}}', config.dailyNotice ?? '')
    .replaceAll('{{CARDAPIO_JSON}}', JSON.stringify(menu))
    .replaceAll('{{BAIRROS_JSON}}', JSON.stringify(neighborhoods));
}
