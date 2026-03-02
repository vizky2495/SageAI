import { Route, Switch } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import FunnelDashboard from "@/pages/funnel-dashboard";
import AnalyticsPage from "@/pages/analytics";
import ContentLibraryPage from "@/pages/content-library-page";

import AdminPage from "@/pages/admin";
import AIChatbot from "@/components/ai-chatbot";
import { queryClient } from "./lib/queryClient";

function Router() {
  return (
    <Switch>
      <Route path="/" component={FunnelDashboard} />
      <Route path="/analytics" component={AnalyticsPage} />
      <Route path="/content-library" component={ContentLibraryPage} />
      <Route path="/admin" component={AdminPage} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
        <AIChatbot />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
