"use client";

import React, { useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  ShieldAlert,
  Clock,
  Award,
  Layers,
  FileText,
  AlertTriangle,
  X,
  ChevronRight
} from "lucide-react";

export interface ParsedAssessmentData {
  intro: string;
  meta: Array<{ label: string; value: string }>;
  table: Array<{ section: string; questions: string; marks: string; isTotal: boolean }>;
  checklist: string[];
  rules: string[];
  rawDescription?: string;
  rawRules?: string;
}

export function parseAssessmentContent(desc?: string, rulesText?: string): ParsedAssessmentData {
  const result: ParsedAssessmentData = {
    intro: "",
    meta: [],
    table: [],
    checklist: [],
    rules: [],
    rawDescription: desc || "",
    rawRules: rulesText || ""
  };

  if (desc) {
    const rawLines = desc.split("\n").map(l => l.trim()).filter(Boolean);
    let mode: "intro" | "details" | "sections" | "checklist" = "intro";
    const introArr: string[] = [];

    for (const l of rawLines) {
      const lower = l.toLowerCase();
      if (lower.startsWith("assessment details") || lower === "details:") {
        mode = "details";
        continue;
      }
      if (lower.startsWith("sections") || lower.startsWith("section breakdown")) {
        mode = "sections";
        continue;
      }
      if (lower.startsWith("before you start") || lower.startsWith("please ensure that you have:")) {
        mode = "checklist";
        continue;
      }
      if (lower.startsWith("good luck")) {
        continue;
      }

      if (mode === "intro") {
        if (l.includes(":") && ["role:", "total questions:", "total marks:", "duration:", "deadline:"].some(k => lower.includes(k))) {
          mode = "details";
          const [lbl, ...valParts] = l.split(":");
          result.meta.push({ label: lbl.trim(), value: valParts.join(":").trim() });
        } else {
          if (!lower.includes("astranex defence | software engineering")) {
            introArr.push(l);
          }
        }
      } else if (mode === "details") {
        if (l.includes("\t") || (!l.includes(":") && ["python", "data structures", "debugging", "backend", "robotics", "coding"].some(k => lower.includes(k)))) {
          mode = "sections";
        } else if (l.includes(":")) {
          const [lbl, ...valParts] = l.split(":");
          result.meta.push({ label: lbl.trim(), value: valParts.join(":").trim() });
        }
      }

      if (mode === "sections") {
        if (l.includes("\t")) {
          const cols = l.split("\t").map(c => c.trim()).filter(Boolean);
          if (cols.length >= 3 && cols[0].toLowerCase() !== "section") {
            result.table.push({
              section: cols[0],
              questions: cols[1],
              marks: cols[2],
              isTotal: cols[0].toLowerCase() === "total"
            });
          }
        }
      } else if (mode === "checklist") {
        if (!lower.includes("please ensure that you have")) {
          result.checklist.push(l.replace(/^[•\-\*]\s*/, ""));
        }
      }
    }

    result.intro = introArr.join(" ");
  }

  if (rulesText) {
    const rLines = rulesText.split("\n").map(l => l.trim()).filter(Boolean);
    for (const r of rLines) {
      const lower = r.toLowerCase();
      if (lower === "important rules" || lower === "rules" || lower.startsWith("important:")) {
        continue;
      }
      result.rules.push(r.replace(/^\d+[\.\)]\s*/, ""));
    }
  }

  return result;
}

interface AssessmentCardViewProps {
  description?: string;
  rules?: string;
  role?: string;
  duration?: number;
  totalMarks?: number;
  passingMarks?: number;
  onOpenDetails?: () => void;
}

export function AssessmentCardSummary({
  description,
  rules,
  role,
  duration,
  totalMarks,
  passingMarks,
  onOpenDetails
}: AssessmentCardViewProps) {
  const parsed = parseAssessmentContent(description, rules);

  const summaryText = parsed.intro ||
    (description ? description.slice(0, 160) + (description.length > 160 ? "..." : "") : "Comprehensive technical evaluation designed for AstraNex engineering roles.");

  return (
    <div style={{ marginBottom: "1rem" }}>
      {/* Short clean summary paragraph */}
      <p style={{
        fontSize: "0.825rem",
        color: "#94a3b8",
        margin: "0 0 0.75rem 0",
        lineHeight: 1.5,
        display: "-webkit-box",
        WebkitLineClamp: 3,
        WebkitBoxOrient: "vertical",
        overflow: "hidden"
      }}>
        {summaryText}
      </p>

      {/* Section Quick Pills */}
      {parsed.table.length > 0 && (
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.35rem",
          marginBottom: "0.75rem"
        }}>
          {parsed.table
            .filter(t => !t.isTotal)
            .map((t, idx) => (
              <span
                key={idx}
                style={{
                  fontSize: "0.68rem",
                  fontWeight: 600,
                  backgroundColor: "rgba(56, 189, 248, 0.08)",
                  border: "1px solid rgba(56, 189, 248, 0.2)",
                  color: "#38bdf8",
                  padding: "0.15rem 0.45rem",
                  borderRadius: "4px"
                }}
              >
                {t.section.split("&")[0].trim()} ({t.questions} Qs)
              </span>
            ))}
        </div>
      )}

      {/* Trigger: View Blueprint & Rules */}
      <button
        type="button"
        onClick={onOpenDetails}
        style={{
          background: "none",
          border: "none",
          color: "#38bdf8",
          fontSize: "0.78rem",
          display: "inline-flex",
          alignItems: "center",
          gap: "0.35rem",
          cursor: "pointer",
          padding: 0,
          fontWeight: 700,
          transition: "opacity 0.2s"
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
      >
        <BookOpen size={14} />
        <span style={{ textDecoration: "underline" }}>View Syllabus Blueprint & Rules</span>
        <ChevronRight size={13} />
      </button>
    </div>
  );
}

