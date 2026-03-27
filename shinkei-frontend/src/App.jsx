import { useState, useEffect, useRef } from "react";

const STEP_TYPES = {
  event: { label: "Event", color: "#7c3aed", bg: "rgba(124,58,237,0.12)", border: "#7c3aed" },
  function: { label: "Function", color: "#94a3b8", bg: "rgba(148,163,184,0.08)", border: "#475569" },
  api: { label: "API Call", color: "#10b981", bg: "rgba(16,185,129,0.12)", border: "#10b981" },
  route: { label: "Route", color: "#f59e0b", bg: "rgba(245,158,11,0.12)", border: "#f59e0b" },
  response: { label: "Response", color: "#6366f1", bg: "rgba(99,102,241,0.12)", border: "#6366f1" },
};

const MOCK_FLOWS = {
  login: [
    { type: "event", label: "onClick → Login Button", file: "LoginForm.jsx", line: 42 },
    { type: "function", label: "handleSubmit(e)", file: "LoginForm.jsx", line: 18 },
    { type: "function", label: "validateCredentials(form)", file: "auth/utils.js", line: 7 },
    { type: "function", label: "loginUser(email, password)", file: "auth/api.js", line: 23 },
    { type: "api", label: "POST /api/auth/login", file: "routes/auth.js", line: 1 },
    { type: "route", label: "authRouter.post('/login')", file: "controllers/authController.js", line: 55 },
    { type: "function", label: "authController.login(req, res)", file: "controllers/authController.js", line: 55 },
    { type: "function", label: "UserService.findByEmail(email)", file: "services/userService.js", line: 12 },
    { type: "function", label: "bcrypt.compare(password, hash)", file: "services/userService.js", line: 19 },
    { type: "function", label: "jwt.sign(payload, secret)", file: "services/authService.js", line: 8 },
    { type: "response", label: "res.json({ token, user })", file: "controllers/authController.js", line: 78 },
    { type: "function", label: "navigate('/dashboard')", file: "LoginForm.jsx", line: 31 },
  ],
  checkout: [
    { type: "event", label: "onClick → Place Order Button", file: "Checkout.jsx", line: 87 },
    { type: "function", label: "handleCheckout(cartItems)", file: "Checkout.jsx", line: 54 },
    { type: "function", label: "validateCart(items)", file: "cart/utils.js", line: 3 },
    { type: "api", label: "POST /api/orders/create", file: "routes/orders.js", line: 1 },
    { type: "route", label: "orderRouter.post('/create')", file: "controllers/orderController.js", line: 11 },
    { type: "function", label: "OrderService.createOrder(data)", file: "services/orderService.js", line: 22 },
    { type: "function", label: "PaymentService.charge(amount)", file: "services/paymentService.js", line: 8 },
    { type: "function", label: "InventoryService.deduct(items)", file: "services/inventoryService.js", line: 15 },
    { type: "response", label: "res.json({ orderId, status })", file: "controllers/orderController.js", line: 45 },
    { type: "function", label: "navigate('/order-confirmation')", file: "Checkout.jsx", line: 72 },
  ],
  search: [
    { type: "event", label: "onSubmit → Search Form", file: "SearchBar.jsx", line: 29 },
    { type: "function", label: "handleSearch(query)", file: "SearchBar.jsx", line: 14 },
    { type: "function", label: "debounce(query, 300ms)", file: "hooks/useSearch.js", line: 5 },
    { type: "api", label: "GET /api/search?q={query}", file: "routes/search.js", line: 1 },
    { type: "route", label: "searchRouter.get('/')", file: "controllers/searchController.js", line: 8 },
    { type: "function", label: "SearchService.query(params)", file: "services/searchService.js", line: 18 },
    { type: "function", label: "db.collection.find(filter)", file: "models/Product.js", line: 34 },
    { type: "response", label: "res.json({ results, total })", file: "controllers/searchController.js", line: 27 },
    { type: "function", label: "setResults(data.results)", file: "SearchBar.jsx", line: 22 },
  ],
};

