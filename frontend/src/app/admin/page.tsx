"use client";

import { useState, useEffect } from "react";
import { Shield, Key, Plus, UserPlus, List, CheckCircle2, AlertCircle, FileText, Code2, Lock, Upload, FileSpreadsheet, Trophy, Eye, Trash2, Award, ChevronRight, X } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function AdminDashboard() {
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState("admin@astranex.def");
  const [loginPassword, setLoginPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"assessments" | "csv_upload" | "leaderboard" | "invites" | "audit">("assessments");

  // Assessments List & Question Bank
  const [assessments, setAssessments] = useState<any[]>([]);
  const [selectedAsmId, setSelectedAsmId] = useState<string | null>(null);
  const [asmQuestions, setAsmQuestions] = useState<any[]>([]);

  // Create Assessment Form
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(60);

  // Question Form
  const [qText, setQText] = useState("");
  const [qType, setQType] = useState<"MCQ" | "CODING">("MCQ");
  const [qMarks, setQMarks] = useState(5.0);
  const [optionsText, setOptionsText] = useState("Option A\nOption B\nOption C\nOption D");
  const [correctOptIdx, setCorrectOptIdx] = useState(0);
  const [tcInput, setTcInput] = useState("World");
  const [tcOutput, setTcOutput] = useState("Hello World");

  // CSV Upload State
  const [selectedCsvFile, setSelectedCsvFile] = useState<File | null>(null);
  const [csvUploadStatus, setCsvUploadStatus] = useState<string | null>(null);
  const [isUploadingCsv, setIsUploadingCsv] = useState(false);

  // Leaderboard & Inspection Modal
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [inspectSession, setInspectSession] = useState<any | null>(null);

  // Invite Form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteAsmId, setInviteAsmId] = useState("");
  const [generatedInvite, setGeneratedInvite] = useState<any>(null);

  // Audit Logs
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Authentication failed.");
      setAdminToken(data.access_token);
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const fetchAssessments = async () => {
    if (!adminToken) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/assessments`, {
        headers: { "Authorization": `Bearer ${adminToken}` }
      });
      const data = await res.json();
      if (res.ok) {
        setAssessments(data);
        if (data.length > 0 && !selectedAsmId) {
          setSelectedAsmId(data[0].id);
          setInviteAsmId(data[0].id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchQuestionsForAsm = async (asmId: str) => {
    if (!adminToken || !asmId) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/assessments/${asmId}/questions`, {
        headers: { "Authorization": `Bearer ${adminToken}` }
      });
      const data = await res.json();
      if (res.ok) setAsmQuestions(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchLeaderboard = async () => {
    if (!adminToken) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/leaderboard`, {
        headers: { "Authorization": `Bearer ${adminToken}` }
      });
      const data = await res.json();
      if (res.ok) setLeaderboard(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchSessionDetail = async (sessId: string) => {
    if (!adminToken) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/sessions/${sessId}`, {
        headers: { "Authorization": `Bearer ${adminToken}` }
      });
      const data = await res.json();
      if (res.ok) setInspectSession(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAuditLogs = async () => {
    if (!adminToken) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/audit-logs`, {
        headers: { "Authorization": `Bearer ${adminToken}` }
      });
      const data = await res.json();
      if (res.ok) setAuditLogs(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (adminToken) {
      fetchAssessments();
    }
  }, [adminToken]);

  useEffect(() => {
    if (adminToken && selectedAsmId) {
      fetchQuestionsForAsm(selectedAsmId);
    }
  }, [adminToken, selectedAsmId]);

  useEffect(() => {
    if (adminToken && activeTab === "leaderboard") {
      fetchLeaderboard();
    } else if (adminToken && activeTab === "audit") {
      fetchAuditLogs();
    }
  }, [adminToken, activeTab]);

  const handleCreateAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/assessments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`
        },
        body: JSON.stringify({ title, duration_minutes: Number(duration), result_visibility: "IMMEDIATE" })
      });
      const data = await res.json();
      if (res.ok) {
        alert("Assessment created successfully!");
        setTitle("");
        fetchAssessments();
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  const handleDeleteAssessment = async (asmId: string) => {
    if (!confirm("Are you sure you want to delete this assessment and all questions/sessions?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/assessments/${asmId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${adminToken}` }
      });
      if (res.ok) {
        alert("Assessment deleted.");
        fetchAssessments();
        if (selectedAsmId === asmId) setSelectedAsmId(null);
      }
    } catch (err: any) {
      alert("Error deleting assessment: " + err.message);
    }
  };

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsmId) return alert("Select or create an assessment first.");

    const opts = optionsText.split("\n").filter(t => t.trim()).map((t, idx) => ({
      option_text: t.trim(),
      display_order: idx + 1,
      is_correct: idx === Number(correctOptIdx)
    }));

    const body: any = {
      question_text: qText,
      question_type: qType,
      marks: Number(qMarks),
      options: qType === "MCQ" ? opts : [],
      hidden_test_cases: qType === "CODING" ? [{ input: tcInput, expected_output: tcOutput, points: Number(qMarks) }] : []
    };

    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/questions?assessment_id=${selectedAsmId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`
        },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        alert("Question with secret server-side answer key added!");
        setQText("");
        fetchQuestionsForAsm(selectedAsmId);
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  const handleDeleteQuestion = async (qId: string) => {
    if (!confirm("Are you sure you want to delete this question?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/questions/${qId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${adminToken}` }
      });
      if (res.ok) {
        alert("Question deleted.");
        if (selectedAsmId) fetchQuestionsForAsm(selectedAsmId);
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  const handleCsvFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsmId) return alert("Please select an Assessment ID first.");
    if (!selectedCsvFile) return alert("Please select a .csv question file to upload.");

    setIsUploadingCsv(true);
    setCsvUploadStatus(null);

    const formData = new FormData();
    formData.append("file", selectedCsvFile);

    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/questions/upload-csv?assessment_id=${selectedAsmId}`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${adminToken}` },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "CSV upload failed.");

      setCsvUploadStatus(`Success! Imported ${data.imported_questions_count} questions with secret server-side test cases.`);
      fetchQuestionsForAsm(selectedAsmId);
      fetchAssessments();
    } catch (err: any) {
      setCsvUploadStatus(`Error: ${err.message}`);
    } finally {
      setIsUploadingCsv(false);
    }
  };

  const handleGenerateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/invites`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          candidate_email: inviteEmail,
          candidate_name: inviteName,
          assessment_id: inviteAsmId,
          expires_in_hours: 48
        })
      });
      const data = await res.json();
      if (res.ok) {
        setGeneratedInvite(data);
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  if (!adminToken) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", backgroundColor: "var(--bg-primary)", padding: "1rem" }}>
        <div style={{ maxWidth: "400px", width: "100%", backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)", padding: "2rem 1.5rem", borderRadius: "10px" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.5rem" }}>
            <img src="/logo.jpg" alt="AstraNex Defence" style={{ height: "54px", objectFit: "contain", borderRadius: "4px" }} />
          </div>

          {authError && <div style={{ color: "var(--accent-red)", fontSize: "0.85rem", marginBottom: "1rem" }}>{authError}</div>}

          <form onSubmit={handleAdminLogin}>
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block", marginBottom: "0.3rem" }}>ADMIN EMAIL</label>
              <input
                type="email"
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                style={{ width: "100%", padding: "0.75rem", backgroundColor: "#060911", border: "1px solid var(--border-color)", color: "#fff", borderRadius: "6px" }}
              />
            </div>
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block", marginBottom: "0.3rem" }}>PASSWORD</label>
              <input
                type="password"
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                placeholder="Enter password..."
                style={{ width: "100%", padding: "0.75rem", backgroundColor: "#060911", border: "1px solid var(--border-color)", color: "#fff", borderRadius: "6px" }}
              />
            </div>
            <button
              type="submit"
              style={{ width: "100%", padding: "0.8rem", backgroundColor: "var(--accent-cyan)", border: "none", color: "#000", fontWeight: 700, borderRadius: "6px", cursor: "pointer" }}
            >
              Authenticate Admin
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "1.5rem 1rem", maxWidth: "1200px", margin: "0 auto" }}>
      <header className="responsive-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <img src="/logo.jpg" alt="AstraNex Defence" style={{ height: "42px", objectFit: "contain", borderRadius: "4px" }} />
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Admin Console</h1>
        </div>

        <nav style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            onClick={() => setActiveTab("assessments")}
            style={{
              padding: "0.5rem 0.85rem",
              backgroundColor: activeTab === "assessments" ? "var(--accent-blue)" : "transparent",
              border: "1px solid var(--border-color)",
              color: "#fff",
              borderRadius: "6px",
              fontSize: "0.85rem",
              cursor: "pointer"
            }}
          >
            Exam & Questions
          </button>

          <button
            onClick={() => setActiveTab("leaderboard")}
            style={{
              padding: "0.5rem 0.85rem",
              backgroundColor: activeTab === "leaderboard" ? "var(--accent-blue)" : "transparent",
              border: "1px solid var(--border-color)",
              color: "#fff",
              borderRadius: "6px",
              fontSize: "0.85rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem"
            }}
          >
            <Trophy size={16} color="var(--accent-amber)" />
            <span>Leaderboard</span>
          </button>

          <button
            onClick={() => setActiveTab("csv_upload")}
            style={{
              padding: "0.5rem 0.85rem",
              backgroundColor: activeTab === "csv_upload" ? "var(--accent-blue)" : "transparent",
              border: "1px solid var(--border-color)",
              color: "#fff",
              borderRadius: "6px",
              fontSize: "0.85rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem"
            }}
          >
            <FileSpreadsheet size={16} />
            <span>Import CSV</span>
          </button>

          <button
            onClick={() => setActiveTab("invites")}
            style={{
              padding: "0.5rem 0.85rem",
              backgroundColor: activeTab === "invites" ? "var(--accent-blue)" : "transparent",
              border: "1px solid var(--border-color)",
              color: "#fff",
              borderRadius: "6px",
              fontSize: "0.85rem",
              cursor: "pointer"
            }}
          >
            Generate Invites
          </button>

          <button
            onClick={() => setActiveTab("audit")}
            style={{
              padding: "0.5rem 0.85rem",
              backgroundColor: activeTab === "audit" ? "var(--accent-blue)" : "transparent",
              border: "1px solid var(--border-color)",
              color: "#fff",
              borderRadius: "6px",
              fontSize: "0.85rem",
              cursor: "pointer"
            }}
          >
            Audit Logs
          </button>
        </nav>
      </header>

      {/* Main Tab 1: Assessments & Question Bank */}
      {activeTab === "assessments" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          {/* Assessment Selector & Manager */}
          <div style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)", padding: "1.25rem", borderRadius: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 600 }}>1. Active Exam Definitions ({assessments.length})</h3>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
              {assessments.map((asm) => {
                const isSelected = asm.id === selectedAsmId;
                return (
                  <div
                    key={asm.id}
                    onClick={() => { setSelectedAsmId(asm.id); setInviteAsmId(asm.id); }}
                    style={{
                      padding: "1rem",
                      backgroundColor: isSelected ? "rgba(6, 182, 212, 0.08)" : "#090d16",
                      border: `1px solid ${isSelected ? "var(--accent-cyan)" : "var(--border-color)"}`,
                      borderRadius: "6px",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between"
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                        <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#fff" }}>{asm.title}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteAssessment(asm.id); }}
                          style={{ background: "none", border: "none", color: "var(--accent-red)", cursor: "pointer" }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                        <span>Duration: {asm.duration_minutes}m • </span>
                        <span>{asm.question_count} Questions ({asm.total_marks} marks)</span>
                      </div>
                    </div>
                    <div style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "var(--accent-cyan)" }}>
                      {asm.session_count} Candidate Submissions
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Create New Assessment Form */}
            <form onSubmit={handleCreateAssessment} style={{ borderTop: "1px solid var(--border-color)", paddingTop: "1rem", display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ flex: 2, minWidth: "220px" }}>
                <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: "0.2rem" }}>NEW ASSESSMENT TITLE</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Robotics Telemetry & DSA Exam"
                  style={{ width: "100%", padding: "0.55rem", backgroundColor: "#060911", border: "1px solid var(--border-color)", color: "#fff", borderRadius: "4px" }}
                />
              </div>
              <div style={{ flex: 1, minWidth: "120px" }}>
                <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: "0.2rem" }}>DURATION (MINS)</label>
                <input
                  type="number"
                  value={duration}
                  onChange={e => setDuration(Number(e.target.value))}
                  style={{ width: "100%", padding: "0.55rem", backgroundColor: "#060911", border: "1px solid var(--border-color)", color: "#fff", borderRadius: "4px" }}
                />
              </div>
              <button type="submit" style={{ padding: "0.55rem 1.2rem", backgroundColor: "var(--accent-green)", border: "none", color: "#fff", fontWeight: 600, borderRadius: "4px", cursor: "pointer" }}>
                + Create Exam Definition
              </button>
            </form>
          </div>

          {/* Question Bank for Selected Assessment */}
          {selectedAsmId && (
            <div style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)", padding: "1.25rem", borderRadius: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap" }}>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 600 }}>2. Question Bank ({asmQuestions.length} Questions)</h3>
                <span style={{ fontSize: "0.8rem", color: "var(--accent-cyan)", fontFamily: "var(--font-mono)" }}>
                  Assessment ID: {selectedAsmId}
                </span>
              </div>

              {/* Existing Questions List */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
                {asmQuestions.map((q, idx) => (
                  <div
                    key={q.id}
                    style={{
                      padding: "1rem",
                      backgroundColor: "#090d16",
                      border: "1px solid var(--border-color)",
                      borderRadius: "6px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "1rem"
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
                        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--accent-cyan)", backgroundColor: "rgba(6,182,212,0.1)", padding: "0.15rem 0.4rem", borderRadius: "3px" }}>
                          Q{idx + 1} ({q.question_type}) • {q.marks} MARKS
                        </span>
                      </div>
                      <p style={{ fontSize: "0.9rem", color: "#fff", fontWeight: 500 }}>{q.question_text}</p>
                    </div>

                    <button
                      onClick={() => handleDeleteQuestion(q.id)}
                      style={{ padding: "0.4rem 0.6rem", backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid var(--accent-red)", borderRadius: "4px", color: "var(--accent-red)", cursor: "pointer" }}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>

              {/* Add Single Question Form */}
              <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "1rem" }}>
                <h4 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.75rem", color: "#fff" }}>Add New Question to Bank</h4>
                <form onSubmit={handleAddQuestion}>
                  <div style={{ marginBottom: "1rem" }}>
                    <label style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>QUESTION STATEMENT</label>
                    <input
                      type="text"
                      value={qText}
                      onChange={e => setQText(e.target.value)}
                      placeholder="e.g. Write a python function to compute BFS shortest path..."
                      style={{ width: "100%", padding: "0.6rem", backgroundColor: "#060911", border: "1px solid var(--border-color)", color: "#fff", borderRadius: "4px" }}
                    />
                  </div>

                  <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>TYPE</label>
                      <select
                        value={qType}
                        onChange={e => setQType(e.target.value as any)}
                        style={{ width: "100%", padding: "0.6rem", backgroundColor: "#060911", border: "1px solid var(--border-color)", color: "#fff", borderRadius: "4px" }}
                      >
                        <option value="MCQ">MCQ</option>
                        <option value="CODING">CODING</option>
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>MARKS</label>
                      <input
                        type="number"
                        value={qMarks}
                        onChange={e => setQMarks(Number(e.target.value))}
                        style={{ width: "100%", padding: "0.6rem", backgroundColor: "#060911", border: "1px solid var(--border-color)", color: "#fff", borderRadius: "4px" }}
                      />
                    </div>
                  </div>

                  {qType === "CODING" && (
                    <div style={{ marginBottom: "1rem" }}>
                      <label style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>SECRET TEST CASE (INPUT / EXPECTED OUTPUT)</label>
                      <input
                        type="text"
                        value={tcInput}
                        onChange={e => setTcInput(e.target.value)}
                        placeholder="Input..."
                        style={{ width: "100%", padding: "0.5rem", backgroundColor: "#060911", border: "1px solid var(--border-color)", color: "#fff", marginBottom: "0.5rem" }}
                      />
                      <input
                        type="text"
                        value={tcOutput}
                        onChange={e => setTcOutput(e.target.value)}
                        placeholder="Expected Output..."
                        style={{ width: "100%", padding: "0.5rem", backgroundColor: "#060911", border: "1px solid var(--border-color)", color: "#fff" }}
                      />
                    </div>
                  )}

                  <button type="submit" style={{ padding: "0.65rem 1.2rem", backgroundColor: "var(--accent-blue)", border: "none", color: "#fff", fontWeight: 600, borderRadius: "4px", cursor: "pointer" }}>
                    + Save Question & Answer Key
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Tab 2: Live Leaderboard */}
      {activeTab === "leaderboard" && (
        <div style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)", padding: "1.5rem", borderRadius: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Trophy color="var(--accent-amber)" size={24} />
              <h3 style={{ fontSize: "1.2rem", fontWeight: 700 }}>Live Exam Leaderboard ({leaderboard.length} Candidates)</h3>
            </div>
            <button onClick={fetchLeaderboard} style={{ padding: "0.4rem 0.85rem", backgroundColor: "#090d16", border: "1px solid var(--border-color)", color: "#fff", borderRadius: "4px", fontSize: "0.8rem", cursor: "pointer" }}>
              Refresh Leaderboard
            </button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-color)", textTransform: "uppercase", color: "var(--text-muted)" }}>
                  <th style={{ padding: "0.75rem", textAlign: "left" }}>Rank</th>
                  <th style={{ padding: "0.75rem", textAlign: "left" }}>Candidate</th>
                  <th style={{ padding: "0.75rem", textAlign: "left" }}>Exam Title</th>
                  <th style={{ padding: "0.75rem", textAlign: "left" }}>Score</th>
                  <th style={{ padding: "0.75rem", textAlign: "left" }}>Percentage</th>
                  <th style={{ padding: "0.75rem", textAlign: "left" }}>Focus Loss</th>
                  <th style={{ padding: "0.75rem", textAlign: "left" }}>Status</th>
                  <th style={{ padding: "0.75rem", textAlign: "left" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((item) => (
                  <tr key={item.session_id} style={{ borderBottom: "1px solid #1a2234" }}>
                    <td style={{ padding: "0.75rem", fontWeight: 700 }}>
                      {item.rank === 1 ? "🥇 #1" : item.rank === 2 ? "🥈 #2" : item.rank === 3 ? "🥉 #3" : `#${item.rank}`}
                    </td>
                    <td style={{ padding: "0.75rem" }}>
                      <div style={{ fontWeight: 600, color: "#fff" }}>{item.candidate_name}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{item.candidate_email}</div>
                    </td>
                    <td style={{ padding: "0.75rem" }}>{item.assessment_title}</td>
                    <td style={{ padding: "0.75rem", fontWeight: 700, color: "var(--accent-cyan)" }}>
                      {item.total_score} / {item.max_marks} pts
                    </td>
                    <td style={{ padding: "0.75rem" }}>
                      <span style={{ fontWeight: 700, color: item.percentage >= 70 ? "var(--accent-green)" : "var(--accent-amber)" }}>
                        {item.percentage}%
                      </span>
                    </td>
                    <td style={{ padding: "0.75rem", color: item.focus_loss_count > 0 ? "var(--accent-red)" : "var(--text-muted)" }}>
                      {item.focus_loss_count} events
                    </td>
                    <td style={{ padding: "0.75rem" }}>
                      <span style={{
                        padding: "0.2rem 0.5rem",
                        borderRadius: "4px",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        backgroundColor: item.status === "SUBMITTED" ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)",
                        color: item.status === "SUBMITTED" ? "var(--accent-green)" : "var(--accent-amber)"
                      }}>
                        {item.status}
                      </span>
                    </td>
                    <td style={{ padding: "0.75rem" }}>
                      <button
                        onClick={() => fetchSessionDetail(item.session_id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          padding: "0.35rem 0.75rem",
                          backgroundColor: "var(--accent-blue)",
                          border: "none",
                          borderRadius: "4px",
                          color: "#fff",
                          fontSize: "0.8rem",
                          cursor: "pointer"
                        }}
                      >
                        <Eye size={14} /> Inspect Code
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Main Tab 3: CSV Importer */}
      {activeTab === "csv_upload" && (
        <div style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)", padding: "2rem", borderRadius: "10px", maxWidth: "700px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
            <FileSpreadsheet color="var(--accent-cyan)" size={28} />
            <div>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 700 }}>Bulk Questions CSV Importer</h3>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Upload CSV files containing DSA, Robotics, or MCQ questions & test cases.</p>
            </div>
          </div>

          <form onSubmit={handleCsvFileUpload}>
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block", marginBottom: "0.4rem" }}>TARGET ASSESSMENT ID</label>
              <input
                type="text"
                value={selectedAsmId || ""}
                onChange={e => setSelectedAsmId(e.target.value)}
                placeholder="Paste Assessment ID..."
                style={{ width: "100%", padding: "0.75rem", backgroundColor: "#060911", border: "1px solid var(--border-color)", color: "#fff", borderRadius: "6px" }}
              />
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block", marginBottom: "0.4rem" }}>SELECT QUESTIONS CSV FILE</label>
              <input
                type="file"
                accept=".csv"
                onChange={e => setSelectedCsvFile(e.target.files ? e.target.files[0] : null)}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  backgroundColor: "#060911",
                  border: "1px solid var(--border-color)",
                  color: "#fff",
                  borderRadius: "6px",
                  cursor: "pointer"
                }}
              />
            </div>

            <button
              type="submit"
              disabled={isUploadingCsv}
              style={{
                width: "100%",
                padding: "0.85rem",
                backgroundColor: isUploadingCsv ? "#1f293d" : "var(--accent-cyan)",
                border: "none",
                color: "#000",
                fontWeight: 700,
                borderRadius: "6px",
                cursor: isUploadingCsv ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem"
              }}
            >
              <Upload size={18} />
              <span>{isUploadingCsv ? "Parsing & Uploading CSV..." : "Import Questions CSV"}</span>
            </button>
          </form>

          {csvUploadStatus && (
            <div style={{
              marginTop: "1.5rem",
              padding: "1rem",
              backgroundColor: csvUploadStatus.startsWith("Error") ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)",
              border: `1px solid ${csvUploadStatus.startsWith("Error") ? "var(--accent-red)" : "var(--accent-green)"}`,
              borderRadius: "6px",
              color: csvUploadStatus.startsWith("Error") ? "var(--accent-red)" : "var(--accent-green)",
              fontSize: "0.9rem"
            }}>
              {csvUploadStatus}
            </div>
          )}
        </div>
      )}

      {/* Main Tab 4: Invites */}
      {activeTab === "invites" && (
        <div style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)", padding: "1.5rem", borderRadius: "8px", maxWidth: "600px" }}>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "1rem" }}>Generate Secure Invitation Link</h3>
          <form onSubmit={handleGenerateInvite}>
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>CANDIDATE NAME</label>
              <input
                type="text"
                value={inviteName}
                onChange={e => setInviteName(e.target.value)}
                placeholder="Jane Doe"
                style={{ width: "100%", padding: "0.6rem", backgroundColor: "#060911", border: "1px solid var(--border-color)", color: "#fff", borderRadius: "4px" }}
              />
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>CANDIDATE EMAIL</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="jane@example.com"
                style={{ width: "100%", padding: "0.6rem", backgroundColor: "#060911", border: "1px solid var(--border-color)", color: "#fff", borderRadius: "4px" }}
              />
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>ASSESSMENT ID</label>
              <input
                type="text"
                value={inviteAsmId}
                onChange={e => setInviteAsmId(e.target.value)}
                placeholder="Paste Assessment UUID..."
                style={{ width: "100%", padding: "0.6rem", backgroundColor: "#060911", border: "1px solid var(--border-color)", color: "#fff", borderRadius: "4px" }}
              />
            </div>
            <button type="submit" style={{ width: "100%", padding: "0.65rem 1.2rem", backgroundColor: "var(--accent-cyan)", border: "none", color: "#000", fontWeight: 700, borderRadius: "4px", cursor: "pointer" }}>
              Generate Single-Use Link
            </button>
          </form>

          {generatedInvite && (
            <div style={{ marginTop: "1.5rem", backgroundColor: "#090e1a", border: "1px solid var(--accent-cyan)", padding: "1rem", borderRadius: "6px" }}>
              <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--accent-cyan)", marginBottom: "0.5rem" }}>INVITATION LINK GENERATED</p>
              <code style={{ fontSize: "0.85rem", color: "#38bdf8", wordBreak: "break-all" }}>
                {window.location.origin}{generatedInvite.assessment_link}
              </code>
            </div>
          )}
        </div>
      )}

      {/* Main Tab 5: Audit Logs */}
      {activeTab === "audit" && (
        <div style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)", padding: "1.25rem", borderRadius: "8px" }}>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "1rem" }}>System Security Audit Logs</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-color)", textTransform: "uppercase", color: "var(--text-muted)" }}>
                  <th style={{ padding: "0.75rem", textAlign: "left" }}>Timestamp</th>
                  <th style={{ padding: "0.75rem", textAlign: "left" }}>Event</th>
                  <th style={{ padding: "0.75rem", textAlign: "left" }}>Resource</th>
                  <th style={{ padding: "0.75rem", textAlign: "left" }}>Actor</th>
                  <th style={{ padding: "0.75rem", textAlign: "left" }}>IP Address</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map(log => (
                  <tr key={log.id} style={{ borderBottom: "1px solid #1a2234" }}>
                    <td style={{ padding: "0.75rem", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>{new Date(log.timestamp).toLocaleString()}</td>
                    <td style={{ padding: "0.75rem", fontWeight: 600, color: "var(--accent-cyan)" }}>{log.event_type}</td>
                    <td style={{ padding: "0.75rem" }}>{log.resource}</td>
                    <td style={{ padding: "0.75rem" }}>{log.actor_id || "Anonymous"}</td>
                    <td style={{ padding: "0.75rem" }}>{log.ip_address}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Candidate Submissions Inspector Modal */}
      {inspectSession && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.85)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "1.5rem",
          zIndex: 1000
        }}>
          <div style={{
            maxWidth: "850px",
            width: "100%",
            maxHeight: "90vh",
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border-color)",
            borderRadius: "10px",
            padding: "1.5rem",
            overflowY: "auto"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.75rem" }}>
              <div>
                <h3 style={{ fontSize: "1.2rem", fontWeight: 700 }}>Candidate Submissions Inspection</h3>
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  {inspectSession.candidate_name} ({inspectSession.candidate_email}) • Total Score: <strong style={{ color: "var(--accent-cyan)" }}>{inspectSession.total_score} / {inspectSession.max_possible_score} pts</strong>
                </p>
              </div>
              <button onClick={() => setInspectSession(null)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer" }}>
                <X size={24} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {inspectSession.submissions.map((sub: any, idx: number) => (
                <div key={sub.submission_id} style={{ backgroundColor: "#060911", border: "1px solid var(--border-color)", borderRadius: "6px", padding: "1rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                    <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--accent-cyan)" }}>
                      Q{idx + 1}: {sub.question_text}
                    </span>
                    <span style={{ fontSize: "0.8rem", fontWeight: 700, color: sub.is_correct ? "var(--accent-green)" : "var(--accent-red)" }}>
                      Score: {sub.score_earned} pts ({sub.is_correct ? "CORRECT" : "INCORRECT"})
                    </span>
                  </div>

                  {sub.question_type === "CODING" && (
                    <div style={{ marginTop: "0.5rem" }}>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: "0.25rem" }}>Submitted {sub.programming_language || "Python"} Code:</span>
                      <pre style={{ backgroundColor: "#090d16", border: "1px solid #1a2234", padding: "0.75rem", borderRadius: "4px", fontSize: "0.85rem", color: "#38bdf8", fontFamily: "var(--font-mono)", overflowX: "auto" }}>
                        {sub.code_response || "No code submitted."}
                      </pre>
                    </div>
                  )}

                  {sub.question_type === "MCQ" && (
                    <div style={{ fontSize: "0.85rem", color: "#d1d5db" }}>
                      Selected Option ID: <code>{sub.selected_option_id || "None selected"}</code>
                    </div>
                  )}

                  {sub.question_type === "TEXT" && (
                    <div style={{ fontSize: "0.85rem", color: "#d1d5db" }}>
                      Text Response: {sub.text_response || "None"}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
