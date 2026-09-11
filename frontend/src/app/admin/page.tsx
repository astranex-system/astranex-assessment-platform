"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Shield, Users, BookOpen, HelpCircle, Activity, Award, ShieldAlert,
  FileBarChart, FileText, Settings, Search, Bell, LogOut, Plus, Upload,
  Download, Eye, Trash2, Edit, Copy, CheckCircle2, AlertTriangle, X,
  ChevronRight, ChevronDown, RefreshCw, Filter, ArrowUpDown, Lock,
  Code2, Sparkles, Clock, Check, ExternalLink, ShieldCheck, AlertCircle,
  FileSpreadsheet, UserPlus, UserCheck, UserX, BarChart3, PieChart
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://astranex-assesment-api.onrender.com";

type NavigationTab =
  | "dashboard"
  | "candidates"
  | "assessments"
  | "question-bank"
  | "monitoring"
  | "results"
  | "integrity"
  | "reports"
  | "audit"
  | "settings";

export default function AdminPortal() {
  // --- Admin Authentication State ---
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [adminUser, setAdminUser] = useState<any>(null);
  const [loginEmail, setLoginEmail] = useState("admin@astranex.def");
  const [loginPassword, setLoginPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // --- Active Navigation & Global Search ---
  const [activeTab, setActiveTab] = useState<NavigationTab>("dashboard");
  const [globalSearch, setGlobalSearch] = useState("");

  // --- Dashboard Data State ---
  const [dashboardMetrics, setDashboardMetrics] = useState<any>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  // --- Candidates State ---
  const [candidates, setCandidates] = useState<any[]>([]);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidateStatusFilter, setCandidateStatusFilter] = useState("ALL");
  const [candidateAssessmentFilter, setCandidateAssessmentFilter] = useState("ALL");
  const [selectedCandidateDetail, setSelectedCandidateDetail] = useState<any>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  // Candidate Assignment Modal
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignCandidateIds, setAssignCandidateIds] = useState<string[]>([]);
  const [assignAssessmentId, setAssignAssessmentId] = useState("");
  const [assignDeadline, setAssignDeadline] = useState("");
  const [bulkCsvEmails, setBulkCsvEmails] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);

  // --- Assessments State ---
  const [assessments, setAssessments] = useState<any[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState<any>(null);
  const [assessmentModalOpen, setAssessmentModalOpen] = useState(false);
  const [editingAssessmentId, setEditingAssessmentId] = useState<string | null>(null);
  const [asmTitle, setAsmTitle] = useState("");
  const [asmRole, setAsmRole] = useState("Software Engineering");
  const [asmDesc, setAsmDesc] = useState("");
  const [asmDuration, setAsmDuration] = useState(60);
  const [asmTotalMarks, setAsmTotalMarks] = useState(100);
  const [asmPassingMarks, setAsmPassingMarks] = useState(60);
  const [asmMaxAttempts, setAsmMaxAttempts] = useState(1);
  const [asmResultVisibility, setAsmResultVisibility] = useState("NEVER");
  const [isSavingAssessment, setIsSavingAssessment] = useState(false);

  // --- Question Bank & CSV Workflow State ---
  const [questionsBank, setQuestionsBank] = useState<any[]>([]);
  const [qSearch, setQSearch] = useState("");
  const [qSectionFilter, setQSectionFilter] = useState("ALL");
  const [qTypeFilter, setQTypeFilter] = useState("ALL");
  const [qDifficultyFilter, setQDifficultyFilter] = useState("ALL");
  const [previewQuestion, setPreviewQuestion] = useState<any>(null);
  const [editingQuestion, setEditingQuestion] = useState<any>(null);

  // CSV Wizard Modal
  const [csvWizardOpen, setCsvWizardOpen] = useState(false);
  const [csvStep, setCsvStep] = useState<1 | 2 | 3 | 4>(1); // 1: Select & Upload, 2: Validation Results, 3: Preview, 4: Summary
  const [targetAsmIdForCsv, setTargetAsmIdForCsv] = useState("");
  const [selectedCsvFile, setSelectedCsvFile] = useState<File | null>(null);
  const [csvValidationResult, setCsvValidationResult] = useState<any>(null);
  const [isValidatingCsv, setIsValidatingCsv] = useState(false);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [importSummary, setImportSummary] = useState<any>(null);

  // --- Live Monitoring State ---
  const [liveMonitoringSessions, setLiveMonitoringSessions] = useState<any[]>([]);
  const [autoRefreshLive, setAutoRefreshLive] = useState(true);

  // --- Results & Ranking State ---
  const [resultsList, setResultsList] = useState<any[]>([]);
  const [resultsFilterAsm, setResultsFilterAsm] = useState("ALL");
  const [resultsFilterPassed, setResultsFilterPassed] = useState("ALL");
  const [rankingData, setRankingData] = useState<any>(null);
  const [inspectSessionDetail, setInspectSessionDetail] = useState<any>(null);
  const [activeResultsSubTab, setActiveResultsSubTab] = useState<"results" | "ranking">("results");

  // --- Question Analytics State ---
  const [questionAnalytics, setQuestionAnalytics] = useState<any[]>([]);

  // --- Integrity Events State ---
  const [integrityEvents, setIntegrityEvents] = useState<any[]>([]);
  const [integrityRiskFilter, setIntegrityRiskFilter] = useState("ALL");

  // --- Reports State ---
  const [activeReportType, setActiveReportType] = useState("assessment");
  const [reportData, setReportData] = useState<any>(null);

  // --- Audit Logs State ---
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // --- Admin Users & Settings State ---
  const [adminUsers, setAdminUsers] = useState<any[]>([]);

  // Feedback Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Restore Token from Session Storage
  useEffect(() => {
    const savedToken = sessionStorage.getItem("astranex_admin_jwt");
    const savedEmail = sessionStorage.getItem("astranex_admin_email");
    const savedRole = sessionStorage.getItem("astranex_admin_role");
    if (savedToken) {
      setAdminToken(savedToken);
      setAdminUser({ email: savedEmail, role: savedRole });
    }
  }, []);

  // Fetch initial data when authenticated
  useEffect(() => {
    if (adminToken) {
      loadDashboardMetrics();
      loadAssessments();
      loadCandidates();
      loadQuestionBank();
      loadLiveMonitoring();
      loadResults();
      loadQuestionAnalytics();
      loadIntegrityEvents();
      loadAuditLogs();
      loadAdminUsers();
    }
  }, [adminToken]);

  // Auto-refresh for Live Monitoring
  useEffect(() => {
    if (!adminToken || !autoRefreshLive || activeTab !== "monitoring") return;
    const interval = setInterval(() => {
      loadLiveMonitoring();
    }, 8000);
    return () => clearInterval(interval);
  }, [adminToken, autoRefreshLive, activeTab]);

  // --- API Loaders ---
  const authHeaders = useMemo(() => ({
    "Authorization": `Bearer ${adminToken}`,
    "Content-Type": "application/json"
  }), [adminToken]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsLoggingIn(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Authentication failed.");

      setAdminToken(data.access_token);
      setAdminUser({ email: data.email, role: data.role, user_id: data.user_id });
      sessionStorage.setItem("astranex_admin_jwt", data.access_token);
      sessionStorage.setItem("astranex_admin_email", data.email);
      sessionStorage.setItem("astranex_admin_role", data.role);
      showToast("Authenticated successfully. Welcome to AstraNex Defence Command.");
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleAdminLogout = () => {
    sessionStorage.removeItem("astranex_admin_jwt");
    sessionStorage.removeItem("astranex_admin_email");
    sessionStorage.removeItem("astranex_admin_role");
    setAdminToken(null);
    setAdminUser(null);
    showToast("Logged out of Administrative Session.", "info");
  };

  const loadDashboardMetrics = async () => {
    if (!adminToken) return;
    try {
      setLoadingMetrics(true);
      const res = await fetch(`${API_BASE}/api/v1/admin/dashboard/metrics`, { headers: authHeaders });
      if (res.ok) setDashboardMetrics(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMetrics(false);
    }
  };

  const loadAssessments = async () => {
    if (!adminToken) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/assessments`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setAssessments(data);
        if (data.length > 0 && !targetAsmIdForCsv) {
          setTargetAsmIdForCsv(data[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadCandidates = async () => {
    if (!adminToken) return;
    try {
      setLoadingCandidates(true);
      let url = `${API_BASE}/api/v1/admin/candidates?`;
      if (candidateStatusFilter !== "ALL") url += `status=${candidateStatusFilter}&`;
      if (candidateAssessmentFilter !== "ALL") url += `assessment_id=${candidateAssessmentFilter}&`;
      if (candidateSearch.trim()) url += `search=${encodeURIComponent(candidateSearch.trim())}&`;
      const res = await fetch(url, { headers: authHeaders });
      if (res.ok) setCandidates(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingCandidates(false);
    }
  };

  const loadCandidateDetail = async (candidateId: string) => {
    if (!adminToken) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/candidates/${candidateId}/detail`, { headers: authHeaders });
      if (res.ok) setSelectedCandidateDetail(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const updateCandidateStatus = async (candidateId: string, newStatus: string) => {
    if (!adminToken) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/candidates/${candidateId}/status`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        showToast(`Candidate status updated to ${newStatus}.`);
        loadCandidates();
        if (selectedCandidateDetail) loadCandidateDetail(candidateId);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAssignCandidates = async () => {
    if (!assignAssessmentId) {
      showToast("Please select a target technical assessment.", "error");
      return;
    }
    setIsAssigning(true);
    try {
      if (bulkCsvEmails.trim()) {
        const emailList = bulkCsvEmails.split(/[\n,;]+/).map(e => e.trim()).filter(Boolean);
        const res = await fetch(`${API_BASE}/api/v1/admin/assessments/${assignAssessmentId}/assign-csv`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ emails: emailList, deadline: assignDeadline ? new Date(assignDeadline).toISOString() : null })
        });
        const data = await res.json();
        if (res.ok) {
          showToast(data.message || "Bulk candidates assigned successfully.");
          setAssignModalOpen(false);
          setBulkCsvEmails("");
          loadCandidates();
          loadDashboardMetrics();
        } else {
          showToast(data.detail || "Assignment failed.", "error");
        }
      } else if (assignCandidateIds.length > 0) {
        const res = await fetch(`${API_BASE}/api/v1/admin/assessments/${assignAssessmentId}/assign`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ candidate_ids: assignCandidateIds, deadline: assignDeadline ? new Date(assignDeadline).toISOString() : null })
        });
        const data = await res.json();
        if (res.ok) {
          showToast(data.message || "Candidates assigned successfully.");
          setAssignModalOpen(false);
          setAssignCandidateIds([]);
          loadCandidates();
          loadDashboardMetrics();
        } else {
          showToast(data.detail || "Assignment failed.", "error");
        }
      } else {
        showToast("Please select candidates or enter emails.", "error");
      }
    } catch (e: any) {
      showToast(e.message || "Error assigning candidates.", "error");
    } finally {
      setIsAssigning(false);
    }
  };

  const loadQuestionBank = async () => {
    if (!adminToken) return;
    try {
      let url = `${API_BASE}/api/v1/admin/questions/bank?`;
      if (qSectionFilter !== "ALL") url += `section=${encodeURIComponent(qSectionFilter)}&`;
      if (qTypeFilter !== "ALL") url += `question_type=${qTypeFilter}&`;
      if (qDifficultyFilter !== "ALL") url += `difficulty=${qDifficultyFilter}&`;
      if (qSearch.trim()) url += `search=${encodeURIComponent(qSearch.trim())}&`;
      const res = await fetch(url, { headers: authHeaders });
      if (res.ok) setQuestionsBank(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const loadLiveMonitoring = async () => {
    if (!adminToken) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/monitoring/live`, { headers: authHeaders });
      if (res.ok) setLiveMonitoringSessions(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const loadResults = async () => {
    if (!adminToken) return;
    try {
      let url = `${API_BASE}/api/v1/admin/results?`;
      if (resultsFilterAsm !== "ALL") url += `assessment_id=${resultsFilterAsm}&`;
      if (resultsFilterPassed !== "ALL") url += `passed=${resultsFilterPassed === "PASSED"}&`;
      const res = await fetch(url, { headers: authHeaders });
      if (res.ok) setResultsList(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const loadRanking = async (assessmentId: string) => {
    if (!adminToken || !assessmentId) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/results/${assessmentId}/ranking`, { headers: authHeaders });
      if (res.ok) setRankingData(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const loadSessionInspection = async (sessionId: string) => {
    if (!adminToken) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/sessions/${sessionId}`, { headers: authHeaders });
      if (res.ok) setInspectSessionDetail(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const loadQuestionAnalytics = async () => {
    if (!adminToken) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/analytics/questions`, { headers: authHeaders });
      if (res.ok) setQuestionAnalytics(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const loadIntegrityEvents = async () => {
    if (!adminToken) return;
    try {
      let url = `${API_BASE}/api/v1/admin/integrity/events?`;
      if (integrityRiskFilter !== "ALL") url += `risk_level=${integrityRiskFilter}&`;
      const res = await fetch(url, { headers: authHeaders });
      if (res.ok) setIntegrityEvents(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const handleIntegrityAction = async (eventId: string, action: string) => {
    if (!adminToken) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/integrity/events/${eventId}/action`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ action })
      });
      if (res.ok) {
        showToast(`Incident marked as ${action}.`);
        loadIntegrityEvents();
        loadCandidates();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadReport = async (reportType: string) => {
    if (!adminToken) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/reports/${reportType}`, { headers: authHeaders });
      if (res.ok) setReportData(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const loadAuditLogs = async () => {
    if (!adminToken) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/audit-logs?limit=100`, { headers: authHeaders });
      if (res.ok) setAuditLogs(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const loadAdminUsers = async () => {
    if (!adminToken || adminUser?.role !== "admin") return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/users`, { headers: authHeaders });
      if (res.ok) setAdminUsers(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  // --- CSV Validation & Import Wizard Logic ---
  const handleValidateCsv = async () => {
    if (!selectedCsvFile) {
      showToast("Please choose a CSV file.", "error");
      return;
    }
    setIsValidatingCsv(true);
    setCsvValidationResult(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedCsvFile);
      const res = await fetch(`${API_BASE}/api/v1/admin/questions/validate-csv`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${adminToken}` },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.detail || "CSV Validation Failed.", "error");
        return;
      }
      setCsvValidationResult(data);
      setCsvStep(2); // Move to results view
      showToast(`Validation Complete: ${data.valid_count} valid, ${data.invalid_count} invalid rows.`);
    } catch (err: any) {
      showToast(err.message || "Error validating CSV file.", "error");
    } finally {
      setIsValidatingCsv(false);
    }
  };

  const handleConfirmImportCsv = async () => {
    if (!targetAsmIdForCsv || !selectedCsvFile) {
      showToast("Target assessment or file missing.", "error");
      return;
    }
    setIsImportingCsv(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedCsvFile);
      const res = await fetch(`${API_BASE}/api/v1/admin/questions/import-csv?assessment_id=${targetAsmIdForCsv}`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${adminToken}` },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Import failed.");

      setImportSummary(data);
      setCsvStep(4);
      showToast(data.message || "Questions successfully imported!");
      loadQuestionBank();
      loadAssessments();
      loadDashboardMetrics();
    } catch (err: any) {
      showToast(err.message || "Import error.", "error");
    } finally {
      setIsImportingCsv(false);
    }
  };

  const downloadValidationErrorsCsv = () => {
    if (!csvValidationResult || !csvValidationResult.errors || csvValidationResult.errors.length === 0) return;
    const headers = "Row,QuestionID,Error\n";
    const rows = csvValidationResult.errors.map((e: any) => `${e.row},"${e.question_id || ""}","${e.error.replace(/"/g, '""')}"`).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `validation_errors_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export report to CSV
  const downloadReportCsv = () => {
    if (!reportData || !reportData.data || reportData.data.length === 0) {
      showToast("No report data available to export.", "info");
      return;
    }
    const sample = reportData.data[0];
    const keys = Object.keys(sample);
    const headers = keys.join(",") + "\n";
    const rows = reportData.data.map((row: any) =>
      keys.map(k => `"${String(row[k] ?? "").replace(/"/g, '""')}"`).join(",")
    ).join("\n");

    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `astranex_${activeReportType}_report_${Date.now()}.csv`;
    a.click();
  };

  // --- Save Assessment (Create or Edit) ---
  const handleSaveAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!asmTitle.trim()) {
      showToast("Assessment title is required.", "error");
      return;
    }
    setIsSavingAssessment(true);
    try {
      const payload = {
        title: asmTitle.trim(),
        role: asmRole.trim(),
        description: asmDesc.trim() || null,
        duration_minutes: asmDuration,
        total_marks: asmTotalMarks,
        passing_marks: asmPassingMarks,
        max_attempts: asmMaxAttempts,
        result_visibility: asmResultVisibility
      };

      let res;
      if (editingAssessmentId) {
        res = await fetch(`${API_BASE}/api/v1/admin/assessments/${editingAssessmentId}`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch(`${API_BASE}/api/v1/admin/assessments`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify(payload)
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to save assessment.");

      showToast(editingAssessmentId ? "Assessment updated." : "Assessment created successfully.");
      setAssessmentModalOpen(false);
      setEditingAssessmentId(null);
      loadAssessments();
      loadDashboardMetrics();
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setIsSavingAssessment(false);
    }
  };

  const handleDuplicateAssessment = async (asmId: string) => {
    if (!confirm("Are you sure you want to duplicate this assessment and its entire question bank?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/assessments/${asmId}/duplicate`, {
        method: "POST",
        headers: authHeaders
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Assessment duplicated successfully.");
        loadAssessments();
        loadDashboardMetrics();
      } else {
        showToast(data.detail || "Duplicate failed.", "error");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  const handleSetAssessmentStatus = async (asmId: string, statusVal: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/assessments/${asmId}/status?status=${statusVal}`, {
        method: "POST",
        headers: authHeaders
      });
      if (res.ok) {
        showToast(`Assessment status set to ${statusVal}.`);
        loadAssessments();
        loadDashboardMetrics();
      }
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  const handleDeleteAssessment = async (asmId: string) => {
    if (!confirm("CRITICAL WARNING: This will permanently delete this technical assessment and all associated questions, attempts, and candidate sessions. Continue?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/assessments/${asmId}`, {
        method: "DELETE",
        headers: authHeaders
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Assessment deleted cleanly with zero orphaned records.");
        loadAssessments();
        loadDashboardMetrics();
        loadQuestionBank();
      } else {
        showToast(data.detail || "Deletion failed.", "error");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  const handleDeleteQuestion = async (qId: string) => {
    if (!confirm("Delete this question from the bank?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/questions/${qId}`, {
        method: "DELETE",
        headers: authHeaders
      });
      if (res.ok) {
        showToast("Question removed from bank.");
        loadQuestionBank();
        loadAssessments();
      }
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  // --- Login Screen (When Not Authenticated) ---
  if (!adminToken) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#060911",
        backgroundImage: "radial-gradient(ellipse at 50% 10%, #0c1c38 0%, #060911 80%)",
        padding: "1.5rem",
        fontFamily: "var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif)"
      }}>
        <div style={{
          width: "100%",
          maxWidth: "440px",
          backgroundColor: "#0a0f1d",
          border: "1px solid #1b2844",
          borderRadius: "12px",
          padding: "2.5rem 2rem",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)"
        }}>
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "60px",
              height: "60px",
              borderRadius: "12px",
              backgroundColor: "rgba(56, 189, 248, 0.1)",
              border: "1px solid rgba(56, 189, 248, 0.3)",
              marginBottom: "1rem"
            }}>
              <Shield size={32} color="#38bdf8" />
            </div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#ffffff", margin: "0 0 0.3rem 0" }}>
              AstraNex Defence
            </h1>
            <p style={{ fontSize: "0.85rem", color: "#8b9bb4", margin: 0 }}>
              Technical Assessment & Command Console
            </p>
          </div>

          {authError && (
            <div style={{
              padding: "0.85rem 1rem",
              backgroundColor: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: "6px",
              color: "#fca5a5",
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              marginBottom: "1.5rem"
            }}>
              <AlertCircle size={18} />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleAdminLogin}>
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#8b9bb4", marginBottom: "0.4rem" }}>
                Command Email
              </label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.75rem 1rem",
                  backgroundColor: "#060911",
                  border: "1px solid #1b2844",
                  borderRadius: "6px",
                  color: "#ffffff",
                  fontSize: "0.95rem",
                  outline: "none"
                }}
              />
            </div>

            <div style={{ marginBottom: "1.75rem" }}>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#8b9bb4", marginBottom: "0.4rem" }}>
                Secret Administrative Key
              </label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Enter password..."
                style={{
                  width: "100%",
                  padding: "0.75rem 1rem",
                  backgroundColor: "#060911",
                  border: "1px solid #1b2844",
                  borderRadius: "6px",
                  color: "#ffffff",
                  fontSize: "0.95rem",
                  outline: "none"
                }}
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              style={{
                width: "100%",
                padding: "0.85rem",
                backgroundColor: "#2563eb",
                border: "none",
                borderRadius: "6px",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: "0.95rem",
                cursor: isLoggingIn ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem"
              }}
            >
              <Lock size={16} />
              <span>{isLoggingIn ? "Authenticating Clearance..." : "Access Administrative Portal"}</span>
            </button>
          </form>

          <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
            <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
              Authorized defence evaluators & system administrators only.
            </span>
          </div>
        </div>
      </div>
    );
  }

  // --- Main Redesigned Admin Portal Layout ---
  return (
    <div style={{
      display: "flex",
      minHeight: "100vh",
      backgroundColor: "#060911",
      color: "#ffffff",
      fontFamily: "var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif)"
    }}>
      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: "fixed",
          top: "1.5rem",
          right: "1.5rem",
          zIndex: 9999,
          padding: "0.85rem 1.25rem",
          backgroundColor: toast.type === "error" ? "#7f1d1d" : (toast.type === "info" ? "#1e3a8a" : "#065f46"),
          border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: "8px",
          color: "#ffffff",
          fontSize: "0.9rem",
          fontWeight: 600,
          boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          gap: "0.6rem"
        }}>
          {toast.type === "error" ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* ================================================== */}
      {/* 1. ADMIN SIDEBAR NAVIGATION                        */}
      {/* ================================================== */}
      <aside style={{
        width: "260px",
        backgroundColor: "#090d18",
        borderRight: "1px solid #162035",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0
      }}>
        {/* Brand Header */}
        <div style={{
          padding: "1.5rem 1.25rem",
          borderBottom: "1px solid #162035",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem"
        }}>
          <div style={{
            width: "36px",
            height: "36px",
            borderRadius: "8px",
            backgroundColor: "rgba(56, 189, 248, 0.15)",
            border: "1px solid rgba(56, 189, 248, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <Shield size={20} color="#38bdf8" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: "1.05rem", letterSpacing: "0.5px", color: "#ffffff" }}>
              ASTRANEX
            </div>
            <div style={{ fontSize: "0.7rem", color: "#38bdf8", fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase" }}>
              DEFENCE COMMAND
            </div>
          </div>
        </div>

        {/* Navigation Items (Strictly NO invitations) */}
        <nav style={{ padding: "1rem 0.75rem", flex: 1, overflowY: "auto" }}>
          {[
            { id: "dashboard", label: "Dashboard", icon: BarChart3 },
            { id: "candidates", label: "Candidates", icon: Users },
            { id: "assessments", label: "Assessments", icon: BookOpen },
            { id: "question-bank", label: "Question Bank", icon: HelpCircle },
            { id: "monitoring", label: "Live Monitoring", icon: Activity, badge: liveMonitoringSessions.length > 0 ? liveMonitoringSessions.length : null },
            { id: "results", label: "Results & Ranking", icon: Award },
            { id: "integrity", label: "Integrity", icon: ShieldAlert },
            { id: "reports", label: "Reports", icon: FileBarChart },
            { id: "audit", label: "Audit Logs", icon: FileText },
            { id: "settings", label: "Settings", icon: Settings },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id as NavigationTab);
                  if (item.id === "reports" && !reportData) loadReport("assessment");
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.75rem 1rem",
                  marginBottom: "0.25rem",
                  backgroundColor: isActive ? "rgba(56, 189, 248, 0.12)" : "transparent",
                  color: isActive ? "#38bdf8" : "#94a3b8",
                  border: isActive ? "1px solid rgba(56, 189, 248, 0.25)" : "1px solid transparent",
                  borderRadius: "8px",
                  fontSize: "0.9rem",
                  fontWeight: isActive ? 700 : 500,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s ease"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <Icon size={18} color={isActive ? "#38bdf8" : "#94a3b8"} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span style={{
                    backgroundColor: "#ef4444",
                    color: "#ffffff",
                    fontSize: "0.7rem",
                    fontWeight: 800,
                    padding: "0.15rem 0.45rem",
                    borderRadius: "10px"
                  }}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer: Current Admin Profile & Logout */}
        <div style={{
          padding: "1rem",
          borderTop: "1px solid #162035",
          backgroundColor: "#070a13"
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#ffffff", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                {adminUser?.email || "Admin User"}
              </div>
              <div style={{ fontSize: "0.7rem", color: "#38bdf8", textTransform: "uppercase", fontWeight: 700 }}>
                {adminUser?.role || "ADMIN"} CLEARANCE
              </div>
            </div>
            <button
              onClick={handleAdminLogout}
              title="Logout"
              style={{
                backgroundColor: "transparent",
                border: "1px solid #1f293d",
                color: "#94a3b8",
                padding: "0.4rem",
                borderRadius: "6px",
                cursor: "pointer"
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* ================================================== */}
        {/* TOP NAVIGATION BAR                                 */}
        {/* ================================================== */}
        <header style={{
          height: "64px",
          backgroundColor: "#080c17",
          borderBottom: "1px solid #162035",
          padding: "0 2rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0
        }}>
          {/* Global Search Input */}
          <div style={{ position: "relative", width: "360px" }}>
            <Search size={16} color="#64748b" style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)" }} />
            <input
              type="text"
              placeholder="Search candidate, examination, or question ID..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "0.55rem 1rem 0.55rem 2.4rem",
                backgroundColor: "#060911",
                border: "1px solid #1b2844",
                borderRadius: "8px",
                color: "#ffffff",
                fontSize: "0.85rem",
                outline: "none"
              }}
            />
          </div>

          {/* Quick Actions & Header Items */}
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <button
              onClick={() => {
                setCsvWizardOpen(true);
                setCsvStep(1);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.55rem 1rem",
                backgroundColor: "rgba(56, 189, 248, 0.12)",
                border: "1px solid rgba(56, 189, 248, 0.3)",
                borderRadius: "6px",
                color: "#38bdf8",
                fontSize: "0.85rem",
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              <Upload size={16} />
              <span>Import Questions CSV</span>
            </button>

            <button
              onClick={() => {
                setEditingAssessmentId(null);
                setAsmTitle("");
                setAsmRole("Software Engineering");
                setAsmDesc("");
                setAsmDuration(60);
                setAsmTotalMarks(100);
                setAsmPassingMarks(60);
                setAsmMaxAttempts(1);
                setAsmResultVisibility("NEVER");
                setAssessmentModalOpen(true);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.55rem 1rem",
                backgroundColor: "#2563eb",
                border: "none",
                borderRadius: "6px",
                color: "#ffffff",
                fontSize: "0.85rem",
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              <Plus size={16} />
              <span>New Technical Exam</span>
            </button>
          </div>
        </header>

        {/* Scrollable Page Body */}
        <main style={{ flex: 1, overflowY: "auto", padding: "2rem" }}>

          {/* ================================================== */}
          {/* TAB 1: DASHBOARD                                   */}
          {/* ================================================== */}
          {activeTab === "dashboard" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.75rem" }}>
                <div>
                  <h2 style={{ fontSize: "1.4rem", fontWeight: 800, margin: "0 0 0.25rem 0", color: "#ffffff" }}>
                    Platform Overview & Assessment Telemetry
                  </h2>
                  <p style={{ fontSize: "0.85rem", color: "#8b9bb4", margin: 0 }}>
                    Real-time metrics, completion performance, and candidate distribution.
                  </p>
                </div>
                <button
                  onClick={loadDashboardMetrics}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    padding: "0.5rem 0.9rem",
                    backgroundColor: "#0d1526",
                    border: "1px solid #1b2844",
                    borderRadius: "6px",
                    color: "#94a3b8",
                    fontSize: "0.8rem",
                    cursor: "pointer"
                  }}
                >
                  <RefreshCw size={14} className={loadingMetrics ? "spin" : ""} />
                  <span>Refresh Metrics</span>
                </button>
              </div>

              {/* 7 Core KPI Cards */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "1rem",
                marginBottom: "2rem"
              }}>
                {[
                  { label: "Total Candidates", value: dashboardMetrics?.total_candidates ?? "-", color: "#38bdf8", sub: "Registered accounts" },
                  { label: "Active Candidates", value: dashboardMetrics?.active_candidates ?? "-", color: "#10b981", sub: "Status: Active" },
                  { label: "Completed Exams", value: dashboardMetrics?.completed_assessments ?? "-", color: "#a855f7", sub: "Final submissions" },
                  { label: "In Progress", value: dashboardMetrics?.in_progress_assessments ?? "-", color: "#f59e0b", sub: "Currently taking exam" },
                  { label: "Average Score", value: `${dashboardMetrics?.average_score ?? 0}%`, color: "#38bdf8", sub: "Across all exams" },
                  { label: "Pass Rate", value: `${dashboardMetrics?.pass_rate ?? 0}%`, color: "#10b981", sub: ">= Passing threshold" },
                  { label: "Active Exams", value: dashboardMetrics?.active_assessments_count ?? "-", color: "#ec4899", sub: "Published assessments" },
                ].map((kpi, idx) => (
                  <div key={idx} style={{
                    backgroundColor: "#0a0f1d",
                    border: "1px solid #162035",
                    borderRadius: "10px",
                    padding: "1.25rem",
                    position: "relative",
                    overflow: "hidden"
                  }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#8b9bb4", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "0.5rem" }}>
                      {kpi.label}
                    </div>
                    <div style={{ fontSize: "1.8rem", fontWeight: 800, color: kpi.color, lineHeight: 1.1, marginBottom: "0.4rem" }}>
                      {kpi.value}
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "#64748b" }}>
                      {kpi.sub}
                    </div>
                  </div>
                ))}
              </div>

              {/* Charts & Distributions */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "2rem" }}>
                {/* Score Distribution Histogram */}
                <div style={{ backgroundColor: "#0a0f1d", border: "1px solid #162035", borderRadius: "10px", padding: "1.5rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
                    <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#ffffff" }}>Score Distribution Histogram</div>
                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Completed attempts</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", height: "140px", gap: "1.5rem", padding: "0 1rem" }}>
                    {Object.entries(dashboardMetrics?.score_distribution || { "<40%": 0, "40-59%": 0, "60-79%": 0, "80-100%": 0 }).map(([bracket, count]: any) => {
                      const total = Object.values(dashboardMetrics?.score_distribution || {}).reduce((a: any, b: any) => a + b, 0) as number || 1;
                      const pctHeight = Math.max(8, Math.min(100, (count / total) * 100));
                      return (
                        <div key={bracket} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
                          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#38bdf8" }}>{count}</div>
                          <div style={{
                            width: "100%",
                            height: `${pctHeight}%`,
                            backgroundColor: bracket === "80-100%" ? "#10b981" : (bracket === "<40%" ? "#ef4444" : "#3b82f6"),
                            borderRadius: "4px 4px 0 0",
                            transition: "height 0.3s"
                          }} />
                          <div style={{ fontSize: "0.7rem", color: "#8b9bb4", fontWeight: 600 }}>{bracket}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Candidate Status Distribution */}
                <div style={{ backgroundColor: "#0a0f1d", border: "1px solid #162035", borderRadius: "10px", padding: "1.5rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
                    <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#ffffff" }}>Candidate Status Distribution</div>
                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Total: {dashboardMetrics?.total_candidates ?? 0}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    {[
                      { status: "ACTIVE", label: "Active Candidates", color: "#10b981", count: dashboardMetrics?.status_distribution?.ACTIVE || 0 },
                      { status: "SUSPENDED", label: "Suspended Candidates", color: "#f59e0b", count: dashboardMetrics?.status_distribution?.SUSPENDED || 0 },
                      { status: "DISQUALIFIED", label: "Disqualified Candidates", color: "#ef4444", count: dashboardMetrics?.status_distribution?.DISQUALIFIED || 0 },
                    ].map((s) => {
                      const total = dashboardMetrics?.total_candidates || 1;
                      const pct = Math.round((s.count / total) * 100);
                      return (
                        <div key={s.status}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "0.3rem" }}>
                            <span style={{ color: "#ffffff", fontWeight: 600 }}>{s.label}</span>
                            <span style={{ color: s.color, fontWeight: 700 }}>{s.count} ({pct}%)</span>
                          </div>
                          <div style={{ width: "100%", height: "8px", backgroundColor: "#060911", borderRadius: "4px", overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", backgroundColor: s.color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Technical Assessments Overview Table */}
              <div style={{ backgroundColor: "#0a0f1d", border: "1px solid #162035", borderRadius: "10px", padding: "1.5rem", marginBottom: "2rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
                  <div>
                    <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 0.2rem 0", color: "#ffffff" }}>
                      Technical Assessments Overview
                    </h3>
                    <p style={{ fontSize: "0.8rem", color: "#8b9bb4", margin: 0 }}>
                      Live candidate progress and pass-rate indicators by role.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab("assessments")}
                    style={{ background: "none", border: "none", color: "#38bdf8", fontSize: "0.8rem", fontWeight: 700, cursor: "pointer" }}
                  >
                    View All Assessments →
                  </button>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #162035", color: "#8b9bb4", fontSize: "0.75rem", textTransform: "uppercase" }}>
                        <th style={{ padding: "0.75rem 1rem" }}>Assessment Name</th>
                        <th style={{ padding: "0.75rem 1rem" }}>Role</th>
                        <th style={{ padding: "0.75rem 1rem" }}>Candidates</th>
                        <th style={{ padding: "0.75rem 1rem" }}>Completed</th>
                        <th style={{ padding: "0.75rem 1rem" }}>In Progress</th>
                        <th style={{ padding: "0.75rem 1rem" }}>Not Started</th>
                        <th style={{ padding: "0.75rem 1rem" }}>Average Score</th>
                        <th style={{ padding: "0.75rem 1rem" }}>Pass Rate</th>
                        <th style={{ padding: "0.75rem 1rem" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(dashboardMetrics?.assessments_overview || []).length === 0 ? (
                        <tr>
                          <td colSpan={9} style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>
                            No technical assessments currently created. Click 'New Technical Exam' above.
                          </td>
                        </tr>
                      ) : (
                        (dashboardMetrics?.assessments_overview || []).map((asm: any) => (
                          <tr key={asm.id} style={{ borderBottom: "1px solid #0f172a" }}>
                            <td style={{ padding: "0.85rem 1rem", fontWeight: 700, color: "#ffffff" }}>
                              {asm.title}
                            </td>
                            <td style={{ padding: "0.85rem 1rem", color: "#8b9bb4" }}>
                              {asm.role}
                            </td>
                            <td style={{ padding: "0.85rem 1rem", color: "#38bdf8", fontWeight: 700 }}>
                              {asm.candidates}
                            </td>
                            <td style={{ padding: "0.85rem 1rem", color: "#10b981", fontWeight: 700 }}>
                              {asm.completed}
                            </td>
                            <td style={{ padding: "0.85rem 1rem", color: "#f59e0b", fontWeight: 700 }}>
                              {asm.in_progress}
                            </td>
                            <td style={{ padding: "0.85rem 1rem", color: "#64748b" }}>
                              {asm.not_started}
                            </td>
                            <td style={{ padding: "0.85rem 1rem", color: "#ffffff", fontWeight: 600 }}>
                              {asm.average_score}%
                            </td>
                            <td style={{ padding: "0.85rem 1rem" }}>
                              <span style={{
                                padding: "0.2rem 0.6rem",
                                borderRadius: "4px",
                                fontSize: "0.75rem",
                                fontWeight: 700,
                                backgroundColor: asm.pass_rate >= 60 ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                                color: asm.pass_rate >= 60 ? "#10b981" : "#ef4444"
                              }}>
                                {asm.pass_rate}%
                              </span>
                            </td>
                            <td style={{ padding: "0.85rem 1rem" }}>
                              <span style={{
                                padding: "0.2rem 0.5rem",
                                borderRadius: "4px",
                                fontSize: "0.7rem",
                                fontWeight: 700,
                                backgroundColor: asm.status === "ACTIVE" ? "rgba(56, 189, 248, 0.15)" : "#1e293b",
                                color: asm.status === "ACTIVE" ? "#38bdf8" : "#94a3b8"
                              }}>
                                {asm.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recent Activity Feed */}
              <div style={{ backgroundColor: "#0a0f1d", border: "1px solid #162035", borderRadius: "10px", padding: "1.5rem" }}>
                <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#ffffff", marginBottom: "1rem" }}>
                  Recent Security & Activity Feed
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {(dashboardMetrics?.recent_activity || []).map((act: any) => (
                    <div key={act.id} style={{
                      padding: "0.75rem 1rem",
                      backgroundColor: "#060911",
                      border: "1px solid #162035",
                      borderRadius: "6px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: "0.8rem"
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <span style={{
                          padding: "0.2rem 0.5rem",
                          backgroundColor: "#1e293b",
                          color: "#38bdf8",
                          borderRadius: "4px",
                          fontWeight: 700,
                          fontSize: "0.7rem"
                        }}>
                          {act.event}
                        </span>
                        <span style={{ color: "#ffffff", fontWeight: 600 }}>{act.target}</span>
                        <span style={{ color: "#64748b" }}>by {act.actor}</span>
                      </div>
                      <div style={{ color: "#64748b", fontSize: "0.75rem" }}>
                        {act.timestamp ? new Date(act.timestamp).toLocaleTimeString() : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ================================================== */}
          {/* TAB 2: CANDIDATES                                  */}
          {/* ================================================== */}
          {activeTab === "candidates" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                <div>
                  <h2 style={{ fontSize: "1.4rem", fontWeight: 800, margin: "0 0 0.25rem 0", color: "#ffffff" }}>
                    Registered Candidate Directory
                  </h2>
                  <p style={{ fontSize: "0.85rem", color: "#8b9bb4", margin: 0 }}>
                    Manage candidates, review exam histories, and assign assessments directly without invitations.
                  </p>
                </div>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button
                    onClick={() => {
                      setAssignCandidateIds([]);
                      setBulkCsvEmails("");
                      setAssignModalOpen(true);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: "0.6rem 1rem",
                      backgroundColor: "#2563eb",
                      border: "none",
                      borderRadius: "6px",
                      color: "#ffffff",
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      cursor: "pointer"
                    }}
                  >
                    <UserPlus size={16} />
                    <span>Assign Assessment</span>
                  </button>
                </div>
              </div>

              {/* Search & Filters */}
              <div style={{
                display: "flex",
                gap: "1rem",
                marginBottom: "1.5rem",
                backgroundColor: "#0a0f1d",
                padding: "1rem",
                borderRadius: "8px",
                border: "1px solid #162035"
              }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <Search size={16} color="#64748b" style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)" }} />
                  <input
                    type="text"
                    placeholder="Search candidate by Name, Email, Phone, or Candidate ID..."
                    value={candidateSearch}
                    onChange={(e) => setCandidateSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && loadCandidates()}
                    style={{
                      width: "100%",
                      padding: "0.5rem 1rem 0.5rem 2.2rem",
                      backgroundColor: "#060911",
                      border: "1px solid #1b2844",
                      borderRadius: "6px",
                      color: "#ffffff",
                      fontSize: "0.85rem",
                      outline: "none"
                    }}
                  />
                </div>

                <select
                  value={candidateStatusFilter}
                  onChange={(e) => {
                    setCandidateStatusFilter(e.target.value);
                    setTimeout(loadCandidates, 50);
                  }}
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: "#060911",
                    border: "1px solid #1b2844",
                    borderRadius: "6px",
                    color: "#ffffff",
                    fontSize: "0.85rem",
                    outline: "none"
                  }}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="DISQUALIFIED">Disqualified</option>
                </select>

                <select
                  value={candidateAssessmentFilter}
                  onChange={(e) => {
                    setCandidateAssessmentFilter(e.target.value);
                    setTimeout(loadCandidates, 50);
                  }}
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: "#060911",
                    border: "1px solid #1b2844",
                    borderRadius: "6px",
                    color: "#ffffff",
                    fontSize: "0.85rem",
                    outline: "none"
                  }}
                >
                  <option value="ALL">All Assessments</option>
                  {assessments.map(a => (
                    <option key={a.id} value={a.id}>{a.title}</option>
                  ))}
                </select>

                <button
                  onClick={loadCandidates}
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: "6px",
                    color: "#ffffff",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  Filter
                </button>
              </div>

              {/* Candidates Table */}
              <div style={{ backgroundColor: "#0a0f1d", border: "1px solid #162035", borderRadius: "10px", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #162035", color: "#8b9bb4", fontSize: "0.75rem", textTransform: "uppercase", backgroundColor: "#070b16" }}>
                      <th style={{ padding: "0.85rem 1rem", width: "40px" }}>
                        <input
                          type="checkbox"
                          onChange={(e) => {
                            if (e.target.checked) setAssignCandidateIds(candidates.map(c => c.id));
                            else setAssignCandidateIds([]);
                          }}
                        />
                      </th>
                      <th style={{ padding: "0.85rem 1rem" }}>Candidate Name</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Email Address</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Phone</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Registered</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Assigned</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Completed</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Avg Score</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Status</th>
                      <th style={{ padding: "0.85rem 1rem", textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.length === 0 ? (
                      <tr>
                        <td colSpan={10} style={{ padding: "2.5rem", textAlign: "center", color: "#64748b" }}>
                          No candidates found matching the query.
                        </td>
                      </tr>
                    ) : (
                      candidates.map((cand) => (
                        <tr key={cand.id} style={{ borderBottom: "1px solid #0f172a" }}>
                          <td style={{ padding: "0.85rem 1rem" }}>
                            <input
                              type="checkbox"
                              checked={assignCandidateIds.includes(cand.id)}
                              onChange={(e) => {
                                if (e.target.checked) setAssignCandidateIds([...assignCandidateIds, cand.id]);
                                else setAssignCandidateIds(assignCandidateIds.filter(id => id !== cand.id));
                              }}
                            />
                          </td>
                          <td style={{ padding: "0.85rem 1rem", fontWeight: 700, color: "#ffffff" }}>
                            {cand.full_name}
                          </td>
                          <td style={{ padding: "0.85rem 1rem", color: "#94a3b8", fontFamily: "var(--font-mono, monospace)" }}>
                            {cand.email}
                          </td>
                          <td style={{ padding: "0.85rem 1rem", color: "#64748b" }}>
                            {cand.phone || "—"}
                          </td>
                          <td style={{ padding: "0.85rem 1rem", color: "#64748b" }}>
                            {cand.created_at ? new Date(cand.created_at).toLocaleDateString() : "—"}
                          </td>
                          <td style={{ padding: "0.85rem 1rem", color: "#38bdf8", fontWeight: 700 }}>
                            {cand.assessments_assigned_count}
                          </td>
                          <td style={{ padding: "0.85rem 1rem", color: "#10b981", fontWeight: 700 }}>
                            {cand.completed_count}
                          </td>
                          <td style={{ padding: "0.85rem 1rem", fontWeight: 700, color: "#ffffff" }}>
                            {cand.average_score}%
                          </td>
                          <td style={{ padding: "0.85rem 1rem" }}>
                            <span style={{
                              padding: "0.2rem 0.5rem",
                              borderRadius: "4px",
                              fontSize: "0.7rem",
                              fontWeight: 800,
                              backgroundColor: cand.status === "ACTIVE" ? "rgba(16, 185, 129, 0.15)" : (cand.status === "SUSPENDED" ? "rgba(245, 158, 11, 0.15)" : "rgba(239, 68, 68, 0.15)"),
                              color: cand.status === "ACTIVE" ? "#10b981" : (cand.status === "SUSPENDED" ? "#f59e0b" : "#ef4444")
                            }}>
                              {cand.status}
                            </span>
                          </td>
                          <td style={{ padding: "0.85rem 1rem", textAlign: "right" }}>
                            <div style={{ display: "inline-flex", gap: "0.5rem" }}>
                              <button
                                onClick={() => loadCandidateDetail(cand.id)}
                                title="View Candidate Profile & History"
                                style={{
                                  padding: "0.35rem 0.6rem",
                                  backgroundColor: "rgba(56, 189, 248, 0.12)",
                                  border: "1px solid rgba(56, 189, 248, 0.25)",
                                  color: "#38bdf8",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  fontSize: "0.75rem",
                                  fontWeight: 600
                                }}
                              >
                                Detail
                              </button>

                              {cand.status === "ACTIVE" ? (
                                <button
                                  onClick={() => updateCandidateStatus(cand.id, "SUSPENDED")}
                                  title="Suspend Candidate"
                                  style={{
                                    padding: "0.35rem 0.6rem",
                                    backgroundColor: "rgba(245, 158, 11, 0.12)",
                                    border: "1px solid rgba(245, 158, 11, 0.25)",
                                    color: "#f59e0b",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                    fontSize: "0.75rem",
                                    fontWeight: 600
                                  }}
                                >
                                  Suspend
                                </button>
                              ) : (
                                <button
                                  onClick={() => updateCandidateStatus(cand.id, "ACTIVE")}
                                  title="Activate Candidate"
                                  style={{
                                    padding: "0.35rem 0.6rem",
                                    backgroundColor: "rgba(16, 185, 129, 0.12)",
                                    border: "1px solid rgba(16, 185, 129, 0.25)",
                                    color: "#10b981",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                    fontSize: "0.75rem",
                                    fontWeight: 600
                                  }}
                                >
                                  Activate
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================================================== */}
          {/* TAB 3: ASSESSMENTS                                 */}
          {/* ================================================== */}
          {activeTab === "assessments" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.75rem" }}>
                <div>
                  <h2 style={{ fontSize: "1.4rem", fontWeight: 800, margin: "0 0 0.25rem 0", color: "#ffffff" }}>
                    Technical Assessments Repository
                  </h2>
                  <p style={{ fontSize: "0.85rem", color: "#8b9bb4", margin: 0 }}>
                    Manage engineering assessment specifications, passing marks, and candidate access assignments.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setEditingAssessmentId(null);
                    setAsmTitle("");
                    setAsmRole("Software Engineering");
                    setAsmDesc("");
                    setAsmDuration(60);
                    setAsmTotalMarks(100);
                    setAsmPassingMarks(60);
                    setAsmMaxAttempts(1);
                    setAsmResultVisibility("NEVER");
                    setAssessmentModalOpen(true);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.6rem 1.1rem",
                    backgroundColor: "#2563eb",
                    border: "none",
                    borderRadius: "6px",
                    color: "#ffffff",
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  <Plus size={16} />
                  <span>Create Assessment</span>
                </button>
              </div>

              {/* Assessments Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: "1.25rem" }}>
                {assessments.map((asm) => (
                  <div key={asm.id} style={{
                    backgroundColor: "#0a0f1d",
                    border: "1px solid #162035",
                    borderRadius: "10px",
                    padding: "1.5rem",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between"
                  }}>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                        <span style={{
                          padding: "0.2rem 0.5rem",
                          backgroundColor: "#1e293b",
                          color: "#38bdf8",
                          borderRadius: "4px",
                          fontSize: "0.7rem",
                          fontWeight: 700
                        }}>
                          {asm.role || "Engineering"}
                        </span>
                        <span style={{
                          padding: "0.2rem 0.5rem",
                          borderRadius: "4px",
                          fontSize: "0.7rem",
                          fontWeight: 800,
                          backgroundColor: asm.status === "ACTIVE" ? "rgba(16, 185, 129, 0.15)" : (asm.status === "DRAFT" ? "#1e293b" : "rgba(245, 158, 11, 0.15)"),
                          color: asm.status === "ACTIVE" ? "#10b981" : (asm.status === "DRAFT" ? "#94a3b8" : "#f59e0b")
                        }}>
                          {asm.status}
                        </span>
                      </div>

                      <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#ffffff", margin: "0 0 0.5rem 0" }}>
                        {asm.title}
                      </h3>
                      <p style={{ fontSize: "0.8rem", color: "#8b9bb4", margin: "0 0 1rem 0", lineHeight: 1.4 }}>
                        {asm.description || "Comprehensive technical assessment designed for AstraNex engineering evaluation."}
                      </p>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1.25rem", fontSize: "0.8rem" }}>
                        <div style={{ backgroundColor: "#060911", padding: "0.6rem 0.8rem", borderRadius: "6px" }}>
                          <span style={{ color: "#64748b", display: "block", fontSize: "0.7rem" }}>Duration</span>
                          <span style={{ color: "#ffffff", fontWeight: 700 }}>{asm.duration_minutes} Minutes</span>
                        </div>
                        <div style={{ backgroundColor: "#060911", padding: "0.6rem 0.8rem", borderRadius: "6px" }}>
                          <span style={{ color: "#64748b", display: "block", fontSize: "0.7rem" }}>Questions / Marks</span>
                          <span style={{ color: "#ffffff", fontWeight: 700 }}>{asm.question_count} Qs ({asm.total_marks} Pts)</span>
                        </div>
                        <div style={{ backgroundColor: "#060911", padding: "0.6rem 0.8rem", borderRadius: "6px" }}>
                          <span style={{ color: "#64748b", display: "block", fontSize: "0.7rem" }}>Passing Criteria</span>
                          <span style={{ color: "#10b981", fontWeight: 700 }}>{asm.passing_marks} Marks</span>
                        </div>
                        <div style={{ backgroundColor: "#060911", padding: "0.6rem 0.8rem", borderRadius: "6px" }}>
                          <span style={{ color: "#64748b", display: "block", fontSize: "0.7rem" }}>Candidates Attempted</span>
                          <span style={{ color: "#38bdf8", fontWeight: 700 }}>{asm.candidate_count} Candidates</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions Row */}
                    <div style={{
                      paddingTop: "1rem",
                      borderTop: "1px solid #162035",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}>
                      <div style={{ display: "flex", gap: "0.4rem" }}>
                        <button
                          onClick={() => {
                            setTargetAsmIdForCsv(asm.id);
                            setCsvWizardOpen(true);
                            setCsvStep(1);
                          }}
                          title="Import Questions via Predefined CSV"
                          style={{
                            padding: "0.4rem 0.6rem",
                            backgroundColor: "rgba(56, 189, 248, 0.1)",
                            border: "1px solid rgba(56, 189, 248, 0.3)",
                            color: "#38bdf8",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            display: "flex",
                            alignItems: "center",
                            gap: "0.3rem"
                          }}
                        >
                          <Upload size={13} />
                          <span>CSV</span>
                        </button>

                        <button
                          onClick={() => handleDuplicateAssessment(asm.id)}
                          title="Duplicate Exam Definition"
                          style={{
                            padding: "0.4rem 0.6rem",
                            backgroundColor: "#1e293b",
                            border: "1px solid #334155",
                            color: "#94a3b8",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontSize: "0.75rem"
                          }}
                        >
                          <Copy size={13} />
                        </button>

                        <button
                          onClick={() => {
                            setEditingAssessmentId(asm.id);
                            setAsmTitle(asm.title);
                            setAsmRole(asm.role || "Software Engineering");
                            setAsmDesc(asm.description || "");
                            setAsmDuration(asm.duration_minutes);
                            setAsmTotalMarks(asm.total_marks);
                            setAsmPassingMarks(asm.passing_marks);
                            setAsmMaxAttempts(asm.max_attempts);
                            setAsmResultVisibility(asm.result_visibility);
                            setAssessmentModalOpen(true);
                          }}
                          title="Edit Assessment Metadata"
                          style={{
                            padding: "0.4rem 0.6rem",
                            backgroundColor: "#1e293b",
                            border: "1px solid #334155",
                            color: "#94a3b8",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontSize: "0.75rem"
                          }}
                        >
                          <Edit size={13} />
                        </button>

                        <button
                          onClick={() => handleDeleteAssessment(asm.id)}
                          title="Delete Assessment"
                          style={{
                            padding: "0.4rem 0.6rem",
                            backgroundColor: "rgba(239, 68, 68, 0.1)",
                            border: "1px solid rgba(239, 68, 68, 0.3)",
                            color: "#ef4444",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontSize: "0.75rem"
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      <div>
                        {asm.status !== "ACTIVE" ? (
                          <button
                            onClick={() => handleSetAssessmentStatus(asm.id, "ACTIVE")}
                            style={{
                              padding: "0.4rem 0.75rem",
                              backgroundColor: "#10b981",
                              border: "none",
                              color: "#ffffff",
                              borderRadius: "4px",
                              cursor: "pointer",
                              fontSize: "0.75rem",
                              fontWeight: 700
                            }}
                          >
                            Publish
                          </button>
                        ) : (
                          <button
                            onClick={() => handleSetAssessmentStatus(asm.id, "CLOSED")}
                            style={{
                              padding: "0.4rem 0.75rem",
                              backgroundColor: "#334155",
                              border: "none",
                              color: "#e2e8f0",
                              borderRadius: "4px",
                              cursor: "pointer",
                              fontSize: "0.75rem",
                              fontWeight: 700
                            }}
                          >
                            Close
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ================================================== */}
          {/* TAB 4: QUESTION BANK & STRICT CSV WORKFLOW         */}
          {/* ================================================== */}
          {activeTab === "question-bank" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                <div>
                  <h2 style={{ fontSize: "1.4rem", fontWeight: 800, margin: "0 0 0.25rem 0", color: "#ffffff" }}>
                    Technical Question Bank
                  </h2>
                  <p style={{ fontSize: "0.85rem", color: "#8b9bb4", margin: 0 }}>
                    Predefined CSV-first question repository. Secret server-side answer keys are strictly isolated.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setCsvWizardOpen(true);
                    setCsvStep(1);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.6rem 1.1rem",
                    backgroundColor: "#2563eb",
                    border: "none",
                    borderRadius: "6px",
                    color: "#ffffff",
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  <Upload size={16} />
                  <span>Upload Questions CSV</span>
                </button>
              </div>

              {/* Filters */}
              <div style={{
                display: "flex",
                gap: "1rem",
                marginBottom: "1.5rem",
                backgroundColor: "#0a0f1d",
                padding: "1rem",
                borderRadius: "8px",
                border: "1px solid #162035"
              }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <Search size={16} color="#64748b" style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)" }} />
                  <input
                    type="text"
                    placeholder="Search by Question ID, text content, or tags..."
                    value={qSearch}
                    onChange={(e) => setQSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && loadQuestionBank()}
                    style={{
                      width: "100%",
                      padding: "0.5rem 1rem 0.5rem 2.2rem",
                      backgroundColor: "#060911",
                      border: "1px solid #1b2844",
                      borderRadius: "6px",
                      color: "#ffffff",
                      fontSize: "0.85rem",
                      outline: "none"
                    }}
                  />
                </div>

                <select
                  value={qTypeFilter}
                  onChange={(e) => { setQTypeFilter(e.target.value); setTimeout(loadQuestionBank, 50); }}
                  style={{ padding: "0.5rem 1rem", backgroundColor: "#060911", border: "1px solid #1b2844", borderRadius: "6px", color: "#ffffff", fontSize: "0.85rem" }}
                >
                  <option value="ALL">All Types</option>
                  <option value="MCQ">MCQ</option>
                  <option value="CODING">Coding</option>
                  <option value="TEXT">Text</option>
                </select>

                <select
                  value={qDifficultyFilter}
                  onChange={(e) => { setQDifficultyFilter(e.target.value); setTimeout(loadQuestionBank, 50); }}
                  style={{ padding: "0.5rem 1rem", backgroundColor: "#060911", border: "1px solid #1b2844", borderRadius: "6px", color: "#ffffff", fontSize: "0.85rem" }}
                >
                  <option value="ALL">All Difficulties</option>
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>

                <button
                  onClick={loadQuestionBank}
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: "6px",
                    color: "#ffffff",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  Filter
                </button>
              </div>

              {/* Questions Table */}
              <div style={{ backgroundColor: "#0a0f1d", border: "1px solid #162035", borderRadius: "10px", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #162035", color: "#8b9bb4", fontSize: "0.75rem", textTransform: "uppercase", backgroundColor: "#070b16" }}>
                      <th style={{ padding: "0.85rem 1rem" }}>Code</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Section</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Type</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Question Preview</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Difficulty</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Marks</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Assessment</th>
                      <th style={{ padding: "0.85rem 1rem", textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {questionsBank.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ padding: "2.5rem", textAlign: "center", color: "#64748b" }}>
                          No questions found in bank. Use 'Upload Questions CSV' to import questions.
                        </td>
                      </tr>
                    ) : (
                      questionsBank.map((q) => (
                        <tr key={q.id} style={{ borderBottom: "1px solid #0f172a" }}>
                          <td style={{ padding: "0.85rem 1rem", color: "#38bdf8", fontWeight: 700, fontFamily: "var(--font-mono, monospace)" }}>
                            {q.question_code}
                          </td>
                          <td style={{ padding: "0.85rem 1rem", color: "#e2e8f0", fontWeight: 600 }}>
                            {q.section}
                          </td>
                          <td style={{ padding: "0.85rem 1rem" }}>
                            <span style={{
                              padding: "0.2rem 0.5rem",
                              borderRadius: "4px",
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              backgroundColor: q.question_type === "CODING" ? "rgba(168, 85, 247, 0.15)" : "rgba(59, 130, 246, 0.15)",
                              color: q.question_type === "CODING" ? "#a855f7" : "#3b82f6"
                            }}>
                              {q.question_type}
                            </span>
                          </td>
                          <td style={{ padding: "0.85rem 1rem", color: "#ffffff", maxWidth: "340px", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                            {q.question_text}
                          </td>
                          <td style={{ padding: "0.85rem 1rem" }}>
                            <span style={{
                              padding: "0.2rem 0.5rem",
                              borderRadius: "4px",
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              backgroundColor: q.difficulty === "Easy" ? "rgba(16, 185, 129, 0.15)" : (q.difficulty === "Hard" ? "rgba(239, 68, 68, 0.15)" : "rgba(245, 158, 11, 0.15)"),
                              color: q.difficulty === "Easy" ? "#10b981" : (q.difficulty === "Hard" ? "#ef4444" : "#f59e0b")
                            }}>
                              {q.difficulty}
                            </span>
                          </td>
                          <td style={{ padding: "0.85rem 1rem", fontWeight: 700, color: "#ffffff" }}>
                            {q.marks} Pts
                          </td>
                          <td style={{ padding: "0.85rem 1rem", color: "#8b9bb4" }}>
                            {q.assessment_title}
                          </td>
                          <td style={{ padding: "0.85rem 1rem", textAlign: "right" }}>
                            <div style={{ display: "inline-flex", gap: "0.4rem" }}>
                              <button
                                onClick={() => setPreviewQuestion(q)}
                                title="Preview Question"
                                style={{
                                  padding: "0.35rem 0.6rem",
                                  backgroundColor: "rgba(56, 189, 248, 0.12)",
                                  border: "1px solid rgba(56, 189, 248, 0.25)",
                                  color: "#38bdf8",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  fontSize: "0.75rem"
                                }}
                              >
                                Preview
                              </button>
                              <button
                                onClick={() => handleDeleteQuestion(q.id)}
                                title="Delete Question"
                                style={{
                                  padding: "0.35rem 0.6rem",
                                  backgroundColor: "rgba(239, 68, 68, 0.12)",
                                  border: "1px solid rgba(239, 68, 68, 0.25)",
                                  color: "#ef4444",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  fontSize: "0.75rem"
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================================================== */}
          {/* TAB 5: LIVE MONITORING                             */}
          {/* ================================================== */}
          {activeTab === "monitoring" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                <div>
                  <h2 style={{ fontSize: "1.4rem", fontWeight: 800, margin: "0 0 0.25rem 0", color: "#ffffff" }}>
                    Live Technical Assessment Monitoring
                  </h2>
                  <p style={{ fontSize: "0.85rem", color: "#8b9bb4", margin: 0 }}>
                    Active candidate session telemetry with server-authoritative time remaining.
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", color: "#8b9bb4", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={autoRefreshLive}
                      onChange={(e) => setAutoRefreshLive(e.target.checked)}
                    />
                    <span>Auto-refresh (8s)</span>
                  </label>
                  <button
                    onClick={loadLiveMonitoring}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      padding: "0.5rem 0.9rem",
                      backgroundColor: "#0d1526",
                      border: "1px solid #1b2844",
                      borderRadius: "6px",
                      color: "#38bdf8",
                      fontSize: "0.8rem",
                      cursor: "pointer"
                    }}
                  >
                    <RefreshCw size={14} />
                    <span>Refresh Now</span>
                  </button>
                </div>
              </div>

              {/* Active Monitoring Table */}
              <div style={{ backgroundColor: "#0a0f1d", border: "1px solid #162035", borderRadius: "10px", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #162035", color: "#8b9bb4", fontSize: "0.75rem", textTransform: "uppercase", backgroundColor: "#070b16" }}>
                      <th style={{ padding: "0.85rem 1rem" }}>Candidate</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Assessment</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Started At</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Time Remaining</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Progress</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Connection</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Integrity Risk</th>
                      <th style={{ padding: "0.85rem 1rem", textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liveMonitoringSessions.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
                          No active candidates are currently sitting for examinations.
                        </td>
                      </tr>
                    ) : (
                      liveMonitoringSessions.map((sess) => {
                        const mins = Math.floor(sess.time_remaining_seconds / 60);
                        const secs = sess.time_remaining_seconds % 60;
                        return (
                          <tr key={sess.session_id} style={{ borderBottom: "1px solid #0f172a" }}>
                            <td style={{ padding: "0.85rem 1rem" }}>
                              <div style={{ fontWeight: 700, color: "#ffffff" }}>{sess.candidate_name}</div>
                              <div style={{ fontSize: "0.75rem", color: "#64748b", fontFamily: "var(--font-mono, monospace)" }}>{sess.candidate_email}</div>
                            </td>
                            <td style={{ padding: "0.85rem 1rem", color: "#38bdf8", fontWeight: 600 }}>
                              {sess.assessment_title}
                            </td>
                            <td style={{ padding: "0.85rem 1rem", color: "#8b9bb4" }}>
                              {sess.started_at ? new Date(sess.started_at).toLocaleTimeString() : "—"}
                            </td>
                            <td style={{ padding: "0.85rem 1rem", fontWeight: 700, color: sess.time_remaining_seconds < 300 ? "#ef4444" : "#ffffff", fontFamily: "var(--font-mono, monospace)" }}>
                              {mins}:{secs < 10 ? `0${secs}` : secs}
                            </td>
                            <td style={{ padding: "0.85rem 1rem" }}>
                              <span style={{ color: "#10b981", fontWeight: 700 }}>{sess.answered_count}</span>
                              <span style={{ color: "#64748b" }}> / {sess.total_questions} Answered</span>
                            </td>
                            <td style={{ padding: "0.85rem 1rem" }}>
                              <span style={{
                                padding: "0.2rem 0.5rem",
                                borderRadius: "4px",
                                fontSize: "0.7rem",
                                fontWeight: 800,
                                backgroundColor: "rgba(16, 185, 129, 0.15)",
                                color: "#10b981"
                              }}>
                                {sess.connection_status}
                              </span>
                            </td>
                            <td style={{ padding: "0.85rem 1rem" }}>
                              <span style={{
                                padding: "0.2rem 0.5rem",
                                borderRadius: "4px",
                                fontSize: "0.7rem",
                                fontWeight: 800,
                                backgroundColor: sess.risk_level === "HIGH" ? "rgba(239, 68, 68, 0.2)" : (sess.risk_level === "MEDIUM" ? "rgba(245, 158, 11, 0.2)" : "rgba(16, 185, 129, 0.15)"),
                                color: sess.risk_level === "HIGH" ? "#ef4444" : (sess.risk_level === "MEDIUM" ? "#f59e0b" : "#10b981")
                              }}>
                                {sess.risk_level} RISK
                              </span>
                            </td>
                            <td style={{ padding: "0.85rem 1rem", textAlign: "right" }}>
                              <button
                                onClick={() => loadSessionInspection(sess.session_id)}
                                style={{
                                  padding: "0.35rem 0.6rem",
                                  backgroundColor: "rgba(56, 189, 248, 0.12)",
                                  border: "1px solid rgba(56, 189, 248, 0.25)",
                                  color: "#38bdf8",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  fontSize: "0.75rem",
                                  fontWeight: 600
                                }}
                              >
                                Inspect Live
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================================================== */}
          {/* TAB 6: RESULTS & SERVER-SIDE RANKING               */}
          {/* ================================================== */}
          {activeTab === "results" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                <div>
                  <h2 style={{ fontSize: "1.4rem", fontWeight: 800, margin: "0 0 0.25rem 0", color: "#ffffff" }}>
                    Candidate Results & Leaderboard
                  </h2>
                  <p style={{ fontSize: "0.85rem", color: "#8b9bb4", margin: 0 }}>
                    Detailed score breakdowns, code submission inspection, and server-calculated rankings.
                  </p>
                </div>
                {/* Toggle Sub Tabs: Individual Results vs Leaderboard */}
                <div style={{ display: "flex", backgroundColor: "#0a0f1d", border: "1px solid #162035", borderRadius: "8px", padding: "0.25rem" }}>
                  <button
                    onClick={() => setActiveResultsSubTab("results")}
                    style={{
                      padding: "0.5rem 1rem",
                      backgroundColor: activeResultsSubTab === "results" ? "#2563eb" : "transparent",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "6px",
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      cursor: "pointer"
                    }}
                  >
                    Results Log
                  </button>
                  <button
                    onClick={() => {
                      setActiveResultsSubTab("ranking");
                      if (assessments.length > 0 && !rankingData) loadRanking(assessments[0].id);
                    }}
                    style={{
                      padding: "0.5rem 1rem",
                      backgroundColor: activeResultsSubTab === "ranking" ? "#2563eb" : "transparent",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "6px",
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      cursor: "pointer"
                    }}
                  >
                    Server-Side Ranking
                  </button>
                </div>
              </div>

              {activeResultsSubTab === "results" ? (
                <div>
                  {/* Results Filter Bar */}
                  <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", backgroundColor: "#0a0f1d", padding: "1rem", borderRadius: "8px", border: "1px solid #162035" }}>
                    <select
                      value={resultsFilterAsm}
                      onChange={(e) => { setResultsFilterAsm(e.target.value); setTimeout(loadResults, 50); }}
                      style={{ padding: "0.5rem 1rem", backgroundColor: "#060911", border: "1px solid #1b2844", borderRadius: "6px", color: "#ffffff", fontSize: "0.85rem" }}
                    >
                      <option value="ALL">All Assessments</option>
                      {assessments.map(a => (
                        <option key={a.id} value={a.id}>{a.title}</option>
                      ))}
                    </select>

                    <select
                      value={resultsFilterPassed}
                      onChange={(e) => { setResultsFilterPassed(e.target.value); setTimeout(loadResults, 50); }}
                      style={{ padding: "0.5rem 1rem", backgroundColor: "#060911", border: "1px solid #1b2844", borderRadius: "6px", color: "#ffffff", fontSize: "0.85rem" }}
                    >
                      <option value="ALL">All Outcomes</option>
                      <option value="PASSED">Passed Only</option>
                      <option value="FAILED">Failed Only</option>
                    </select>

                    <button
                      onClick={loadResults}
                      style={{
                        padding: "0.5rem 1rem",
                        backgroundColor: "#1e293b",
                        border: "1px solid #334155",
                        borderRadius: "6px",
                        color: "#ffffff",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        cursor: "pointer"
                      }}
                    >
                      Filter
                    </button>
                  </div>

                  {/* Results Table */}
                  <div style={{ backgroundColor: "#0a0f1d", border: "1px solid #162035", borderRadius: "10px", overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #162035", color: "#8b9bb4", fontSize: "0.75rem", textTransform: "uppercase", backgroundColor: "#070b16" }}>
                          <th style={{ padding: "0.85rem 1rem" }}>Candidate</th>
                          <th style={{ padding: "0.85rem 1rem" }}>Assessment</th>
                          <th style={{ padding: "0.85rem 1rem" }}>Score</th>
                          <th style={{ padding: "0.85rem 1rem" }}>Percentage</th>
                          <th style={{ padding: "0.85rem 1rem" }}>Outcome</th>
                          <th style={{ padding: "0.85rem 1rem" }}>Time Taken</th>
                          <th style={{ padding: "0.85rem 1rem" }}>Completed Date</th>
                          <th style={{ padding: "0.85rem 1rem", textAlign: "right" }}>Inspection</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resultsList.length === 0 ? (
                          <tr>
                            <td colSpan={8} style={{ padding: "2.5rem", textAlign: "center", color: "#64748b" }}>
                              No candidate assessment submissions found matching criteria.
                            </td>
                          </tr>
                        ) : (
                          resultsList.map((res: any) => {
                            const mins = Math.floor(res.time_taken_seconds / 60);
                            const secs = res.time_taken_seconds % 60;
                            return (
                              <tr key={res.session_id} style={{ borderBottom: "1px solid #0f172a" }}>
                                <td style={{ padding: "0.85rem 1rem" }}>
                                  <div style={{ fontWeight: 700, color: "#ffffff" }}>{res.candidate_name}</div>
                                  <div style={{ fontSize: "0.75rem", color: "#64748b", fontFamily: "var(--font-mono, monospace)" }}>{res.candidate_email}</div>
                                </td>
                                <td style={{ padding: "0.85rem 1rem", color: "#38bdf8", fontWeight: 600 }}>
                                  {res.assessment_title}
                                </td>
                                <td style={{ padding: "0.85rem 1rem", fontWeight: 700, color: "#ffffff" }}>
                                  {res.score} / {res.max_marks}
                                </td>
                                <td style={{ padding: "0.85rem 1rem", fontWeight: 700, color: res.passed ? "#10b981" : "#ef4444" }}>
                                  {res.percentage}%
                                </td>
                                <td style={{ padding: "0.85rem 1rem" }}>
                                  <span style={{
                                    padding: "0.2rem 0.5rem",
                                    borderRadius: "4px",
                                    fontSize: "0.75rem",
                                    fontWeight: 800,
                                    backgroundColor: res.passed ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                                    color: res.passed ? "#10b981" : "#ef4444"
                                  }}>
                                    {res.passed ? "PASSED" : "FAILED"}
                                  </span>
                                </td>
                                <td style={{ padding: "0.85rem 1rem", color: "#8b9bb4", fontFamily: "var(--font-mono, monospace)" }}>
                                  {mins}m {secs}s
                                </td>
                                <td style={{ padding: "0.85rem 1rem", color: "#64748b" }}>
                                  {res.completed_at ? new Date(res.completed_at).toLocaleDateString() : "—"}
                                </td>
                                <td style={{ padding: "0.85rem 1rem", textAlign: "right" }}>
                                  <button
                                    onClick={() => loadSessionInspection(res.session_id)}
                                    style={{
                                      padding: "0.35rem 0.65rem",
                                      backgroundColor: "rgba(56, 189, 248, 0.12)",
                                      border: "1px solid rgba(56, 189, 248, 0.3)",
                                      color: "#38bdf8",
                                      borderRadius: "4px",
                                      cursor: "pointer",
                                      fontSize: "0.75rem",
                                      fontWeight: 600
                                    }}
                                  >
                                    Inspect Result
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* Sub Tab: Server-Side Ranking */
                <div>
                  <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", alignItems: "center" }}>
                    <span style={{ fontSize: "0.85rem", color: "#8b9bb4", fontWeight: 600 }}>Select Assessment:</span>
                    <select
                      value={targetAsmIdForCsv}
                      onChange={(e) => {
                        setTargetAsmIdForCsv(e.target.value);
                        loadRanking(e.target.value);
                      }}
                      style={{ padding: "0.5rem 1rem", backgroundColor: "#0a0f1d", border: "1px solid #162035", borderRadius: "6px", color: "#ffffff", fontSize: "0.85rem" }}
                    >
                      {assessments.map(a => (
                        <option key={a.id} value={a.id}>{a.title}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ backgroundColor: "#0a0f1d", border: "1px solid #162035", borderRadius: "10px", overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #162035", color: "#8b9bb4", fontSize: "0.75rem", textTransform: "uppercase", backgroundColor: "#070b16" }}>
                          <th style={{ padding: "0.85rem 1rem", width: "60px" }}>Rank</th>
                          <th style={{ padding: "0.85rem 1rem" }}>Candidate</th>
                          <th style={{ padding: "0.85rem 1rem" }}>Score</th>
                          <th style={{ padding: "0.85rem 1rem" }}>Percentage</th>
                          <th style={{ padding: "0.85rem 1rem" }}>Time Taken</th>
                          <th style={{ padding: "0.85rem 1rem" }}>Focus Loss Events</th>
                          <th style={{ padding: "0.85rem 1rem" }}>Date Completed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(!rankingData || !rankingData.overall_ranking || rankingData.overall_ranking.length === 0) ? (
                          <tr>
                            <td colSpan={7} style={{ padding: "2.5rem", textAlign: "center", color: "#64748b" }}>
                              No candidate submissions recorded yet for this assessment ranking.
                            </td>
                          </tr>
                        ) : (
                          rankingData.overall_ranking.map((row: any) => (
                            <tr key={row.session_id} style={{ borderBottom: "1px solid #0f172a" }}>
                              <td style={{ padding: "0.85rem 1rem" }}>
                                <span style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  width: "28px",
                                  height: "28px",
                                  borderRadius: "50%",
                                  backgroundColor: row.rank === 1 ? "#fbbf24" : (row.rank === 2 ? "#94a3b8" : (row.rank === 3 ? "#b45309" : "#1e293b")),
                                  color: row.rank <= 3 ? "#000000" : "#ffffff",
                                  fontWeight: 800,
                                  fontSize: "0.8rem"
                                }}>
                                  {row.rank}
                                </span>
                              </td>
                              <td style={{ padding: "0.85rem 1rem" }}>
                                <div style={{ fontWeight: 700, color: "#ffffff" }}>{row.candidate_name}</div>
                                <div style={{ fontSize: "0.75rem", color: "#64748b", fontFamily: "var(--font-mono, monospace)" }}>{row.candidate_email}</div>
                              </td>
                              <td style={{ padding: "0.85rem 1rem", fontWeight: 700, color: "#38bdf8" }}>
                                {row.score} / {row.max_marks}
                              </td>
                              <td style={{ padding: "0.85rem 1rem", fontWeight: 700, color: row.percentage >= 60 ? "#10b981" : "#ef4444" }}>
                                {row.percentage}%
                              </td>
                              <td style={{ padding: "0.85rem 1rem", color: "#8b9bb4", fontFamily: "var(--font-mono, monospace)" }}>
                                {Math.floor(row.time_taken_seconds / 60)}m {row.time_taken_seconds % 60}s
                              </td>
                              <td style={{ padding: "0.85rem 1rem", color: row.focus_loss_count > 3 ? "#ef4444" : "#10b981", fontWeight: 600 }}>
                                {row.focus_loss_count}
                              </td>
                              <td style={{ padding: "0.85rem 1rem", color: "#64748b" }}>
                                {row.completed_at ? new Date(row.completed_at).toLocaleDateString() : "—"}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================================================== */}
          {/* TAB 7: INTEGRITY DASHBOARD                         */}
          {/* ================================================== */}
          {activeTab === "integrity" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                <div>
                  <h2 style={{ fontSize: "1.4rem", fontWeight: 800, margin: "0 0 0.25rem 0", color: "#ffffff" }}>
                    Security & Proctoring Integrity Dashboard
                  </h2>
                  <p style={{ fontSize: "0.85rem", color: "#8b9bb4", margin: 0 }}>
                    Real-time monitoring of suspicious activity, tab switching, rapid submissions, and token anomalies.
                  </p>
                </div>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <select
                    value={integrityRiskFilter}
                    onChange={(e) => {
                      setIntegrityRiskFilter(e.target.value);
                      setTimeout(loadIntegrityEvents, 50);
                    }}
                    style={{ padding: "0.5rem 1rem", backgroundColor: "#0a0f1d", border: "1px solid #162035", borderRadius: "6px", color: "#ffffff", fontSize: "0.85rem" }}
                  >
                    <option value="ALL">All Risk Levels</option>
                    <option value="HIGH">High Risk Only</option>
                    <option value="MEDIUM">Medium Risk</option>
                    <option value="LOW">Low Risk</option>
                  </select>
                </div>
              </div>

              {/* Integrity Incidents Table */}
              <div style={{ backgroundColor: "#0a0f1d", border: "1px solid #162035", borderRadius: "10px", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #162035", color: "#8b9bb4", fontSize: "0.75rem", textTransform: "uppercase", backgroundColor: "#070b16" }}>
                      <th style={{ padding: "0.85rem 1rem" }}>Candidate</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Assessment</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Incident Event</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Timestamp</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Risk Level</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Status</th>
                      <th style={{ padding: "0.85rem 1rem", textAlign: "right" }}>Admin Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {integrityEvents.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
                          No integrity risk incidents flagged across ongoing or completed sessions.
                        </td>
                      </tr>
                    ) : (
                      integrityEvents.map((ev) => (
                        <tr key={ev.id} style={{ borderBottom: "1px solid #0f172a" }}>
                          <td style={{ padding: "0.85rem 1rem" }}>
                            <div style={{ fontWeight: 700, color: "#ffffff" }}>{ev.candidate_name}</div>
                            <div style={{ fontSize: "0.75rem", color: "#64748b", fontFamily: "var(--font-mono, monospace)" }}>{ev.candidate_email}</div>
                          </td>
                          <td style={{ padding: "0.85rem 1rem", color: "#38bdf8", fontWeight: 600 }}>
                            {ev.assessment_title}
                          </td>
                          <td style={{ padding: "0.85rem 1rem", fontWeight: 700, color: "#ffffff" }}>
                            {ev.event_type}
                          </td>
                          <td style={{ padding: "0.85rem 1rem", color: "#8b9bb4" }}>
                            {ev.created_at ? new Date(ev.created_at).toLocaleTimeString() : "—"}
                          </td>
                          <td style={{ padding: "0.85rem 1rem" }}>
                            <span style={{
                              padding: "0.2rem 0.5rem",
                              borderRadius: "4px",
                              fontSize: "0.7rem",
                              fontWeight: 800,
                              backgroundColor: ev.risk_level === "HIGH" ? "rgba(239, 68, 68, 0.2)" : (ev.risk_level === "MEDIUM" ? "rgba(245, 158, 11, 0.2)" : "rgba(16, 185, 129, 0.15)"),
                              color: ev.risk_level === "HIGH" ? "#ef4444" : (ev.risk_level === "MEDIUM" ? "#f59e0b" : "#10b981")
                            }}>
                              {ev.risk_level}
                            </span>
                          </td>
                          <td style={{ padding: "0.85rem 1rem", color: "#8b9bb4", fontWeight: 600 }}>
                            {ev.status}
                          </td>
                          <td style={{ padding: "0.85rem 1rem", textAlign: "right" }}>
                            <div style={{ display: "inline-flex", gap: "0.4rem" }}>
                              <button
                                onClick={() => handleIntegrityAction(ev.id, "REVIEWED")}
                                style={{
                                  padding: "0.3rem 0.5rem",
                                  backgroundColor: "rgba(16, 185, 129, 0.12)",
                                  border: "1px solid rgba(16, 185, 129, 0.25)",
                                  color: "#10b981",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  fontSize: "0.75rem",
                                  fontWeight: 600
                                }}
                              >
                                Mark Reviewed
                              </button>
                              <button
                                onClick={() => handleIntegrityAction(ev.id, "DISMISSED")}
                                style={{
                                  padding: "0.3rem 0.5rem",
                                  backgroundColor: "#1e293b",
                                  border: "1px solid #334155",
                                  color: "#94a3b8",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  fontSize: "0.75rem"
                                }}
                              >
                                Dismiss
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm("Disqualify this candidate from the examination?")) {
                                    handleIntegrityAction(ev.id, "DISQUALIFIED");
                                  }
                                }}
                                style={{
                                  padding: "0.3rem 0.5rem",
                                  backgroundColor: "rgba(239, 68, 68, 0.12)",
                                  border: "1px solid rgba(239, 68, 68, 0.25)",
                                  color: "#ef4444",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  fontSize: "0.75rem",
                                  fontWeight: 600
                                }}
                              >
                                Disqualify
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================================================== */}
          {/* TAB 8: REPORTS                                     */}
          {/* ================================================== */}
          {activeTab === "reports" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                <div>
                  <h2 style={{ fontSize: "1.4rem", fontWeight: 800, margin: "0 0 0.25rem 0", color: "#ffffff" }}>
                    Platform Reports & Analytical Exports
                  </h2>
                  <p style={{ fontSize: "0.85rem", color: "#8b9bb4", margin: 0 }}>
                    Generate structured engineering reports with direct CSV and print export.
                  </p>
                </div>
                <button
                  onClick={downloadReportCsv}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.6rem 1.1rem",
                    backgroundColor: "#10b981",
                    border: "none",
                    borderRadius: "6px",
                    color: "#ffffff",
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  <Download size={16} />
                  <span>Download Report CSV</span>
                </button>
              </div>

              {/* Report Category Selectors */}
              <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem", overflowX: "auto" }}>
                {[
                  { id: "assessment", label: "Assessment Report" },
                  { id: "ranking", label: "Candidate Ranking" },
                  { id: "questions", label: "Question Analytics" },
                  { id: "integrity", label: "Integrity Incidents" },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveReportType(item.id);
                      loadReport(item.id);
                    }}
                    style={{
                      padding: "0.6rem 1rem",
                      backgroundColor: activeReportType === item.id ? "rgba(56, 189, 248, 0.15)" : "#0a0f1d",
                      border: activeReportType === item.id ? "1px solid rgba(56, 189, 248, 0.4)" : "1px solid #162035",
                      color: activeReportType === item.id ? "#38bdf8" : "#94a3b8",
                      borderRadius: "6px",
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      cursor: "pointer"
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Report Preview Table */}
              <div style={{ backgroundColor: "#0a0f1d", border: "1px solid #162035", borderRadius: "10px", padding: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", fontSize: "0.8rem", color: "#64748b" }}>
                  <span>Total Records: {reportData?.total_records ?? 0}</span>
                  <span>Generated: {reportData?.generated_at ? new Date(reportData.generated_at).toLocaleString() : ""}</span>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #162035", color: "#8b9bb4", fontSize: "0.75rem", textTransform: "uppercase" }}>
                        {reportData?.data && reportData.data.length > 0 ? (
                          Object.keys(reportData.data[0]).map(key => (
                            <th key={key} style={{ padding: "0.75rem 1rem" }}>{key}</th>
                          ))
                        ) : <th>No Data</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {(!reportData || !reportData.data || reportData.data.length === 0) ? (
                        <tr>
                          <td colSpan={6} style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>
                            Select a report above to generate.
                          </td>
                        </tr>
                      ) : (
                        reportData.data.map((row: any, rIdx: number) => (
                          <tr key={rIdx} style={{ borderBottom: "1px solid #0f172a" }}>
                            {Object.values(row).map((val: any, cIdx: number) => (
                              <td key={cIdx} style={{ padding: "0.75rem 1rem", color: "#ffffff" }}>
                                {String(val)}
                              </td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================================================== */}
          {/* TAB 9: AUDIT LOGS                                  */}
          {/* ================================================== */}
          {activeTab === "audit" && (
            <div>
              <div style={{ marginBottom: "1.5rem" }}>
                <h2 style={{ fontSize: "1.4rem", fontWeight: 800, margin: "0 0 0.25rem 0", color: "#ffffff" }}>
                  System Audit Logs
                </h2>
                <p style={{ fontSize: "0.85rem", color: "#8b9bb4", margin: 0 }}>
                  Immutable security audit trail recording sensitive administrator actions, question imports, and candidate status updates.
                </p>
              </div>

              <div style={{ backgroundColor: "#0a0f1d", border: "1px solid #162035", borderRadius: "10px", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #162035", color: "#8b9bb4", fontSize: "0.75rem", textTransform: "uppercase", backgroundColor: "#070b16" }}>
                      <th style={{ padding: "0.85rem 1rem" }}>Timestamp</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Action Event</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Actor Role</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Resource Target</th>
                      <th style={{ padding: "0.85rem 1rem" }}>IP Address</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Metadata</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: "2.5rem", textAlign: "center", color: "#64748b" }}>
                          No audit entries recorded.
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((log) => (
                        <tr key={log.id} style={{ borderBottom: "1px solid #0f172a" }}>
                          <td style={{ padding: "0.85rem 1rem", color: "#64748b", fontFamily: "var(--font-mono, monospace)", fontSize: "0.75rem" }}>
                            {log.timestamp ? new Date(log.timestamp).toLocaleString() : "—"}
                          </td>
                          <td style={{ padding: "0.85rem 1rem", fontWeight: 700, color: "#38bdf8" }}>
                            {log.event_type}
                          </td>
                          <td style={{ padding: "0.85rem 1rem" }}>
                            <span style={{
                              padding: "0.2rem 0.5rem",
                              borderRadius: "4px",
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              backgroundColor: "#1e293b",
                              color: "#e2e8f0"
                            }}>
                              {log.actor_role || "SYSTEM"}
                            </span>
                          </td>
                          <td style={{ padding: "0.85rem 1rem", color: "#ffffff", fontWeight: 600 }}>
                            {log.resource}
                          </td>
                          <td style={{ padding: "0.85rem 1rem", color: "#8b9bb4", fontFamily: "var(--font-mono, monospace)" }}>
                            {log.ip_address || "127.0.0.1"}
                          </td>
                          <td style={{ padding: "0.85rem 1rem", color: "#64748b", fontSize: "0.75rem" }}>
                            {log.metadata_json ? JSON.stringify(log.metadata_json) : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================================================== */}
          {/* TAB 10: SETTINGS & RBAC                            */}
          {/* ================================================== */}
          {activeTab === "settings" && (
            <div>
              <div style={{ marginBottom: "1.5rem" }}>
                <h2 style={{ fontSize: "1.4rem", fontWeight: 800, margin: "0 0 0.25rem 0", color: "#ffffff" }}>
                  Platform Settings & Administrative RBAC
                </h2>
                <p style={{ fontSize: "0.85rem", color: "#8b9bb4", margin: 0 }}>
                  Role-based access permissions and proctoring integrity parameters.
                </p>
              </div>

              {/* RBAC Users */}
              <div style={{ backgroundColor: "#0a0f1d", border: "1px solid #162035", borderRadius: "10px", padding: "1.5rem", marginBottom: "2rem" }}>
                <div style={{ fontWeight: 700, fontSize: "1rem", color: "#ffffff", marginBottom: "0.4rem" }}>
                  Administrative Team & Roles
                </div>
                <p style={{ fontSize: "0.8rem", color: "#8b9bb4", margin: "0 0 1.25rem 0" }}>
                  Admin (full access), Recruiter (candidates, exams, results), Evaluator (questions, submissions, code evaluation).
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {adminUsers.map((u) => (
                    <div key={u.id} style={{
                      padding: "0.85rem 1rem",
                      backgroundColor: "#060911",
                      border: "1px solid #162035",
                      borderRadius: "6px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}>
                      <div>
                        <div style={{ fontWeight: 700, color: "#ffffff" }}>{u.full_name}</div>
                        <div style={{ fontSize: "0.8rem", color: "#64748b" }}>{u.email}</div>
                      </div>
                      <span style={{
                        padding: "0.25rem 0.6rem",
                        borderRadius: "4px",
                        fontSize: "0.75rem",
                        fontWeight: 800,
                        backgroundColor: u.role === "admin" ? "rgba(56, 189, 248, 0.15)" : "rgba(168, 85, 247, 0.15)",
                        color: u.role === "admin" ? "#38bdf8" : "#a855f7",
                        textTransform: "uppercase"
                      }}>
                        {u.role}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Platform Security & Sandbox Policy */}
              <div style={{ backgroundColor: "#0a0f1d", border: "1px solid #162035", borderRadius: "10px", padding: "1.5rem" }}>
                <div style={{ fontWeight: 700, fontSize: "1rem", color: "#ffffff", marginBottom: "1rem" }}>
                  Proctoring & Code Execution Policies
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", fontSize: "0.85rem" }}>
                  <div style={{ backgroundColor: "#060911", padding: "1rem", borderRadius: "8px", border: "1px solid #162035" }}>
                    <div style={{ fontWeight: 700, color: "#ffffff", marginBottom: "0.3rem" }}>Isolated Sandbox Engine</div>
                    <div style={{ color: "#8b9bb4", fontSize: "0.8rem", lineHeight: 1.4 }}>
                      Process limit: 30 procs, Memory: 128 MB, CPU: 3.0s, Network: Disabled. Untrusted candidate code never executes on API host.
                    </div>
                  </div>
                  <div style={{ backgroundColor: "#060911", padding: "1rem", borderRadius: "8px", border: "1px solid #162035" }}>
                    <div style={{ fontWeight: 700, color: "#ffffff", marginBottom: "0.3rem" }}>Zero Answer Leakage Assurance</div>
                    <div style={{ color: "#8b9bb4", fontSize: "0.8rem", lineHeight: 1.4 }}>
                      Correct answers, rubric text, and hidden test cases are strictly quarantined in PostgreSQL `question_answers` and never serialized to candidates.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* ================================================== */}
      {/* MODAL: 8-STAGE PREDEFINED CSV IMPORT WIZARD        */}
      {/* ================================================== */}
      {csvWizardOpen && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "1rem"
        }}>
          <div style={{
            width: "100%",
            maxWidth: "720px",
            backgroundColor: "#0a0f1d",
            border: "1px solid #1e293b",
            borderRadius: "12px",
            padding: "2rem",
            maxHeight: "90vh",
            overflowY: "auto",
            boxShadow: "0 25px 50px rgba(0,0,0,0.8)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <div>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 800, margin: "0 0 0.25rem 0", color: "#ffffff" }}>
                  Predefined Questions CSV Import Wizard
                </h3>
                <p style={{ fontSize: "0.8rem", color: "#8b9bb4", margin: 0 }}>
                  Format: questionId,section,questionType,question,option1..4,correctAnswer,marks,difficulty,tags,testCases
                </p>
              </div>
              <button
                onClick={() => setCsvWizardOpen(false)}
                style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Step 1: File Selection & Target Assessment */}
            {csvStep === 1 && (
              <div>
                <div style={{ marginBottom: "1.25rem" }}>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#8b9bb4", marginBottom: "0.4rem" }}>
                    Select Target Technical Assessment
                  </label>
                  <select
                    value={targetAsmIdForCsv}
                    onChange={(e) => setTargetAsmIdForCsv(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.75rem",
                      backgroundColor: "#060911",
                      border: "1px solid #1b2844",
                      borderRadius: "6px",
                      color: "#ffffff",
                      fontSize: "0.9rem"
                    }}
                  >
                    {assessments.map(a => (
                      <option key={a.id} value={a.id}>{a.title} ({a.role})</option>
                    ))}
                  </select>
                </div>

                <div style={{
                  border: "2px dashed #1e293b",
                  borderRadius: "8px",
                  padding: "2.5rem 1.5rem",
                  textAlign: "center",
                  backgroundColor: "#060911",
                  marginBottom: "1.5rem"
                }}>
                  <FileSpreadsheet size={36} color="#38bdf8" style={{ marginBottom: "0.75rem" }} />
                  <div style={{ fontWeight: 700, color: "#ffffff", marginBottom: "0.25rem" }}>
                    {selectedCsvFile ? selectedCsvFile.name : "Choose or drag and drop your questions CSV"}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "1.25rem" }}>
                    Strict predefined columns will be validated before import.
                  </div>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => setSelectedCsvFile(e.target.files ? e.target.files[0] : null)}
                    style={{ display: "none" }}
                    id="csv-file-input"
                  />
                  <label
                    htmlFor="csv-file-input"
                    style={{
                      display: "inline-block",
                      padding: "0.6rem 1.25rem",
                      backgroundColor: "#1e293b",
                      border: "1px solid #334155",
                      color: "#ffffff",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "0.85rem",
                      fontWeight: 700
                    }}
                  >
                    Browse Local File
                  </label>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                  <button
                    onClick={() => setCsvWizardOpen(false)}
                    style={{ padding: "0.6rem 1rem", backgroundColor: "transparent", border: "1px solid #334155", color: "#94a3b8", borderRadius: "6px", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleValidateCsv}
                    disabled={!selectedCsvFile || isValidatingCsv}
                    style={{
                      padding: "0.6rem 1.25rem",
                      backgroundColor: selectedCsvFile ? "#2563eb" : "#1e293b",
                      border: "none",
                      color: "#ffffff",
                      borderRadius: "6px",
                      fontWeight: 700,
                      cursor: selectedCsvFile ? "pointer" : "not-allowed"
                    }}
                  >
                    {isValidatingCsv ? "Validating Rules..." : "Validate CSV Format →"}
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Validation Results & Error Reporting */}
            {csvStep === 2 && csvValidationResult && (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
                  <div style={{ backgroundColor: "#060911", padding: "1rem", borderRadius: "6px", textAlign: "center" }}>
                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Total Rows</div>
                    <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#ffffff" }}>{csvValidationResult.total_rows}</div>
                  </div>
                  <div style={{ backgroundColor: "#060911", padding: "1rem", borderRadius: "6px", textAlign: "center" }}>
                    <div style={{ fontSize: "0.75rem", color: "#10b981" }}>Valid Questions</div>
                    <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#10b981" }}>{csvValidationResult.valid_count}</div>
                  </div>
                  <div style={{ backgroundColor: "#060911", padding: "1rem", borderRadius: "6px", textAlign: "center" }}>
                    <div style={{ fontSize: "0.75rem", color: "#ef4444" }}>Invalid Rows</div>
                    <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#ef4444" }}>{csvValidationResult.invalid_count}</div>
                  </div>
                </div>

                {csvValidationResult.invalid_count > 0 && (
                  <div style={{ marginBottom: "1.5rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#fca5a5" }}>Exact Validation Errors:</span>
                      <button
                        onClick={downloadValidationErrorsCsv}
                        style={{ background: "none", border: "none", color: "#38bdf8", fontSize: "0.75rem", textDecoration: "underline", cursor: "pointer" }}
                      >
                        Download Errors as CSV
                      </button>
                    </div>
                    <div style={{ maxHeight: "160px", overflowY: "auto", backgroundColor: "#060911", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "6px", padding: "0.75rem" }}>
                      {csvValidationResult.errors.map((err: any, idx: number) => (
                        <div key={idx} style={{ fontSize: "0.8rem", color: "#fca5a5", marginBottom: "0.3rem" }}>
                          <strong>Row {err.row} ({err.question_id || "No ID"}):</strong> {err.error}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <button
                    onClick={() => setCsvStep(1)}
                    style={{ padding: "0.6rem 1rem", backgroundColor: "transparent", border: "1px solid #334155", color: "#94a3b8", borderRadius: "6px", cursor: "pointer" }}
                  >
                    ← Back to File Select
                  </button>
                  <div style={{ display: "flex", gap: "0.75rem" }}>
                    <button
                      onClick={() => setCsvStep(3)}
                      style={{ padding: "0.6rem 1rem", backgroundColor: "#1e293b", border: "1px solid #334155", color: "#ffffff", borderRadius: "6px", cursor: "pointer" }}
                    >
                      Preview Valid Questions →
                    </button>
                    <button
                      onClick={handleConfirmImportCsv}
                      disabled={csvValidationResult.valid_count === 0 || isImportingCsv}
                      style={{
                        padding: "0.6rem 1.25rem",
                        backgroundColor: "#10b981",
                        border: "none",
                        color: "#ffffff",
                        borderRadius: "6px",
                        fontWeight: 700,
                        cursor: csvValidationResult.valid_count > 0 ? "pointer" : "not-allowed"
                      }}
                    >
                      {isImportingCsv ? "Importing..." : "Confirm & Import Questions"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Question Preview Table */}
            {csvStep === 3 && csvValidationResult && (
              <div>
                <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#ffffff", marginBottom: "0.75rem" }}>
                  Preview of Valid Questions ({csvValidationResult.valid_count})
                </div>
                <div style={{ maxHeight: "240px", overflowY: "auto", backgroundColor: "#060911", border: "1px solid #162035", borderRadius: "6px", marginBottom: "1.5rem" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem", textAlign: "left" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #162035", color: "#8b9bb4" }}>
                        <th style={{ padding: "0.5rem" }}>ID</th>
                        <th style={{ padding: "0.5rem" }}>Section</th>
                        <th style={{ padding: "0.5rem" }}>Type</th>
                        <th style={{ padding: "0.5rem" }}>Question Preview</th>
                        <th style={{ padding: "0.5rem" }}>Marks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvValidationResult.preview.map((p: any) => (
                        <tr key={p.row} style={{ borderBottom: "1px solid #0f172a" }}>
                          <td style={{ padding: "0.5rem", color: "#38bdf8", fontWeight: 700 }}>{p.question_id}</td>
                          <td style={{ padding: "0.5rem", color: "#e2e8f0" }}>{p.section}</td>
                          <td style={{ padding: "0.5rem" }}>{p.question_type}</td>
                          <td style={{ padding: "0.5rem", color: "#ffffff" }}>{p.question_text}</td>
                          <td style={{ padding: "0.5rem", fontWeight: 700 }}>{p.marks}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <button
                    onClick={() => setCsvStep(2)}
                    style={{ padding: "0.6rem 1rem", backgroundColor: "transparent", border: "1px solid #334155", color: "#94a3b8", borderRadius: "6px", cursor: "pointer" }}
                  >
                    ← Back to Validation Summary
                  </button>
                  <button
                    onClick={handleConfirmImportCsv}
                    disabled={isImportingCsv}
                    style={{
                      padding: "0.6rem 1.25rem",
                      backgroundColor: "#10b981",
                      border: "none",
                      color: "#ffffff",
                      borderRadius: "6px",
                      fontWeight: 700,
                      cursor: "pointer"
                    }}
                  >
                    {isImportingCsv ? "Importing to Assessment..." : "Confirm & Import Questions"}
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Import Summary */}
            {csvStep === 4 && importSummary && (
              <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
                <div style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "60px",
                  height: "60px",
                  borderRadius: "50%",
                  backgroundColor: "rgba(16, 185, 129, 0.15)",
                  color: "#10b981",
                  marginBottom: "1rem"
                }}>
                  <CheckCircle2 size={36} />
                </div>
                <h4 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#ffffff", margin: "0 0 0.5rem 0" }}>
                  Import Successful!
                </h4>
                <p style={{ fontSize: "0.85rem", color: "#8b9bb4", margin: "0 0 1.5rem 0" }}>
                  {importSummary.message}
                </p>
                <button
                  onClick={() => {
                    setCsvWizardOpen(false);
                    setActiveTab("question-bank");
                  }}
                  style={{
                    padding: "0.7rem 1.5rem",
                    backgroundColor: "#2563eb",
                    border: "none",
                    borderRadius: "6px",
                    color: "#ffffff",
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  Close & View Question Bank
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ================================================== */}
      {/* MODAL: ASSIGN ASSESSMENT TO CANDIDATES             */}
      {/* ================================================== */}
      {assignModalOpen && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "1rem"
        }}>
          <div style={{
            width: "100%",
            maxWidth: "540px",
            backgroundColor: "#0a0f1d",
            border: "1px solid #1e293b",
            borderRadius: "12px",
            padding: "2rem",
            boxShadow: "0 25px 50px rgba(0,0,0,0.8)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 800, margin: 0, color: "#ffffff" }}>
                Assign Technical Assessment
              </h3>
              <button
                onClick={() => setAssignModalOpen(false)}
                style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#8b9bb4", marginBottom: "0.4rem" }}>
                Target Examination
              </label>
              <select
                value={assignAssessmentId}
                onChange={(e) => setAssignAssessmentId(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  backgroundColor: "#060911",
                  border: "1px solid #1b2844",
                  borderRadius: "6px",
                  color: "#ffffff",
                  fontSize: "0.9rem"
                }}
              >
                <option value="">-- Choose Examination --</option>
                {assessments.map(a => (
                  <option key={a.id} value={a.id}>{a.title} ({a.role})</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#8b9bb4", marginBottom: "0.4rem" }}>
                Bulk Assign via Email List (Optional)
              </label>
              <textarea
                rows={3}
                placeholder="Paste candidate emails (comma or newline separated)..."
                value={bulkCsvEmails}
                onChange={(e) => setBulkCsvEmails(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  backgroundColor: "#060911",
                  border: "1px solid #1b2844",
                  borderRadius: "6px",
                  color: "#ffffff",
                  fontSize: "0.85rem",
                  outline: "none"
                }}
              />
              <span style={{ fontSize: "0.7rem", color: "#64748b" }}>
                Selected candidates via checkboxes: {assignCandidateIds.length}
              </span>
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#8b9bb4", marginBottom: "0.4rem" }}>
                Custom Deadline (Optional)
              </label>
              <input
                type="datetime-local"
                value={assignDeadline}
                onChange={(e) => setAssignDeadline(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  backgroundColor: "#060911",
                  border: "1px solid #1b2844",
                  borderRadius: "6px",
                  color: "#ffffff",
                  fontSize: "0.85rem"
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button
                onClick={() => setAssignModalOpen(false)}
                style={{ padding: "0.6rem 1rem", backgroundColor: "transparent", border: "1px solid #334155", color: "#94a3b8", borderRadius: "6px", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleAssignCandidates}
                disabled={isAssigning}
                style={{
                  padding: "0.6rem 1.25rem",
                  backgroundColor: "#2563eb",
                  border: "none",
                  color: "#ffffff",
                  borderRadius: "6px",
                  fontWeight: 700,
                  cursor: isAssigning ? "not-allowed" : "pointer"
                }}
              >
                {isAssigning ? "Assigning Candidates..." : "Confirm Assignment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================== */}
      {/* MODAL: CREATE / EDIT ASSESSMENT                    */}
      {/* ================================================== */}
      {assessmentModalOpen && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "1rem"
        }}>
          <div style={{
            width: "100%",
            maxWidth: "560px",
            backgroundColor: "#0a0f1d",
            border: "1px solid #1e293b",
            borderRadius: "12px",
            padding: "2rem",
            maxHeight: "90vh",
            overflowY: "auto",
            boxShadow: "0 25px 50px rgba(0,0,0,0.8)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <h3 style={{ fontSize: "1.25rem", fontWeight: 800, margin: 0, color: "#ffffff" }}>
                {editingAssessmentId ? "Edit Technical Assessment" : "Create Technical Assessment"}
              </h3>
              <button
                onClick={() => setAssessmentModalOpen(false)}
                style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveAssessment}>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#8b9bb4", marginBottom: "0.4rem" }}>
                  Assessment Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Avionics Software Engineering Assessment"
                  value={asmTitle}
                  onChange={(e) => setAsmTitle(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    backgroundColor: "#060911",
                    border: "1px solid #1b2844",
                    borderRadius: "6px",
                    color: "#ffffff",
                    fontSize: "0.9rem"
                  }}
                />
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#8b9bb4", marginBottom: "0.4rem" }}>
                  Target Role / Domain
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Autonomous Systems Engineer"
                  value={asmRole}
                  onChange={(e) => setAsmRole(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    backgroundColor: "#060911",
                    border: "1px solid #1b2844",
                    borderRadius: "6px",
                    color: "#ffffff",
                    fontSize: "0.9rem"
                  }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#8b9bb4", marginBottom: "0.4rem" }}>
                    Duration (Minutes)
                  </label>
                  <input
                    type="number"
                    min={15}
                    value={asmDuration}
                    onChange={(e) => setAsmDuration(parseInt(e.target.value) || 60)}
                    style={{
                      width: "100%",
                      padding: "0.75rem",
                      backgroundColor: "#060911",
                      border: "1px solid #1b2844",
                      borderRadius: "6px",
                      color: "#ffffff",
                      fontSize: "0.9rem"
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#8b9bb4", marginBottom: "0.4rem" }}>
                    Passing Marks
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={asmPassingMarks}
                    onChange={(e) => setAsmPassingMarks(parseFloat(e.target.value) || 60)}
                    style={{
                      width: "100%",
                      padding: "0.75rem",
                      backgroundColor: "#060911",
                      border: "1px solid #1b2844",
                      borderRadius: "6px",
                      color: "#ffffff",
                      fontSize: "0.9rem"
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: "1.5rem" }}>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#8b9bb4", marginBottom: "0.4rem" }}>
                  Description / Guidelines
                </label>
                <textarea
                  rows={3}
                  placeholder="Instructions displayed to candidates prior to launching the exam..."
                  value={asmDesc}
                  onChange={(e) => setAsmDesc(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    backgroundColor: "#060911",
                    border: "1px solid #1b2844",
                    borderRadius: "6px",
                    color: "#ffffff",
                    fontSize: "0.85rem"
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button
                  type="button"
                  onClick={() => setAssessmentModalOpen(false)}
                  style={{ padding: "0.6rem 1rem", backgroundColor: "transparent", border: "1px solid #334155", color: "#94a3b8", borderRadius: "6px", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingAssessment}
                  style={{
                    padding: "0.6rem 1.25rem",
                    backgroundColor: "#2563eb",
                    border: "none",
                    color: "#ffffff",
                    borderRadius: "6px",
                    fontWeight: 700,
                    cursor: isSavingAssessment ? "not-allowed" : "pointer"
                  }}
                >
                  {isSavingAssessment ? "Saving..." : (editingAssessmentId ? "Update Exam" : "Create Technical Exam")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================== */}
      {/* DRAWER: CANDIDATE DETAIL PROFILE                   */}
      {/* ================================================== */}
      {selectedCandidateDetail && (
        <div style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "560px",
          maxWidth: "100vw",
          backgroundColor: "#090d18",
          borderLeft: "1px solid #162035",
          zIndex: 1000,
          padding: "2rem",
          overflowY: "auto",
          boxShadow: "-10px 0 30px rgba(0,0,0,0.8)"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
            <h3 style={{ fontSize: "1.2rem", fontWeight: 800, margin: 0, color: "#ffffff" }}>
              Candidate Assessment Dossier
            </h3>
            <button
              onClick={() => setSelectedCandidateDetail(null)}
              style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
            >
              <X size={20} />
            </button>
          </div>

          <div style={{ backgroundColor: "#060911", padding: "1.25rem", borderRadius: "8px", border: "1px solid #162035", marginBottom: "1.5rem" }}>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#ffffff", marginBottom: "0.2rem" }}>
              {selectedCandidateDetail.full_name}
            </div>
            <div style={{ fontSize: "0.85rem", color: "#38bdf8", fontFamily: "var(--font-mono, monospace)", marginBottom: "0.6rem" }}>
              {selectedCandidateDetail.email}
            </div>
            <div style={{ display: "flex", gap: "1rem", fontSize: "0.8rem", color: "#8b9bb4" }}>
              <span>Status: <strong style={{ color: selectedCandidateDetail.status === "ACTIVE" ? "#10b981" : "#ef4444" }}>{selectedCandidateDetail.status}</strong></span>
              <span>Registered: {new Date(selectedCandidateDetail.created_at).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Assessment History */}
          <div style={{ marginBottom: "1.5rem" }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#ffffff", marginBottom: "0.75rem" }}>
              Examination Submissions & Attempts
            </div>
            {selectedCandidateDetail.assessment_history.length === 0 ? (
              <div style={{ fontSize: "0.8rem", color: "#64748b" }}>No assessment attempts recorded yet.</div>
            ) : (
              selectedCandidateDetail.assessment_history.map((h: any) => (
                <div key={h.session_id} style={{
                  padding: "0.85rem",
                  backgroundColor: "#060911",
                  border: "1px solid #162035",
                  borderRadius: "6px",
                  marginBottom: "0.5rem"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                    <span style={{ fontWeight: 700, color: "#ffffff", fontSize: "0.85rem" }}>{h.assessment_title}</span>
                    <span style={{
                      padding: "0.15rem 0.5rem",
                      borderRadius: "4px",
                      fontSize: "0.7rem",
                      fontWeight: 800,
                      backgroundColor: h.passed ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                      color: h.passed ? "#10b981" : "#ef4444"
                    }}>
                      {h.passed ? "PASSED" : "FAILED"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#8b9bb4" }}>
                    <span>Score: <strong style={{ color: "#38bdf8" }}>{h.score}/{h.max_marks} ({h.percentage}%)</strong></span>
                    <span>Focus Losses: {h.focus_loss_count}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Activity Timeline */}
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#ffffff", marginBottom: "0.75rem" }}>
              Activity Timeline
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {selectedCandidateDetail.activity_timeline.map((t: any) => (
                <div key={t.id} style={{ fontSize: "0.8rem", padding: "0.5rem 0.75rem", backgroundColor: "#060911", borderRadius: "4px", border: "1px solid #162035" }}>
                  <div style={{ color: "#38bdf8", fontWeight: 600 }}>{t.event}</div>
                  <div style={{ color: "#64748b", fontSize: "0.7rem" }}>{t.timestamp ? new Date(t.timestamp).toLocaleString() : ""}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================================================== */}
      {/* MODAL: SESSION RESULT INSPECTION (SUBMISSION VIEW) */}
      {/* ================================================== */}
      {inspectSessionDetail && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.85)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "1.5rem"
        }}>
          <div style={{
            width: "100%",
            maxWidth: "840px",
            backgroundColor: "#0a0f1d",
            border: "1px solid #1e293b",
            borderRadius: "12px",
            padding: "2rem",
            maxHeight: "90vh",
            overflowY: "auto",
            boxShadow: "0 25px 50px rgba(0,0,0,0.85)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
              <div>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 800, margin: "0 0 0.25rem 0", color: "#ffffff" }}>
                  Candidate Technical Submission Dossier
                </h3>
                <div style={{ fontSize: "0.85rem", color: "#8b9bb4" }}>
                  {inspectSessionDetail.candidate_name} ({inspectSessionDetail.candidate_email}) — {inspectSessionDetail.assessment_title}
                </div>
              </div>
              <button
                onClick={() => setInspectSessionDetail(null)}
                style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
              >
                <X size={22} />
              </button>
            </div>

            {/* Score Summary */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "1rem",
              backgroundColor: "#060911",
              padding: "1rem",
              borderRadius: "8px",
              border: "1px solid #162035",
              marginBottom: "1.5rem",
              textAlign: "center"
            }}>
              <div>
                <span style={{ fontSize: "0.75rem", color: "#64748b", display: "block" }}>Total Score</span>
                <span style={{ fontSize: "1.4rem", fontWeight: 800, color: "#38bdf8" }}>
                  {inspectSessionDetail.total_score} / {inspectSessionDetail.max_possible_score}
                </span>
              </div>
              <div>
                <span style={{ fontSize: "0.75rem", color: "#64748b", display: "block" }}>Status</span>
                <span style={{ fontSize: "1.1rem", fontWeight: 700, color: inspectSessionDetail.status === "SUBMITTED" ? "#10b981" : "#f59e0b" }}>
                  {inspectSessionDetail.status}
                </span>
              </div>
              <div>
                <span style={{ fontSize: "0.75rem", color: "#64748b", display: "block" }}>Focus Loss Events</span>
                <span style={{ fontSize: "1.4rem", fontWeight: 800, color: inspectSessionDetail.focus_loss_count > 3 ? "#ef4444" : "#10b981" }}>
                  {inspectSessionDetail.focus_loss_count}
                </span>
              </div>
            </div>

            {/* Question by Question Responses */}
            <div style={{ fontWeight: 700, fontSize: "1rem", color: "#ffffff", marginBottom: "0.75rem" }}>
              Submitted Responses ({inspectSessionDetail.submissions.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {inspectSessionDetail.submissions.map((sub: any, idx: number) => (
                <div key={sub.submission_id} style={{
                  padding: "1.25rem",
                  backgroundColor: "#060911",
                  border: "1px solid #162035",
                  borderRadius: "8px"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                    <div style={{ fontWeight: 700, color: "#ffffff", fontSize: "0.9rem" }}>
                      Q{idx + 1}. {sub.question_text}
                    </div>
                    <span style={{
                      padding: "0.2rem 0.5rem",
                      borderRadius: "4px",
                      fontSize: "0.75rem",
                      fontWeight: 800,
                      backgroundColor: sub.is_correct ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                      color: sub.is_correct ? "#10b981" : "#ef4444"
                    }}>
                      Score: {sub.score_earned} Pts
                    </span>
                  </div>

                  {sub.code_response && (
                    <div style={{ marginTop: "0.5rem" }}>
                      <span style={{ fontSize: "0.75rem", color: "#a855f7", fontWeight: 700 }}>
                        Candidate Code ({sub.programming_language || "python"}):
                      </span>
                      <pre style={{
                        marginTop: "0.4rem",
                        padding: "0.75rem",
                        backgroundColor: "#030712",
                        border: "1px solid #1e293b",
                        borderRadius: "6px",
                        color: "#38bdf8",
                        fontSize: "0.8rem",
                        overflowX: "auto",
                        fontFamily: "var(--font-mono, monospace)"
                      }}>
                        {sub.code_response}
                      </pre>
                    </div>
                  )}

                  {sub.text_response && (
                    <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "#e2e8f0" }}>
                      <strong>Response:</strong> {sub.text_response}
                    </div>
                  )}

                  {sub.execution_details && (
                    <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "#64748b" }}>
                      Execution Diagnostics: {JSON.stringify(sub.execution_details)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================================================== */}
      {/* MODAL: PREVIEW QUESTION MODAL                      */}
      {/* ================================================== */}
      {previewQuestion && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "1rem"
        }}>
          <div style={{
            width: "100%",
            maxWidth: "520px",
            backgroundColor: "#0a0f1d",
            border: "1px solid #1e293b",
            borderRadius: "12px",
            padding: "2rem",
            boxShadow: "0 25px 50px rgba(0,0,0,0.8)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
              <div>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#38bdf8", fontFamily: "var(--font-mono, monospace)" }}>
                  {previewQuestion.question_code}
                </span>
                <h4 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#ffffff", margin: "0.2rem 0" }}>
                  {previewQuestion.section}
                </h4>
              </div>
              <button
                onClick={() => setPreviewQuestion(null)}
                style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ fontSize: "0.95rem", color: "#ffffff", lineHeight: 1.5, marginBottom: "1.25rem" }}>
              {previewQuestion.question_text}
            </div>

            <div style={{ display: "flex", gap: "1rem", fontSize: "0.8rem", color: "#8b9bb4", marginBottom: "1.5rem" }}>
              <span>Type: <strong>{previewQuestion.question_type}</strong></span>
              <span>Marks: <strong>{previewQuestion.marks}</strong></span>
              <span>Difficulty: <strong>{previewQuestion.difficulty}</strong></span>
            </div>

            <button
              onClick={() => setPreviewQuestion(null)}
              style={{
                width: "100%",
                padding: "0.65rem",
                backgroundColor: "#2563eb",
                border: "none",
                borderRadius: "6px",
                color: "#ffffff",
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              Close Preview
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
