// Aviso sonoro de pedido novo pros painéis de garçom e cozinha.
//
// Sem arquivo de áudio: o beep é sintetizado com Web Audio (oscilador +
// envelope), então não há asset pra carregar nem cache pra falhar. O que
// existe de verdade é a política de autoplay do navegador: som só toca depois
// de um gesto do usuário na página. Por isso o AudioContext é criado/resumido
// em unlockAudioOnGesture() -- chamado num pointerdown/keydown qualquer do
// painel (PanelLayout) -- e playNewOrderAlert() só toca se ele estiver
// "running". Antes do primeiro toque na tela, o aviso é silencioso, sem erro.

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

// Chamar dentro de um handler de gesto do usuário (pointerdown/keydown).
// Idempotente: depois do primeiro resume bem-sucedido não custa nada.
export function unlockAudioOnGesture(): void {
  const c = getContext();
  if (!c) return;
  if (c.state !== 'running') c.resume().catch(() => {});
}

export function isAudioUnlocked(): boolean {
  return ctx?.state === 'running';
}

function beep(c: AudioContext, at: number, freq: number, durationSec: number): void {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.5, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + durationSec);
  osc.connect(gain).connect(c.destination);
  osc.start(at);
  osc.stop(at + durationSec + 0.02);
}

// Três toques ascendentes, ~0,6s no total -- alto o suficiente pra cozinha,
// curto o suficiente pra não virar irritação com dez pedidos seguidos.
export function playNewOrderAlert(): boolean {
  const c = getContext();
  if (!c || c.state !== 'running') return false;
  const t = c.currentTime;
  beep(c, t, 880, 0.14);
  beep(c, t + 0.2, 1100, 0.14);
  beep(c, t + 0.4, 1320, 0.2);
  // Celular no bolso do garçom: vibração ajuda onde o som não chega.
  try { navigator.vibrate?.([150, 80, 150]); } catch { /* sem suporte */ }
  return true;
}
