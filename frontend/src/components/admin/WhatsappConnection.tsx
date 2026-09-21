import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { Button } from '../ui/Button';

interface WhatsappBusinessAccount {
  id: number;
  wabaId: string;
  phoneNumberId: string;
  displayPhone: string | null;
  verifiedName: string | null;
  // Fase 15.3 -- confirmação vinda da API da Meta, não do que o popup alegou.
  // null = a Meta não devolveu o campo; false = a Meta disse que não.
  isOnBizApp: boolean | null;
  platformType: string | null;
  isCoexistence: boolean;
  active: boolean;
}

interface EmbeddedSignupSession {
  type?: string;
  event?: string;
  data?: { waba_id?: string; phone_number_id?: string; business_id?: string };
}

declare global {
  interface Window {
    fbAsyncInit?: () => void;
    FB?: {
      init: (opts: { appId: string; cookie: boolean; xfbml: boolean; version: string }) => void;
      login: (
        callback: (response: { authResponse?: { code?: string } }) => void,
        opts: Record<string, unknown>
      ) => void;
    };
  }
}

// Públicos por natureza (aparecem no bundle do navegador) -- App ID e Config
// ID do Facebook Login não são segredo, diferente do App Secret, que nunca
// sai do backend (ver embeddedSignup.service.ts).
const APP_ID = import.meta.env.VITE_META_APP_ID as string | undefined;
const CONFIG_ID = import.meta.env.VITE_META_ES_CONFIG_ID as string | undefined;

// SDK carregado sob demanda, só quando esta aba monta -- não em index.html,
// pra não pesar no bundle/carregamento do cardápio público (regra do
// projeto: nenhum painel entra no caminho de carregamento do cliente final).
const SDK_SCRIPT_ID = 'facebook-jssdk';
const SDK_TIMEOUT_MS = 15_000;

function loadFacebookSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.FB) {
      resolve();
      return;
    }

    // Tentativa anterior que falhou deixa a tag na página com window.FB ainda
    // undefined. Sem isto, cada clique empilha mais um <script> que vai falhar
    // igual -- e o segundo nem dispara onerror em alguns navegadores, o que
    // deixaria o botão preso em "Conectando..." pra sempre.
    document.getElementById(SDK_SCRIPT_ID)?.remove();

    // O onerror do <script> não cobre tudo: bloqueador que devolve um corpo
    // vazio em vez de recusar a requisição faz o script "carregar" sem nunca
    // chamar fbAsyncInit. Sem teto de tempo, isso trava o botão.
    const timeout = setTimeout(() => reject(new Error('SDK_TIMEOUT')), SDK_TIMEOUT_MS);

    window.fbAsyncInit = () => {
      clearTimeout(timeout);
      try {
        window.FB!.init({ appId: APP_ID!, cookie: true, xfbml: false, version: 'v23.0' });
        resolve();
      } catch (err) {
        reject(err);
      }
    };

    const script = document.createElement('script');
    script.id = SDK_SCRIPT_ID;
    script.src = 'https://connect.facebook.net/pt_BR/sdk.js';
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('SDK_BLOCKED'));
    };
    document.body.appendChild(script);
  });
}

