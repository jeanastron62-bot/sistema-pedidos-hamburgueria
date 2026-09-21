# Sistema de Pedidos Trailer — Contexto de Estilo e Aparência

Documento separado do `CONTEXTO.md` técnico de propósito — este é sobre aparência, não sobre regra de negócio. Cobre o que já foi implementado (Fases 5-8) e a direção completa para a reformulação visual, que fica pra depois de todas as fases (seção 14 do contexto técnico).

**Origem:** parte deste sistema de cores/tipografia foi extraída e verificada — linha por linha, contra o código real — de um projeto de referência gerado no Google AI Studio. Não é o mesmo projeto que este (aquele tinha arquitetura antiga, rejeitada: Supabase Auth direto no frontend, preço em float, etc.) — só a aparência foi aproveitada, nunca a lógica.

---

## 1. Já implementado (não retrabalhar sem necessidade)

- **Paleta e fontes:** `tailwind.config.js` e `src/index.css` do frontend, aplicados globalmente.
- **`Login.tsx`:** redesenhado por completo — contas salvas com token real (não senha em texto puro), rótulos mono/maiúsculo, micro-interação no botão.
- **Componentes novos desde a Fase 8** (`KitchenOrderCard`, `DeliveryOrderCard`, `AvailabilityToggleModal`, etc.): já usam a escala numérica de 9 tons (`neutral-950` a `neutral-400`), não a semântica de 3 tons da Fase 5-7.
- **Componentes da Fase 5-7 não tocados** (`PublicHeader`, `MenuItemCard`, `CartDrawer`, `OrderCard`, etc.): ainda na escala semântica de 3 tons (`bg-bg`, `bg-bg-surface`, `bg-bg-elevated`). Funcionam, testados — só ficam visualmente "mais simples" que o resto até a reformulação completa unificar tudo.

## 2. Sistema de cor (nomeado, com o porquê de cada uma)

| Nome | Hex | Uso | Por quê |
|---|---|---|---|
| Carvão (base) | `#161618` | Fundo de tela | Preto de asfalto à noite, não preto puro |
| Carvão-superfície | `#1f1f22` | Fundo de card/painel | Um degrau acima do fundo, sem virar cinza genérico |
| Brasa (primária) | `#FF6B00` | Botão de ação, destaque | O calor da chapa — não é laranja de app, é laranja de fogo aceso |
| Mostarda (secundária) | `#F6E05E` | Destaque alternativo, sucesso/status positivo | Condimento — ketchup e mostarda são as cores reais do produto, não paleta de marca inventada |
| Vermelho-farol (delivery, **novo, não implementado ainda**) | `#E63946` | Exclusivo do painel do entregador | Luz de freio de moto à noite — dá identidade própria pra tela da rua, diferente do laranja da cozinha |
| Esmeralda | `#10B981` | Status positivo (disponível, entregue) | Já em uso via classes `emerald-400/600` do Tailwind |

## 3. Tipografia (já implementada)

- **Outfit** (display, títulos): peso extra-preto, condensado o bastante pra lembrar letreiro pintado à mão na lateral do trailer — não é só "uma segunda fonte pra variar".
- **Inter** (corpo, formulários): resolve de propósito a queixa original — maiúscula e minúscula precisam ser visualmente distintas em campo de usuário/senha, e Inter foi desenhada exatamente pra isso.
- **JetBrains Mono** (dados, rótulos, preço, número de pedido): dá textura de comanda/terminal operacional a números e identificadores — não é decoração, é o mesmo motivo de rótulos tipo `USUÁRIO`/`SENHA` no Login já usarem mono maiúsculo.

## 4. Convenções de componente (já em uso desde a Fase 8)

