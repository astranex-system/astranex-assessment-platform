"use client";

import { useState, useEffect } from "react";
import { Shield, Key, Plus, UserPlus, List, CheckCircle2, AlertCircle, FileText, Code2, Lock, Upload, FileSpreadsheet } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function AdminDashboard() {
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState("admin@astranex.def");
  const [loginPassword, setLoginPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"assessments" | "csv_upload" | "invites" | "audit">("assessments");

  // Create Assessment Form
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(60);
  const [createdAsmId, setCreatedAsmId] = useState<string | null>(null);

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
        setCreatedAsmId(data.id);
        setInviteAsmId(data.id);
        alert("Assessment created successfully!");
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createdAsmId) return alert("Select or create an assessment first.");

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
      const res = await fetch(`${API_BASE}/api/v1/admin/questions?assessment_id=${createdAsmId}`, {
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
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  const handleCsvFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createdAsmId) return alert("Please create or select an Assessment ID first.");
    if (!selectedCsvFile) return alert("Please select a .csv question file to upload.");

    setIsUploadingCsv(true);
    setCsvUploadStatus(null);

    const formData = new FormData();
    formData.append("file", selectedCsvFile);

    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/questions/upload-csv?assessment_id=${createdAsmId}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${adminToken}`
        },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "CSV upload failed.");

      setCsvUploadStatus(`Success! Imported ${data.imported_questions_count} questions with secret server-side test cases.`);
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

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/audit-logs`, {
        headers: { "Authorization": `Bearer ${adminToken}` }
      });
      const data = await res.json();
      if (res.ok) setAuditLogs(data);
    } catch (err: any) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (adminToken && activeTab === "audit") {
      fetchAuditLogs();
    }
  }, [adminToken, activeTab]);

  if (!adminToken) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", backgroundColor: "var(--bg-primary)" }}>
        <div style={{ maxWidth: "400px", width: "100%", backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)", padding: "2rem", borderRadius: "10px" }}>
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
    <div style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <img src="/logo.jpg" alt="AstraNex Defence" style={{ height: "42px", objectFit: "contain", borderRadius: "4px" }} />
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Admin Console</h1>
        </div>

        <nav style={{ display: "flex", gap: "0.75rem" }}>
          <button
            onClick={() => setActiveTab("assessments")}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: activeTab === "assessments" ? "var(--accent-blue)" : "transparent",
              border: "1px solid var(--border-color)",
              color: "#fff",
              borderRadius: "6px",
              cursor: "pointer"
            }}
          >
            Create Questions
          </button>

          <button
            onClick={() => setActiveTab("csv_upload")}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: activeTab === "csv_upload" ? "var(--accent-blue)" : "transparent",
              border: "1px solid var(--border-color)",
              color: "#fff",
              borderRadius: "6px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem"
            }}
          >
            <FileSpreadsheet size={16} />
            <span>Upload Questions CSV</span>
          </button>

          <button
            onClick={() => setActiveTab("invites")}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: activeTab === "invites" ? "var(--accent-blue)" : "transparent",
              border: "1px solid var(--border-color)",
              color: "#fff",
              borderRadius: "6px",
              cursor: "pointer"
            }}
          >
            Generate Invites
          </button>

          <button
            onClick={() => setActiveTab("audit")}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: activeTab === "audit" ? "var(--accent-blue)" : "transparent",
              border: "1px solid var(--border-color)",
              color: "#fff",
              borderRadius: "6px",
              cursor: "pointer"
            }}
          >
            Audit Logs
          </button>
        </nav>
      </header>

      {activeTab === "assessments" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
          {/* Create Assessment */}
          <div style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)", padding: "1.5rem", borderRadius: "8px" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "1rem" }}>1. Create Assessment</h3>
            <form onSubmit={handleCreateAssessment}>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>TITLE</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Robotics & DSA Evaluation"
                  style={{ width: "100%", padding: "0.6rem", backgroundColor: "#060911", border: "1px solid var(--border-color)", color: "#fff", borderRadius: "4px" }}
                />
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>DURATION (MINUTES)</label>
                <input
                  type="number"
                  value={duration}
                  onChange={e => setDuration(Number(e.target.value))}
                  style={{ width: "100%", padding: "0.6rem", backgroundColor: "#060911", border: "1px solid var(--border-color)", color: "#fff", borderRadius: "4px" }}
                />
              </div>
              <button type="submit" style={{ padding: "0.6rem 1.2rem", backgroundColor: "var(--accent-green)", border: "none", color: "#fff", fontWeight: 600, borderRadius: "4px", cursor: "pointer" }}>
                Create Assessment Definition
              </button>
            </form>
            {createdAsmId && <div style={{ marginTop: "1rem", color: "var(--accent-cyan)", fontSize: "0.85rem" }}>Active Assessment ID: {createdAsmId}</div>}
          </div>

          {/* Add Single Question */}
          <div style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)", padding: "1.5rem", borderRadius: "8px" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "1rem" }}>2. Add Single Question</h3>
            <form onSubmit={handleAddQuestion}>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>QUESTION STATEMENT</label>
                <input
                  type="text"
                  value={qText}
                  onChange={e => setQText(e.target.value)}
                  placeholder="Question statement..."
                  style={{ width: "100%", padding: "0.6rem", backgroundColor: "#060911", border: "1px solid var(--border-color)", color: "#fff", borderRadius: "4px" }}
                />
              </div>

              <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
                <div>
                  <label style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>TYPE</label>
                  <select
                    value={qType}
                    onChange={e => setQType(e.target.value as any)}
                    style={{ padding: "0.6rem", backgroundColor: "#060911", border: "1px solid var(--border-color)", color: "#fff", borderRadius: "4px" }}
                  >
                    <option value="MCQ">MCQ</option>
                    <option value="CODING">CODING</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>MARKS</label>
                  <input
                    type="number"
                    value={qMarks}
                    onChange={e => setQMarks(Number(e.target.value))}
                    style={{ width: "80px", padding: "0.6rem", backgroundColor: "#060911", border: "1px solid var(--border-color)", color: "#fff", borderRadius: "4px" }}
                  />
                </div>
              </div>

              {qType === "CODING" && (
                <div style={{ marginBottom: "1rem" }}>
                  <label style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>SECRET TEST CASE (INPUT / EXPECTED OUTPUT)</label>
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

              <button type="submit" style={{ padding: "0.6rem 1.2rem", backgroundColor: "var(--accent-blue)", border: "none", color: "#fff", fontWeight: 600, borderRadius: "4px", cursor: "pointer" }}>
                Save Question & Answer Key
              </button>
            </form>
          </div>
        </div>
      )}

      {activeTab === "csv_upload" && (
        <div style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)", padding: "2rem", borderRadius: "10px", maxWidth: "700px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
            <FileSpreadsheet color="var(--accent-cyan)" size={28} />
            <div>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 700 }}>Bulk Questions CSV Importer</h3>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Upload CSV files containing DSA, Robotics, or MCQ questions & test cases.</p>
            </div>
          </div>

          <div style={{ backgroundColor: "#090e1a", border: "1px solid var(--border-color)", padding: "1rem", borderRadius: "6px", marginBottom: "1.5rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
            <p style={{ fontWeight: 600, color: "#fff", marginBottom: "0.3rem" }}>Expected CSV Header Format:</p>
            <code>type,section,topic,subTopic,tags,questionText,language,testCases,marks,difficulty,timeLimit,memoryLimit</code>
          </div>

          <form onSubmit={handleCsvFileUpload}>
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block", marginBottom: "0.4rem" }}>TARGET ASSESSMENT ID</label>
              <input
                type="text"
                value={createdAsmId || ""}
                onChange={e => setCreatedAsmId(e.target.value)}
                placeholder="Paste Assessment ID or create one in tab 1..."
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
            <button type="submit" style={{ padding: "0.6rem 1.2rem", backgroundColor: "var(--accent-cyan)", border: "none", color: "#000", fontWeight: 700, borderRadius: "4px", cursor: "pointer" }}>
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

      {activeTab === "audit" && (
        <div style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)", padding: "1.5rem", borderRadius: "8px" }}>
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
                    <td style={{ padding: "0.75rem", fontFamily: "var(--font-mono)" }}>{new Date(log.timestamp).toLocaleString()}</td>
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
    </div>
  );
}