function StepNode({ step, index, isLast, visible }) {
  const t = STEP_TYPES[step.type] || STEP_TYPES.function;
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(12px)",
      transition: `opacity 0.35s ease ${index * 60}ms, transform 0.35s ease ${index * 60}ms`,
    }}>
      <div style={{
        width: 480,
        maxWidth: "100%",
        display: "flex",
        alignItems: "stretch",
        gap: 0,
        background: t.bg,
        border: `1px solid ${t.border}`,
        borderRadius: 10,
        overflow: "hidden",
        position: "relative",
      }}>
        <div style={{
          width: 4,
          background: t.color,
          flexShrink: 0,
        }} />
        <div style={{ padding: "12px 16px", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{
              fontSize: 10,
              fontFamily: "monospace",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: t.color,
              fontWeight: 700,
              background: `${t.color}22`,
              padding: "2px 7px",
              borderRadius: 4,
            }}>{t.label}</span>
            <span style={{ fontSize: 10, color: "#475569", fontFamily: "monospace" }}>
              {step.file}:{step.line}
            </span>
          </div>
          <div style={{
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 14,
            color: "#e2e8f0",
            fontWeight: 500,
          }}>{step.label}</div>
        </div>
        <div style={{
          position: "absolute",
          right: 12,
          top: "50%",
          transform: "translateY(-50%)",
          fontSize: 11,
          color: "#334155",
          fontFamily: "monospace",
        }}>#{index + 1}</div>
      </div>

      {!isLast && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{
            width: 1,
            height: 20,
            background: "linear-gradient(to bottom, #334155, #1e293b)",
          }} />
          <svg width="10" height="6" viewBox="0 0 10 6">
            <path d="M5 6 L0 0 L10 0 Z" fill="#334155" />
          </svg>
        </div>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div style={{
      display: "flex",
      flexWrap: "wrap",
      gap: "8px 16px",
      justifyContent: "center",
      marginBottom: 28,
    }}>
      {Object.entries(STEP_TYPES).map(([key, val]) => (
        <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: val.color }} />
          <span style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>{val.label}</span>
        </div>
      ))}
    </div>
  );
}

function GlowOrb({ x, y, color, size }) {
  return (
    <div style={{
      position: "absolute",
      left: x, top: y,
      width: size, height: size,
      borderRadius: "50%",
      background: color,
      filter: "blur(80px)",
      opacity: 0.18,
      pointerEvents: "none",
    }} />
  );
}