```
Card:              bg-neutral-900/50 border border-neutral-850 rounded-2xl p-5 hover:border-neutral-800
Botão primário:     bg-primary border border-primary/40 hover:bg-primary-hover text-white font-bold font-mono text-xs uppercase tracking-wider rounded-xl px-4 py-2.5
Botão secundário:   bg-neutral-850 border border-neutral-750 text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-xl px-4 py-2.5
Input:              bg-neutral-950 border border-neutral-800 focus:border-primary focus:ring-1 focus:ring-primary rounded-2xl text-white placeholder-neutral-600 text-sm font-medium px-4 py-3
Tabela:             wrapper overflow-x-auto border border-neutral-850 rounded-2xl; linhas border-b border-neutral-850/60 bg-neutral-900/20 hover:bg-neutral-900/50
Rótulo/badge:       font-mono uppercase tracking-wider
```

## 5. Explicitamente evitar (tell de site genérico gerado por IA)

Identificado e rejeitado de propósito durante o desenvolvimento — nunca reintroduzir:

- Blobs decorativos com `blur-3xl` atrás de conteúdo
- Overlays `bg-gradient-to-b from-primary/10 via-transparent`
- Sombras coloridas tipo `shadow-2xl shadow-primary/30`
- Qualquer coisa que pareça "polimento de SaaS genérico" em vez de decisão específica pra este produto

## 6. Direção para a reformulação completa (pós-fases) — ainda não implementada

O que existe hoje (cor + fonte + Login) é a base, não o produto final. A reformulação completa precisa ir além de "recolorir" — ancorada no universo real de um trailer de lanche noturno, não em estética de app genérico.

### Elemento-assinatura proposto: o cartão-comanda

Toda tela do sistema mostra pedido de alguma forma (card do garçom, da cozinha, do entregador). Hoje cada um é só "card arredondado". A proposta: todos compartilham um motivo visual de **comanda/ticket** — não literal (sem imagem de papel), mas estrutural:

- Separador tracejado (`border-dashed`) entre o cabeçalho do card (mesa/cliente) e o corpo (itens) — como a linha de destacar de um ticket
- Número do pedido sempre em `font-mono`, tratado como número de comanda (`Nº 0047`, não só `#47`)
- Borda superior levemente diferenciada (pode ser um traço mais grosso, cor de destaque) sugerindo a margem picotada de um bloco de comandas

Esse é o "um elemento memorável" da identidade visual — o resto do sistema fica disciplinado ao redor dele, sem competir com ele.

### Identidade por papel, dentro do mesmo sistema

- **Cozinha:** laranja-brasa como cor dominante — calor, urgência.
- **Entregador:** vermelho-farol como cor dominante, não laranja — sensação de rua, à noite, diferente da cozinha. Ainda não implementado (seção 2).
- **Garçom/ADM/TI:** neutro, laranja só como destaque pontual — são papéis de gestão, não de produção.

### Textura sutil (opcional, avaliar no momento da execução)

Padrão de fundo quase imperceptível inspirado em papel de embalar lanche (papel xadrez/manteiga) — muito sutil, baixa opacidade, só em áreas vazias grandes (tela de login, estado vazio de lista). Não é obrigatório; só incluir se não pesar no visual "leve" que o projeto exige.

### O que não muda, custe o que custar

- **Dark mode fixo.** Não existe tema claro neste produto — usado à noite, em ambiente de trailer, tablet com brilho de chapa por perto.
- **Sem foto de produto.** Regra de negócio, não só estilo (seção 10 do contexto técnico).
- **Áreas de toque generosas** — 48px mínimo geral, 56-72px em cozinha/entregador, papéis usados sob pressão ou com luva.
- **Leve.** Nenhuma decisão de estilo pode adicionar dependência pesada ou reintroduzir algo do que já foi cortado (glow, gradiente, blur) — beleza aqui é disciplina, não acúmulo de efeito.

---

## 7. Decisões confirmadas (não são mais perguntas em aberto)

1. **Vermelho-farol de moto (`#E63946`) aprovado** para uso exclusivo no painel do entregador — não usar em nenhum outro lugar do sistema.
2. **Textura de papel xadrez aprovada** — sutil, baixa opacidade, só em áreas vazias grandes (login, estados sem pedido). Não pode pesar no visual "leve".
3. Unificar a escala de 3 tons (Fase 5-7) com a de 9 tons (Fase 8+) acontece nesta reformulação — é o momento certo, não antes.
