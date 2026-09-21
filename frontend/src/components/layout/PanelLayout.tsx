import { useEffect, type ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useSocketStore } from '../../stores/useSocketStore';
import { unlockAudioOnGesture } from '../../utils/alertSound';

interface PanelLayoutProps {
  title: string;
  children: ReactNode;
}

export function PanelLayout({ title, children }: PanelLayoutProps) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const disconnectAll = useSocketStore((s) => s.disconnectAll);

  const handleLogout = () => {
    disconnectAll();
    logout();
  };

  // Destrava o áudio do aviso de pedido novo no primeiro gesto em qualquer
  // painel (política de autoplay -- ver alertSound.ts). Listener global e
  // barato; o unlock em si é idempotente.
  useEffect(() => {
    const opts: AddEventListenerOptions = { passive: true };
    document.addEventListener('pointerdown', unlockAudioOnGesture, opts);
    document.addEventListener('keydown', unlockAudioOnGesture, opts);
    return () => {
      document.removeEventListener('pointerdown', unlockAudioOnGesture);
      document.removeEventListener('keydown', unlockAudioOnGesture);
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-neutral-950">
      <header className="flex items-center justify-between bg-neutral-900 border-b border-neutral-850 px-4 py-3 shadow-md">
        <div>
          <h1 className="text-lg font-black text-white font-display">{title}</h1>
          {user && <p className="text-xs font-mono text-neutral-500">{user.username} · {user.role}</p>}
        </div>
        <button onClick={handleLogout} className="flex h-11 items-center gap-2 rounded-xl bg-neutral-850 border border-neutral-750 px-3 text-sm text-neutral-300 hover:text-white transition-colors">
          <LogOut size={18} />
          Sair
        </button>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
