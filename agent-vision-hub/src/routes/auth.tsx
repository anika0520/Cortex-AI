import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Mail, Lock, ArrowRight, Sparkles, User, Eye, EyeOff, AlertCircle } from "lucide-react";
import { saveAuth, loadAuth, clearAuth } from "@/lib/storage";
import authHero from "@/assets/auth-hero.jpg";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Cortex" },
      { name: "description", content: "Sign in to Cortex AI Agent Platform." },
    ],
  }),
  component: AuthPage,
});

// ── Credential store ──────────────────────────────────────────────────────────

const USERS_KEY = "cortex_v2_users";

interface StoredUser {
  name: string;
  email: string;
  passwordHash: string;
}

/**
 * Secure password hashing using SubtleCrypto SHA-256, salted with the email.
 * Falls back to a sync FNV-1a only in environments where SubtleCrypto is absent.
 */
async function hashPassword(password: string, email: string): Promise<string> {
  const salted = `${email.toLowerCase()}::${password}`;
  try {
    const buf    = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salted));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    // SubtleCrypto unavailable (non-secure context) — fallback
    let h = 0x811c9dc5;
    for (const c of salted) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16);
  }
}

function loadUsers(): StoredUser[] {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) ?? "[]"); } catch { return []; }
}
function saveUsers(users: StoredUser[]) {
  try { localStorage.setItem(USERS_KEY, JSON.stringify(users)); } catch {}
}

// ── Google OAuth helpers ──────────────────────────────────────────────────────

const GOOGLE_CLIENT_ID = ((import.meta as any).env?.VITE_GOOGLE_CLIENT_ID ?? "").trim();

/** Decode a JWT payload (Google ID token) without verifying signature (browser-only). */
function decodeJWT(token: string): Record<string, any> | null {
  try {
    const [, payload] = token.split(".");
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch { return null; }
}

/**
 * Render the Google Sign-In button into a given container element.
 * Returns a cleanup function that removes the rendered button.
 */
function renderGoogleButton(
  containerId: string,
  onSuccess: (name: string, email: string) => void,
  onError: () => void,
) {
  const win = window as any;
  if (!win.google?.accounts?.id) return;

  win.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: (resp: any) => {
      const payload = decodeJWT(resp.credential);
      if (!payload?.email) { onError(); return; }
      onSuccess(payload.name ?? payload.email, payload.email);
    },
    auto_select: false,
  });

  win.google.accounts.id.renderButton(document.getElementById(containerId), {
    theme: "filled_black",
    size: "large",
    width: "100%",
    text: "signin_with",
    shape: "rectangular",
  });
}

/** Load the Google Identity Services script once. */
function useGoogleScript(): boolean {
  const [ready, setReady] = useState(() => !!(window as any).google?.accounts?.id);
  useEffect(() => {
    if (ready || !GOOGLE_CLIENT_ID) return;
    if (document.getElementById("gis-script")) { setReady(true); return; }
    const s    = document.createElement("script");
    s.id       = "gis-script";
    s.src      = "https://accounts.google.com/gsi/client";
    s.async    = true;
    s.defer    = true;
    s.onload   = () => setReady(true);
    document.head.appendChild(s);
  }, [ready]);
  return ready;
}

// ── Page component ────────────────────────────────────────────────────────────

