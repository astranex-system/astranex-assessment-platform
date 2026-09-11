"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Shield, Lock, ArrowRight, AlertTriangle, CheckCircle } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function CandidatePortalLanding() {
  const [tokenInput, setTokenInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Check if token is passed via query param ?token=xyz
    const params = new URLSearchParams(window.location.search);
    const tok = params.get("token");
    if (tok) {
      setTokenInput(tok);
    }
  }, []);

  const handleStartAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) {
      setError("Please enter a valid assessment invitation token.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/v1/candidate/session/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenInput.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Failed to initialize assessment session.");
      }

      // Store CSRF token in sessionStorage for API headers
      if (data.csrf_token) {
        sessionStorage.setItem("astranex_csrf", data.csrf_token);
      }

      // Redirect to assessment workspace
      router.push("/assessment");
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
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
      background: "radial-gradient(circle at top, #111e38 0%, #0a0f1d 70%)"
    }}>
      <div style={{
        maxWidth: "520px",
        width: "100%",
        backgroundColor: "var(--bg-card)",
        border: "1px solid var(--border-color)",
        borderRadius: "12px",
        padding: "2.5rem 2rem",
        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
          <div style={{
            background: "rgba(6, 182, 212, 0.1)",
            padding: "0.75rem",
            borderRadius: "8px",
            border: "1px solid rgba(6, 182, 212, 0.3)"
          }}>
            <Shield size={28} color="var(--accent-cyan)" />
          </div>
          <div>
            <h1 style={{ fontSize: "1.35rem", fontWeight: 700, letterSpacing: "-0.02em" }}>AstraNex Defence</h1>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Secure Technical Evaluation Environment</p>
          </div>
        </div>

        <div style={{
          backgroundColor: "#0d1424",
          borderLeft: "4px solid var(--accent-cyan)",
          padding: "1rem",
          borderRadius: "4px",
          marginBottom: "1.75rem",
          fontSize: "0.875rem",
          color: "#d1d5db"
        }}>
          <p style={{ fontWeight: 600, marginBottom: "0.25rem" }}>Candidate Security Notice</p>
          <p>
            You are entering a monitored high-security technical assessment. All evaluation logic and time tracking occur strictly on AstraNex secure servers.
          </p>
        </div>

        {error && (
          <div style={{
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            border: "1px solid var(--accent-red)",
            borderRadius: "6px",
            padding: "0.75rem 1rem",
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            fontSize: "0.875rem",
            color: "#fca5a5"
          }}>
            <AlertTriangle size={18} color="var(--accent-red)" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleStartAssessment}>
          <div style={{ marginBottom: "1.5rem" }}>
            <label style={{
              display: "block",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--text-muted)",
              marginBottom: "0.5rem"
            }}>
              ASSESSMENT INVITATION TOKEN
            </label>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Paste your unique token string here..."
                style={{
                  width: "100%",
                  padding: "0.85rem 1rem 0.85rem 2.5rem",
                  backgroundColor: "#090d16",
                  border: "1px solid var(--border-color)",
                  borderRadius: "6px",
                  color: "#ffffff",
                  fontSize: "0.95rem",
                  fontFamily: "var(--font-mono)",
                  outline: "none",
                  transition: "border-color 0.2s"
                }}
                onFocus={(e) => e.target.style.borderColor = "var(--accent-cyan)"}
                onBlur={(e) => e.target.style.borderColor = "var(--border-color)"}
              />
              <Lock size={18} color="var(--text-muted)" style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)" }} />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "0.9rem",
              backgroundColor: loading ? "#1f293d" : "var(--accent-blue)",
              border: "none",
              borderRadius: "6px",
              color: "#ffffff",
              fontWeight: 600,
              fontSize: "0.95rem",
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              transition: "background-color 0.2s"
            }}
          >
            {loading ? "Validating Credentials..." : (
              <>
                <span>Begin Technical Assessment</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div style={{
          marginTop: "2rem",
          paddingTop: "1.25rem",
          borderTop: "1px solid var(--border-color)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "0.75rem",
          color: "var(--text-muted)"
        }}>
          <span>AstraNex Security v2.4</span>
          <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <CheckCircle size={14} color="var(--accent-green)" /> Server-Clock Sync Active
          </span>
        </div>
      </div>
    </div>
  );
}