export default function App() {
  const [url, setUrl] = useState("");
  const [flow, setFlow] = useState(null);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [activeTab, setActiveTab] = useState("flow");
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  const demos = [
    { label: "Login flow", url: "https://github.com/example/app", key: "login" },
    { label: "Checkout", url: "https://github.com/example/shop", key: "checkout" },
    { label: "Search", url: "https://github.com/example/search", key: "search" },
  ];

 const handleAnalyze = async () => {
  if (!url) {
    setError("Please enter a GitHub repo URL");
    return;
  }

  try {
    setLoading(true);
    setError("");
    setFlow(null);

    const res = await fetch("http://localhost:5000/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ repoUrl: url }),
    });

    console.log("STATUS:", res.status);

    const text = await res.text(); // 👈 IMPORTANT
    console.log("RAW RESPONSE:", text);

    if (!res.ok) {
      throw new Error(text);
    }

    const data = JSON.parse(text); // parse manually

    setFlow(Array.isArray(data.flow) ? data.flow : []);
    setVisible(true);

  } catch (err) {
    console.error("ERROR:", err);
    setError(err.message);
  } finally {
    setLoading(false);
  }
};
  const stats = flow ? {
    total: flow.length,
    frontend: flow.filter(s => ["event", "function"].includes(s.type) && !s.file.includes("Controller") && !s.file.includes("Service") && !s.file.includes("routes")).length,
    backend: flow.filter(s => s.file && (s.file.includes("Controller") || s.file.includes("Service") || s.file.includes("routes"))).length,
    api: flow.filter(s => s.type === "api").length,
  } : null;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#070d1a",
      color: "#e2e8f0",
      fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif",
      position: "relative",
      overflow: "hidden",
    }}>
      <GlowOrb x="-80px" y="40px" color="#7c3aed" size="400px" />
      <GlowOrb x="60%" y="200px" color="#0ea5e9" size="350px" />
      <GlowOrb x="20%" y="70%" color="#10b981" size="300px" />

      {/* Grid texture */}
      <div style={{
        position: "fixed",
        inset: 0,
        backgroundImage: "linear-gradient(rgba(99,102,241,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.04) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
        pointerEvents: "none",
        zIndex: 0,
      }} />

      <div style={{ position: "relative", zIndex: 1, padding: "48px 24px 80px" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 52, maxWidth: 640, margin: "0 auto 52px" }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(124,58,237,0.12)",
            border: "1px solid rgba(124,58,237,0.3)",
            borderRadius: 20,
            padding: "4px 14px",
            fontSize: 11,
            color: "#a78bfa",
            fontFamily: "monospace",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            marginBottom: 24,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#7c3aed", display: "inline-block" }} />
            Static AST Analysis Engine
          </div>

          <h1 style={{
            fontSize: "clamp(32px, 6vw, 58px)",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
            margin: "0 0 16px",
            color: "#f8fafc",
          }}>
            <span style={{ color: "#a78bfa" }}>SHINKEI</span>
          </h1>
          <p style={{
            fontFamily: "monospace",
            fontSize: 13,
            color: "#64748b",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            margin: "0 0 12px",
          }}>神経 / Execution Flow Visualizer</p>
          <p style={{
            fontSize: 16,
            color: "#94a3b8",
            lineHeight: 1.6,
            margin: 0,
          }}>
            Trace every step from frontend interaction to backend response. Zero runtime overhead.
          </p>
        </div>

        {/* Input */}
        <div style={{ maxWidth: 620, margin: "0 auto 16px" }}>
          <div style={{
            display: "flex",
            gap: 10,
            background: "rgba(15,23,42,0.8)",
            border: "1px solid rgba(99,102,241,0.25)",
            borderRadius: 12,
            padding: 6,
            backdropFilter: "blur(12px)",
          }}>
            <input
              ref={inputRef}
              type="text"
              placeholder="https://github.com/username/repository"
              value={url}
              onChange={e => { setUrl(e.target.value); setError(""); }}
              onKeyDown={e => e.key === "Enter" && handleAnalyze}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "#e2e8f0",
                fontSize: 14,
                fontFamily: "monospace",
                padding: "10px 14px",
              }}
            />
            <button
              onClick={handleAnalyze}
              disabled={loading}
              style={{
                background: loading ? "#334155" : "linear-gradient(135deg,#7c3aed,#6366f1)",
                border: "none",
                borderRadius: 8,
                color: "#fff",
                fontWeight: 700,
                fontSize: 13,
                padding: "10px 22px",
                cursor: loading ? "default" : "pointer",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                fontFamily: "monospace",
                transition: "opacity 0.2s",
                opacity: loading ? 0.6 : 1,
                flexShrink: 0,
              }}
            >
              {loading ? "Parsing..." : "Analyze →"}
            </button>
          </div>
          {error && <p style={{ color: "#f87171", fontSize: 12, marginTop: 8, fontFamily: "monospace", paddingLeft: 6 }}>{error}</p>}
        </div>

        {/* Demo buttons */}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 48, flexWrap: "wrap" }}>
          {demos.map(d => (
            <button
              key={d.key}
              onClick={() => {
  setUrl(d.url);
  setTimeout(() => handleAnalyze(), 0);
}}
              style={{
                background: "rgba(30,41,59,0.7)",
                border: "1px solid rgba(71,85,105,0.5)",
                borderRadius: 8,
                color: "#94a3b8",
                fontSize: 12,
                padding: "7px 16px",
                cursor: "pointer",
                fontFamily: "monospace",
                transition: "border-color 0.2s, color 0.2s",
              }}
              onMouseEnter={e => { e.target.style.borderColor = "#7c3aed"; e.target.style.color = "#c4b5fd"; }}
              onMouseLeave={e => { e.target.style.borderColor = "rgba(71,85,105,0.5)"; e.target.style.color = "#94a3b8"; }}
            >
              Try: {d.label}
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{
              display: "inline-flex",
              gap: 6,
              alignItems: "center",
              color: "#64748b",
              fontFamily: "monospace",
              fontSize: 13,
            }}>
              {["Parsing AST", "Resolving imports", "Tracing calls", "Building graph"].map((t, i) => (
                <span key={i} style={{
                  animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
                  opacity: 0.4,
                }}>
                  {t}{i < 3 ? " →" : ""}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {flow && !loading && (
          <div style={{ maxWidth: 640, margin: "0 auto" }}>

            {/* Stats bar */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 10,
              marginBottom: 28,
            }}>
              {[
                { label: "Total steps", value: stats.total, color: "#a78bfa" },
                { label: "Frontend", value: stats.frontend, color: "#60a5fa" },
                { label: "Backend", value: stats.backend, color: "#34d399" },
                { label: "API calls", value: stats.api, color: "#fbbf24" },
              ].map(s => (
                <div key={s.label} style={{
                  background: "rgba(15,23,42,0.8)",
                  border: "1px solid rgba(71,85,105,0.3)",
                  borderRadius: 10,
                  padding: "12px 16px",
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: "monospace", lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 4, fontFamily: "monospace" }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 2, marginBottom: 24, background: "rgba(15,23,42,0.6)", border: "1px solid rgba(71,85,105,0.3)", borderRadius: 10, padding: 4 }}>
              {["flow", "summary"].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    flex: 1,
                    background: activeTab === tab ? "rgba(124,58,237,0.2)" : "transparent",
                    border: activeTab === tab ? "1px solid rgba(124,58,237,0.4)" : "1px solid transparent",
                    borderRadius: 7,
                    color: activeTab === tab ? "#c4b5fd" : "#475569",
                    fontSize: 12,
                    padding: "8px 0",
                    cursor: "pointer",
                    fontFamily: "monospace",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    fontWeight: 700,
                    transition: "all 0.2s",
                  }}
                >{tab}</button>
              ))}
            </div>

            {activeTab === "flow" && (
              <div>
                <Legend />
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  {flow.map((step, i) => (
                    <StepNode key={i} step={step} index={i} isLast={i === flow.length - 1} visible={visible} />
                  ))}
                </div>
              </div>
            )}

            {activeTab === "summary" && (
              <div style={{
                background: "rgba(15,23,42,0.8)",
                border: "1px solid rgba(71,85,105,0.3)",
                borderRadius: 12,
                overflow: "hidden",
              }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(71,85,105,0.2)" }}>
                  <span style={{ fontSize: 12, color: "#64748b", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em" }}>Execution Path Summary</span>
                </div>
                {flow.map((step, i) => {
                  const t = STEP_TYPES[step.type] || STEP_TYPES.function;
                  return (
                    <div key={i} style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 20px",
                      borderBottom: i < flow.length - 1 ? "1px solid rgba(30,41,59,0.8)" : "none",
                      opacity: visible ? 1 : 0,
                      transition: `opacity 0.3s ease ${i * 40}ms`,
                    }}>
                      <span style={{ fontSize: 11, color: "#334155", fontFamily: "monospace", minWidth: 20 }}>{String(i + 1).padStart(2, "0")}</span>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
                      <span style={{ fontFamily: "monospace", fontSize: 13, color: "#cbd5e1", flex: 1 }}>{step.label}</span>
                      <span style={{ fontSize: 11, color: "#334155", fontFamily: "monospace" }}>{step.file}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!flow && !loading && (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{
              width: 64,
              height: 64,
              margin: "0 auto 16px",
              background: "rgba(124,58,237,0.08)",
              border: "1px solid rgba(124,58,237,0.2)",
              borderRadius: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
            }}>⬡</div>
            <p style={{ color: "#334155", fontFamily: "monospace", fontSize: 13 }}>No execution flow loaded yet</p>
          </div>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        input::placeholder { color: #334155; }
        @keyframes pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}
