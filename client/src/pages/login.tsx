import { useState } from "react";
import { motion } from "framer-motion";
import { Lock, Mail, Shield, Loader2, User } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LoginPageProps {
  onLogin: (token: string, user: { id: string; displayName: string; isAdmin: boolean }) => void;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Please fill in all fields.");
      return;
    }
    if (!isValidEmail(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: email.trim().toLowerCase(), password, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Login failed.");
        setLoading(false);
        return;
      }
      onLogin(data.token, data.user);
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_circle_at_50%_20%,hsl(145_100%_42%/0.08),transparent_60%),radial-gradient(800px_circle_at_20%_80%,hsl(200_80%_50%/0.06),transparent_55%),radial-gradient(800px_circle_at_80%_70%,hsl(270_60%_50%/0.06),transparent_55%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/60" />
        <div className="absolute inset-0 grain" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="mb-8 text-center"
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/50 px-4 py-1.5 backdrop-blur mb-6">
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">CIA Platform</span>
        </div>
        <h1 className="text-3xl font-[700] tracking-tight md:text-4xl" data-testid="text-login-title">
          Content Intelligence
          <br />
          <span className="bg-gradient-to-r from-primary via-emerald-300 to-sky-400 bg-clip-text text-transparent">
            Analyst
          </span>
        </h1>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm"
      >
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-border/60 bg-card/70 backdrop-blur-sm p-6 shadow-2xl"
          data-testid="form-login"
        >
          <h2 className="text-lg font-semibold mb-5 text-center">Sign In</h2>

          <div className="flex items-center gap-1.5 mb-5 p-1 rounded-xl bg-muted/30 border border-border/30">
            <button
              type="button"
              onClick={() => setRole("user")}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                role === "user"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="btn-role-user"
            >
              <User className="h-3.5 w-3.5" />
              User
            </button>
            <button
              type="button"
              onClick={() => setRole("admin")}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                role === "admin"
                  ? "bg-violet-500 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="btn-role-admin"
            >
              <Shield className="h-3.5 w-3.5" />
              Admin
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email ID"
                  className="w-full h-10 pl-9 pr-3 rounded-lg bg-muted/30 border border-border/40 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                  data-testid="input-email"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={role === "admin" ? "Admin password" : "User password"}
                  className="w-full h-10 pl-9 pr-3 rounded-lg bg-muted/30 border border-border/40 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                  data-testid="input-password"
                />
              </div>
            </div>
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xs text-destructive mt-3 text-center"
              data-testid="text-login-error"
            >
              {error}
            </motion.p>
          )}

          <Button
            type="submit"
            className="w-full mt-5 h-10 rounded-lg text-sm font-medium"
            disabled={loading}
            data-testid="btn-login-submit"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Lock className="h-4 w-4 mr-2" />
            )}
            {loading ? "Signing in..." : "Sign In"}
          </Button>

          <p className="text-[10px] text-muted-foreground/50 text-center mt-4">
            {role === "admin"
              ? "Admin access grants upload and management features."
              : "User access provides full analytics and chat features."}
          </p>
        </form>
      </motion.div>
    </div>
  );
}
