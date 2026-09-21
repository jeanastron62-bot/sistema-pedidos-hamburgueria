import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import type { SystemConfig } from '../../types';

// Quantas horas de vida um aviso tem antes de virar suspeito. Aviso velho é
// pior que aviso nenhum: o bot avisaria que faltou alface num dia em que tem
// alface, e o cliente descobre a diferença só na entrega.
const AVISO_VELHO_HORAS = 14;

function descreveIdade(iso: string): { texto: string; velho: boolean } {
  const atualizado = new Date(iso);
  const horas = (Date.now() - atualizado.getTime()) / 3_600_000;
  const hora = atualizado.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (horas < 1) return { texto: 'atualizado agora há pouco', velho: false };
  if (horas < AVISO_VELHO_HORAS) return { texto: `atualizado hoje às ${hora}`, velho: false };
  const dias = Math.floor(horas / 24);
  if (dias < 1) return { texto: `atualizado às ${hora} — já faz ${Math.floor(horas)}h`, velho: true };
  return { texto: `atualizado há ${dias} dia${dias > 1 ? 's' : ''} — provavelmente desatualizado`, velho: true };
}

export function DailyNoticeEditor() {
  const [texto, setTexto] = useState('');
  const [salvoEm, setSalvoEm] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    setErro(null);
    try {
      const { data } = await api.get<SystemConfig>('/config');
      setTexto(data.dailyNotice ?? '');
      setSalvoEm(data.dailyNoticeUpdatedAt ?? null);
    } catch (err: any) {
      setErro(err.response?.data?.error || 'Erro ao carregar o aviso do dia.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    setOk(false);
    try {
      // String vazia vira null: "sem aviso" e "aviso em branco" são a mesma
      // coisa pro bot, e null é o que o prompt trata como ausência.
      const valor = texto.trim() === '' ? null : texto.trim();
      const { data } = await api.patch<SystemConfig>('/config/daily-notice', { dailyNotice: valor });
      setTexto(data.dailyNotice ?? '');
      setSalvoEm(data.dailyNoticeUpdatedAt ?? null);
      setOk(true);
      setTimeout(() => setOk(false), 2500);
    } catch (err: any) {
      setErro(err.response?.data?.error || 'Erro ao salvar o aviso do dia.');
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) return <p className="text-neutral-500">Carregando...</p>;

  const idade = salvoEm ? descreveIdade(salvoEm) : null;

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <div className="border-b border-neutral-850 pb-4">
        <h3 className="font-display text-lg font-black text-white">Aviso do dia</h3>
        <p className="font-mono text-xs text-neutral-500">
          O bot do WhatsApp avisa isso ao cliente ANTES de fechar o pedido
        </p>
      </div>

      {erro && <p className="rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-300">{erro}</p>}

      <div className="flex flex-col gap-3 rounded-xl border border-neutral-850 bg-neutral-900 p-4">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Ex.: hoje sem alface"
          className="w-full resize-y rounded-lg border border-neutral-750 bg-neutral-950 p-3 text-sm text-white placeholder:text-neutral-600 focus:border-primary focus:outline-none"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={`font-mono text-xs ${idade?.velho ? 'text-amber-400' : 'text-neutral-600'}`}>
            {texto.length}/500
            {idade && ` · ${idade.texto}`}
            {!salvoEm && ' · nunca preenchido'}
          </p>
          <Button size="md" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : ok ? 'Salvo!' : 'Salvar aviso'}
          </Button>
        </div>
        {texto.trim() === '' && salvoEm && (
          <p className="font-mono text-xs text-neutral-500">
            Salvar em branco apaga o aviso — o bot volta a não avisar nada.
          </p>
        )}
      </div>
    </div>
  );
}
