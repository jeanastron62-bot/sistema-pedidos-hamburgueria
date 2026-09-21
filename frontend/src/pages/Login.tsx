import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Lock, Eye, EyeOff, Trash2, LogIn, UserPlus, ShieldAlert, ShoppingCart } from 'lucide-react';
import { api } from '../services/api';
import { useAuthStore, DEFAULT_ROUTE_BY_ROLE } from '../stores/useAuthStore';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import type { Role } from '../types';

type Mode = 'login' | 'register';

interface SavedAccount {
  username: string;
  role: Role;
  token: string;
  lastLogin: string;
}

const SAVED_ACCOUNTS_KEY = 'sistema_pedidos_saved_profiles';

export default function Login() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('GARCOM');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SAVED_ACCOUNTS_KEY);
      if (stored) setSavedAccounts(JSON.parse(stored));
    } catch {
      // sem contas salvas ainda
    }
  }, []);

  const persistSavedAccounts = (accounts: SavedAccount[]) => {
    setSavedAccounts(accounts);
    localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(accounts));
  };

  const handleRemoveSaved = (usernameToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    persistSavedAccounts(savedAccounts.filter((a) => a.username !== usernameToRemove));
  };

  const handleSelectSaved = (acc: SavedAccount) => {
    const payload = JSON.parse(atob(acc.token.split('.')[1]));
    setAuth(acc.token, { id: payload.userId, username: payload.username, role: payload.role as Role });
    navigate(DEFAULT_ROUTE_BY_ROLE[acc.role]);
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { username, password });
      const payload = JSON.parse(atob(data.token.split('.')[1]));
      const user = { id: payload.userId, username: payload.username, role: payload.role as Role };
      setAuth(data.token, user);

      if (rememberMe) {
        const newAccount: SavedAccount = { username: user.username, role: user.role, token: data.token, lastLogin: new Date().toISOString() };
        const filtered = savedAccounts.filter((a) => a.username.toLowerCase() !== user.username.toLowerCase());
        persistSavedAccounts([newAccount, ...filtered].slice(0, 5));
      }

      navigate(DEFAULT_ROUTE_BY_ROLE[user.role]);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao fazer login.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', { username, password, role });
      setInfo(data.message || 'Cadastro realizado. Aguarde aprovação do administrador.');
      setMode('login');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao cadastrar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 px-4 py-12">
      <Link to="/" className="mb-6 flex items-center gap-1.5 text-sm text-neutral-500 hover:text-white transition-colors"><ArrowLeft size={16} />Voltar ao cardápio</Link>

      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-primary flex items-center justify-center">
            <ShoppingCart className="text-white" size={28} strokeWidth={2.5} />
          </div>
          <h1 className="mt-4 text-2xl font-black text-white tracking-tight font-display">Pedidos <span className="text-primary">Trailer</span></h1>
          <p className="mt-1 text-sm text-neutral-500">{mode === 'register' ? 'Cadastro de novos colaboradores' : 'Autenticação de colaboradores'}</p>
        </div>

        <div className="rounded-2xl bg-neutral-900 border border-neutral-850 p-5">
          {savedAccounts.length > 0 && mode === 'login' && (
            <div className="mb-5">
              <p className="mb-2 text-xs font-mono font-bold uppercase tracking-wider text-neutral-500">Acesso rápido</p>
              <div className="flex flex-col gap-2">
                {savedAccounts.map((acc) => (
                  <div
                    key={acc.username}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelectSaved(acc)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelectSaved(acc); } }}
                    className="flex items-center justify-between rounded-xl bg-neutral-950 border border-neutral-850 hover:border-primary/40 p-3 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-black">{acc.username[0].toUpperCase()}</div>
                      <div>
                        <p className="text-sm font-bold text-white group-hover:text-primary transition-colors">{acc.username}</p>
                        <p className="text-[10px] font-mono uppercase text-neutral-500">{acc.role}</p>
                      </div>
                    </div>
                    <button onClick={(e) => handleRemoveSaved(acc.username, e)} className="p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Remover"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
              <div className="mt-4 border-t border-neutral-850 pt-4">
                <p className="text-xs font-mono uppercase tracking-wider text-neutral-500">Ou entre com outra conta</p>
              </div>
            </div>
          )}

          <div className="mb-4 flex rounded-xl bg-neutral-950 p-1">
            <button className={`h-9 flex-1 rounded-lg text-sm font-bold transition-colors ${mode === 'login' ? 'bg-primary text-white' : 'text-neutral-500'}`} onClick={() => setMode('login')}>Entrar</button>
            <button className={`h-9 flex-1 rounded-lg text-sm font-bold transition-colors ${mode === 'register' ? 'bg-primary text-white' : 'text-neutral-500'}`} onClick={() => setMode('register')}>Cadastrar</button>
          </div>

          {error && (<div className="mb-3 flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400"><ShieldAlert size={16} className="shrink-0 mt-0.5" />{error}</div>)}
          {info && <p className="mb-3 text-sm text-secondary">{info}</p>}

          <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="flex flex-col gap-4">
            <div>
              <label htmlFor="login-username" className="mb-1.5 block text-xs font-mono font-bold uppercase tracking-wider text-neutral-500">Usuário</label>
              <div className="relative">
                <User size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input id="login-username" value={username} onChange={(e) => setUsername(e.target.value)} required className="h-12 w-full rounded-xl bg-neutral-950 border border-neutral-800 pl-10 pr-3 text-sm text-white placeholder-neutral-600 focus:border-primary focus:outline-none transition-colors" placeholder="joao_burger" />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="mb-1.5 block text-xs font-mono font-bold uppercase tracking-wider text-neutral-500">Senha</label>
              <PasswordField id="login-password" value={password} onChange={setPassword} />
            </div>

            {mode === 'login' && (
              <label className="flex items-center gap-2 text-xs text-neutral-500 cursor-pointer select-none">
                <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="h-4 w-4 rounded border-neutral-800 bg-neutral-950 text-primary focus:ring-primary" />
                Salvar para acesso rápido neste aparelho
              </label>
            )}

            {mode === 'register' && (
              <Select label="Função" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="GARCOM">Garçom</option>
                <option value="CHAPISTA">Chapista</option>
                <option value="ENTREGADOR">Entregador</option>
              </Select>
            )}

            <Button type="submit" size="lg" disabled={loading} className="mt-1 hover:-translate-y-0.5 active:translate-y-0 transition-transform">
              {loading ? 'Aguarde...' : mode === 'login' ? (<span className="flex items-center justify-center gap-1.5"><LogIn size={16} />Entrar</span>) : (<span className="flex items-center justify-center gap-1.5"><UserPlus size={16} />Cadastrar</span>)}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function PasswordField({ id, value, onChange }: { id?: string; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Lock size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
      <input id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} required className="h-12 w-full rounded-xl bg-neutral-950 border border-neutral-800 pl-10 pr-11 text-sm text-white placeholder-neutral-600 focus:border-primary focus:outline-none transition-colors" placeholder="••••••••" />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors" aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
    </div>
  );
}
