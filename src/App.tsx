import { useEffect, useState, type FormEvent } from "react";
import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import { AppProvider, useApp } from "./lib/app";
import { DEMO_MODE, ROLE_LABEL, supabase, type Role } from "./lib/store";
import { Audit } from "./pages/Audit";
import { PlanLibrary } from "./pages/PlanLibrary";
import { QuickCheck } from "./pages/QuickCheck";
import { Learning } from "./pages/Learning";
import { Registration } from "./pages/Registration";
import { RulesAdmin } from "./pages/RulesAdmin";
import { Scenarios } from "./pages/Scenarios";
import { Status } from "./pages/Status";

function Shell() {
  const { role, setRole, user, setUser, demo, signOut } = useApp();
  return (
    <div className="shell">
      <nav className="rail" aria-label="Main">
        <div className="brand">
          <b>Ledgr</b>
          <span>by Aether</span>
        </div>
        <NavLink to="/" end>Copay check</NavLink>
        <NavLink to="/plans">Plan library</NavLink>
        <NavLink to="/detailed">Detailed check</NavLink>
        <NavLink to="/scenarios">Demo scenarios</NavLink>
        <NavLink to="/learn">Learning center</NavLink>
        <NavLink to="/rules">Rule library</NavLink>
        <NavLink to="/audit">Audit log</NavLink>
        <NavLink to="/readiness">Readiness</NavLink>
        <div className="spacer" />
        <div className="who">
          {demo ? (
            <>
              <label>
                <span className="sr-only">Signed in as</span>
                <select value={user} onChange={(e) => setUser(e.target.value)} aria-label="Demo user">
                  <option>Demo User A</option>
                  <option>Demo User B</option>
                </select>
              </label>
              <select value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Demo role">
                {Object.entries(ROLE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </>
          ) : (
            <>
              <span>{user}</span>
              <span>{ROLE_LABEL[role]}</span>
              <button className="btn small" onClick={signOut}>Sign out</button>
            </>
          )}
        </div>
      </nav>
      <main className="main">
        {demo && <div className="demo-banner" role="status">Demo mode: fictitious patients and hypothetical plan amounts only. Don't enter real patient information.</div>}
        <Routes>
          <Route path="/" element={<QuickCheck />} />
          <Route path="/plans" element={<PlanLibrary />} />
          <Route path="/detailed" element={<Registration />} />
          <Route path="/scenarios" element={<Scenarios />} />
          <Route path="/learn" element={<Learning />} />
          <Route path="/rules" element={<RulesAdmin />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="/readiness" element={<Status />} />
        </Routes>
      </main>
    </div>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(DEMO_MODE);
  const [signedIn, setSignedIn] = useState(DEMO_MODE);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (DEMO_MODE || !supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => data.subscription.unsubscribe();
  }, []);
  if (!ready) return null;
  if (signedIn) return <>{children}</>;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await supabase!.auth.signInWithPassword({ email, password });
    setErr(error ? "Email or password is incorrect." : null);
  };
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <form className="panel" style={{ width: "min(380px, 100%)" }} onSubmit={submit}>
        <div className="panel-head"><h1 style={{ fontSize: "1.3rem" }}>Sign in to Ledgr</h1></div>
        <div className="panel-body">
          <label className="field"><span>Work email</span><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label className="field"><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          {err && <p style={{ color: "var(--st-ed)" }}>{err}</p>}
          <button className="btn primary" type="submit">Sign in</button>
        </div>
      </form>
    </div>
  );
}

export default function App() {
  return (
    <AuthGate>
      <AppProvider>
        <BrowserRouter>
          <Shell />
        </BrowserRouter>
      </AppProvider>
    </AuthGate>
  );
}
