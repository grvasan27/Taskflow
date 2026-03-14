import { useEffect, useState, createContext, useContext } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import LandingPage from "@/pages/LandingPage";
import Dashboard from "@/pages/Dashboard";
import SubtaskPage from "@/pages/SubtaskPage";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ── Token helpers ──────────────────────────────────────────────────────────
// Get the stored session token (set after OAuth redirect)
const getStoredToken = () => localStorage.getItem('taskflow_session');

// Build Authorization header for all API calls
export const getAuthHeaders = () => {
  const token = getStoredToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

// Extract ?token= from the URL after OAuth redirect and store it
const extractAndStoreToken = () => {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (token) {
    localStorage.setItem('taskflow_session', token);
    // Remove the token from the URL to keep it clean (no page reload)
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
  }
};

// Theme Context
const ThemeContext = createContext();

export const useTheme = () => useContext(ThemeContext);

const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("taskflow-theme");
    return saved || "system";
  });

  useEffect(() => {
    const root = document.documentElement;
    // All possible theme classes
    const allThemeClasses = ["dark", "theme-slate", "theme-sage", "theme-midnight"];

    const applyTheme = (themeName) => {
      // Remove all theme classes first
      root.classList.remove(...allThemeClasses);

      if (themeName === "dark") {
        root.classList.add("dark");
      } else if (themeName === "slate") {
        root.classList.add("theme-slate");
      } else if (themeName === "sage") {
        root.classList.add("theme-sage");
      } else if (themeName === "midnight") {
        root.classList.add("dark", "theme-midnight");
      }
      // "light" and "system" (light) → no extra classes
    };

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      applyTheme(mediaQuery.matches ? "dark" : "light");

      const handler = (e) => applyTheme(e.matches ? "dark" : "light");
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    } else {
      applyTheme(theme);
    }
  }, [theme]);

  const setThemeAndSave = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem("taskflow-theme", newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme: setThemeAndSave }}>
      {children}
    </ThemeContext.Provider>
  );
};

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const [user, setUser] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Extract token from URL (set after OAuth redirect) and store it first
        extractAndStoreToken();

        const response = await fetch(`${API}/auth/me`, {
          credentials: "include",
          headers: getAuthHeaders(),
        });

        if (!response.ok) {
          throw new Error("Not authenticated");
        }

        const userData = await response.json();
        setUser(userData);
        setIsAuthenticated(true);
      } catch (error) {
        setIsAuthenticated(false);
        navigate("/", { replace: true });
      }
    };

    checkAuth();
  }, [navigate]);

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return children({ user, setUser });
};

// App Router Component
function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            {({ user, setUser }) => <Dashboard user={user} setUser={setUser} />}
          </ProtectedRoute>
        }
      />
      <Route
        path="/task/:taskId"
        element={
          <ProtectedRoute>
            {({ user }) => <SubtaskPage user={user} />}
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider>
      <div className="App min-h-screen bg-background">
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
        <Toaster position="bottom-right" />
      </div>
    </ThemeProvider>
  );
}

export default App;
