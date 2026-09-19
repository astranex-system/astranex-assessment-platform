"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  Mail,
  User,
  Lock,
  BookOpen,
  ArrowRight,
  AlertTriangle,
  CheckCircle,
  LogIn,
  UserPlus,
  LogOut,
  Clock,
  Award,
  FileText,
  RefreshCw,
  Play,
  CheckCircle2,
  Calendar,
  X,
  ShieldAlert
} from "lucide-react";
import { AssessmentCardSummary, AssessmentDetailsModal } from "@/components/AssessmentDetailsView";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://astranex-assesment-api.onrender.com";

interface AssessmentCard {
  id: string;
  title: string;
  description?: string;
  role: string;
  duration_minutes: number;
  total_marks: number;
  passing_marks: number;
  start_window?: string;
  end_window?: string;
  deadline?: string;
  attempts_remaining: number;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "EXPIRED";
  score?: number | null;
  slot_open?: boolean;
  active_slot_name?: string;
  question_count: number;
  rules?: string;
}

interface CandidateUser {
  full_name?: string;
  email: string;
}

export default function CandidatePortalLanding() {
  const router = useRouter();

  // Auth Mode: "register" | "login"
  const [authMode, setAuthMode] = useState<"register" | "login">("login");

  // Authentication Fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Authenticated Candidate State
  const [candidate, setCandidate] = useState<CandidateUser | null>(null);
  const [candidatePassword, setCandidatePassword] = useState<string>("");

  // Candidate Assigned Assessments
  const [myAssessments, setMyAssessments] = useState<AssessmentCard[]>([]);
  const [loadingAssessments, setLoadingAssessments] = useState(false);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [rulesModalOpen, setRulesModalOpen] = useState(false);
  const [selectedAsmForRules, setSelectedAsmForRules] = useState<AssessmentCard | null>(null);
  const [rulesAgreed, setRulesAgreed] = useState(false);

  // Common UI State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Results Modal State
  const [resultsModalOpen, setResultsModalOpen] = useState(false);
  const [resultsData, setResultsData] = useState<any>(null);
  const [loadingResults, setLoadingResults] = useState(false);

  // Check existing candidate session on mount
  useEffect(() => {
    const savedEmail = sessionStorage.getItem("astranex_candidate_email");
    const savedName = sessionStorage.getItem("astranex_candidate_name");
    const savedPwd = sessionStorage.getItem("astranex_candidate_pwd");
    const justSubmitted = sessionStorage.getItem("astranex_just_submitted");

    if (justSubmitted) {
      setSuccessMsg("Assessment submitted successfully! Your examination responses and score have been recorded.");
      sessionStorage.removeItem("astranex_just_submitted");
    }

    if (savedEmail) {
      const user: CandidateUser = {
        email: savedEmail,
        full_name: savedName || savedEmail.split("@")[0]
      };
      setCandidate(user);
      if (savedPwd) setCandidatePassword(savedPwd);
      fetchMyAssessments(savedEmail, savedPwd || undefined);
    }
  }, []);

  // Keep ref of myAssessments for interval polling without resetting timers
  const myAssessmentsRef = useRef<AssessmentCard[]>(myAssessments);
  useEffect(() => {
    myAssessmentsRef.current = myAssessments;
  }, [myAssessments]);

  // Auto-polling for Google Meet slot unlock (silent background sync)
  useEffect(() => {
    if (!candidate?.email) return;

    // Poll silently every 10 seconds only if there's an unstarted assessment with locked slot
    const interval = setInterval(() => {
      const hasLockedSlot = (myAssessmentsRef.current || []).some(
        a => a.status === "NOT_STARTED" && a.slot_open === false
      );
      if (hasLockedSlot) {
        fetchMyAssessments(candidate.email, candidatePassword || undefined, true);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [candidate?.email, candidatePassword]);

  // Fetch candidate's assigned examinations (supports silent background refresh)
  const fetchMyAssessments = async (candEmail: string, candPwd?: string, isBackground = false) => {
    try {
      if (!isBackground) {
        setLoadingAssessments(true);
        setError(null);
      }
      const token = typeof window !== "undefined" ? sessionStorage.getItem("astranex_candidate_token") : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/api/v1/candidate/my-assessments`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          email: candEmail.trim().toLowerCase(),
          password: candPwd || undefined
        })
      });

      if (res.ok) {
        const data: AssessmentCard[] = await res.json();
        // Prevent state thrashing / component re-renders if the data hasn't changed
        setMyAssessments(prev => {
          if (JSON.stringify(prev) === JSON.stringify(data)) return prev;
          return data;
        });
      } else if (!isBackground) {
        const errData = await res.json().catch(() => ({}));
        setError(errData.detail || "Failed to load assigned assessments.");
      }
    } catch (err: any) {
      if (!isBackground) {
        console.error("Failed to load assessments:", err);
        setError("Network connection issue while retrieving assessments.");
      }
    } finally {
      if (!isBackground) {
        setLoadingAssessments(false);
      }
    }
  };

  // Fetch detailed results for a specific assessment
  const fetchMyResults = async (assessmentId: string) => {
    if (!candidate) return;
    try {
      setLoadingResults(true);
      setResultsModalOpen(true);
      setResultsData(null);

      const token = typeof window !== "undefined" ? sessionStorage.getItem("astranex_candidate_token") : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/api/v1/candidate/my-results`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          email: candidate.email,
          password: candidatePassword || undefined,
          assessment_id: assessmentId
        })
      });

      if (res.ok) {
        const data = await res.json();
        setResultsData(data);
      } else {
        const errData = await res.json().catch(() => ({}));
        setResultsData({ error: errData.detail || "Failed to load results." });
      }
    } catch (err: any) {
      setResultsData({ error: err.message || "Network error loading results." });
    } finally {
      setLoadingResults(false);
    }
  };

  // Handler: Candidate Registration
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

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
          password: password
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Registration failed.");
      }

      // Store candidate info
      const candUser: CandidateUser = {
        email: email.trim().toLowerCase(),
        full_name: fullName.trim()
      };
      setCandidate(candUser);
      setCandidatePassword(password);
      sessionStorage.setItem("astranex_candidate_email", candUser.email);
      if (candUser.full_name) {
        sessionStorage.setItem("astranex_candidate_name", candUser.full_name);
      }
      sessionStorage.setItem("astranex_candidate_pwd", password);

      setSuccessMsg("Account registered successfully! Welcome to AstraNex Assessment Portal.");
      fetchMyAssessments(candUser.email, password);
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
    setSuccessMsg(null);

    if (!email.trim()) {
      setError("Please enter your registered email address.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/candidate/my-assessments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password: password || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Authentication failed.");
      }

      // Set user session
      const candUser: CandidateUser = {
        email: email.trim().toLowerCase(),
        full_name: email.trim().split("@")[0]
      };
      setCandidate(candUser);
      setCandidatePassword(password);
      sessionStorage.setItem("astranex_candidate_email", candUser.email);
      sessionStorage.setItem("astranex_candidate_pwd", password);

      setMyAssessments(data);
    } catch (err: any) {
      setError(err.message || "An error occurred during sign in.");
    } finally {
      setLoading(false);
    }
  };

  // Open Assessment Rules Modal
  const handleOpenRulesModal = (asm: AssessmentCard) => {
    setSelectedAsmForRules(asm);
    setRulesAgreed(false);
    setRulesModalOpen(true);
  };

  // Handler: Start or Resume an Assigned Assessment
  const handleStartAssessment = async (asm: AssessmentCard) => {
    if (!candidate) return;
    setLaunchingId(asm.id);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/v1/candidate/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: candidate.email,
          password: candidatePassword || undefined,
          assessment_id: asm.id
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to initialize examination session.");
      }

      if (data.access_token) {
        sessionStorage.setItem("astranex_candidate_token", data.access_token);
      }
      if (data.csrf_token) {
        sessionStorage.setItem("astranex_csrf", data.csrf_token);
      }
      if (data.candidate_name) {
        sessionStorage.setItem("astranex_candidate_name", data.candidate_name);
      }
      sessionStorage.setItem("astranex_candidate_email", candidate.email);
      if (asm.rules) {
        sessionStorage.setItem("astranex_assessment_rules", asm.rules);
      } else {
        sessionStorage.removeItem("astranex_assessment_rules");
      }

      // Request fullscreen inside user gesture
      try {
        const docEl = document.documentElement as any;
        if (docEl.requestFullscreen) {
          await docEl.requestFullscreen().catch(() => {});
        } else if (docEl.webkitRequestFullscreen) {
          await docEl.webkitRequestFullscreen().catch(() => {});
        }
      } catch (_) {}

      router.push("/assessment");
    } catch (err: any) {
      setError(err.message || "Could not launch examination.");
      setLaunchingId(null);
    }
  };

  // Sign out candidate
  const handleSignOut = () => {
    sessionStorage.removeItem("astranex_candidate_email");
    sessionStorage.removeItem("astranex_candidate_name");
    sessionStorage.removeItem("astranex_candidate_pwd");
    sessionStorage.removeItem("astranex_candidate_token");
    sessionStorage.removeItem("astranex_csrf");
    setCandidate(null);
    setCandidatePassword("");
    setMyAssessments([]);
    setPassword("");
    setConfirmPassword("");
    setError(null);
    setSuccessMsg(null);
  };

  // Format date helper
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    try {
      return new Date(dateStr).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return dateStr;
    }
  };

  // RENDER VIEW: Authenticated "My Assessments" Dashboard
  if (candidate) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--bg-primary, #060911)",
        color: "#ffffff"
      }}>
        {/* Top Navigation Bar */}
        <header style={{
          height: "64px",
          backgroundColor: "#0d1424",
          borderBottom: "1px solid #1e293b",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 2rem",
          position: "sticky",
          top: 0,
          zIndex: 50
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <img
              src="/logo.jpg"
              alt="AstraNex Defence"
              style={{ height: "40px", objectFit: "contain", borderRadius: "4px" }}
            />
            <div>
              <div style={{ fontWeight: 800, fontSize: "1rem", letterSpacing: "-0.01em", color: "#ffffff" }}>
                AstraNex Defence Systems
              </div>
              <div style={{ fontSize: "0.72rem", color: "var(--accent-cyan)", fontWeight: 600 }}>
                Candidate Examination Portal
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              backgroundColor: "rgba(15, 23, 42, 0.8)",
              border: "1px solid #1e293b",
              padding: "0.4rem 0.85rem",
              borderRadius: "20px"
            }}>
              <div style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                backgroundColor: "#10b981"
              }} />
              <span style={{ fontSize: "0.825rem", color: "#e2e8f0", fontWeight: 600 }}>
                {candidate.full_name || candidate.email}
              </span>
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                ({candidate.email})
              </span>
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.45rem 0.85rem",
                backgroundColor: "transparent",
                border: "1px solid #334155",
                borderRadius: "6px",
                color: "#cbd5e1",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s"
              }}
            >
              <LogOut size={14} />
              <span>Sign Out</span>
            </button>
          </div>
        </header>

        {/* Dashboard Main Content */}
        <main style={{
          flex: 1,
          maxWidth: "1200px",
          width: "100%",
          margin: "0 auto",
          padding: "2.5rem 1.5rem"
        }}>
          {/* Header Banner */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginBottom: "2rem",
            borderBottom: "1px solid #1e293b",
            paddingBottom: "1.5rem"
          }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
                <BookOpen size={22} color="var(--accent-cyan)" />
                <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "#ffffff", letterSpacing: "-0.02em" }}>
                  My Assigned Assessments
                </h1>
              </div>
              <p style={{ fontSize: "0.875rem", color: "#94a3b8" }}>
                Select an examination assigned to your candidate profile to begin or resume your test.
              </p>
            </div>

            <button
              type="button"
              onClick={() => fetchMyAssessments(candidate.email, candidatePassword)}
              disabled={loadingAssessments}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.5rem 1rem",
                backgroundColor: "#0f172a",
                border: "1px solid #334155",
                borderRadius: "6px",
                color: "#94a3b8",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              <RefreshCw size={14} className={loadingAssessments ? "animate-spin" : ""} />
              <span>Refresh</span>
            </button>
          </div>

          {/* Success / Error Alerts */}
          {successMsg && (
            <div style={{
              backgroundColor: "rgba(16, 185, 129, 0.12)",
              border: "1px solid #10b981",
              borderRadius: "6px",
              padding: "0.85rem 1.25rem",
              marginBottom: "1.5rem",
              fontSize: "0.875rem",
              color: "#6ee7b7",
              display: "flex",
              alignItems: "center",
              gap: "0.6rem"
            }}>
              <CheckCircle size={18} color="#10b981" />
              <span>{successMsg}</span>
            </div>
          )}

          {error && (
            <div style={{
              backgroundColor: "rgba(239, 68, 68, 0.12)",
              border: "1px solid var(--accent-red)",
              borderRadius: "6px",
              padding: "0.85rem 1.25rem",
              marginBottom: "1.5rem",
              fontSize: "0.875rem",
              color: "#fca5a5",
              display: "flex",
              alignItems: "center",
              gap: "0.6rem"
            }}>
              <AlertTriangle size={18} color="var(--accent-red)" />
              <span>{error}</span>
            </div>
          )}

          {/* Assessments Grid */}
          {loadingAssessments ? (
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "4rem 0",
              color: "#64748b"
            }}>
              <Shield size={36} className="animate-spin" color="var(--accent-cyan)" />
              <p style={{ marginTop: "1rem", fontSize: "0.9rem" }}>Loading your assigned examinations...</p>
            </div>
          ) : myAssessments.length === 0 ? (
            <div style={{
              backgroundColor: "#0d1424",
              border: "1px dashed #334155",
              borderRadius: "12px",
              padding: "3.5rem 2rem",
              textAlign: "center"
            }}>
              <BookOpen size={48} color="#475569" style={{ margin: "0 auto 1rem" }} />
              <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#ffffff", marginBottom: "0.5rem" }}>
                No Assessments Assigned Yet
              </h3>
              <p style={{ color: "#94a3b8", fontSize: "0.9rem", maxWidth: "500px", margin: "0 auto 1.5rem", lineHeight: 1.5 }}>
                There are no examinations currently assigned to your account ({candidate.email}). Your evaluation coordinator will assign your technical assessment shortly.
              </p>
              <button
                type="button"
                onClick={() => fetchMyAssessments(candidate.email, candidatePassword)}
                style={{
                  padding: "0.65rem 1.25rem",
                  backgroundColor: "var(--accent-blue)",
                  border: "none",
                  borderRadius: "6px",
                  color: "#ffffff",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Check for Updates
              </button>
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))",
              gap: "1.5rem"
            }}>
              {myAssessments.map(asm => {
                const isCompleted = asm.status === "COMPLETED";
                const isInProgress = asm.status === "IN_PROGRESS";
                const isExpired = asm.status === "EXPIRED";
                const isLaunching = launchingId === asm.id;
                const isSlotLocked = asm.slot_open === false;

                let statusBadgeColor = "#38bdf8";
                let statusBadgeBg = "rgba(56, 189, 248, 0.12)";
                let statusLabel = "Not Started";

                if (isCompleted) {
                  statusBadgeColor = "#10b981";
                  statusBadgeBg = "rgba(16, 185, 129, 0.15)";
                  statusLabel = "Completed";
                } else if (isInProgress) {
                  statusBadgeColor = "#f59e0b";
                  statusBadgeBg = "rgba(245, 158, 11, 0.15)";
                  statusLabel = "In Progress";
                } else if (isExpired) {
                  statusBadgeColor = "#ef4444";
                  statusBadgeBg = "rgba(239, 68, 68, 0.15)";
                  statusLabel = "Window Closed";
                } else if (isSlotLocked) {
                  statusBadgeColor = "#f59e0b";
                  statusBadgeBg = "rgba(245, 158, 11, 0.15)";
                  statusLabel = `Locked (${asm.active_slot_name || "Slot 1"})`;
                }

                return (
                  <div
                    key={asm.id}
                    style={{
                      backgroundColor: "#0d1424",
                      border: isInProgress ? "1px solid #f59e0b" : "1px solid #1e293b",
                      borderRadius: "10px",
                      padding: "1.5rem",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      transition: "transform 0.2s, border-color 0.2s",
                      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)"
                    }}
                  >
                    <div>
                      {/* Top Meta: Role & Status */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem" }}>
                        <span style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          backgroundColor: "#1e293b",
                          color: "#94a3b8",
                          padding: "0.2rem 0.6rem",
                          borderRadius: "4px",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em"
                        }}>
                          {asm.role}
                        </span>

                        <span style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          backgroundColor: statusBadgeBg,
                          color: statusBadgeColor,
                          padding: "0.25rem 0.65rem",
                          borderRadius: "12px"
                        }}>
                          {statusLabel}
                        </span>
                      </div>

                      {/* Title & Description */}
                      <h3 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#ffffff", marginBottom: "0.4rem", lineHeight: 1.3 }}>
                        {asm.title}
                      </h3>
                      <AssessmentCardSummary
                        description={asm.description}
                        rules={asm.rules}
                        role={asm.role}
                        duration={asm.duration_minutes}
                        totalMarks={asm.total_marks}
                        passingMarks={asm.passing_marks}
                        onOpenDetails={() => handleOpenRulesModal(asm)}
                      />

                      {/* Key Stats Pill Row */}
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, 1fr)",
                        gap: "0.6rem",
                        marginBottom: "1.25rem",
                        backgroundColor: "#080c16",
                        border: "1px solid #1e293b",
                        borderRadius: "8px",
                        padding: "0.85rem"
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <Clock size={15} color="#38bdf8" />
                          <div>
                            <div style={{ fontSize: "0.68rem", color: "#64748b", textTransform: "uppercase" }}>Duration</div>
                            <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#ffffff" }}>{asm.duration_minutes} Mins</div>
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <FileText size={15} color="#a855f7" />
                          <div>
                            <div style={{ fontSize: "0.68rem", color: "#64748b", textTransform: "uppercase" }}>Questions</div>
                            <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#ffffff" }}>{asm.question_count} Questions</div>
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <Award size={15} color="#10b981" />
                          <div>
                            <div style={{ fontSize: "0.68rem", color: "#64748b", textTransform: "uppercase" }}>Total Score</div>
                            <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#ffffff" }}>{asm.total_marks} Pts</div>
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <Shield size={15} color="#eab308" />
                          <div>
                            <div style={{ fontSize: "0.68rem", color: "#64748b", textTransform: "uppercase" }}>Pass Criteria</div>
                            <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#ffffff" }}>{asm.passing_marks} Pts</div>
                          </div>
                        </div>
                      </div>

                      {/* Deadline info if available */}
                      {asm.deadline && (
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.4rem",
                          fontSize: "0.75rem",
                          color: "#64748b",
                          marginBottom: "1.25rem"
                        }}>
                          <Calendar size={13} />
                          <span>Deadline: {formatDate(asm.deadline)}</span>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div>
                      {isCompleted ? (
                        <div>
                          <div style={{
                            width: "100%",
                            padding: "0.75rem",
                            backgroundColor: "rgba(16, 185, 129, 0.1)",
                            border: "1px solid rgba(16, 185, 129, 0.3)",
                            borderRadius: "6px",
                            color: "#10b981",
                            fontSize: "0.85rem",
                            fontWeight: 600,
                            textAlign: "center",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "0.4rem"
                          }}>
                            <CheckCircle2 size={16} />
                            <span>
                              Examination Submitted
                              {asm.score !== undefined && asm.score !== null ? ` • Score: ${asm.score}/${asm.total_marks} pts` : ""}
                            </span>
                          </div>

                          <div style={{
                            marginTop: "0.6rem",
                            padding: "0.55rem 0.75rem",
                            backgroundColor: "rgba(56, 189, 248, 0.08)",
                            border: "1px solid rgba(56, 189, 248, 0.2)",
                            borderRadius: "6px",
                            fontSize: "0.74rem",
                            color: "#94a3b8",
                            lineHeight: 1.45,
                            textAlign: "center"
                          }}>
                            {asm.score !== undefined && asm.score !== null ? (
                              <>
                                <span style={{ color: "#38bdf8", fontWeight: 600 }}>Note:</span> This is the assessment score. Code Review and Shortlisting for next round result will be declared through email.
                              </>
                            ) : (
                              <>Code Review and Shortlisting for next round result will be declared through email.</>
                            )}
                          </div>

                          {/* View Results Button */}
                          {asm.score !== undefined && asm.score !== null && (
                            <button
                              type="button"
                              onClick={() => fetchMyResults(asm.id)}
                              style={{
                                marginTop: "0.6rem",
                                width: "100%",
                                padding: "0.65rem",
                                backgroundColor: "rgba(56, 189, 248, 0.1)",
                                border: "1px solid rgba(56, 189, 248, 0.3)",
                                borderRadius: "6px",
                                color: "#38bdf8",
                                fontSize: "0.82rem",
                                fontWeight: 700,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "0.4rem"
                              }}
                            >
                              <Award size={15} />
                              <span>View Results & Submissions</span>
                            </button>
                          )}
                        </div>
                      ) : isExpired ? (
                        <div style={{
                          width: "100%",
                          padding: "0.75rem",
                          backgroundColor: "rgba(239, 68, 68, 0.1)",
                          border: "1px solid rgba(239, 68, 68, 0.3)",
                          borderRadius: "6px",
                          color: "#ef4444",
                          fontSize: "0.85rem",
                          fontWeight: 600,
                          textAlign: "center"
                        }}>
                          Window Closed
                        </div>
                      ) : isInProgress ? (
                        <button
                          type="button"
                          onClick={() => handleOpenRulesModal(asm)}
                          disabled={isLaunching}
                          style={{
                            width: "100%",
                            padding: "0.85rem",
                            backgroundColor: "#f59e0b",
                            border: "none",
                            borderRadius: "6px",
                            color: "#000000",
                            fontWeight: 800,
                            fontSize: "0.9rem",
                            cursor: isLaunching ? "not-allowed" : "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "0.5rem",
                            transition: "all 0.2s"
                          }}
                        >
                          <Play size={16} />
                          <span>{isLaunching ? "Resuming Session..." : "Resume Examination"}</span>
                        </button>
                      ) : isSlotLocked ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                          <button
                            type="button"
                            disabled={true}
                            style={{
                              width: "100%",
                              padding: "0.85rem",
                              backgroundColor: "rgba(30, 41, 59, 0.6)",
                              border: "1px dashed rgba(245, 158, 11, 0.5)",
                              borderRadius: "6px",
                              color: "#f59e0b",
                              fontWeight: 700,
                              fontSize: "0.85rem",
                              cursor: "not-allowed",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "0.5rem"
                            }}
                          >
                            <Lock size={15} />
                            <span>Slot Locked • Waiting for Invigilator</span>
                          </button>
                          <div style={{
                            fontSize: "0.75rem",
                            color: "#8b9bb4",
                            textAlign: "center",
                            lineHeight: 1.4
                          }}>
                            Your invigilator will open <strong>{asm.active_slot_name || "this slot"}</strong> during the Google Meet call. This will activate automatically.
                          </div>
                          <button
                            type="button"
                            onClick={() => candidate && fetchMyAssessments(candidate.email, candidatePassword || undefined)}
                            style={{
                              background: "none",
                              border: "none",
                              color: "#38bdf8",
                              fontSize: "0.75rem",
                              cursor: "pointer",
                              textDecoration: "underline",
                              padding: "0.2rem"
                            }}
                          >
                            ↻ Check Slot Status Now
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenRulesModal(asm)}
                          disabled={isLaunching}
                          style={{
                            width: "100%",
                            padding: "0.85rem",
                            backgroundColor: "var(--accent-blue)",
                            border: "none",
                            borderRadius: "6px",
                            color: "#ffffff",
                            fontWeight: 700,
                            fontSize: "0.9rem",
                            cursor: isLaunching ? "not-allowed" : "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "0.5rem",
                            transition: "all 0.2s"
                          }}
                        >
                          <span>{isLaunching ? "Initializing Session..." : "Start Examination"}</span>
                          <ArrowRight size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>

        {/* Global Footer */}
        <footer style={{
          marginTop: "auto",
          borderTop: "1px solid #1e293b",
          padding: "1.25rem 2rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "0.75rem",
          color: "#64748b",
          backgroundColor: "#0d1424"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <CheckCircle size={14} color="#10b981" />
            <span>Secure AstraNex Examination Engine Connected</span>
          </div>

          <a
            href="/admin"
            style={{ color: "var(--accent-cyan)", textDecoration: "none", fontWeight: 600 }}
          >
            Admin & Evaluator Portal →
          </a>
        </footer>

        {/* ================================================== */}
        {/* MODAL: EXAMINATION RULES & INTEGRITY PROTOCOLS     */}
        {/* ================================================== */}
        {rulesModalOpen && selectedAsmForRules && (
          <AssessmentDetailsModal
            isOpen={rulesModalOpen}
            onClose={() => setRulesModalOpen(false)}
            title={selectedAsmForRules.title}
            role={selectedAsmForRules.role}
            description={selectedAsmForRules.description}
            rules={selectedAsmForRules.rules}
            durationMinutes={selectedAsmForRules.duration_minutes}
            totalMarks={selectedAsmForRules.total_marks}
            passingMarks={selectedAsmForRules.passing_marks}
            isCandidateStart={true}
            onAgreeAndStart={() => {
              const target = selectedAsmForRules;
              setRulesModalOpen(false);
              handleStartAssessment(target);
            }}
          />
        )}
      </div>
    );
  }

  // RENDER VIEW: Unauthenticated Registration & Sign In Portal
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      padding: "2rem 1rem",
      background: "radial-gradient(circle at top, #111e38 0%, #0a0f1d 75%)"
    }}>
      <div style={{
        maxWidth: "480px",
        width: "100%",
        backgroundColor: "var(--bg-card, #0c1220)",
        border: "1px solid var(--border-color, #1e293b)",
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

        {/* Tab Switcher: Register vs Sign In */}
        <div style={{
          display: "flex",
          backgroundColor: "#060911",
          borderRadius: "8px",
          padding: "4px",
          marginBottom: "1.5rem",
          border: "1px solid var(--border-color, #1e293b)"
        }}>
          <button
            type="button"
            onClick={() => { setAuthMode("login"); setError(null); setSuccessMsg(null); }}
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
              backgroundColor: authMode === "login" ? "var(--accent-blue, #2563eb)" : "transparent",
              color: authMode === "login" ? "#ffffff" : "#94a3b8",
              transition: "all 0.2s"
            }}
          >
            <LogIn size={16} />
            <span>Sign In</span>
          </button>
          <button
            type="button"
            onClick={() => { setAuthMode("register"); setError(null); setSuccessMsg(null); }}
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
              backgroundColor: authMode === "register" ? "var(--accent-blue, #2563eb)" : "transparent",
              color: authMode === "register" ? "#ffffff" : "#94a3b8",
              transition: "all 0.2s"
            }}
          >
            <UserPlus size={16} />
            <span>Register Account</span>
          </button>
        </div>

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
          {authMode === "login" ? (
            <p><strong>Candidate Login:</strong> Sign in with your registered email and password to access your assigned examinations.</p>
          ) : (
            <p><strong>New Candidate?</strong> Register below with your Name, Email, and Password to view available technical evaluations.</p>
          )}
        </div>

        {/* Success Alert */}
        {successMsg && (
          <div style={{
            backgroundColor: "rgba(16, 185, 129, 0.12)",
            border: "1px solid #10b981",
            borderRadius: "6px",
            padding: "0.75rem 1rem",
            marginBottom: "1.25rem",
            fontSize: "0.85rem",
            color: "#6ee7b7",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem"
          }}>
            <CheckCircle size={16} color="#10b981" />
            <span>{successMsg}</span>
          </div>
        )}

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
                Click here to Register an account now →
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

        {/* Form: Register New Candidate */}
        {authMode === "register" && (
          <form onSubmit={handleRegister}>
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted, #94a3b8)", marginBottom: "0.35rem" }}>
                FULL NAME
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Milan Jyoti Ray"
                  style={{ width: "100%", padding: "0.75rem 1rem 0.75rem 2.4rem", backgroundColor: "#090d16", border: "1px solid var(--border-color, #1e293b)", borderRadius: "6px", color: "#fff", fontSize: "0.9rem", outline: "none" }}
                />
                <User size={16} color="#64748b" style={{ position: "absolute", left: "0.8rem", top: "50%", transform: "translateY(-50%)" }} />
              </div>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted, #94a3b8)", marginBottom: "0.35rem" }}>
                EMAIL ADDRESS
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. candidate@example.com"
                  style={{ width: "100%", padding: "0.75rem 1rem 0.75rem 2.4rem", backgroundColor: "#090d16", border: "1px solid var(--border-color, #1e293b)", borderRadius: "6px", color: "#fff", fontSize: "0.9rem", outline: "none" }}
                />
                <Mail size={16} color="#64748b" style={{ position: "absolute", left: "0.8rem", top: "50%", transform: "translateY(-50%)" }} />
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.25rem" }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted, #94a3b8)", marginBottom: "0.35rem" }}>
                  CREATE PASSWORD
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 4 chars..."
                    style={{ width: "100%", padding: "0.75rem 1rem 0.75rem 2.4rem", backgroundColor: "#090d16", border: "1px solid var(--border-color, #1e293b)", borderRadius: "6px", color: "#fff", fontSize: "0.9rem", outline: "none" }}
                  />
                  <Lock size={16} color="#64748b" style={{ position: "absolute", left: "0.8rem", top: "50%", transform: "translateY(-50%)" }} />
                </div>
              </div>

              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted, #94a3b8)", marginBottom: "0.35rem" }}>
                  CONFIRM PASSWORD
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter..."
                    style={{ width: "100%", padding: "0.75rem 1rem 0.75rem 2.4rem", backgroundColor: "#090d16", border: "1px solid var(--border-color, #1e293b)", borderRadius: "6px", color: "#fff", fontSize: "0.9rem", outline: "none" }}
                  />
                  <Lock size={16} color="#64748b" style={{ position: "absolute", left: "0.8rem", top: "50%", transform: "translateY(-50%)" }} />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "0.9rem",
                backgroundColor: loading ? "#1f293d" : "var(--accent-blue, #2563eb)",
                border: "none",
                borderRadius: "6px",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: "0.95rem",
                cursor: loading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem"
              }}
            >
              {loading ? "Creating Account..." : (
                <>
                  <span>Create Account & View Dashboard</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        )}

        {/* Form: Sign In Existing Candidate */}
        {authMode === "login" && (
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: "1.2rem" }}>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted, #94a3b8)", marginBottom: "0.35rem" }}>
                REGISTERED EMAIL ADDRESS
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. candidate@example.com"
                  style={{ width: "100%", padding: "0.75rem 1rem 0.75rem 2.4rem", backgroundColor: "#090d16", border: "1px solid var(--border-color, #1e293b)", borderRadius: "6px", color: "#fff", fontSize: "0.9rem", outline: "none" }}
                />
                <Mail size={16} color="#64748b" style={{ position: "absolute", left: "0.8rem", top: "50%", transform: "translateY(-50%)" }} />
              </div>
            </div>

            <div style={{ marginBottom: "1.4rem" }}>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted, #94a3b8)", marginBottom: "0.35rem" }}>
                ACCOUNT PASSWORD
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password..."
                  style={{ width: "100%", padding: "0.75rem 1rem 0.75rem 2.4rem", backgroundColor: "#090d16", border: "1px solid var(--border-color, #1e293b)", borderRadius: "6px", color: "#fff", fontSize: "0.9rem", outline: "none" }}
                />
                <Lock size={16} color="#64748b" style={{ position: "absolute", left: "0.8rem", top: "50%", transform: "translateY(-50%)" }} />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "0.9rem",
                backgroundColor: loading ? "#1f293d" : "var(--accent-blue, #2563eb)",
                border: "none",
                borderRadius: "6px",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: "0.95rem",
                cursor: loading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem"
              }}
            >
              {loading ? "Authenticating Session..." : (
                <>
                  <span>Sign In & View Assessments</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        )}

        {/* Bottom Bar: System & Recruiter link */}
        <div style={{
          marginTop: "1.75rem",
          paddingTop: "1.25rem",
          borderTop: "1px solid var(--border-color, #1e293b)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "0.75rem",
          color: "var(--text-muted, #94a3b8)"
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <CheckCircle size={14} color="#10b981" /> Server Active
          </span>
          <a
            href="/admin"
            style={{ color: "var(--accent-cyan)", textDecoration: "none", fontWeight: 600 }}
          >
            Admin & Recruiter Portal →
          </a>
        </div>
      </div>

      {/* Results Modal */}
      {resultsModalOpen && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.8)", zIndex: 9999,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "1rem"
        }}>
          <div style={{
            width: "100%", maxWidth: "800px", maxHeight: "90vh",
            backgroundColor: "#0a0f1e", border: "1px solid #1e293b",
            borderRadius: "14px", display: "flex", flexDirection: "column",
            overflow: "hidden"
          }}>
            {/* Modal Header */}
            <div style={{
              padding: "1.25rem 1.5rem",
              borderBottom: "1px solid #1e293b",
              display: "flex", justifyContent: "space-between", alignItems: "center"
            }}>
              <div>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#fff", margin: 0 }}>
                  {resultsData?.assessment_title || "Assessment Results"}
                </h2>
                {resultsData && !resultsData.error && (
                  <div style={{ display: "flex", gap: "1rem", marginTop: "0.4rem", fontSize: "0.8rem" }}>
                    <span style={{ color: "#38bdf8", fontWeight: 700 }}>
                      Score: {resultsData.total_score}/{resultsData.total_marks}
                    </span>
                    <span style={{
                      color: resultsData.passed ? "#10b981" : "#ef4444",
                      fontWeight: 700
                    }}>
                      {resultsData.passed ? "✅ PASSED" : "❌ NOT PASSED"}
                    </span>
                  </div>
                )}
              </div>
              <button
                onClick={() => { setResultsModalOpen(false); setResultsData(null); }}
                style={{
                  background: "transparent", border: "none", color: "#94a3b8",
                  cursor: "pointer", fontSize: "1.2rem", padding: "0.25rem"
                }}
              >✕</button>
            </div>

            {/* Modal Body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem 1.5rem" }}>
              {loadingResults && (
                <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>
                  <RefreshCw size={24} className="animate-spin" style={{ margin: "0 auto 0.75rem" }} />
                  <p>Loading your results...</p>
                </div>
              )}

              {resultsData?.error && (
                <div style={{
                  padding: "1.5rem", textAlign: "center",
                  backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: "8px", color: "#f87171"
                }}>
                  <AlertTriangle size={24} style={{ margin: "0 auto 0.5rem" }} />
                  <p style={{ fontWeight: 600 }}>{resultsData.error}</p>
                </div>
              )}

              {resultsData && !resultsData.error && resultsData.questions && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {resultsData.questions.map((q: any, idx: number) => (
                    <div key={q.question_id} style={{
                      backgroundColor: "#060911",
                      border: `1px solid ${q.is_correct ? "rgba(16,185,129,0.3)" : q.is_correct === false ? "rgba(239,68,68,0.3)" : "#1e293b"}`,
                      borderRadius: "10px", padding: "1rem 1.25rem"
                    }}>
                      {/* Question Header */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span style={{
                            backgroundColor: "#1e293b", color: "#94a3b8",
                            padding: "0.15rem 0.5rem", borderRadius: "4px",
                            fontSize: "0.7rem", fontWeight: 700
                          }}>Q{idx + 1}</span>
                          <span style={{
                            fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase",
                            color: q.question_type === "CODING" ? "#a855f7" : q.question_type === "MCQ" ? "#38bdf8" : "#f59e0b"
                          }}>{q.question_type}</span>
                          <span style={{ fontSize: "0.68rem", color: "#64748b" }}>{q.section}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <span style={{
                            fontSize: "0.78rem", fontWeight: 700,
                            color: q.is_correct ? "#10b981" : q.is_correct === false ? "#ef4444" : "#f59e0b"
                          }}>
                            {q.score_earned}/{q.marks}
                          </span>
                          {q.is_correct === true && <CheckCircle size={14} color="#10b981" />}
                          {q.is_correct === false && <X size={14} color="#ef4444" />}
                        </div>
                      </div>

                      {/* Question Text */}
                      <p style={{
                        fontSize: "0.85rem", color: "#e2e8f0", marginBottom: "0.75rem",
                        lineHeight: 1.5, whiteSpace: "pre-wrap"
                      }}>{q.question_text}</p>

                      {/* MCQ Options */}
                      {q.question_type === "MCQ" && q.options && q.options.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginBottom: "0.5rem" }}>
                          {q.options.map((opt: any) => (
                            <div key={opt.id} style={{
                              padding: "0.45rem 0.75rem",
                              borderRadius: "6px",
                              fontSize: "0.8rem",
                              backgroundColor: opt.is_selected ? "rgba(56,189,248,0.12)" : "rgba(255,255,255,0.02)",
                              border: `1px solid ${opt.is_selected ? "rgba(56,189,248,0.4)" : "#1e293b"}`,
                              color: opt.is_selected ? "#38bdf8" : "#94a3b8",
                              fontWeight: opt.is_selected ? 600 : 400
                            }}>
                              {opt.is_selected ? "● " : "○ "}{opt.option_text}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Text Response */}
                      {q.question_type === "TEXT" && q.text_response && (
                        <div style={{
                          backgroundColor: "#050810", border: "1px solid #1e293b",
                          borderRadius: "6px", padding: "0.6rem 0.8rem",
                          fontSize: "0.8rem", color: "#e2e8f0", whiteSpace: "pre-wrap"
                        }}>
                          <span style={{ fontSize: "0.68rem", color: "#64748b", display: "block", marginBottom: "0.3rem", fontWeight: 700 }}>YOUR ANSWER:</span>
                          {q.text_response}
                        </div>
                      )}

                      {/* Code Response */}
                      {q.question_type === "CODING" && q.code_response && (
                        <div>
                          <span style={{ fontSize: "0.68rem", color: "#64748b", fontWeight: 700, marginBottom: "0.25rem", display: "block" }}>
                            YOUR CODE ({q.programming_language || "python"}):
                          </span>
                          <pre style={{
                            backgroundColor: "#050810", border: "1px solid #1e293b",
                            borderRadius: "6px", padding: "0.6rem 0.8rem",
                            fontSize: "0.75rem", color: "#e2e8f0",
                            overflow: "auto", maxHeight: "200px",
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                            whiteSpace: "pre", margin: 0
                          }}>{q.code_response}</pre>
                        </div>
                      )}

                      {/* Unanswered */}
                      {!q.selected_option_id && !q.text_response && !q.code_response && (
                        <div style={{ fontSize: "0.78rem", color: "#64748b", fontStyle: "italic" }}>
                          Not answered
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
