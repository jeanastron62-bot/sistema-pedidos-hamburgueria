// Normaliza telefone brasileiro pra um formato único, comparável entre os dois
// canais que gravam Order.customerPhone: o site (CheckoutForm/OrderWizard,
// sem DDI, às vezes sem o 9º dígito do celular -- número antigo digitado à
// mão) e o bot do WhatsApp (wa_id do Meta, sempre com DDI 55). Sem isso,
// "5531999998888" (bot) e "(31) 99999-8888" (site) nunca batem numa
// comparação de string, mesmo sendo o mesmo número.
//
// Formato de saída: DDD (2 dígitos) + assinante (9 dígitos) = 11 dígitos,
// sem DDI, só números. Mantém o DDD (não usa só sufixo) pra não colidir
// números de cidades diferentes. Reconstrutível pro formato do wa_id só
// prefixando "55" -- importante pro dia de mandar mensagem (ex.: aviso de
// "pedido pronto") a partir de Order.customerPhone, não só de dentro de uma
// conversa do bot.
//
// Mesma função usada na gravação (orders.service.ts, createOrder) e na
// consulta (findActiveOrdersByPhone, cancelActiveOrderByCustomer) -- nunca
// compara um lado normalizado com o outro cru.
export function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, '');

  if (digits.length > 11 && digits.startsWith('55')) {
    digits = digits.slice(2);
  }

  if (digits.length === 10) {
    // DDD + 8 dígitos: celular sem o 9º dígito (formato antigo, comum em
    // número digitado à mão no site). Insere o 9 pra bater com o wa_id.
    digits = digits.slice(0, 2) + '9' + digits.slice(2);
  }

  return digits;
}
