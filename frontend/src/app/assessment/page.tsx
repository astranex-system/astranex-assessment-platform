"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Shield, Clock, AlertTriangle, Check, Play, Save, CheckCircle2, Lock, FileCode, Radio } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface QuestionOption {
  id: string;
  option_text: string;
  display_order: number;
}

interface Question {
  id: string;
  question_text: string;
  question_type: "MCQ" | "CODING" | "TEXT";
  marks: number;
  display_order: number;
  options: QuestionOption[];
}

interface SubmissionState {
  question_id: string;
  selected_option_id?: string;
  text_response?: string;
  code_response?: string;
  programming_language?: string;
}

export default function AssessmentWorkspace() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [activeQIndex, setActiveQIndex] = useState(0);
  const [submissions, setSubmissions] = useState<Record<string, SubmissionState>>({});

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isFinished, setIsFinished] = useState(false);
  const [finalResult, setFinalResult] = useState<any>(null);

  // Load session & questions
  useEffect(() => {
    fetchSessionAndQuestions();
  }, []);

  // Telemetry: Focus loss tracker
  useEffect(() => {
    const handleBlur = () => {
      const csrf = sessionStorage.getItem("astranex_csrf") || "";
      fetch(`${API_BASE}/api/v1/candidate/telemetry/focus`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf
        },
        body: JSON.stringify({ timestamp: new Date().toISOString() })
      }).catch(() => {});
    };

    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, []);

  // Countdown timer based strictly on server expires_at
  useEffect(() => {
    if (!session?.expires_at || isFinished) return;

    const interval = setInterval(() => {
      const exp = new Date(session.expires_at).getTime();
      const now = new Date().getTime();
      const diff = Math.max(0, Math.floor((exp - now) / 1000));
      setTimeLeft(diff);

      if (diff <= 0) {
        clearInterval(interval);
        handleFinishAssessment(true);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [session, isFinished]);

  const fetchSessionAndQuestions = async () => {
    try {
      setLoading(true);
      const [sessRes, qRes] = await Promise.all([
        fetch(`${API_BASE}/api/v1/candidate/session/me`, { headers: { "Content-Type": "application/json" } }),
        fetch(`${API_BASE}/api/v1/candidate/questions`, { headers: { "Content-Type": "application/json" } })
      ]);

      if (sessRes.status === 401 || qRes.status === 401) {
        router.push("/");
        return;
      }

      const sessData = await sessRes.json();
      const qData = await qRes.json();

      setSession(sessData);
      setQuestions(qData);

      // Populate existing draft submissions
      const subMap: Record<string, SubmissionState> = {};
      if (sessData.submissions) {
        sessData.submissions.forEach((s: any) => {
          subMap[s.question_id] = {
            question_id: s.question_id,
            selected_option_id: s.selected_option_id,
            text_response: s.text_response,
            code_response: s.code_response,
            programming_language: s.programming_language || "python"
          };
        });
      }
      setSubmissions(subMap);

      if (sessData.status === "SUBMITTED" || sessData.status === "EXPIRED") {
        setIsFinished(true);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load assessment data.");
    } finally {
      setLoading(false);
    }
  };

  const handleOptionSelect = (qId: string, optId: string) => {
    setSubmissions(prev => ({
      ...prev,
      [qId]: {
        ...prev[qId],
        question_id: qId,
        selected_option_id: optId
      }
    }));
  };

  const handleCodeChange = (qId: string, code: string, lang: string = "python") => {
    setSubmissions(prev => ({
      ...prev,
      [qId]: {
        ...prev[qId],
        question_id: qId,
        code_response: code,
        programming_language: lang
      }
    }));
  };

  const handleTextChange = (qId: string, text: string) => {
    setSubmissions(prev => ({
      ...prev,
      [qId]: {
        ...prev[qId],
        question_id: qId,
        text_response: text
      }
    }));
  };

  const submitSingleAnswer = async (qId: string) => {
    const subData = submissions[qId];
    if (!subData) return;

    const csrf = sessionStorage.getItem("astranex_csrf") || "";
    setSubmitting(true);
    setSaveMessage(null);

    try {
      const res = await fetch(`${API_BASE}/api/v1/candidate/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf
        },
        body: JSON.stringify(subData)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Submission failed");

      setSaveMessage("Draft saved & evaluated server-side.");
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to submit response.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinishAssessment = async (autoExpired: boolean = false) => {
    if (!autoExpired && !confirm("Are you sure you want to finalize and submit your assessment? You cannot modify your answers afterwards.")) {
      return;
    }

    const csrf = sessionStorage.getItem("astranex_csrf") || "";
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/v1/candidate/session/finish`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf
        }
      });
      const data = await res.json();
      setFinalResult(data);
      setIsFinished(true);
    } catch (err: any) {
      setError(err.message || "Failed to submit assessment.");
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number | null) => {
    if (seconds === null) return "--:--";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "var(--text-muted)" }}>
        <Shield className="animate-spin" size={32} color="var(--accent-cyan)" />
        <span style={{ marginLeft: "1rem", fontSize: "1.1rem" }}>Connecting to Secure AstraNex Server...</span>
      </div>
    );
  }

  if (isFinished) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "2rem" }}>
        <div style={{
          maxWidth: "550px",
          width: "100%",
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border-color)",
          borderRadius: "12px",
          padding: "2.5rem",
          textAlign: "center"
        }}>
          <CheckCircle2 size={54} color="var(--accent-green)" style={{ margin: "0 auto 1.5rem" }} />
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>Assessment Complete</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", marginBottom: "1.5rem" }}>
            {finalResult?.message || "Your assessment responses have been safely recorded and evaluated on AstraNex servers."}
          </p>

          {finalResult?.total_score !== null && finalResult?.total_score !== undefined && (
            <div style={{
              backgroundColor: "#0d172a",
              border: "1px solid var(--accent-blue)",
              padding: "1rem",
              borderRadius: "8px",
              marginBottom: "1.5rem"
            }}>
              <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", display: "block" }}>FINAL SCORE</span>
              <span style={{ fontSize: "1.8rem", fontWeight: 700, color: "var(--accent-cyan)" }}>{finalResult.total_score} pts</span>
            </div>
          )}

          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", borderTop: "1px solid var(--border-color)", paddingTop: "1rem" }}>
            Recruiters will be notified automatically. You may close this window safely.
          </div>
        </div>
      </div>
    );
  }

  const currentQ = questions[activeQIndex];
  const currentSub: Partial<SubmissionState> = currentQ ? (submissions[currentQ.id] || {}) : {};

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Header */}
      <header style={{
        height: "60px",
        backgroundColor: "var(--bg-card)",
        borderBottom: "1px solid var(--border-color)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 1.5rem"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Shield size={22} color="var(--accent-cyan)" />
          <span style={{ fontWeight: 700, fontSize: "1.05rem" }}>AstraNex Defence</span>
          <span style={{ color: "var(--border-color)" }}>|</span>
          <span style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>{session?.assessment?.title}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            backgroundColor: timeLeft !== null && timeLeft < 300 ? "rgba(239, 68, 68, 0.15)" : "#090e1a",
            border: `1px solid ${timeLeft !== null && timeLeft < 300 ? "var(--accent-red)" : "var(--border-color)"}`,
            padding: "0.4rem 0.85rem",
            borderRadius: "6px",
            fontSize: "0.9rem",
            fontFamily: "var(--font-mono)",
            fontWeight: 600,
            color: timeLeft !== null && timeLeft < 300 ? "var(--accent-red)" : "var(--text-main)"
          }}>
            <Clock size={16} />
            <span>{formatTime(timeLeft)}</span>
          </div>

          <button
            onClick={() => handleFinishAssessment(false)}
            style={{
              padding: "0.45rem 1rem",
              backgroundColor: "var(--accent-red)",
              border: "none",
              borderRadius: "6px",
              color: "#fff",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: "pointer"
            }}
          >
            Submit Assessment
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left Navigator Sidebar */}
        <aside style={{
          width: "250px",
          backgroundColor: "#0d1322",
          borderRight: "1px solid var(--border-color)",
          padding: "1rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem"
        }}>
          <h3 style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
            QUESTIONS ({questions.length})
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", flex: 1, overflowY: "auto" }}>
            {questions.map((q, idx) => {
              const isAnswered = Boolean(submissions[q.id]?.selected_option_id || submissions[q.id]?.code_response || submissions[q.id]?.text_response);
              const isActive = idx === activeQIndex;

              return (
                <button
                  key={q.id}
                  onClick={() => setActiveQIndex(idx)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.65rem 0.85rem",
                    backgroundColor: isActive ? "var(--bg-card-hover)" : "transparent",
                    border: `1px solid ${isActive ? "var(--accent-cyan)" : "transparent"}`,
                    borderRadius: "6px",
                    color: isActive ? "#fff" : "var(--text-muted)",
                    fontSize: "0.875rem",
                    cursor: "pointer",
                    textAlign: "left"
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {q.question_type === "CODING" ? <FileCode size={16} /> : <Radio size={16} />}
                    <span>Q{idx + 1} ({q.question_type})</span>
                  </span>
                  {isAnswered && <Check size={14} color="var(--accent-green)" />}
                </button>
              );
            })}
          </div>

          <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "0.75rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
            Server Auto-Sync Active
          </div>
        </aside>

        {/* Content Area */}
        <main style={{ flex: 1, padding: "2rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {currentQ ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--accent-cyan)", letterSpacing: "0.05em" }}>
                    QUESTION {activeQIndex + 1} OF {questions.length} • {currentQ.marks} MARKS
                  </span>
                  <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginTop: "0.25rem" }}>{currentQ.question_text}</h2>
                </div>
                {saveMessage && (
                  <span style={{ fontSize: "0.8rem", color: "var(--accent-green)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <CheckCircle2 size={14} /> {saveMessage}
                  </span>
                )}
              </div>

              {/* Question Input Type Component */}
              {currentQ.question_type === "MCQ" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {currentQ.options.map((opt) => {
                    const selected = currentSub.selected_option_id === opt.id;
                    return (
                      <label
                        key={opt.id}
                        onClick={() => handleOptionSelect(currentQ.id, opt.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.85rem",
                          padding: "1rem 1.25rem",
                          backgroundColor: selected ? "rgba(6, 182, 212, 0.08)" : "var(--bg-card)",
                          border: `1px solid ${selected ? "var(--accent-cyan)" : "var(--border-color)"}`,
                          borderRadius: "8px",
                          cursor: "pointer",
                          transition: "all 0.2s"
                        }}
                      >
                        <input
                          type="radio"
                          name={`q_${currentQ.id}`}
                          checked={selected}
                          onChange={() => {}}
                          style={{ accentColor: "var(--accent-cyan)" }}
                        />
                        <span style={{ fontSize: "0.95rem", color: "#e5e7eb" }}>{opt.option_text}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {currentQ.question_type === "CODING" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Source Code Editor</span>
                    <select
                      value={currentSub.programming_language || "python"}
                      onChange={(e) => handleCodeChange(currentQ.id, currentSub.code_response || "", e.target.value)}
                      style={{
                        padding: "0.35rem 0.75rem",
                        backgroundColor: "#090e1a",
                        border: "1px solid var(--border-color)",
                        borderRadius: "4px",
                        color: "#fff",
                        fontSize: "0.85rem"
                      }}
                    >
                      <option value="python">Python 3</option>
                      <option value="javascript">JavaScript (Node)</option>
                      <option value="cpp">C++ 17</option>
                    </select>
                  </div>

                  <textarea
                    value={currentSub.code_response || ""}
                    onChange={(e) => handleCodeChange(currentQ.id, e.target.value, currentSub.programming_language || "python")}
                    placeholder="# Write your solution code here..."
                    style={{
                      flex: 1,
                      minHeight: "320px",
                      width: "100%",
                      backgroundColor: "#060911",
                      border: "1px solid var(--border-color)",
                      borderRadius: "6px",
                      padding: "1rem",
                      color: "#38bdf8",
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.9rem",
                      outline: "none",
                      resize: "vertical"
                    }}
                  />
                </div>
              )}

              {currentQ.question_type === "TEXT" && (
                <textarea
                  value={currentSub.text_response || ""}
                  onChange={(e) => handleTextChange(currentQ.id, e.target.value)}
                  placeholder="Type your explanation or response here..."
                  style={{
                    minHeight: "200px",
                    width: "100%",
                    backgroundColor: "#060911",
                    border: "1px solid var(--border-color)",
                    borderRadius: "6px",
                    padding: "1rem",
                    color: "#fff",
                    fontSize: "0.95rem",
                    outline: "none"
                  }}
                />
              )}

              {/* Action Toolbar */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto", paddingTop: "1rem" }}>
                <button
                  disabled={activeQIndex === 0}
                  onClick={() => setActiveQIndex(prev => prev - 1)}
                  style={{
                    padding: "0.6rem 1.2rem",
                    backgroundColor: "var(--bg-card)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "6px",
                    color: "#fff",
                    cursor: activeQIndex === 0 ? "not-allowed" : "pointer"
                  }}
                >
                  Previous Question
                </button>

                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button
                    onClick={() => submitSingleAnswer(currentQ.id)}
                    disabled={submitting}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      padding: "0.6rem 1.25rem",
                      backgroundColor: "var(--accent-blue)",
                      border: "none",
                      borderRadius: "6px",
                      color: "#fff",
                      fontWeight: 600,
                      cursor: submitting ? "not-allowed" : "pointer"
                    }}
                  >
                    <Save size={16} />
                    <span>{submitting ? "Saving..." : "Save Answer"}</span>
                  </button>

                  <button
                    disabled={activeQIndex === questions.length - 1}
                    onClick={() => setActiveQIndex(prev => prev + 1)}
                    style={{
                      padding: "0.6rem 1.2rem",
                      backgroundColor: "var(--bg-card)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "6px",
                      color: "#fff",
                      cursor: activeQIndex === questions.length - 1 ? "not-allowed" : "pointer"
                    }}
                  >
                    Next Question
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div>No questions found for this assessment.</div>
          )}
        </main>
      </div>
    </div>
  );
}
