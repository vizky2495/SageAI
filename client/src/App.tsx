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

import AdminPage from "@/pages/admin";
import FeedbackButton from "@/components/feedback-button";
import { queryClient } from "./lib/queryClient";

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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
        <FeedbackButton />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
