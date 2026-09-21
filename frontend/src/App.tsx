import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './components/auth/ProtectedRoute';

const PublicMenu = lazy(() => import('./pages/PublicMenu'));
const Login = lazy(() => import('./pages/Login'));
const PanelGarcom = lazy(() => import('./pages/panels/PanelGarcom'));
const PanelChapista = lazy(() => import('./pages/panels/PanelChapista'));
const PanelEntregador = lazy(() => import('./pages/panels/PanelEntregador'));
const PanelADM = lazy(() => import('./pages/panels/PanelADM'));
const PanelTI = lazy(() => import('./pages/panels/PanelTI'));

function Loading() {
  return <div className="flex min-h-screen items-center justify-center bg-bg text-white">Carregando...</div>;
}

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<PublicMenu />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/painel/garcom"
          element={
            <ProtectedRoute allowedRoles={['GARCOM', 'TI']}>
              <PanelGarcom />
            </ProtectedRoute>
          }
        />
        <Route
          path="/painel/cozinha"
          element={
            <ProtectedRoute allowedRoles={['CHAPISTA', 'TI']}>
              <PanelChapista />
            </ProtectedRoute>
          }
        />
        <Route
          path="/painel/entrega"
          element={
            <ProtectedRoute allowedRoles={['ENTREGADOR', 'TI']}>
              <PanelEntregador />
            </ProtectedRoute>
          }
        />
        <Route
          path="/painel/admin"
          element={
            <ProtectedRoute allowedRoles={['ADM', 'TI']}>
              <PanelADM />
            </ProtectedRoute>
          }
        />
        <Route
          path="/painel/ti"
          element={
            <ProtectedRoute allowedRoles={['TI']}>
              <PanelTI />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Suspense>
  );
}

export default App;
