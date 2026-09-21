import { lazy, Suspense, useEffect } from 'react';
import { AppLoadingScreen } from '~/components/ui/AppLoadingScreen';
import { AuthProvider } from '~/hooks/useAuth';
import { useHashRoute } from '~/lib/hash-route';
import { LandingRoute } from '~/routes/LandingRoute';

/**
 * Hash router (DAY 1).
 *
 *   #app        → Core Editor (`EditorShell`, the v2.8 `App` unchanged, lazy)
 *   #dashboard  → User portal; AuthModal when signed out (lazy)
 *   #admin      → Admin dashboard; non-admins are sent to #dashboard (lazy)
 *   (empty)     → Landing placeholder with "Vào Editor"
 *
 * Each route is its own chunk, so the portal never downloads the editor's
 * engines and the editor never downloads the portal. The editor keeps its own
 * Suspense + LazyDialogProvider inside `EditorShell`, exactly as before.
 */
const EditorShell = lazy(async () => {
  const module = await import('~/components/EditorShell');
  return { default: module.EditorShell };
});

const DashboardRoute = lazy(async () => {
  const module = await import('~/routes/DashboardRoute');
  return { default: module.DashboardRoute };
});

const AdminRoute = lazy(async () => {
  const module = await import('~/routes/AdminRoute');
  return { default: module.AdminRoute };
});

const TITLES = {
  home: 'SciRender',
  app: 'SciRender — Trình soạn thảo',
  dashboard: 'SciRender — Tài khoản',
  admin: 'SciRender — Quản trị',
} as const;

export function App(): JSX.Element {
  const route = useHashRoute();

  useEffect(() => {
    document.title = TITLES[route.name];
  }, [route.name]);

  let view: JSX.Element;
  switch (route.name) {
    case 'app':
      view = (
        <EditorShell
          openDocId={route.params.get('doc')}
          printAfterOpen={route.params.get('action') === 'print'}
        />
      );
      break;
    case 'dashboard':
      view = <DashboardRoute />;
      break;
    case 'admin':
      view = <AdminRoute />;
      break;
    default:
      view = <LandingRoute />;
  }

  return (
    <AuthProvider>
      <Suspense fallback={<AppLoadingScreen />}>{view}</Suspense>
    </AuthProvider>
  );
}