interface AssessmentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  role?: string;
  description?: string;
  rules?: string;
  durationMinutes?: number;
  totalMarks?: number;
  passingMarks?: number;
  onAgreeAndStart?: () => void;
  isCandidateStart?: boolean;
}

export function AssessmentDetailsModal({
  isOpen,
  onClose,
  title,
  role,
  description,
  rules,
  durationMinutes,
  totalMarks,
  passingMarks,
  onAgreeAndStart,
  isCandidateStart = false
}: AssessmentDetailsModalProps) {
  const [agreed, setAgreed] = useState(false);

  if (!isOpen) return null;

  const parsed = parseAssessmentContent(description, rules);

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.85)",
      backdropFilter: "blur(8px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
      padding: "1rem"
    }}>
      <div style={{
        width: "100%",
        maxWidth: "760px",
        backgroundColor: "#0d1424",
        border: "1px solid #1e293b",
        borderRadius: "12px",
        padding: "2rem",
        maxHeight: "90vh",
        overflowY: "auto",
        boxShadow: "0 25px 60px rgba(0, 0, 0, 0.9)",
        color: "#ffffff"
      }}>
        {/* Header Bar */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "1.25rem",
          borderBottom: "1px solid #1e293b",
          paddingBottom: "1rem"
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
              <ShieldAlert size={18} color="#38bdf8" />
              <span style={{ fontSize: "0.72rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#38bdf8" }}>
                AstraNex Defence Examination Blueprint
              </span>
            </div>
            <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#ffffff", margin: 0 }}>
              {title}
            </h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.6rem" }}>
              <span style={{ fontSize: "0.75rem", backgroundColor: "#1e293b", color: "#94a3b8", padding: "0.2rem 0.6rem", borderRadius: "4px", fontWeight: 700 }}>
                {role || "Engineering"}
              </span>
              {durationMinutes && (
                <span style={{ fontSize: "0.75rem", backgroundColor: "rgba(56, 189, 248, 0.12)", color: "#38bdf8", padding: "0.2rem 0.6rem", borderRadius: "4px", fontWeight: 700 }}>
                  ⏱ {durationMinutes} Minutes
                </span>
              )}
              {totalMarks && (
                <span style={{ fontSize: "0.75rem", backgroundColor: "rgba(16, 185, 129, 0.12)", color: "#10b981", padding: "0.2rem 0.6rem", borderRadius: "4px", fontWeight: 700 }}>
                  🎯 {totalMarks} Total Marks
                </span>
              )}
              {passingMarks && (
                <span style={{ fontSize: "0.75rem", backgroundColor: "rgba(245, 158, 11, 0.12)", color: "#f59e0b", padding: "0.2rem 0.6rem", borderRadius: "4px", fontWeight: 700 }}>
                  🛡 Pass: {passingMarks} Marks
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", padding: "0.3rem" }}
          >
            <X size={22} />
          </button>
        </div>

        {/* Section 1: Overview */}
        {parsed.intro && (
          <div style={{ marginBottom: "1.5rem" }}>
            <h3 style={{ fontSize: "0.85rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8", marginBottom: "0.5rem" }}>
              Assessment Overview
            </h3>
            <p style={{ fontSize: "0.875rem", color: "#cbd5e1", lineHeight: 1.6, margin: 0 }}>
              {parsed.intro}
            </p>
          </div>
        )}

        {/* Section 2: Exam Blueprint & Section Weightages Table */}
        {parsed.table.length > 0 && (
          <div style={{ marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
              <h3 style={{ fontSize: "0.85rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#38bdf8", margin: 0, display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <Layers size={16} />
                <span>Examination Structure & Section Weightages</span>
              </h3>
              <span style={{ fontSize: "0.72rem", color: "#64748b" }}>Negative Marking: None</span>
            </div>

            <div style={{
              backgroundColor: "#070b16",
              border: "1px solid #1e293b",
              borderRadius: "8px",
              overflow: "hidden"
            }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.825rem" }}>
                <thead>
                  <tr style={{ backgroundColor: "#0f172a", borderBottom: "1px solid #1e293b", color: "#94a3b8", textTransform: "uppercase", fontSize: "0.72rem", letterSpacing: "0.05em" }}>
                    <th style={{ padding: "0.65rem 1rem" }}>Section Domain</th>
                    <th style={{ padding: "0.65rem 1rem", textAlign: "center", width: "120px" }}>Questions</th>
                    <th style={{ padding: "0.65rem 1rem", textAlign: "right", width: "120px" }}>Marks</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.table.map((row, idx) => (
                    <tr
                      key={idx}
                      style={{
                        borderBottom: row.isTotal ? "none" : "1px solid #131d33",
                        backgroundColor: row.isTotal ? "rgba(56, 189, 248, 0.08)" : (idx % 2 === 0 ? "#070b16" : "#0a0f1d"),
                        fontWeight: row.isTotal ? 800 : 500,
                        color: row.isTotal ? "#38bdf8" : "#ffffff"
                      }}
                    >
                      <td style={{ padding: "0.65rem 1rem", color: row.isTotal ? "#38bdf8" : "#e2e8f0" }}>
                        {row.section}
                      </td>
                      <td style={{ padding: "0.65rem 1rem", textAlign: "center", color: row.isTotal ? "#38bdf8" : "#94a3b8" }}>
                        {row.questions}
                      </td>
                      <td style={{ padding: "0.65rem 1rem", textAlign: "right", fontWeight: 700, color: row.isTotal ? "#10b981" : "#ffffff" }}>
                        {row.marks} Pts
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Section 3: Pre-requisites Checklist */}
        {parsed.checklist.length > 0 && (
          <div style={{ marginBottom: "1.5rem" }}>
            <h3 style={{ fontSize: "0.85rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#10b981", marginBottom: "0.6rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <CheckCircle2 size={16} />
              <span>Mandatory Pre-requisites Before Starting</span>
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
              {parsed.checklist.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    backgroundColor: "#070b16",
                    border: "1px solid #162035",
                    borderRadius: "6px",
                    padding: "0.65rem 0.85rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                    fontSize: "0.8rem",
                    color: "#cbd5e1"
                  }}
                >
                  <CheckCircle2 size={15} color="#10b981" style={{ flexShrink: 0 }} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Section 4: Examination Rules & Protocols */}
        {parsed.rules.length > 0 && (
          <div style={{ marginBottom: "1.5rem" }}>
            <h3 style={{ fontSize: "0.85rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#f59e0b", marginBottom: "0.6rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <AlertTriangle size={16} />
              <span>Official Examination Rules & Candidate Regulations</span>
            </h3>
            <div style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              backgroundColor: "#070b16",
              border: "1px solid #162035",
              borderRadius: "8px",
              padding: "1rem"
            }}>
              {parsed.rules.map((rule, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.6rem",
                    fontSize: "0.82rem",
                    lineHeight: 1.5,
                    color: "#e2e8f0"
                  }}
                >
                  <span style={{
                    color: "#f59e0b",
                    fontWeight: 700,
                    fontSize: "0.75rem",
                    backgroundColor: "rgba(245, 158, 11, 0.12)",
                    borderRadius: "50%",
                    width: "20px",
                    height: "20px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    marginTop: "1px"
                  }}>
                    {idx + 1}
                  </span>
                  <span>{rule}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Candidate Acknowledgment & Action buttons */}
        {isCandidateStart && onAgreeAndStart ? (
          <div style={{
            borderTop: "1px solid #1e293b",
            paddingTop: "1.25rem",
            marginTop: "1rem"
          }}>
            <label style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              fontSize: "0.85rem",
              color: "#e2e8f0",
              cursor: "pointer",
              marginBottom: "1.25rem"
            }}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                style={{ width: "18px", height: "18px", accentColor: "#10b981", cursor: "pointer" }}
              />
              <span>I confirm that I meet the pre-requisites and agree to adhere to all examination regulations and integrity protocols.</span>
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: "0.7rem 1.25rem",
                  backgroundColor: "transparent",
                  border: "1px solid #334155",
                  borderRadius: "6px",
                  color: "#94a3b8",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  fontWeight: 600
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!agreed}
                onClick={onAgreeAndStart}
                style={{
                  padding: "0.7rem 1.5rem",
                  backgroundColor: agreed ? "#10b981" : "#1e293b",
                  border: "none",
                  borderRadius: "6px",
                  color: agreed ? "#000000" : "#64748b",
                  cursor: agreed ? "pointer" : "not-allowed",
                  fontSize: "0.85rem",
                  fontWeight: 800,
                  transition: "all 0.2s"
                }}
              >
                Proceed to Examination
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "flex-end", borderTop: "1px solid #1e293b", paddingTop: "1rem" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "0.6rem 1.25rem",
                backgroundColor: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "6px",
                color: "#ffffff",
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: 600
              }}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
