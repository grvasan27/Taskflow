import { useEffect, useState, useRef } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import LandingPage from "@/pages/LandingPage";
import Dashboard from "@/pages/Dashboard";
import SubtaskPage from "@/pages/SubtaskPage";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Auth Callback Component
const AuthCallback = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Use useRef to prevent double processing in StrictMode
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const processAuth = async () => {
      const hash = location.hash;
      const sessionIdMatch = hash.match(/session_id=([^&]+)/);
      
      if (!sessionIdMatch) {
        navigate("/", { replace: true });
        return;
      }

      const sessionId = sessionIdMatch[1];

      try {
        const response = await fetch(`${API}/auth/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ session_id: sessionId }),
        });

        if (!response.ok) {
          throw new Error("Auth failed");
        }

        const data = await response.json();
        // Navigate to dashboard with user data
        navigate("/dashboard", { replace: true, state: { user: data.user } });
      } catch (error) {
        console.error("Auth error:", error);
        navigate("/", { replace: true });
      }
    };

    processAuth();
  }, [location, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Authenticating...</p>
      </div>
    </div>
  );
};

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const [user, setUser] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // If user data was passed from AuthCallback, use it
    if (location.state?.user) {
      setUser(location.state.user);
      setIsAuthenticated(true);
      return;
    }

    const checkAuth = async () => {
      try {
        const response = await fetch(`${API}/auth/me`, {
          credentials: "include",
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
  }, [location, navigate]);

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

  // Clone children and pass user as prop
  return children({ user, setUser });
};

// App Router Component
function AppRouter() {
  const location = useLocation();

  // CRITICAL: Check for session_id synchronously during render
  // This prevents race conditions by processing auth FIRST
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }

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
  // Theme detection
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    
    const handleChange = (e) => {
      if (e.matches) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    };

    // Set initial theme
    handleChange(mediaQuery);

    // Listen for changes
    mediaQuery.addEventListener("change", handleChange);

    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return (
    <div className="App min-h-screen bg-background">
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
      <Toaster position="bottom-right" />
    </div>
  );
}

export default App;
