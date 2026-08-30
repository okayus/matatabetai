import { AuthProvider, useAuth, type AuthState } from "./auth";
import { Link } from "./components/Link";
import { AccountPage } from "./pages/AccountPage";
import { HomePage } from "./pages/HomePage";
import { InvitePage } from "./pages/InvitePage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { RegisterPage } from "./pages/RegisterPage";
import { SpaceSettingsPage } from "./pages/SpaceSettingsPage";
import { matchPath, usePath } from "./router";

export function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}

function Shell() {
  const path = usePath();
  const { state } = useAuth();
  return (
    <>
      <header className="app-header">
        <div className="container row row--between">
          <Link href="/" className="brand">
            またたべたい
          </Link>
          {state.status === "authed" && (
            <nav aria-label="メイン" className="row">
              <Link href="/">ホーム</Link>
              <Link href="/account">アカウント</Link>
            </nav>
          )}
        </div>
      </header>
      <main className="container">{route(path, state)}</main>
    </>
  );
}

function route(path: string, state: AuthState) {
  if (path === "/login") return <LoginPage />;
  if (path === "/register") return <RegisterPage />;
  if (path === "/invite") return <InvitePage />;

  const settings = matchPath("/spaces/:spaceId/settings", path);
  const spaceId = settings?.["spaceId"];
  if (path !== "/" && path !== "/account" && spaceId === undefined) return <NotFoundPage />;

  if (state.status === "loading") return <p className="muted">読み込み中…</p>;
  if (state.status === "anonymous") return <LoginPage />;
  if (path === "/") return <HomePage me={state.me} />;
  if (path === "/account") return <AccountPage me={state.me} />;
  return <SpaceSettingsPage me={state.me} spaceId={spaceId ?? ""} />;
}
