import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Calendar, Bell, BarChart3, ArrowRight } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const LandingPage = () => {
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Check if user is already authenticated
    const checkAuth = async () => {
      try {
        const response = await fetch(`${API}/auth/me`, {
          credentials: "include",
        });

        if (response.ok) {
          navigate("/dashboard", { replace: true });
          return;
        }
      } catch (error) {
        // Not authenticated, show landing page
      }
      setIsChecking(false);
    };

    checkAuth();
  }, [navigate]);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API}/auth/google/url`, {
        credentials: "include",
      });
      
      if (response.ok) {
        const data = await response.json();
        window.location.href = data.authorization_url;
      } else {
        console.error("Failed to get auth URL");
        setIsLoading(false);
      }
    } catch (error) {
      console.error("Auth error:", error);
      setIsLoading(false);
    }
  };

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const features = [
    {
      icon: CheckCircle2,
      title: "Track Everything",
      description: "Organize all your tasks in one powerful Gantt view",
    },
    {
      icon: Calendar,
      title: "Google Calendar Sync",
      description: "Automatically sync tasks to your Google Calendar",
    },
    {
      icon: Bell,
      title: "Smart Reminders",
      description: "Never miss a deadline with browser notifications",
    },
    {
      icon: BarChart3,
      title: "Progress Insights",
      description: "Track day-by-day completion with visual progress",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-transparent" />
        
        <div className="container mx-auto px-4 md:px-8 lg:px-12">
          <nav className="flex items-center justify-between py-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-8 w-8 text-accent" />
              <span className="text-xl font-bold tracking-tight font-['Manrope']">TaskFlow</span>
            </div>
            <Button
              onClick={handleGoogleLogin}
              variant="outline"
              disabled={isLoading}
              data-testid="nav-login-btn"
            >
              {isLoading ? "Loading..." : "Sign In"}
            </Button>
          </nav>

          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 py-16 md:py-24 lg:py-32">
            {/* Left Column - Content */}
            <div className="flex flex-col justify-center">
              <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-4">
                Task Management Reimagined
              </p>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tighter font-['Manrope'] mb-6">
                Track Tasks.
                <br />
                <span className="text-accent">Visualize Progress.</span>
              </h1>
              <p className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-lg">
                A powerful Gantt-style task tracker with Google Calendar & Drive integration. 
                Track daily progress, set reminders, and backup your data automatically.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Button
                  onClick={handleGoogleLogin}
                  size="lg"
                  disabled={isLoading}
                  className="google-btn bg-primary text-primary-foreground hover:bg-primary/90 active-scale"
                  data-testid="hero-login-btn"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  {isLoading ? "Redirecting..." : "Continue with Google"}
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
              
              <p className="text-xs text-muted-foreground mt-4">
                Includes Google Calendar & Drive integration for all accounts
              </p>
            </div>

            {/* Right Column - Visual */}
            <div className="relative hidden lg:flex items-center justify-center">
              <div className="relative w-full max-w-md aspect-square">
                <img
                  src="https://images.unsplash.com/photo-1581087659125-322b6be59e99?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMjV8MHwxfHNlYXJjaHwyfHxtaW5pbWFsaXN0JTIwYWJzdHJhY3QlMjBvcmdhbml6ZWQlMjBnZW9tZXRyaWMlMjBzaGFwZXN8ZW58MHx8fHwxNzY5Mzg2OTMwfDA&ixlib=rb-4.1.0&q=85"
                  alt="Abstract geometric structure representing organized tasks"
                  className="rounded-sm object-cover w-full h-full"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/20 to-transparent rounded-sm" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="container mx-auto px-4 md:px-8 lg:px-12">
          <div className="text-center mb-12">
            <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">
              Features
            </p>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight font-['Manrope']">
              Everything you need to stay organized
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <div
                key={index}
                className="border border-border bg-card p-6 rounded-sm hover-lift"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <feature.icon className="h-8 w-8 text-accent mb-4" />
                <h3 className="text-lg font-medium font-['Manrope'] mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4 md:px-8 lg:px-12">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight font-['Manrope'] mb-4">
              Ready to take control of your tasks?
            </h2>
            <p className="text-muted-foreground mb-8">
              Sign in with Google to get started. Your data syncs automatically with Calendar & Drive.
            </p>
            <Button
              onClick={handleGoogleLogin}
              size="lg"
              disabled={isLoading}
              className="google-btn bg-accent text-accent-foreground hover:bg-accent/90 active-scale"
              data-testid="cta-login-btn"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              {isLoading ? "Redirecting..." : "Get Started with Google"}
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-4 md:px-8 lg:px-12">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-accent" />
              <span className="font-medium font-['Manrope']">TaskFlow</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Built for productivity enthusiasts
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
