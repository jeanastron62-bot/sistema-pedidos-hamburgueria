import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore, DEFAULT_ROUTE_BY_ROLE } from '../../stores/useAuthStore';
import type { Role } from '../../types';

interface ProtectedRouteProps {
  allowedRoles: Role[];
  children: ReactNode;
}

export function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={DEFAULT_ROUTE_BY_ROLE[user.role]} replace />;
  }

  return <>{children}</>;
}