export function WhatsappConnection() {
  const [account, setAccount] = useState<WhatsappBusinessAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Última sessão de Embedded Signup capturada pelo listener abaixo -- ref,
  // não state, porque só o clique de login/callback do FB precisa ler o
  // valor mais recente, não precisa disparar novo render.
  const lastSessionRef = useRef<EmbeddedSignupSession | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<WhatsappBusinessAccount | null>('/webhook/whatsapp/business-account');
      setAccount(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar status da conexão.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Fase 15.2 -- session logging do Embedded Signup: exigência da Meta, não
  // log de debug opcional. Filtra por origem do Facebook antes de processar
  // qualquer coisa (postMessage recebe de qualquer origem por padrão).
  useEffect(() => {
    function handleSessionMessage(event: MessageEvent) {
      if (!event.origin.endsWith('facebook.com')) return;
      let data: EmbeddedSignupSession;
      try {
        data = JSON.parse(event.data);
      } catch {
        return; // não é payload JSON do fluxo de Embedded Signup -- ignora.
      }
      if (data.type !== 'WA_EMBEDDED_SIGNUP') return;
      console.log('[WHATSAPP_EMBEDDED_SIGNUP_SESSION]', data);
      lastSessionRef.current = data;
    }
    window.addEventListener('message', handleSessionMessage);
    return () => window.removeEventListener('message', handleSessionMessage);
  }, []);

  const finishConnect = async (code: string) => {
    // O wabaId vem do evento de sessão (postMessage), não do callback do
    // FB.login -- são duas origens diferentes que só se encontram aqui. Sem
    // ele o backend não tem o que consultar, e o `code` é de uso único: vale
    // mais recusar antes de gastá-lo do que mandar uma requisição que já
    // nasce incompleta e obrigar a refazer o fluxo inteiro com a dona.
    const wabaId = lastSessionRef.current?.data?.waba_id;
    if (!wabaId) {
      setConnecting(false);
      setError(
        'O fluxo do Facebook terminou sem informar a conta do WhatsApp (waba_id). ' +
          'Nada foi conectado. Refaça a conexão pelo botão -- se repetir, veja o console (F12).'
      );
      return;
    }
    try {
      const { data } = await api.post<WhatsappBusinessAccount>('/webhook/whatsapp/connect', {
        code,
        wabaId,
        sessionInfo: lastSessionRef.current,
      });
      setAccount(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao concluir a conexão.');
    } finally {
      setConnecting(false);
    }
  };

  // O phone_number_id é o valor que vai ser colado no Railway logo depois da
  // conexão. Se ele só existisse no banco, alguém teria que abrir o Postgres
  // no meio da operação, com a dona esperando.
  const copyPhoneNumberId = async () => {
    if (!account) return;
    try {
      await navigator.clipboard.writeText(account.phoneNumberId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard bloqueado (contexto não seguro, permissão negada): o valor
      // continua na tela pra seleção manual, então não é erro de verdade.
      setCopied(false);
    }
  };

  const handleConnect = async () => {
    if (!APP_ID || !CONFIG_ID) {
      setError(
        'VITE_META_APP_ID / VITE_META_ES_CONFIG_ID não configurados neste ambiente. ' +
          'Crie a Configuration do Embedded Signup no painel do Meta for Developers e preencha o .env do frontend antes de conectar.'
      );
      return;
    }
    setConnecting(true);
    setError(null);

    // Carregar o SDK e chamar o login são falhas DIFERENTES, com causas e
    // soluções diferentes -- um catch só pros dois (como era antes) mostrava
    // "não foi possível carregar o SDK" até quando o SDK tinha carregado
    // bem e o problema era outro.
    try {
      await loadFacebookSdk();
    } catch (err) {
      console.error('[WHATSAPP_FB_SDK_LOAD_FAILED]', err);
      setConnecting(false);
      setError(
        'O navegador não conseguiu carregar o SDK do Facebook (connect.facebook.net). ' +
          'Quase sempre é bloqueador de anúncios, extensão de privacidade ou a rede bloqueando esse domínio. ' +
          'Tente numa janela anônima sem extensões, ou noutra rede. Detalhe técnico no console (F12).'
      );
      return;
    }

    try {
      window.FB!.login(
        (response) => {
          const code = response?.authResponse?.code;
          if (!code) {
            setConnecting(false); // usuário fechou o popup sem concluir
            return;
          }
          finishConnect(code);
        },
        {
          config_id: CONFIG_ID,
          response_type: 'code',
          override_default_response_type: true,
          extras: {
            setup: {},
            // Fase 15 -- ESTE parâmetro é o que liga a coexistência. Sem ele
            // o fluxo é o normal, e um número que já tem o app WhatsApp
            // Business instalado (que é o caso do trailer) é REJEITADO.
            // Como conferir antes de envolver a dona: abrir esta tela e
            // clicar em conectar. Se aparecer a opção de conectar uma conta
            // do WhatsApp Business que já existe, pegou; se aparecer a
            // seleção de WABA normal, não pegou -- e aí o problema está na
            // Configuration do App Dashboard, não aqui.
            featureType: 'whatsapp_business_app_onboarding',
            sessionInfoVersion: '3',
          },
        }
      );
    } catch (err) {
      console.error('[WHATSAPP_FB_LOGIN_FAILED]', err);
      setConnecting(false);
      setError('O SDK carregou, mas a chamada de login falhou. Veja o erro do Facebook no console (F12).');
    }
  };

  const handleDisconnect = async () => {
    if (!account) return;
    setError(null);
    try {
      const { data } = await api.patch<WhatsappBusinessAccount>(
        `/webhook/whatsapp/business-account/${account.id}/disconnect`
      );
      setAccount(data.active ? data : null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao desconectar.');
    }
  };

  if (loading) return <p className="text-neutral-500">Carregando...</p>;

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <div className="border-b border-neutral-850 pb-4">
        <h3 className="text-lg font-black text-white font-display">WhatsApp</h3>
        <p className="text-xs font-mono text-neutral-500">Conexão da conta do WhatsApp Business (Embedded Signup)</p>
      </div>

      {error && <p className="rounded-lg bg-red-950/40 border border-red-900/60 p-3 text-sm text-red-300">{error}</p>}

      {!account?.active ? (
        <div className="flex flex-col gap-3 rounded-xl bg-neutral-900 border border-neutral-850 p-4">
          <p className="text-sm text-neutral-400">
            Nenhum WhatsApp conectado. Quem loga no popup é o Facebook do dono do número, que precisa ser
            administrador do portfólio Meta do Sistema de Pedidos Trailer (isso é independente do login deste painel). O
            celular do trailer precisa estar em mãos: a confirmação final acontece nele.
          </p>
          <Button size="lg" onClick={handleConnect} disabled={connecting}>
            {connecting ? 'Conectando...' : 'Conectar WhatsApp do trailer'}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl bg-neutral-900 border border-neutral-850 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-white">{account.verifiedName ?? 'Número conectado'}</p>
              <p className="font-mono text-sm text-neutral-400">{account.displayPhone ?? account.phoneNumberId}</p>
            </div>
            {account.isOnBizApp === true ? (
              <span className="rounded-full border border-emerald-900/60 bg-emerald-950/40 px-3 py-1 font-mono text-xs uppercase tracking-wider text-emerald-300">
                Coexistência ativa
              </span>
            ) : account.isCoexistence ? (
              // O popup rodou o fluxo de coexistência, mas a Meta não
              // confirmou (is_on_biz_app false ou ausente). Não é detalhe:
              // significa que o celular da dona pode ter saído do ar.
              <span className="rounded-full border border-amber-900/60 bg-amber-950/40 px-3 py-1 font-mono text-xs uppercase tracking-wider text-amber-300">
                Não confirmada
              </span>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 rounded-xl bg-neutral-950 border border-neutral-850 p-3">
            <p className="font-mono text-xs uppercase tracking-wider text-neutral-500">
              Phone Number ID (colar no Railway)
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="select-all break-all font-mono text-sm text-white">{account.phoneNumberId}</code>
              <Button variant="secondary" size="md" onClick={copyPhoneNumberId}>
                {copied ? 'Copiado!' : 'Copiar'}
              </Button>
            </div>
            <p className="font-mono text-xs text-neutral-600">
              is_on_biz_app: {account.isOnBizApp === null ? 'não informado' : String(account.isOnBizApp)} · platform_type:{' '}
              {account.platformType ?? 'não informado'}
            </p>
          </div>
          <Button variant="secondary" size="md" onClick={handleDisconnect}>
            Desconectar
          </Button>
        </div>
      )}
    </div>
  );
}
