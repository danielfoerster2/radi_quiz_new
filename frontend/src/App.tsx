import { useCallback, useEffect, useState } from "react";
import LandingPage from "./pages/LandingPage";
import DashboardPage from "./pages/DashboardPage";

export type User = {
  email: string;
  user_uuid: string;
  last_active?: string;
  workspace_is_encrypted?: boolean;
};

const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSession = useCallback(async () => {
    try {
      const response = await fetch("/auth/session", {
        method: "GET",
        credentials: "include",
      });
      if (!response.ok) {
        setUser(null);
        return;
      }
      const data = (await response.json()) as { user?: User };
      if (data.user) {
        setUser(data.user);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const handleAuthenticated = useCallback((nextUser: User) => {
    setUser(nextUser);
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await fetch("/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore
    } finally {
      setUser(null);
    }
  }, []);

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading__spinner" />
        <p>Chargement de votre session…</p>
      </div>
    );
  }

  if (!user) {
    return <LandingPage onAuthenticated={handleAuthenticated} />;
  }

  return <DashboardPage user={user} onLogout={handleLogout} />;
};

export default App;
