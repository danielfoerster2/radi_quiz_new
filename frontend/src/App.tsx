import { useCallback, useEffect, useState } from "react";
import LandingPage from "./pages/LandingPage";
import DashboardPage from "./pages/DashboardPage";
import SettingsPage from "./pages/SettingsPage";
import HelpPage from "./pages/HelpPage";
import { parseJson } from "./utils/api";

export type User = {
  email: string;
  user_uuid: string;
  last_active?: string;
  workspace_is_encrypted?: boolean;
};

const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"dashboard" | "settings" | "help">("dashboard");

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
      const data = await parseJson<{ user?: User }>(response);
      if (data?.user) {
        setUser(data.user);
        setView("dashboard");
      } else {
        setUser(null);
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
    setView("dashboard");
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
      setView("dashboard");
    }
  }, []);

  const handleNavigateSettings = useCallback(() => {
    setView("settings");
  }, []);

  const handleNavigateDashboard = useCallback(() => {
    setView("dashboard");
  }, []);

  const handleNavigateHelp = useCallback(() => {
    setView("help");
  }, []);

  const handleUserUpdate = useCallback((nextUser: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...nextUser } : prev));
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

  if (view === "settings") {
    return (
      <SettingsPage
        user={user}
        onBack={handleNavigateDashboard}
        onLogout={handleLogout}
        onUserUpdate={handleUserUpdate}
        onNavigateHelp={handleNavigateHelp}
      />
    );
  }

  if (view === "help") {
    return (
      <HelpPage
        user={user}
        onBack={handleNavigateDashboard}
        onLogout={handleLogout}
        onNavigateSettings={handleNavigateSettings}
      />
    );
  }

  return <DashboardPage user={user} onLogout={handleLogout} onNavigateSettings={handleNavigateSettings} onNavigateHelp={handleNavigateHelp} />;
};

export default App;
