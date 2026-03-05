import { Route, Switch } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import HubPage from "@/pages/hub";
import FunnelDashboard from "@/pages/funnel-dashboard";
import AnalyticsPage from "@/pages/analytics";
import ContentLibraryPage from "@/pages/content-library-page";
import CampaignPlannerPage from "@/pages/campaign-planner";
import FeedbackPage from "@/pages/feedback";
import ReportsDashboard from "@/pages/reports-dashboard";
import LoginPage from "@/pages/login";
import AdminPage from "@/pages/admin";
import { queryClient } from "./lib/queryClient";
import { AuthProvider, useAuth } from "./lib/auth";
import { ThemeProvider } from "./lib/theme";

function Router() {
  return (
    <Switch>
      <Route path="/" component={HubPage} />
      <Route path="/performance" component={FunnelDashboard} />
      <Route path="/analytics" component={AnalyticsPage} />
      <Route path="/content-library" component={ContentLibraryPage} />
      <Route path="/campaign-planner" component={CampaignPlannerPage} />
      <Route path="/reports" component={ReportsDashboard} />
      <Route path="/feedback" component={FeedbackPage} />
      <Route path="/admin" component={AdminPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthGate() {
  const { isLoggedIn, loading, login } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return <LoginPage onLogin={login} />;
  }

  return <Router />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AuthProvider>
            <Toaster />
            <AuthGate />
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
