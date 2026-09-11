from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict
from app.models import QuestionType, SessionStatus, ResultVisibility

# --- Request Models ---
class StartSessionRequest(BaseModel):
    token: str = Field(..., description="Unique single-use assessment invitation token")

class CandidateLoginRequest(BaseModel):
    email: str = Field(..., description="Candidate email address")
    full_name: str = Field(..., description="Candidate full name")
    assessment_id: Optional[str] = Field(None, description="Assessment ID (optional, defaults to active assessment)")

class PublicAssessmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    description: Optional[str] = None
    duration_minutes: int
    question_count: int = 0

class SubmissionRequest(BaseModel):
    question_id: str
    selected_option_id: Optional[str] = None
    text_response: Optional[str] = None
    code_response: Optional[str] = None
    programming_language: Optional[str] = None

class FocusLossTelemetryRequest(BaseModel):
    timestamp: Optional[datetime] = None

# --- Sanitized Response DTOs (Zero Answer Leakage Guaranteed) ---
class CandidateQuestionOptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    option_text: str
    display_order: int
    # NOTE: NO correctness field exists in option model!

class CandidateQuestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    question_text: str
    question_type: QuestionType
    marks: float
    display_order: int
    options: List[CandidateQuestionOptionOut] = []
    # NOTE: Strictly ZERO answer keys, correct_option_id, hidden_test_cases, or expected_output fields!

class CandidateAssessmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    description: Optional[str] = None
    duration_minutes: int
    result_visibility: ResultVisibility

class CandidateSubmissionStateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    question_id: str
    selected_option_id: Optional[str] = None
    text_response: Optional[str] = None
    code_response: Optional[str] = None
    programming_language: Optional[str] = None
    submitted_at: datetime

class CandidateSessionMeOut(BaseModel):
    session_id: str
    status: SessionStatus
    started_at: datetime
    expires_at: datetime
    server_time: datetime
    candidate_name: Optional[str] = None
    candidate_email: Optional[str] = None
    assessment: CandidateAssessmentOut
    submissions: List[CandidateSubmissionStateOut] = []

class CandidateSubmissionResultOut(BaseModel):
    submission_id: str
    question_id: str
    status: str
    # Public compilation/execution indicator if intentionally returned, but NO hidden test details or answer key!
    compilation_status: Optional[str] = None
    message: str = "Submission received and recorded server-side."

class CandidateFinalResultOut(BaseModel):
    session_id: str
    status: SessionStatus
    finished_at: Optional[datetime] = None
    total_score: Optional[float] = None  # Populated only if result_visibility == IMMEDIATE
    visibility: ResultVisibility
    message: str
