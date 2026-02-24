import { Route, Switch } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import FunnelDashboard from "@/pages/funnel-dashboard";
import PromptStudio from "@/pages/prompt-studio";
import AIChatbot from "@/components/ai-chatbot";
import { queryClient } from "./lib/queryClient";

function Router() {
  return (
    <Switch>
      <Route path="/" component={FunnelDashboard} />
      <Route path="/prompt-studio" component={PromptStudio} />
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
