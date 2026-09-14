"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Shield, Clock, AlertTriangle, Check, Play, Save, CheckCircle2, Lock, FileCode, Radio, BookOpen, ShieldAlert, X, Maximize2, ShieldCheck, EyeOff, ArrowRight } from "lucide-react";
import { parseAssessmentContent } from "@/components/AssessmentDetailsView";
import CodingPad from "@/components/CodingPad";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://astranex-assesment-api.onrender.com";

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
  const isFinishedRef = useRef(false);
  const [finalResult, setFinalResult] = useState<any>(null);
  const [redirectCountdown, setRedirectCountdown] = useState<number>(3);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [isSubmittingFinal, setIsSubmittingFinal] = useState(false);

  // Full-Screen & Integrity Lockdown States
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasEnteredFullscreen, setHasEnteredFullscreen] = useState(false);
  const [isSecurityLocked, setIsSecurityLocked] = useState(false);
  const [lockReason, setLockReason] = useState<"FULLSCREEN_EXIT" | "TAB_SWITCH" | "WINDOW_RESIZED">("FULLSCREEN_EXIT");
  const [focusLossCount, setFocusLossCount] = useState(0);

  // Load session & questions
  useEffect(() => {
    fetchSessionAndQuestions();
  }, []);

  // Automatic redirection to main page after submission
  useEffect(() => {
    if (!isFinished) return;
    isFinishedRef.current = true;

    if (typeof document !== "undefined" && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }

    const timer = setInterval(() => {
      setRedirectCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          if (typeof window !== "undefined") {
            window.onbeforeunload = null;
            sessionStorage.setItem("astranex_just_submitted", "true");
            window.location.href = "/";
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isFinished]);

  const getAuthHeaders = () => {
    const token = typeof window !== "undefined" ? sessionStorage.getItem("astranex_candidate_token") : null;
    const csrf = typeof window !== "undefined" ? sessionStorage.getItem("astranex_csrf") : null;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (csrf) headers["X-CSRF-Token"] = csrf;
    return headers;
  };

  const checkIsFullscreen = () => {
    if (typeof document === "undefined") return false;
    const fsEl =
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement;
    return Boolean(fsEl);
  };

  const requestFullScreenMode = async () => {
    try {
      const docEl = document.documentElement as any;
      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen();
      } else if (docEl.webkitRequestFullscreen) {
        await docEl.webkitRequestFullscreen();
      } else if (docEl.mozRequestFullScreen) {
        await docEl.mozRequestFullScreen();
      } else if (docEl.msRequestFullscreen) {
        await docEl.msRequestFullscreen();
      }
      setIsFullscreen(true);
      setHasEnteredFullscreen(true);
      setIsSecurityLocked(false);
    } catch (err) {
      console.warn("Fullscreen request rejected:", err);
      // Still permit access if browser explicitly blocks fullscreen API
      setHasEnteredFullscreen(true);
      setIsSecurityLocked(false);
    }
  };

  // Full-Screen, Window Resize, and Tab Switch Surveillance Guard
  useEffect(() => {
    if (isFinished || loading) return;

    // Detect if already in fullscreen (e.g. initiated from landing page)
    if (checkIsFullscreen()) {
      setIsFullscreen(true);
      setHasEnteredFullscreen(true);
    }

    const reportSecurityViolation = (reason: "FULLSCREEN_EXIT" | "TAB_SWITCH" | "WINDOW_RESIZED") => {
      if (isFinishedRef.current) return;
      setFocusLossCount(prev => prev + 1);
      setLockReason(reason);
      setIsSecurityLocked(true);

      fetch(`${API_BASE}/api/v1/candidate/telemetry/focus`, {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include",
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          reason: reason
        })
      }).then(async (res) => {
        if (res.ok) {
          const d = await res.json().catch(() => ({}));
          if (typeof d.focus_loss_count === "number") {
            setFocusLossCount(d.focus_loss_count);
          }
        }
      }).catch(() => {});
    };

    const handleFullscreenChange = () => {
      if (isFinishedRef.current) return;
      const isFs = checkIsFullscreen();
      setIsFullscreen(isFs);
      if (!isFs) {
        if (hasEnteredFullscreen) {
          reportSecurityViolation("FULLSCREEN_EXIT");
        }
      } else {
        if (!document.hidden) {
          setIsSecurityLocked(false);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (isFinishedRef.current) return;
      if (document.hidden) {
        if (hasEnteredFullscreen) {
          reportSecurityViolation("TAB_SWITCH");
        }
      } else {
        if (checkIsFullscreen()) {
          setIsSecurityLocked(false);
        } else if (hasEnteredFullscreen) {
          setIsSecurityLocked(true);
          setLockReason("FULLSCREEN_EXIT");
        }
      }
    };

    const handleWindowBlur = () => {
      if (isFinishedRef.current) return;
      if (hasEnteredFullscreen) {
        reportSecurityViolation("TAB_SWITCH");
      }
    };

    const handleWindowResize = () => {
      if (isFinishedRef.current) return;
      if (!hasEnteredFullscreen) return;
      const isFs = checkIsFullscreen();
      const isWindowSplitOrResized =
        typeof window !== "undefined" &&
        typeof screen !== "undefined" &&
        (window.innerWidth < screen.availWidth * 0.85 || window.innerHeight < screen.availHeight * 0.8);

      if (!isFs || isWindowSplitOrResized) {
        reportSecurityViolation("WINDOW_RESIZED");
      }
    };

    // Anti-Cheating Keyboard Shortcut Neutralizer
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isFinishedRef.current) return;
      // Prevent F11 manual fullscreen desync
      if (e.key === "F11") {
        e.preventDefault();
        return false;
      }
      // Block DevTools: F12, Ctrl+Shift+I, Cmd+Option+I, Ctrl+Shift+J, Cmd+Option+J, Ctrl+Shift+C, Cmd+Option+C
      if (
        e.key === "F12" ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i", "I", "j", "J", "c", "C"].includes(e.key))
      ) {
        e.preventDefault();
        return false;
      }
      // Block Ctrl+U / Cmd+U (View Source)
      if ((e.ctrlKey || e.metaKey) && (e.key === "u" || e.key === "U")) {
        e.preventDefault();
        return false;
      }
      // Block Ctrl+P / Cmd+P (Print)
      if ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        return false;
      }
      // Block Ctrl+S / Cmd+S (Save Page)
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        return false;
      }
      // Block Ctrl+T, Ctrl+N, Ctrl+W (New Tab, New Window, Close Tab)
      if ((e.ctrlKey || e.metaKey) && ["t", "T", "n", "N", "w", "W"].includes(e.key)) {
        e.preventDefault();
        return false;
      }
    };

    // Disable Right-Click Context Menu
    const handleContextMenu = (e: MouseEvent) => {
      if (isFinishedRef.current) return;
      e.preventDefault();
      return false;
    };

    // Prevent accidental page reloads
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isFinishedRef.current) return;
      e.preventDefault();
      e.returnValue = "Leaving or reloading this examination may forfeit your session attempt.";
      return e.returnValue;
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("resize", handleWindowResize);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("resize", handleWindowResize);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasEnteredFullscreen, isFinished, loading]);

  // Countdown timer based strictly on server expires_at
  useEffect(() => {
    if (!session?.expires_at || isFinished) return;

    // Calculate immediately on mount/update so there is no 1-second delay
    const updateCountdown = () => {
      const exp = new Date(session.expires_at).getTime();
      const now = new Date().getTime();
      const diff = Math.max(0, Math.floor((exp - now) / 1000));
      setTimeLeft(diff);

      if (diff <= 0) {
        handleFinishAssessment(true);
        return false;
      }
      return true;
    };

    updateCountdown();
    const interval = setInterval(() => {
      const shouldContinue = updateCountdown();
      if (!shouldContinue) clearInterval(interval);
    }, 1000);

    const handleVisibilityOrFocus = () => {
      updateCountdown();
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [session, isFinished]);

  const fetchSessionAndQuestions = async () => {
    try {
      setLoading(true);
      const authHeaders = getAuthHeaders();
      const [sessRes, qRes] = await Promise.all([
        fetch(`${API_BASE}/api/v1/candidate/session/me`, { headers: authHeaders, credentials: "include" }),
        fetch(`${API_BASE}/api/v1/candidate/questions`, { headers: authHeaders, credentials: "include" })
      ]);

      if (sessRes.status === 401 || qRes.status === 401) {
        router.push("/");
        return;
      }

      const sessData = await sessRes.json();
      const qData = await qRes.json();

      setSession(sessData);
      setQuestions(qData);
      if (typeof sessData.focus_loss_count === "number") {
        setFocusLossCount(sessData.focus_loss_count);
      }

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

  const autoSaveAnswer = async (subData: SubmissionState) => {
    if (!subData || !subData.question_id) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/candidate/submit`, {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include",
        body: JSON.stringify(subData)
      });
      if (res.ok) {
        setSaveMessage("Answer auto-saved");
        setTimeout(() => setSaveMessage(null), 2500);
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error("Auto-save rejected by server:", res.status, errData);
        setSaveMessage(`Sync error (${res.status})`);
      }
    } catch (e) {
      console.error("Auto-save error:", e);
    }
  };

  const handleOptionSelect = (qId: string, optId: string) => {
    const updated = {
      ...(submissions[qId] || {}),
      question_id: qId,
      selected_option_id: optId
    };
    setSubmissions(prev => ({
      ...prev,
      [qId]: updated
    }));
    autoSaveAnswer(updated);
  };

  const codeSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleCodeChange = (qId: string, code: string, lang: string = "python") => {
    const updated = {
      ...(submissions[qId] || {}),
      question_id: qId,
      code_response: code,
      programming_language: lang
    };
    setSubmissions(prev => ({
      ...prev,
      [qId]: updated
    }));

    if (codeSaveTimeoutRef.current) {
      clearTimeout(codeSaveTimeoutRef.current);
    }
    codeSaveTimeoutRef.current = setTimeout(() => {
      autoSaveAnswer(updated);
    }, 1200);
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

  const saveAndNavigate = (newIdx: number) => {
    const currentQ = questions[activeQIndex];
    if (currentQ && submissions[currentQ.id]) {
      const currentSub = submissions[currentQ.id];
      if (currentSub.selected_option_id || currentSub.code_response || currentSub.text_response) {
        autoSaveAnswer(currentSub);
      }
    }
    setActiveQIndex(newIdx);
  };

  const submitSingleAnswer = async (qId: string) => {
    const subData = submissions[qId];
    if (!subData) return;

    setSubmitting(true);
    setSaveMessage(null);

    try {
      const res = await fetch(`${API_BASE}/api/v1/candidate/submit`, {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include",
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

  const handleFinishAssessment = (autoExpired: boolean = false) => {
    if (autoExpired) {
      executeFinalSubmission();
    } else {
      setShowSubmitModal(true);
    }
  };

  const executeFinalSubmission = async () => {
    try {
      setIsSubmittingFinal(true);
      // Disarm all security guards immediately (no UI redirect yet)
      isFinishedRef.current = true;
      setIsSecurityLocked(false);

      if (typeof window !== "undefined") {
        window.onbeforeunload = null;
      }

      // Default starter templates shipped with CodingPad — if a candidate's code
      // matches any of these exactly, it means they never wrote real code.
      // Don't flush these to the backend so they score 0.
      const DEFAULT_CODING_TEMPLATES = [
        // Python
        "# AstraNex Python 3 Environment\ndef solution():\n    # Write your solution code here\n    pass\n\nif __name__ == \"__main__\":\n    solution()\n",
        // JavaScript
        "// AstraNex JavaScript (Node.js) Environment\nfunction solution() {\n    // Write your solution code here\n}\n\nsolution();\n",
        // C++
        "// AstraNex C++ 17 Environment\n#include <iostream>\n#include <vector>\n#include <string>\n#include <algorithm>\n\nusing namespace std;\n\nint main() {\n    // Write your solution code here\n    return 0;\n}\n",
        // Java
        "// AstraNex Java Environment\nimport java.util.*;\n\npublic class Solution {\n    public static void main(String[] args) {\n        // Write your solution code here\n    }\n}\n",
      ];

      const isDefaultTemplate = (code: string) => {
        const s = code.trim();
        return DEFAULT_CODING_TEMPLATES.some(t => t.trim() === s);
      };

      // Flush any pending answers first — but skip coding submissions that are just starter templates
      const subEntries = Object.values(submissions).filter(s => {
        if (s.code_response && isDefaultTemplate(s.code_response)) return false;
        return s.selected_option_id || s.code_response || s.text_response;
      });
      if (subEntries.length > 0) {
        await Promise.all(
          subEntries.map(sub =>
            fetch(`${API_BASE}/api/v1/candidate/submit`, {
              method: "POST",
              headers: getAuthHeaders(),
              credentials: "include",
              body: JSON.stringify(sub)
            }).catch(() => {})
          )
        );
      }

      // Call finish — wait for the DB to mark session SUBMITTED before redirecting
      const res = await fetch(`${API_BASE}/api/v1/candidate/session/finish`, {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include"
      });
      // Ignore parse errors — still redirect
      await res.json().catch(() => ({}));

      if (typeof window !== "undefined") {
        sessionStorage.setItem("astranex_just_submitted", "true");
      }

      if (typeof document !== "undefined" && document.fullscreenElement) {
        try { await document.exitFullscreen().catch(() => {}); } catch {}
      }

      // Now redirect — session is SUBMITTED in the DB
      window.location.href = "/";
    } catch (err: any) {
      console.error("Failed to submit assessment:", err);
      if (typeof window !== "undefined") {
        sessionStorage.setItem("astranex_just_submitted", "true");
        window.location.href = "/";
      }
    } finally {
      setIsSubmittingFinal(false);
    }
  };

  const formatTime = (seconds: number | null) => {
    if (seconds === null) return "--:--";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
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
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "2rem", backgroundColor: "#030712" }}>
        <div style={{
          maxWidth: "550px",
          width: "100%",
          backgroundColor: "#060911",
          border: "1px solid #1e293b",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.6)",
          borderRadius: "14px",
          padding: "2.5rem",
          textAlign: "center"
        }}>
          <CheckCircle2 size={56} color="#10b981" style={{ margin: "0 auto 1.5rem" }} />
          <h2 style={{ fontSize: "1.6rem", fontWeight: 800, marginBottom: "0.5rem", color: "#ffffff" }}>Assessment Submitted</h2>
          <p style={{ color: "#94a3b8", fontSize: "0.95rem", marginBottom: "1.5rem", lineHeight: 1.5 }}>
            {finalResult?.message || "Your examination answers have been recorded and evaluated on AstraNex servers."}
          </p>

          {finalResult?.total_score !== null && finalResult?.total_score !== undefined && (
            <div style={{
              backgroundColor: "#0d172a",
              border: "1px solid rgba(56, 189, 248, 0.3)",
              padding: "1rem",
              borderRadius: "8px",
              marginBottom: "1.5rem"
            }}>
              <span style={{ fontSize: "0.8rem", color: "#8b9bb4", display: "block", letterSpacing: "0.05em", fontWeight: 700 }}>FINAL SCORE</span>
              <span style={{ fontSize: "1.9rem", fontWeight: 800, color: "#38bdf8" }}>{finalResult.total_score} pts</span>
            </div>
          )}

          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            backgroundColor: "rgba(56, 189, 248, 0.1)",
            border: "1px solid rgba(56, 189, 248, 0.25)",
            padding: "0.6rem 1.2rem",
            borderRadius: "8px",
            color: "#38bdf8",
            fontSize: "0.85rem",
            fontWeight: 600,
            marginBottom: "1.5rem"
          }}>
            <Clock size={16} />
            <span>Redirecting to main page in {redirectCountdown}s...</span>
          </div>

          <div>
            <button
              type="button"
              onClick={() => {
                isFinishedRef.current = true;
                if (typeof window !== "undefined") {
                  window.onbeforeunload = null;
                  sessionStorage.setItem("astranex_just_submitted", "true");
                }
                if (typeof document !== "undefined" && document.fullscreenElement) {
                  document.exitFullscreen().catch(() => {});
                }
                window.location.href = "/";
              }}
              style={{
                padding: "0.75rem 1.75rem",
                backgroundColor: "#2563eb",
                border: "none",
                borderRadius: "8px",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: "0.9rem",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem"
              }}
            >
              <span>Return to Main Page Now</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!hasEnteredFullscreen && !isFinished) {
    return (
      <div style={{
        minHeight: "100vh",
        backgroundColor: "#030712",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        color: "#ffffff"
      }}>
        <div style={{
          maxWidth: "600px",
          width: "100%",
          backgroundColor: "#060911",
          border: "1px solid #1e293b",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.6)",
          borderRadius: "14px",
          padding: "2.5rem 2rem",
          textAlign: "center"
        }}>
          <div style={{
            width: "68px",
            height: "68px",
            borderRadius: "50%",
            backgroundColor: "rgba(56, 189, 248, 0.12)",
            border: "1px solid rgba(56, 189, 248, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1.5rem",
            color: "#38bdf8"
          }}>
            <ShieldAlert size={36} />
          </div>

          <span style={{
            display: "inline-block",
            padding: "0.25rem 0.75rem",
            backgroundColor: "rgba(56, 189, 248, 0.1)",
            border: "1px solid rgba(56, 189, 248, 0.25)",
            borderRadius: "9999px",
            fontSize: "0.75rem",
            fontWeight: 800,
            color: "#38bdf8",
            letterSpacing: "0.08em",
            marginBottom: "1rem"
          }}>
            ASTRANEX DEFENCE SECURITY PROTOCOL
          </span>

          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#ffffff", marginBottom: "0.5rem" }}>
            Mandatory Full-Screen Lock
          </h1>
          <p style={{ fontSize: "0.9rem", color: "#8b9bb4", lineHeight: 1.6, marginBottom: "1.75rem" }}>
            This technical examination is conducted inside a restricted, invigilated environment. To ensure assessment integrity, full-screen mode is enforced throughout.
          </p>

          <div style={{
            backgroundColor: "#0b1220",
            border: "1px solid #1e293b",
            borderRadius: "10px",
            padding: "1.25rem",
            textAlign: "left",
            display: "flex",
            flexDirection: "column",
            gap: "0.85rem",
            marginBottom: "2rem",
            fontSize: "0.85rem",
            color: "#cbd5e1"
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "0.65rem" }}>
              <span style={{ color: "#38bdf8", fontWeight: 700 }}>•</span>
              <div><strong>Full-Screen Lock:</strong> The exam will occupy 100% of your screen. Exiting full-screen pauses the test immediately.</div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "0.65rem" }}>
              <span style={{ color: "#ef4444", fontWeight: 700 }}>•</span>
              <div><strong>No Tab Switching or Minimizing:</strong> Switching tabs or clicking other applications is tracked in real-time on the invigilator dashboard.</div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "0.65rem" }}>
              <span style={{ color: "#f59e0b", fontWeight: 700 }}>•</span>
              <div><strong>No Split-Screen:</strong> Halving the screen or resizing the browser alongside other tools is strictly prohibited and triggers an instant lockdown overlay.</div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "0.65rem" }}>
              <span style={{ color: "#10b981", fontWeight: 700 }}>•</span>
              <div><strong>Right-Click & Shortcuts Disabled:</strong> Context menu, copy-paste outside the code editor, printing, and developer tools are blocked.</div>
            </div>
          </div>

          <button
            onClick={requestFullScreenMode}
            style={{
              width: "100%",
              padding: "0.85rem 1.5rem",
              backgroundColor: "#2563eb",
              backgroundImage: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
              border: "1px solid #3b82f6",
              borderRadius: "8px",
              color: "#ffffff",
              fontWeight: 800,
              fontSize: "1rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.65rem",
              boxShadow: "0 4px 20px rgba(37, 99, 235, 0.4)"
            }}
          >
            <Maximize2 size={18} />
            <span>Enter Full Screen & Start Examination</span>
          </button>
        </div>
      </div>
    );
  }

  const currentQ = questions[activeQIndex];
  const currentSub: Partial<SubmissionState> = currentQ ? (submissions[currentQ.id] || {}) : {};

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100vh",
      userSelect: "none",
      WebkitUserSelect: "none",
      filter: isSecurityLocked ? "blur(20px)" : "none",
      pointerEvents: isSecurityLocked ? "none" : "auto",
      transition: "filter 0.2s"
    }}>
      {/* Header */}
      <header className="responsive-header" style={{
        height: "60px",
        backgroundColor: "var(--bg-card)",
        borderBottom: "1px solid var(--border-color)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 1.5rem"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <img src="/logo.jpg" alt="AstraNex Defence" style={{ height: "36px", objectFit: "contain", borderRadius: "4px" }} />
          <span style={{ color: "var(--border-color)" }}>|</span>
          <span style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>{session?.assessment?.title}</span>
          {session?.candidate_name && (
            <span style={{
              fontSize: "0.8rem",
              color: "var(--accent-cyan)",
              backgroundColor: "rgba(6, 182, 212, 0.12)",
              border: "1px solid rgba(6, 182, 212, 0.3)",
              padding: "0.2rem 0.6rem",
              borderRadius: "4px",
              fontWeight: 500
            }}>
              Candidate: {session.candidate_name}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {/* Fullscreen & Security Status Indicator */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            padding: "0.35rem 0.75rem",
            backgroundColor: isFullscreen ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
            border: `1px solid ${isFullscreen ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
            borderRadius: "6px",
            fontSize: "0.75rem",
            fontWeight: 700,
            color: isFullscreen ? "#10b981" : "#ef4444"
          }}>
            {isFullscreen ? <ShieldCheck size={14} /> : <AlertTriangle size={14} />}
            <span>{isFullscreen ? "FULLSCREEN ACTIVE" : "LOCKDOWN ACTIVE"}</span>
            {focusLossCount > 0 && (
              <span style={{
                marginLeft: "0.2rem",
                padding: "0.1rem 0.4rem",
                borderRadius: "4px",
                backgroundColor: focusLossCount >= 5 ? "rgba(239, 68, 68, 0.2)" : "rgba(245, 158, 11, 0.2)",
                color: focusLossCount >= 5 ? "#ef4444" : "#f59e0b",
                fontSize: "0.7rem",
                fontWeight: 800
              }}>
                {focusLossCount} flag{focusLossCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowRulesModal(true)}
            title="Review Examination Rules & Integrity Protocols"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.4rem 0.8rem",
              backgroundColor: "rgba(56, 189, 248, 0.12)",
              border: "1px solid rgba(56, 189, 248, 0.3)",
              borderRadius: "6px",
              color: "#38bdf8",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            <ShieldAlert size={15} />
            <span>Exam Rules</span>
          </button>

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
      <div className="responsive-flex-col" style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left Navigator Sidebar */}
        <aside className="responsive-sidebar" style={{
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
                  onClick={() => saveAndNavigate(idx)}
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
                <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "460px", marginBottom: "1rem" }}>
                  <CodingPad
                    questionId={currentQ.id}
                    code={currentSub.code_response || ""}
                    language={currentSub.programming_language || "python"}
                    onCodeChange={(newCode, newLang) => handleCodeChange(currentQ.id, newCode, newLang)}
                    saveMessage={saveMessage}
                    getAuthHeaders={getAuthHeaders}
                    apiBase={API_BASE}
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
                  onClick={() => saveAndNavigate(activeQIndex - 1)}
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

                  {activeQIndex === questions.length - 1 ? (
                    <button
                      onClick={() => handleFinishAssessment(false)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.45rem",
                        padding: "0.6rem 1.35rem",
                        backgroundColor: "var(--accent-red)",
                        border: "none",
                        borderRadius: "6px",
                        color: "#fff",
                        fontWeight: 700,
                        cursor: "pointer"
                      }}
                    >
                      <CheckCircle2 size={16} />
                      <span>Submit Assessment</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => saveAndNavigate(activeQIndex + 1)}
                      style={{
                        padding: "0.6rem 1.2rem",
                        backgroundColor: "var(--bg-card)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "6px",
                        color: "#fff",
                        cursor: "pointer"
                      }}
                    >
                      Next Question
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div>No questions found for this assessment.</div>
          )}
        </main>
      </div>

      {/* ================================================== */}
      {/* MODAL: ACTIVE EXAMINATION RULES & PROTOCOLS        */}
      {/* ================================================== */}
      {showRulesModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.85)",
          backdropFilter: "blur(6px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "1rem"
        }}>
          <div style={{
            width: "100%",
            maxWidth: "640px",
            backgroundColor: "#0d1424",
            border: "1px solid #1e293b",
            borderRadius: "12px",
            padding: "2rem",
            maxHeight: "85vh",
            overflowY: "auto",
            boxShadow: "0 25px 50px rgba(0, 0, 0, 0.85)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem", borderBottom: "1px solid #1e293b", paddingBottom: "1rem" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
                  <ShieldAlert size={20} color="#38bdf8" />
                  <span style={{ fontSize: "0.75rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#38bdf8" }}>
                    AstraNex Examination Rules
                  </span>
                </div>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#ffffff", margin: 0 }}>
                  {session?.assessment?.title || "Active Examination"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRulesModal(false)}
                style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", padding: "0.25rem" }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Custom Rules */}
            {(session?.assessment?.rules || (typeof window !== "undefined" && sessionStorage.getItem("astranex_assessment_rules"))) && (() => {
              const rText = session?.assessment?.rules || (typeof window !== "undefined" && sessionStorage.getItem("astranex_assessment_rules")) || "";
              const parsed = parseAssessmentContent(undefined, rText);
              return (
                <div style={{
                  backgroundColor: "rgba(56, 189, 248, 0.08)",
                  border: "1px solid rgba(56, 189, 248, 0.25)",
                  borderRadius: "8px",
                  padding: "1rem",
                  marginBottom: "1.25rem"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.75rem", color: "#38bdf8", fontWeight: 700, fontSize: "0.85rem" }}>
                    <BookOpen size={16} />
                    <span>Specific Examination Regulations</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {parsed.rules.map((rule, idx) => (
                      <div key={idx} style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem", fontSize: "0.82rem", lineHeight: 1.5, color: "#e2e8f0" }}>
                        <span style={{
                          color: "#38bdf8",
                          fontWeight: 700,
                          fontSize: "0.72rem",
                          backgroundColor: "rgba(56, 189, 248, 0.15)",
                          borderRadius: "50%",
                          width: "18px",
                          height: "18px",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          marginTop: "2px"
                        }}>
                          {idx + 1}
                        </span>
                        <span>{rule}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Platform Rules */}
            <div style={{ marginBottom: "1.5rem" }}>
              <h4 style={{ fontSize: "0.82rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8", margin: "0 0 0.75rem 0" }}>
                Mandatory Security & Integrity Protocols
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem", fontSize: "0.82rem" }}>
                <div style={{ display: "flex", gap: "0.75rem", backgroundColor: "#060911", padding: "0.75rem 1rem", borderRadius: "6px", border: "1px solid #162035" }}>
                  <div style={{ color: "#38bdf8", fontWeight: 800, minWidth: "1.25rem" }}>1.</div>
                  <div style={{ color: "#cbd5e1" }}>
                    <strong style={{ color: "#ffffff" }}>Proctored Window Focus:</strong> Leaving the active browser window or switching applications logs security infractions directly into the proctoring audit log.
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.75rem", backgroundColor: "#060911", padding: "0.75rem 1rem", borderRadius: "6px", border: "1px solid #162035" }}>
                  <div style={{ color: "#38bdf8", fontWeight: 800, minWidth: "1.25rem" }}>2.</div>
                  <div style={{ color: "#cbd5e1" }}>
                    <strong style={{ color: "#ffffff" }}>Server-Synchronized Timer:</strong> The countdown clock is authoritative on the backend. Time continues to elapse even if the browser is closed.
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.75rem", backgroundColor: "#060911", padding: "0.75rem 1rem", borderRadius: "6px", border: "1px solid #162035" }}>
                  <div style={{ color: "#38bdf8", fontWeight: 800, minWidth: "1.25rem" }}>3.</div>
                  <div style={{ color: "#cbd5e1" }}>
                    <strong style={{ color: "#ffffff" }}>Zero-Trust Isolated Code Sandbox:</strong> Code submissions are compiled in an isolated sandbox with zero external network connectivity.
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.75rem", backgroundColor: "#060911", padding: "0.75rem 1rem", borderRadius: "6px", border: "1px solid #162035" }}>
                  <div style={{ color: "#38bdf8", fontWeight: 800, minWidth: "1.25rem" }}>4.</div>
                  <div style={{ color: "#cbd5e1" }}>
                    <strong style={{ color: "#ffffff" }}>Anti-Plagiarism:</strong> External copy-pasting, unauthorized AI assistants, and developer tool tampering are prohibited.
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setShowRulesModal(false)}
                style={{
                  padding: "0.6rem 1.5rem",
                  backgroundColor: "var(--accent-blue)",
                  border: "none",
                  borderRadius: "6px",
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  cursor: "pointer"
                }}
              >
                Return to Examination
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-App Assessment Submission Confirmation Modal */}
      {showSubmitModal && !isFinished && (
        <div style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(3, 7, 18, 0.88)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          zIndex: 99998,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem"
        }}>
          <div style={{
            maxWidth: "480px",
            width: "100%",
            backgroundColor: "#0b1220",
            border: "1px solid #1e293b",
            boxShadow: "0 25px 60px rgba(0, 0, 0, 0.7)",
            borderRadius: "14px",
            padding: "2rem",
            textAlign: "center"
          }}>
            <div style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              backgroundColor: "rgba(56, 189, 248, 0.12)",
              border: "1px solid rgba(56, 189, 248, 0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.25rem",
              color: "#38bdf8"
            }}>
              <CheckCircle2 size={30} />
            </div>

            <h3 style={{ fontSize: "1.3rem", fontWeight: 700, color: "#ffffff", marginBottom: "0.5rem" }}>
              Submit Technical Assessment?
            </h3>

            <p style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.5, marginBottom: "1.5rem" }}>
              Are you ready to submit your examination? Once submitted, your answers will be finalized and evaluated, and you will not be able to return to this examination.
            </p>

            {/* Questions Progress Pill */}
            <div style={{
              backgroundColor: "#070b14",
              border: "1px solid #1e293b",
              borderRadius: "8px",
              padding: "0.85rem 1rem",
              marginBottom: "1.25rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "0.85rem"
            }}>
              <span style={{ color: "#94a3b8" }}>Answered Questions:</span>
              <span style={{ color: "#38bdf8", fontWeight: 700 }}>
                {questions.filter(q => {
                  const sub = submissions[q.id];
                  return sub && (sub.selected_option_id || sub.text_response || sub.code_response);
                }).length} / {questions.length}
              </span>
            </div>

            {questions.length - questions.filter(q => {
              const sub = submissions[q.id];
              return sub && (sub.selected_option_id || sub.text_response || sub.code_response);
            }).length > 0 && (
              <div style={{
                backgroundColor: "rgba(245, 158, 11, 0.1)",
                border: "1px solid rgba(245, 158, 11, 0.25)",
                borderRadius: "6px",
                padding: "0.6rem 0.85rem",
                marginBottom: "1.5rem",
                fontSize: "0.8rem",
                color: "#fbbf24",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                textAlign: "left"
              }}>
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <span>You have unanswered questions remaining. Unanswered questions will receive 0 marks.</span>
              </div>
            )}

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                disabled={isSubmittingFinal}
                onClick={() => setShowSubmitModal(false)}
                style={{
                  flex: 1,
                  padding: "0.75rem 1rem",
                  backgroundColor: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: "8px",
                  color: "#e2e8f0",
                  fontSize: "0.88rem",
                  fontWeight: 600,
                  cursor: isSubmittingFinal ? "not-allowed" : "pointer"
                }}
              >
                Return to Exam
              </button>
              <button
                type="button"
                disabled={isSubmittingFinal}
                onClick={() => executeFinalSubmission()}
                style={{
                  flex: 1.3,
                  padding: "0.75rem 1rem",
                  backgroundColor: "#ef4444",
                  border: "none",
                  borderRadius: "8px",
                  color: "#ffffff",
                  fontSize: "0.88rem",
                  fontWeight: 700,
                  cursor: isSubmittingFinal ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem"
                }}
              >
                {isSubmittingFinal ? (
                  <>
                    <Shield size={16} className="animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <span>Yes, Finalize & Submit</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Security Violation Lockdown Modal */}
      {isSecurityLocked && hasEnteredFullscreen && !isFinished && (
        <div style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(3, 7, 18, 0.96)",
          backdropFilter: "blur(28px)",
          WebkitBackdropFilter: "blur(28px)",
          zIndex: 99999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem"
        }}>
          <div style={{
            maxWidth: "540px",
            width: "100%",
            backgroundColor: "#060911",
            border: "2px solid #ef4444",
            boxShadow: "0 0 50px rgba(239, 68, 68, 0.35)",
            borderRadius: "14px",
            padding: "2.25rem 2rem",
            textAlign: "center"
          }}>
            <div style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              backgroundColor: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.25rem",
              color: "#ef4444"
            }}>
              <Lock size={32} />
            </div>

            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.3rem 0.75rem",
              backgroundColor: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.35)",
              borderRadius: "6px",
              color: "#ef4444",
              fontSize: "0.8rem",
              fontWeight: 800,
              marginBottom: "1rem"
            }}>
              <AlertTriangle size={15} />
              <span>SECURITY ALERT • STRIKE {focusLossCount}</span>
            </div>

            <h2 style={{ color: "#ffffff", fontSize: "1.35rem", fontWeight: 800, marginBottom: "0.65rem" }}>
              {lockReason === "FULLSCREEN_EXIT"
                ? "Full-Screen Mode Required"
                : lockReason === "WINDOW_RESIZED"
                ? "Window Resized / Split-Screen Detected"
                : "Window Focus Lost / Tab Switched"}
            </h2>

            <p style={{ color: "#8b9bb4", fontSize: "0.9rem", lineHeight: 1.6, marginBottom: "1.75rem" }}>
              {lockReason === "FULLSCREEN_EXIT"
                ? "You have exited full-screen display. The examination is paused and question content is hidden until full-screen is restored."
                : lockReason === "WINDOW_RESIZED"
                ? "Running in split-screen or resizing your window to half-width is strictly prohibited under AstraNex proctoring rules."
                : "You navigated away, switched tabs, or clicked another application. This event has been logged directly to the real-time proctoring audit log."}
            </p>

            <button
              onClick={requestFullScreenMode}
              style={{
                width: "100%",
                padding: "0.85rem 1.5rem",
                backgroundColor: "#2563eb",
                backgroundImage: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                border: "1px solid #3b82f6",
                borderRadius: "8px",
                color: "#ffffff",
                fontWeight: 800,
                fontSize: "0.95rem",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                boxShadow: "0 4px 20px rgba(37, 99, 235, 0.4)"
              }}
            >
              <Maximize2 size={18} />
              <span>Restore Full Screen & Resume Exam</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
