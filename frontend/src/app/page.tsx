"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Shield, Mail, User, Lock, BookOpen, ArrowRight, AlertTriangle, CheckCircle, Key, ChevronDown, UserPlus, LogIn } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface PublicAssessment {
  id: string;
  title: string;
  description?: string;
  duration_minutes: number;
  question_count: number;
}

export default function CandidatePortalLanding() {
  const router = useRouter();

  // Mode: "register" (create account) or "login" (sign in)
  const [authMode, setAuthMode] = useState<"register" | "login">("register");

  // Form Fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [selectedAsmId, setSelectedAsmId] = useState<string>("");

  // Assessments list
  const [assessments, setAssessments] = useState<PublicAssessment[]>([]);
  const [loadingAssessments, setLoadingAssessments] = useState(true);

  // Alternative token login
  const [showTokenMode, setShowTokenMode] = useState(false);
  const [tokenInput, setTokenInput] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAssessments = async () => {
      try {
        setLoadingAssessments(true);
        const res = await fetch(`${API_BASE}/api/v1/candidate/assessments`);
        if (res.ok) {
          const data: PublicAssessment[] = await res.json();
          setAssessments(data);
          if (data.length > 0) {
            setSelectedAsmId(data[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to load assessments:", err);
      } finally {
        setLoadingAssessments(false);
      }
    };

    fetchAssessments();

    const params = new URLSearchParams(window.location.search);
    const tok = params.get("token");
    if (tok) {
      setTokenInput(tok);
      setShowTokenMode(true);
    }
  }, []);

  const saveCandidateSession = (data: any) => {
    if (data.access_token) {
      sessionStorage.setItem("astranex_candidate_token", data.access_token);
    }
    if (data.csrf_token) {
      sessionStorage.setItem("astranex_csrf", data.csrf_token);
    }
    if (data.candidate_name) {
      sessionStorage.setItem("astranex_candidate_name", data.candidate_name);
    }
    if (data.candidate_email) {
      sessionStorage.setItem("astranex_candidate_email", data.candidate_email);
    }
    router.push("/assessment");
  };

  // Handler: Candidate Registration
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim() || !email.trim()) {
      setError("Please provide both your Full Name and Email Address.");
      return;
    }
    if (!password || password.length < 4) {
      setError("Password must be at least 4 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/candidate/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          password: password,
          assessment_id: selectedAsmId || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Registration failed.");
      }

      saveCandidateSession(data);
    } catch (err: any) {
      setError(err.message || "An error occurred during registration.");
    } finally {
      setLoading(false);
    }
  };

  // Handler: Candidate Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError("Please enter your registered email address.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/candidate/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password: password || undefined,
          assessment_id: selectedAsmId || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Login failed.");
      }

      saveCandidateSession(data);
    } catch (err: any) {
      setError(err.message || "An error occurred during login.");
    } finally {
      setLoading(false);
    }
  };

  // Handler: Legacy Token Start
  const handleTokenStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) {
      setError("Please enter a valid invitation token.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/v1/candidate/session/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenInput.trim() })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to initialize assessment session.");
      }

      saveCandidateSession(data);
    } catch (err: any) {
      setError(err.message || "An error occurred with this invitation token.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      flex: 1,
      padding: "2rem 1rem",
      background: "radial-gradient(circle at top, #111e38 0%, #0a0f1d 75%)"
    }}>
      <div style={{
        maxWidth: "520px",
        width: "100%",
        backgroundColor: "var(--bg-card)",
        border: "1px solid var(--border-color)",
        borderRadius: "12px",
        padding: "2.25rem 2rem",
        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)"
      }}>
        {/* Logo & Header */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "1.5rem" }}>
          <img
            src="/logo.jpg"
            alt="AstraNex Defence"
            style={{ height: "64px", objectFit: "contain", borderRadius: "6px", marginBottom: "0.75rem" }}
          />
          <h1 style={{ fontSize: "1.35rem", fontWeight: 700, color: "#ffffff", textAlign: "center", letterSpacing: "-0.01em" }}>
            AstraNex Defence Systems
          </h1>
          <p style={{ fontSize: "0.85rem", color: "var(--accent-cyan)", marginTop: "0.2rem", fontWeight: 600 }}>
            Online Technical Examination Portal
          </p>
        </div>

        {/* Tab Switcher: Register vs Login */}
        {!showTokenMode && (
          <div style={{
            display: "flex",
            backgroundColor: "#060911",
            borderRadius: "8px",
            padding: "4px",
            marginBottom: "1.5rem",
            border: "1px solid var(--border-color)"
          }}>
            <button
              type="button"
              onClick={() => { setAuthMode("register"); setError(null); }}
              style={{
                flex: 1,
                padding: "0.65rem",
                borderRadius: "6px",
                border: "none",
                fontWeight: 600,
                fontSize: "0.85rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.4rem",
                cursor: "pointer",
                backgroundColor: authMode === "register" ? "var(--accent-blue)" : "transparent",
                color: authMode === "register" ? "#ffffff" : "var(--text-muted)",
                transition: "all 0.2s"
              }}
            >
              <UserPlus size={16} />
              <span>Register Account</span>
            </button>
            <button
              type="button"
              onClick={() => { setAuthMode("login"); setError(null); }}
              style={{
                flex: 1,
                padding: "0.65rem",
                borderRadius: "6px",
                border: "none",
                fontWeight: 600,
                fontSize: "0.85rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.4rem",
                cursor: "pointer",
                backgroundColor: authMode === "login" ? "var(--accent-blue)" : "transparent",
                color: authMode === "login" ? "#ffffff" : "var(--text-muted)",
                transition: "all 0.2s"
              }}
            >
              <LogIn size={16} />
              <span>Sign In</span>
            </button>
          </div>
        )}

        {/* Notice Banner */}
        <div style={{
          backgroundColor: "#0d1424",
          borderLeft: "4px solid var(--accent-cyan)",
          padding: "0.75rem 1rem",
          borderRadius: "4px",
          marginBottom: "1.25rem",
          fontSize: "0.825rem",
          color: "#d1d5db",
          lineHeight: 1.45
        }}>
          {showTokenMode ? (
            <p>Enter your single-use invitation token to connect to your assessment session.</p>
          ) : authMode === "register" ? (
            <p><strong>New candidate?</strong> Register below with your Name, Email, and Password to start your examination.</p>
          ) : (
            <p><strong>Already registered?</strong> Sign in with your Email and Password to begin or resume your examination.</p>
          )}
        </div>

        {/* Error Alert with Smart Action Link */}
        {error && (
          <div style={{
            backgroundColor: "rgba(239, 68, 68, 0.12)",
            border: "1px solid var(--accent-red)",
            borderRadius: "6px",
            padding: "0.75rem 1rem",
            marginBottom: "1.25rem",
            fontSize: "0.85rem",
            color: "#fca5a5"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: error.includes("Register") || error.includes("Login") ? "0.4rem" : "0" }}>
              <AlertTriangle size={18} color="var(--accent-red)" style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
            {error.includes("Register") && (
              <button
                type="button"
                onClick={() => { setAuthMode("register"); setError(null); }}
                style={{ background: "none", border: "none", color: "var(--accent-cyan)", fontWeight: 700, cursor: "pointer", fontSize: "0.8rem", textDecoration: "underline", padding: 0 }}
              >
                Click here to Register now →
              </button>
            )}
            {error.includes("Login") && (
              <button
                type="button"
                onClick={() => { setAuthMode("login"); setError(null); }}
                style={{ background: "none", border: "none", color: "var(--accent-cyan)", fontWeight: 700, cursor: "pointer", fontSize: "0.8rem", textDecoration: "underline", padding: 0 }}
              >
                Click here to Sign In →
              </button>
            )}
          </div>
        )}

        {/* Form 1: Register New Candidate */}
        {!showTokenMode && authMode === "register" && (
          <form onSubmit={handleRegister}>
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                FULL NAME
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Milan Jyoti Ray"
                  style={{ width: "100%", padding: "0.75rem 1rem 0.75rem 2.4rem", backgroundColor: "#090d16", border: "1px solid var(--border-color)", borderRadius: "6px", color: "#fff", fontSize: "0.9rem", outline: "none" }}
                />
                <User size={16} color="var(--text-muted)" style={{ position: "absolute", left: "0.8rem", top: "50%", transform: "translateY(-50%)" }} />
              </div>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                EMAIL ADDRESS
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. candidate@example.com"
                  style={{ width: "100%", padding: "0.75rem 1rem 0.75rem 2.4rem", backgroundColor: "#090d16", border: "1px solid var(--border-color)", borderRadius: "6px", color: "#fff", fontSize: "0.9rem", outline: "none" }}
                />
                <Mail size={16} color="var(--text-muted)" style={{ position: "absolute", left: "0.8rem", top: "50%", transform: "translateY(-50%)" }} />
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                  CREATE PASSWORD
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 4 chars..."
                    style={{ width: "100%", padding: "0.75rem 1rem 0.75rem 2.4rem", backgroundColor: "#090d16", border: "1px solid var(--border-color)", borderRadius: "6px", color: "#fff", fontSize: "0.9rem", outline: "none" }}
                  />
                  <Lock size={16} color="var(--text-muted)" style={{ position: "absolute", left: "0.8rem", top: "50%", transform: "translateY(-50%)" }} />
                </div>
              </div>

              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                  CONFIRM PASSWORD
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter..."
                    style={{ width: "100%", padding: "0.75rem 1rem 0.75rem 2.4rem", backgroundColor: "#090d16", border: "1px solid var(--border-color)", borderRadius: "6px", color: "#fff", fontSize: "0.9rem", outline: "none" }}
                  />
                  <Lock size={16} color="var(--text-muted)" style={{ position: "absolute", left: "0.8rem", top: "50%", transform: "translateY(-50%)" }} />
                </div>
              </div>
            </div>

            {/* Assessment Selector */}
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                ASSIGNED EXAMINATION
              </label>
              <div style={{ position: "relative" }}>
                {loadingAssessments ? (
                  <div style={{ padding: "0.75rem", backgroundColor: "#090d16", border: "1px solid var(--border-color)", borderRadius: "6px", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    Loading available exams...
                  </div>
                ) : assessments.length > 1 ? (
                  <div style={{ position: "relative" }}>
                    <select
                      value={selectedAsmId}
                      onChange={(e) => setSelectedAsmId(e.target.value)}
                      style={{ width: "100%", padding: "0.75rem 1rem 0.75rem 2.4rem", backgroundColor: "#090d16", border: "1px solid var(--border-color)", borderRadius: "6px", color: "#ffffff", fontSize: "0.85rem", appearance: "none", cursor: "pointer" }}
                    >
                      {assessments.map(asm => (
                        <option key={asm.id} value={asm.id}>
                          {asm.title} ({asm.duration_minutes} Mins • {asm.question_count} Questions)
                        </option>
                      ))}
                    </select>
                    <BookOpen size={16} color="var(--text-muted)" style={{ position: "absolute", left: "0.8rem", top: "50%", transform: "translateY(-50%)" }} />
                    <ChevronDown size={16} color="var(--text-muted)" style={{ position: "absolute", right: "0.8rem", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                  </div>
                ) : assessments.length === 1 ? (
                  <div style={{ padding: "0.75rem 1rem 0.75rem 2.4rem", backgroundColor: "#090d16", border: "1px solid var(--border-color)", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <BookOpen size={16} color="var(--text-muted)" style={{ position: "absolute", left: "0.8rem" }} />
                    <span style={{ fontWeight: 600, color: "#fff", fontSize: "0.85rem" }}>{assessments[0].title}</span>
                    <span style={{ fontSize: "0.75rem", backgroundColor: "#1e293b", color: "var(--accent-cyan)", padding: "0.15rem 0.4rem", borderRadius: "4px" }}>
                      {assessments[0].duration_minutes} Mins
                    </span>
                  </div>
                ) : (
                  <div style={{ padding: "0.75rem", backgroundColor: "#090d16", border: "1px solid var(--border-color)", borderRadius: "6px", color: "var(--accent-yellow)", fontSize: "0.85rem" }}>
                    No active examinations currently available.
                  </div>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || (!loadingAssessments && assessments.length === 0)}
              style={{ width: "100%", padding: "0.9rem", backgroundColor: loading ? "#1f293d" : "var(--accent-blue)", border: "none", borderRadius: "6px", color: "#ffffff", fontWeight: 700, fontSize: "0.95rem", cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}
            >
              {loading ? "Creating Account..." : (
                <>
                  <span>Register & Begin Examination</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        )}

        {/* Form 2: Login Existing Candidate */}
        {!showTokenMode && authMode === "login" && (
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: "1.2rem" }}>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                REGISTERED EMAIL ADDRESS
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. candidate@example.com"
                  style={{ width: "100%", padding: "0.75rem 1rem 0.75rem 2.4rem", backgroundColor: "#090d16", border: "1px solid var(--border-color)", borderRadius: "6px", color: "#fff", fontSize: "0.9rem", outline: "none" }}
                />
                <Mail size={16} color="var(--text-muted)" style={{ position: "absolute", left: "0.8rem", top: "50%", transform: "translateY(-50%)" }} />
              </div>
            </div>

            <div style={{ marginBottom: "1.2rem" }}>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                ACCOUNT PASSWORD
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password..."
                  style={{ width: "100%", padding: "0.75rem 1rem 0.75rem 2.4rem", backgroundColor: "#090d16", border: "1px solid var(--border-color)", borderRadius: "6px", color: "#fff", fontSize: "0.9rem", outline: "none" }}
                />
                <Lock size={16} color="var(--text-muted)" style={{ position: "absolute", left: "0.8rem", top: "50%", transform: "translateY(-50%)" }} />
              </div>
            </div>

            {/* Assessment Selector */}
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                ASSIGNED EXAMINATION
              </label>
              <div style={{ position: "relative" }}>
                {loadingAssessments ? (
                  <div style={{ padding: "0.75rem", backgroundColor: "#090d16", border: "1px solid var(--border-color)", borderRadius: "6px", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    Loading available exams...
                  </div>
                ) : assessments.length > 1 ? (
                  <div style={{ position: "relative" }}>
                    <select
                      value={selectedAsmId}
                      onChange={(e) => setSelectedAsmId(e.target.value)}
                      style={{ width: "100%", padding: "0.75rem 1rem 0.75rem 2.4rem", backgroundColor: "#090d16", border: "1px solid var(--border-color)", borderRadius: "6px", color: "#ffffff", fontSize: "0.85rem", appearance: "none", cursor: "pointer" }}
                    >
                      {assessments.map(asm => (
                        <option key={asm.id} value={asm.id}>
                          {asm.title} ({asm.duration_minutes} Mins • {asm.question_count} Questions)
                        </option>
                      ))}
                    </select>
                    <BookOpen size={16} color="var(--text-muted)" style={{ position: "absolute", left: "0.8rem", top: "50%", transform: "translateY(-50%)" }} />
                    <ChevronDown size={16} color="var(--text-muted)" style={{ position: "absolute", right: "0.8rem", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                  </div>
                ) : assessments.length === 1 ? (
                  <div style={{ padding: "0.75rem 1rem 0.75rem 2.4rem", backgroundColor: "#090d16", border: "1px solid var(--border-color)", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <BookOpen size={16} color="var(--text-muted)" style={{ position: "absolute", left: "0.8rem" }} />
                    <span style={{ fontWeight: 600, color: "#fff", fontSize: "0.85rem" }}>{assessments[0].title}</span>
                    <span style={{ fontSize: "0.75rem", backgroundColor: "#1e293b", color: "var(--accent-cyan)", padding: "0.15rem 0.4rem", borderRadius: "4px" }}>
                      {assessments[0].duration_minutes} Mins
                    </span>
                  </div>
                ) : (
                  <div style={{ padding: "0.75rem", backgroundColor: "#090d16", border: "1px solid var(--border-color)", borderRadius: "6px", color: "var(--accent-yellow)", fontSize: "0.85rem" }}>
                    No active examinations currently available.
                  </div>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || (!loadingAssessments && assessments.length === 0)}
              style={{ width: "100%", padding: "0.9rem", backgroundColor: loading ? "#1f293d" : "var(--accent-blue)", border: "none", borderRadius: "6px", color: "#ffffff", fontWeight: 700, fontSize: "0.95rem", cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}
            >
              {loading ? "Authenticating Session..." : (
                <>
                  <span>Sign In & Continue Examination</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        )}

        {/* Form 3: Legacy Token Start */}
        {showTokenMode && (
          <form onSubmit={handleTokenStart}>
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.4rem" }}>
                ASSESSMENT INVITATION TOKEN
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Paste your unique token string here..."
                  style={{ width: "100%", padding: "0.8rem 1rem 0.8rem 2.4rem", backgroundColor: "#090d16", border: "1px solid var(--border-color)", borderRadius: "6px", color: "#ffffff", fontSize: "0.95rem", fontFamily: "var(--font-mono)", outline: "none" }}
                />
                <Key size={18} color="var(--text-muted)" style={{ position: "absolute", left: "0.8rem", top: "50%", transform: "translateY(-50%)" }} />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{ width: "100%", padding: "0.95rem", backgroundColor: loading ? "#1f293d" : "var(--accent-blue)", border: "none", borderRadius: "6px", color: "#ffffff", fontWeight: 700, fontSize: "0.95rem", cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.6rem" }}
            >
              {loading ? "Validating Token..." : (
                <>
                  <span>Enter With Token</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        )}

        {/* Toggle between Portal and Legacy Token */}
        <div style={{ textAlign: "center", marginTop: "1.25rem" }}>
          <button
            type="button"
            onClick={() => {
              setShowTokenMode(!showTokenMode);
              setError(null);
            }}
            style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "0.8rem", textDecoration: "underline", cursor: "pointer" }}
          >
            {showTokenMode ? "← Back to Register / Login" : "Have an invitation token? Enter token instead"}
          </button>
        </div>

        {/* Bottom Bar: System & Recruiter link */}
        <div style={{
          marginTop: "1.5rem",
          paddingTop: "1.25rem",
          borderTop: "1px solid var(--border-color)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "0.75rem",
          color: "var(--text-muted)"
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <CheckCircle size={14} color="var(--accent-green)" /> Server Ready
          </span>
          <a
            href="/admin"
            style={{ color: "var(--accent-blue)", textDecoration: "none", fontWeight: 600 }}
          >
            Recruiter Portal →
          </a>
        </div>
      </div>
    </div>
  );
}
