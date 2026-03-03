import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

interface AuthUser {
  id: string;
  displayName: string;
  isAdmin: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoggedIn: boolean;
  isAdmin: boolean;
  token: string | null;
  loading: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoggedIn: false,
  isAdmin: false,
  token: null,
  loading: true,
  login: () => {},
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem("cia_token");
    if (!savedToken) {
      setLoading(false);
      return;
    }
    fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${savedToken}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Invalid session");
        return res.json();
      })
      .then((data: AuthUser) => {
        setUser(data);
        setToken(savedToken);
        if (data.isAdmin) {
          sessionStorage.setItem("admin_token", savedToken);
        }
      })
      .catch(() => {
        localStorage.removeItem("cia_token");
        localStorage.removeItem("cia_user");
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback((newToken: string, newUser: AuthUser) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem("cia_token", newToken);
    localStorage.setItem("cia_user", JSON.stringify(newUser));
    if (newUser.isAdmin) {
      sessionStorage.setItem("admin_token", newToken);
    }
  }, []);

  const logout = useCallback(() => {
    const currentToken = localStorage.getItem("cia_token");
    if (currentToken) {
      fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${currentToken}` },
      }).catch(() => {});
    }
    setToken(null);
    setUser(null);
    localStorage.removeItem("cia_token");
    localStorage.removeItem("cia_user");
    sessionStorage.removeItem("admin_token");
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoggedIn: !!user,
        isAdmin: user?.isAdmin ?? false,
        token,
        loading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
