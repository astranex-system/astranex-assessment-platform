"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Code2,
  Copy,
  Check,
  RotateCcw,
  Terminal,
  FileCode,
  Sparkles,
  Maximize2,
  Minimize2
} from "lucide-react";

interface CodingPadProps {
  questionId: string;
  code: string;
  language: string;
  onCodeChange: (code: string, language: string) => void;
  saveMessage?: string | null;
}

const DEFAULT_TEMPLATES: Record<string, string> = {
  python: `# AstraNex Python 3 Environment
def solution():
    # Write your solution code here
    pass

if __name__ == "__main__":
    solution()
`,
  javascript: `// AstraNex JavaScript (Node.js) Environment
function solution() {
    // Write your solution code here
}

solution();
`,
  cpp: `// AstraNex C++ 17 Environment
#include <iostream>
#include <vector>
#include <string>
#include <algorithm>

using namespace std;

int main() {
    // Write your solution code here
    return 0;
}
`,
  java: `// AstraNex Java Environment
import java.util.*;

public class Solution {
    public static void main(String[] args) {
        // Write your solution code here
    }
}
`
};

export default function CodingPad({
  questionId,
  code,
  language = "python",
  onCodeChange,
  saveMessage
}: CodingPadProps) {
  const [selectedLang, setSelectedLang] = useState(language || "python");
  const [copied, setCopied] = useState(false);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [isFullscreen, setIsFullscreen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  // Sync internal selected language with prop
  useEffect(() => {
    if (language && language !== selectedLang) {
      setSelectedLang(language);
    }
  }, [language]);

  // If code is completely empty, initialize with template
  useEffect(() => {
    if (!code || code.trim() === "") {
      const tmpl = DEFAULT_TEMPLATES[selectedLang] || DEFAULT_TEMPLATES.python;
      onCodeChange(tmpl, selectedLang);
    }
  }, [questionId]);

  // Calculate lines
  const currentCode = code || "";
  const lines = currentCode.split("\n");
  const lineCount = Math.max(lines.length, 18);

  // Sync scroll between textarea and line numbers gutter
  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  // Track cursor position (Line & Col)
  const updateCursorPosition = () => {
    if (!textareaRef.current) return;
    const text = textareaRef.current.value;
    const selStart = textareaRef.current.selectionStart;
    const textBeforeCursor = text.substring(0, selStart);
    const linesBefore = textBeforeCursor.split("\n");
    const currentLineNum = linesBefore.length;
    const currentColNum = linesBefore[linesBefore.length - 1].length + 1;
    setCursorPos({ line: currentLineNum, col: currentColNum });
  };

  // Keyboard ergonomics: Tab (indent 4 spaces), Shift+Tab, Auto-indent on Enter
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const { selectionStart, selectionEnd, value } = textarea;

    // 1. TAB & SHIFT+TAB
    if (e.key === "Tab") {
      e.preventDefault();
      const tabSpaces = "    ";

      if (!e.shiftKey) {
        // Simple insert 4 spaces at cursor
        if (selectionStart === selectionEnd) {
          const updated = value.substring(0, selectionStart) + tabSpaces + value.substring(selectionEnd);
          onCodeChange(updated, selectedLang);
          setTimeout(() => {
            textarea.selectionStart = textarea.selectionEnd = selectionStart + tabSpaces.length;
            updateCursorPosition();
          }, 0);
        } else {
          // Multiline indent
          const startLine = value.lastIndexOf("\n", selectionStart - 1) + 1;
          const endLine = value.indexOf("\n", selectionEnd);
          const block = value.substring(startLine, endLine === -1 ? value.length : endLine);
          const indentedBlock = block.split("\n").map(l => tabSpaces + l).join("\n");
          const updated = value.substring(0, startLine) + indentedBlock + (endLine === -1 ? "" : value.substring(endLine));
          onCodeChange(updated, selectedLang);
        }
      } else {
        // Shift+Tab: unindent
        const startLine = value.lastIndexOf("\n", selectionStart - 1) + 1;
        const endLine = value.indexOf("\n", selectionEnd);
        const block = value.substring(startLine, endLine === -1 ? value.length : endLine);
        const unindentedBlock = block.split("\n").map(l => l.startsWith("    ") ? l.substring(4) : (l.startsWith("\t") ? l.substring(1) : l)).join("\n");
        const updated = value.substring(0, startLine) + unindentedBlock + (endLine === -1 ? "" : value.substring(endLine));
        onCodeChange(updated, selectedLang);
      }
    }

    // 2. ENTER: Smart Indentation
    else if (e.key === "Enter") {
      e.preventDefault();
      const currentLineText = value.substring(0, selectionStart).split("\n").pop() || "";
      const match = currentLineText.match(/^(\s*)/);
      let indent = match ? match[1] : "";

      // If line ended with colon (Python) or open brace (JS/C++), add extra indent
      const trimmed = currentLineText.trim();
      if (trimmed.endsWith(":") || trimmed.endsWith("{") || trimmed.endsWith("(")) {
        indent += "    ";
      }

      const insertion = "\n" + indent;
      const updated = value.substring(0, selectionStart) + insertion + value.substring(selectionEnd);
      onCodeChange(updated, selectedLang);

      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = selectionStart + insertion.length;
        updateCursorPosition();
      }, 0);
    }

    // 3. AUTO-CLOSE BRACKETS & QUOTES
    else if (["(", "[", "{", "\"", "'"].includes(e.key) && selectionStart === selectionEnd) {
      const pairs: Record<string, string> = {
        "(": ")",
        "[": "]",
        "{": "}",
        "\"": "\"",
        "'": "'"
      };
      const closing = pairs[e.key];
      if (closing) {
        e.preventDefault();
        const updated = value.substring(0, selectionStart) + e.key + closing + value.substring(selectionEnd);
        onCodeChange(updated, selectedLang);
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = selectionStart + 1;
          updateCursorPosition();
        }, 0);
      }
    }
  };

  // Copy Code
  const handleCopy = () => {
    navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Reset to Boilerplate
  const handleResetTemplate = () => {
    if (window.confirm("Reset editor to default starter template? Current unsaved modifications will be replaced.")) {
      const tmpl = DEFAULT_TEMPLATES[selectedLang] || DEFAULT_TEMPLATES.python;
      onCodeChange(tmpl, selectedLang);
    }
  };

  // Language Change
  const handleLanguageSelect = (newLang: string) => {
    setSelectedLang(newLang);
    // If current code is empty or matches a default template, switch to new template
    const isCurrentDefault = Object.values(DEFAULT_TEMPLATES).some(t => t.trim() === currentCode.trim());
    if (!currentCode.trim() || isCurrentDefault) {
      const newTmpl = DEFAULT_TEMPLATES[newLang] || DEFAULT_TEMPLATES.python;
      onCodeChange(newTmpl, newLang);
    } else {
      onCodeChange(currentCode, newLang);
    }
  };

  const getFileName = (lang: string) => {
    switch (lang) {
      case "python": return "solution.py";
      case "javascript": return "solution.js";
      case "cpp": return "solution.cpp";
      case "java": return "Solution.java";
      default: return "solution.txt";
    }
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: isFullscreen ? "100vh" : "100%",
      minHeight: isFullscreen ? "100vh" : "460px",
      backgroundColor: "#070b14",
      border: "1px solid #1e293b",
      borderRadius: isFullscreen ? "0px" : "10px",
      overflow: "hidden",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.45)",
      position: isFullscreen ? "fixed" : "relative",
      top: isFullscreen ? 0 : "auto",
      left: isFullscreen ? 0 : "auto",
      right: isFullscreen ? 0 : "auto",
      bottom: isFullscreen ? 0 : "auto",
      zIndex: isFullscreen ? 9999 : "auto"
    }}>
      {/* IDE Top Window Chrome Bar */}
      <div style={{
        height: "44px",
        backgroundColor: "#0b1120",
        borderBottom: "1px solid #162035",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 1rem",
        userSelect: "none"
      }}>
        {/* Left: macOS dots + File Tab */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
          {/* Terminal Dots */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#ef4444", display: "inline-block" }} />
            <span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#f59e0b", display: "inline-block" }} />
            <span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#10b981", display: "inline-block" }} />
          </div>

          {/* Active File Tab */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "0.45rem",
            backgroundColor: "#070b14",
            padding: "0.35rem 0.85rem",
            borderRadius: "6px 6px 0 0",
            border: "1px solid #1e293b",
            borderBottom: "none",
            fontSize: "0.8rem",
            fontWeight: 700,
            color: "#38bdf8"
          }}>
            <FileCode size={14} color="#38bdf8" />
            <span>{getFileName(selectedLang)}</span>
          </div>
        </div>

        {/* Right: Language Selector + Quick Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {/* Language Selector */}
          <select
            value={selectedLang}
            onChange={(e) => handleLanguageSelect(e.target.value)}
            style={{
              padding: "0.28rem 0.65rem",
              backgroundColor: "#060911",
              border: "1px solid #1e293b",
              borderRadius: "5px",
              color: "#ffffff",
              fontSize: "0.78rem",
              fontWeight: 600,
              cursor: "pointer",
              outline: "none"
            }}
          >
            <option value="python">🐍 Python 3</option>
            <option value="javascript">⚡ JavaScript (Node.js)</option>
            <option value="cpp">⚙️ C++ 17</option>
            <option value="java">☕ Java 17</option>
          </select>

          {/* Reset Template Button */}
          <button
            type="button"
            onClick={handleResetTemplate}
            title="Reset code to default template"
            style={{
              padding: "0.3rem 0.6rem",
              backgroundColor: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              color: "#f87171",
              borderRadius: "5px",
              cursor: "pointer",
              fontSize: "0.75rem",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "0.3rem"
            }}
          >
            <RotateCcw size={12} />
            <span>Reset</span>
          </button>

          {/* Copy Button */}
          <button
            type="button"
            onClick={handleCopy}
            title="Copy code to clipboard"
            style={{
              padding: "0.3rem 0.6rem",
              backgroundColor: "#162035",
              border: "1px solid #233352",
              color: copied ? "#10b981" : "#94a3b8",
              borderRadius: "5px",
              cursor: "pointer",
              fontSize: "0.75rem",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "0.3rem"
            }}
          >
            {copied ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Code Editor"}
            style={{
              padding: "0.3rem 0.5rem",
              backgroundColor: "#162035",
              border: "1px solid #233352",
              color: "#94a3b8",
              borderRadius: "5px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center"
            }}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {/* Editor Body: Line Numbers + Monospace Code Surface */}
      <div style={{
        flex: 1,
        display: "flex",
        position: "relative",
        backgroundColor: "#070b14",
        minHeight: "360px"
      }}>
        {/* Line Numbers Gutter */}
        <div
          ref={lineNumbersRef}
          style={{
            width: "48px",
            backgroundColor: "#050810",
            borderRight: "1px solid #131c30",
            color: "#475569",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: "0.85rem",
            lineHeight: "1.6",
            padding: "1rem 0.5rem",
            textAlign: "right",
            userSelect: "none",
            overflow: "hidden"
          }}
        >
          {Array.from({ length: lineCount }).map((_, idx) => {
            const lineNum = idx + 1;
            const isCurrentLine = lineNum === cursorPos.line;
            return (
              <div
                key={idx}
                style={{
                  color: isCurrentLine ? "#38bdf8" : "#334155",
                  fontWeight: isCurrentLine ? 800 : 400
                }}
              >
                {lineNum}
              </div>
            );
          })}
        </div>

        {/* Code Textarea Surface */}
        <textarea
          ref={textareaRef}
          value={currentCode}
          onChange={(e) => onCodeChange(e.target.value, selectedLang)}
          onKeyDown={handleKeyDown}
          onKeyUp={updateCursorPosition}
          onClick={updateCursorPosition}
          onScroll={handleScroll}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          placeholder="# Write your technical solution code here..."
          style={{
            flex: 1,
            backgroundColor: "transparent",
            border: "none",
            outline: "none",
            color: "#e2e8f0",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
            fontSize: "0.875rem",
            lineHeight: "1.6",
            padding: "1rem 1.25rem",
            resize: "none",
            whiteSpace: "pre",
            overflowWrap: "normal",
            overflowX: "auto",
            tabSize: 4
          }}
        />
      </div>

      {/* VS Code Style Status Bar */}
      <div style={{
        height: "28px",
        backgroundColor: "#050810",
        borderTop: "1px solid #131c30",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 1rem",
        fontSize: "0.72rem",
        color: "#64748b",
        userSelect: "none",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
      }}>
        {/* Left: Terminal status & save indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "#38bdf8" }}>
            <Terminal size={12} />
            <span>Interactive Code Pad</span>
          </div>
          {saveMessage && (
            <span style={{ color: "#10b981", fontWeight: 700 }}>
              ● {saveMessage}
            </span>
          )}
        </div>

        {/* Right: Line/Col stats + Encoding */}
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
          <span>{lines.length} lines • {currentCode.length} chars</span>
          <span style={{ color: "#94a3b8" }}>Spaces: 4</span>
          <span style={{ color: "#94a3b8" }}>UTF-8</span>
        </div>
      </div>
    </div>
  );
}
