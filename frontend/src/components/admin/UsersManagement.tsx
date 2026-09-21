import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useAuthStore } from '../../stores/useAuthStore';
import { Select } from '../ui/Select';
import type { Role, User } from '../../types';

const ALL_ROLES: Role[] = ['GARCOM', 'CHAPISTA', 'ENTREGADOR', 'ADM', 'TI'];
const ADM_ASSIGNABLE_ROLES: Role[] = ['GARCOM', 'CHAPISTA', 'ENTREGADOR'];

function isProtected(user: User) {
  return user.username === 'tecnico' || user.id === 1;
}

export function UsersManagement() {
  const currentUser = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const isTI = currentUser?.role === 'TI';
  const assignableRoles = isTI ? ALL_ROLES : ADM_ASSIGNABLE_ROLES;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<User[]>('/users');
      setUsers(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar usuários.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleApprove = async (user: User, approved: boolean) => {
    setBusyId(user.id);
    setError(null);
    try {
      const { data } = await api.patch<User>(`/users/${user.id}/approve`, { approved });
      setUsers((prev) => prev.map((u) => (u.id === data.id ? data : u)));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao atualizar aprovação.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRoleChange = async (user: User, role: Role) => {
    setBusyId(user.id);
    setError(null);
    try {
      const { data } = await api.patch<User>(`/users/${user.id}/role`, { role });
      setUsers((prev) => prev.map((u) => (u.id === data.id ? data : u)));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao atualizar papel.');
      load();
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <p className="text-neutral-500">Carregando...</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="border-b border-neutral-850 pb-4">
        <h3 className="text-lg font-black text-white font-display">Usuários</h3>
        <p className="text-xs font-mono text-neutral-500">Aprovação e hierarquia de acesso</p>
      </div>

      {error && <p className="rounded-lg bg-red-950/40 border border-red-900/60 p-3 text-sm text-red-300">{error}</p>}

      <div className="flex flex-col gap-2">
        {users.map((user) => {
          const protectedAccount = isProtected(user);
          const busy = busyId === user.id;
          const roleOptions = assignableRoles.includes(user.role) ? assignableRoles : [...assignableRoles, user.role];

          return (
            <div key={user.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-neutral-900 border border-neutral-850 p-3">
              <div>
                <p className="font-semibold text-white">{user.username}</p>
                <p className="text-sm text-neutral-500">{user.approved ? 'Aprovado' : 'Aguardando aprovação'}</p>
              </div>

              {protectedAccount ? (
                <span className="text-sm text-neutral-500 italic">Conta protegida do sistema</span>
              ) : (
                <div className="flex items-center gap-2">
                  <Select
                    value={user.role}
                    disabled={busy || (!isTI && !ADM_ASSIGNABLE_ROLES.includes(user.role))}
                    onChange={(e) => handleRoleChange(user, e.target.value as Role)}
                    className="h-11 w-40"
                  >
                    {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                  </Select>
                  <label className="flex items-center gap-1 text-sm text-neutral-400">
                    <input
                      type="checkbox"
                      checked={user.approved}
                      disabled={busy}
                      onChange={(e) => handleApprove(user, e.target.checked)}
                      className="h-5 w-5"
                    />
                    Aprovado
                  </label>
                </div>
              )}
            </div>
          );
        })}
        {users.length === 0 && <p className="py-10 text-center text-sm text-neutral-500">Nenhum usuário cadastrado.</p>}
      </div>
    </div>
  );
}