function AuthPage() {
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [name,     setName]     = useState("");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);
  const navigate   = useNavigate();
  const isSignup   = authMode === "signup";
  const gisReady   = useGoogleScript();

  // Render Google button whenever the script becomes ready or mode changes
  useEffect(() => {
    if (!gisReady || !GOOGLE_CLIENT_ID) return;
    renderGoogleButton(
      "google-btn",
      (gName, gEmail) => {
        saveAuth({ name: gName, email: gEmail, avatarInitial: gName[0].toUpperCase(), signedInAt: new Date().toISOString() });
        navigate({ to: "/" });
      },
      () => setError("Google sign-in failed. Try email/password instead."),
    );
  }, [gisReady, authMode, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) { setError("Please fill in all fields."); return; }
    if (password.length < 6)        { setError("Password must be at least 6 characters."); return; }
    setLoading(true);

    await new Promise((r) => setTimeout(r, 400));

    const users  = loadUsers();
    const pwHash = await hashPassword(password, email);

    if (isSignup) {
      if (!name.trim()) { setError("Please enter your name."); setLoading(false); return; }
      if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
        setError("An account with this email already exists. Sign in instead.");
        setLoading(false);
        return;
      }
      const newUser: StoredUser = { name: name.trim(), email: email.toLowerCase(), passwordHash: pwHash };
      saveUsers([...users, newUser]);
      saveAuth({ name: newUser.name, email: newUser.email, avatarInitial: newUser.name[0].toUpperCase(), signedInAt: new Date().toISOString() });
    } else {
      const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
      if (!user) { setError("No account found with that email. Create an account first."); setLoading(false); return; }
      if (user.passwordHash !== pwHash) { setError("Incorrect password. Please try again."); setLoading(false); return; }
      saveAuth({ name: user.name, email: user.email, avatarInitial: user.name[0].toUpperCase(), signedInAt: new Date().toISOString() });
    }

    setLoading(false);
    navigate({ to: "/" });
  };

  const switchMode = () => { setAuthMode(isSignup ? "signin" : "signup"); setError(null); };

  return (
    <div className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-2 bg-background">
      {/* ── Left — form ──────────────────────────────────────────────────── */}
      <div className="flex flex-col justify-between px-8 py-10 lg:px-16 lg:py-12 relative">
        <Link to="/" className="inline-flex items-center gap-2.5 group w-fit" aria-label="Cortex home">
          <div className="relative">
            <div className="h-10 w-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="absolute inset-0 rounded-xl bg-gradient-primary blur-xl opacity-60 -z-10" />
          </div>
          <span className="text-xl font-semibold tracking-tight text-foreground">Cortex</span>
        </Link>

        <div className="max-w-md w-full mx-auto lg:mx-0">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
            <h1 className="text-5xl md:text-6xl font-semibold tracking-tight text-foreground leading-[1.05] mb-4">
              {isSignup ? "Create" : "Welcome"}{" "}
              <span className="font-display-italic">{isSignup ? "account." : "back."}</span>
            </h1>
            <p className="text-muted-foreground text-[15px] mb-10">
              {isSignup ? "Start building autonomous workflows in seconds." : "Sign in to continue building autonomous workflows."}
            </p>

            {/* Error banner */}
            {error && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                className="mb-4 flex items-center gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />{error}
              </motion.div>
            )}

            {/* Google Sign-In button (only when client ID is configured) */}
            {GOOGLE_CLIENT_ID && (
              <div className="mb-6 space-y-3">
                <div id="google-btn" className="w-full" />
                <div className="relative flex items-center gap-3">
                  <div className="flex-1 h-px bg-border/60" />
                  <span className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">or</span>
                  <div className="flex-1 h-px bg-border/60" />
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3" noValidate aria-label={isSignup ? "Create account form" : "Sign in form"}>
              {isSignup && (
                <Field icon={User} type="text" placeholder="Full name" value={name} onChange={setName} label="Full name" disabled={loading} />
              )}
              <Field icon={Mail} type="email" placeholder="you@example.com" value={email} onChange={setEmail} label="Email address" disabled={loading} />

              {/* Password field with show/hide toggle */}
              <label className="block">
                <span className="sr-only">Password</span>
                <div className="relative flex items-center h-14 rounded-2xl border border-border/60 bg-card/40 hover:border-border focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20 transition-all px-4">
                  <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                  <input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••" required disabled={loading} minLength={6}
                    className="flex-1 bg-transparent outline-none px-3 text-[14.5px] text-foreground placeholder:text-muted-foreground/60 disabled:opacity-50" />
                  <button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? "Hide password" : "Show password"}
                    className="text-muted-foreground hover:text-foreground transition-colors p-1">
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>

              <motion.button whileHover={{ scale: loading ? 1 : 1.01 }} whileTap={{ scale: loading ? 1 : 0.99 }}
                type="submit" disabled={loading}
                className="w-full h-14 mt-3 rounded-2xl bg-foreground text-background font-medium flex items-center justify-center gap-2 hover:bg-foreground/90 transition-colors group disabled:opacity-60 disabled:cursor-not-allowed">
                {loading ? (
                  <><span className="h-4 w-4 rounded-full border-2 border-background/30 border-t-background animate-spin" />{isSignup ? "Creating account…" : "Signing in…"}</>
                ) : (
                  <>{isSignup ? "Create account" : "Sign in"}<ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" /></>
                )}
              </motion.button>
            </form>

            <p className="text-center text-sm text-muted-foreground mt-6">
              {isSignup ? "Already have an account?" : "New to Cortex?"}{" "}
              <button onClick={switchMode} className="text-primary hover:text-primary-glow font-medium transition-colors">
                {isSignup ? "Sign in" : "Create an account"}
              </button>
            </p>
          </motion.div>
        </div>

        <div className="text-[11px] text-muted-foreground/60">
          © {new Date().getFullYear()} Cortex Labs · All rights reserved
        </div>
      </div>

      {/* ── Right — hero image ────────────────────────────────────────────── */}
      <div className="hidden lg:block relative overflow-hidden">
        <img src={authHero} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" width={1080} height={1920} />
        <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-transparent to-background/40" aria-hidden />
        <div className="absolute bottom-0 left-0 right-0 p-12">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.6 }}>
            <div className="text-[10px] uppercase tracking-[0.28em] text-foreground/70 mb-4">The Operating System for Agents</div>
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-foreground leading-[1.1] max-w-xl">
              Plan, execute and verify <span className="font-display-italic">complex tasks</span>{" "}
              with full transparency.
            </h2>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function Field({ icon: Icon, type, placeholder, value, onChange, label, disabled }: {
  icon: any; type: string; placeholder: string; value: string; onChange: (v: string) => void; label: string; disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <div className="relative flex items-center h-14 rounded-2xl border border-border/60 bg-card/40 hover:border-border focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20 transition-all px-4">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          required disabled={disabled}
          className="flex-1 bg-transparent outline-none px-3 text-[14.5px] text-foreground placeholder:text-muted-foreground/60 disabled:opacity-50" />
      </div>
    </label>
  );
}
