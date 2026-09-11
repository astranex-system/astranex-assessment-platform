from datetime import datetime
from typing import List, Optional, Any, Dict
from pydantic import BaseModel, EmailStr, Field, ConfigDict
from app.models import QuestionType, ResultVisibility, UserRole, SessionStatus

# --- Admin Auth Schemas ---
class AdminLoginRequest(BaseModel):
    email: EmailStr
    password: str

class AdminTokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: str
    role: UserRole

# --- Question & Option Creation Schemas ---
class QuestionOptionCreate(BaseModel):
    option_text: str
    display_order: int = 0
    is_correct: bool = False

class HiddenTestCaseCreate(BaseModel):
    input: str
    expected_output: str
    points: float = 1.0
    is_hidden: bool = True

class QuestionCreate(BaseModel):
    question_code: Optional[str] = None
    section: str = "General"
    question_text: str
    question_type: QuestionType
    marks: float = 1.0
    difficulty: str = "Medium"
    tags: Optional[str] = ""
    display_order: int = 0
    options: List[QuestionOptionCreate] = []
    rubric_text: Optional[str] = None
    hidden_test_cases: List[HiddenTestCaseCreate] = []

class QuestionUpdate(BaseModel):
    section: Optional[str] = None
    question_text: Optional[str] = None
    marks: Optional[float] = None
    difficulty: Optional[str] = None
    tags: Optional[str] = None
    status: Optional[str] = None
    display_order: Optional[int] = None

# --- Assessment Schemas ---
class AssessmentCreate(BaseModel):
    title: str
    description: Optional[str] = None
    role: Optional[str] = "Software Engineering"
    duration_minutes: int = 60
    total_marks: float = 100.0
    passing_marks: float = 60.0
    max_attempts: int = 1
    status: str = "ACTIVE"
    rules: Optional[str] = None
    start_window: Optional[datetime] = None
    end_window: Optional[datetime] = None
    result_visibility: ResultVisibility = ResultVisibility.NEVER

class AssessmentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    role: Optional[str] = None
    duration_minutes: Optional[int] = None
    total_marks: Optional[float] = None
    passing_marks: Optional[float] = None
    max_attempts: Optional[int] = None
    status: Optional[str] = None
    rules: Optional[str] = None
    start_window: Optional[datetime] = None
    end_window: Optional[datetime] = None
    result_visibility: Optional[ResultVisibility] = None

# --- Candidate Assignment Schemas ---
class CandidateAssignRequest(BaseModel):
    candidate_ids: List[str]
    deadline: Optional[datetime] = None

class CandidateBulkCSVAssignRequest(BaseModel):
    emails: List[str]
    deadline: Optional[datetime] = None

class CandidateStatusUpdateRequest(BaseModel):
    status: str  # ACTIVE, SUSPENDED, DISQUALIFIED

class CandidateListItem(BaseModel):
    id: str
    full_name: str
    email: str
    phone: Optional[str] = None
    status: str
    created_at: datetime
    assessments_assigned_count: int
    completed_count: int
    average_score: float

class CandidateDetailOut(BaseModel):
    id: str
    full_name: str
    email: str
    phone: Optional[str] = None
    status: str
    created_at: datetime
    assessments_assigned: List[Dict[str, Any]] = []
    assessment_history: List[Dict[str, Any]] = []
    integrity_events: List[Dict[str, Any]] = []
    activity_timeline: List[Dict[str, Any]] = []

# --- CSV Validation & Import Schemas ---
class CSVValidationRowError(BaseModel):
    row: int
    question_id: Optional[str] = None
    error: str

class CSVValidationPreviewItem(BaseModel):
    row: int
    question_id: str
    section: str
    question_type: str
    question_text: str
    marks: float
    difficulty: str
    tags: str
    options_count: int
    correct_answer_preview: str
    has_test_cases: bool

class CSVValidationResponse(BaseModel):
    total_rows: int
    valid_count: int
    invalid_count: int
    errors: List[CSVValidationRowError]
    preview: List[CSVValidationPreviewItem]

# --- Dashboard & Metrics Schemas ---
class DashboardMetricsOut(BaseModel):
    total_candidates: int
    active_candidates: int
    completed_assessments: int
    in_progress_assessments: int
    average_score: float
    pass_rate: float
    active_assessments_count: int
    assessments_overview: List[Dict[str, Any]]
    score_distribution: Dict[str, int]
    status_distribution: Dict[str, int]
    recent_activity: List[Dict[str, Any]]

# --- Question Bank & Analytics Schemas ---
class QuestionBankItemOut(BaseModel):
    id: str
    question_code: Optional[str] = None
    section: str
    question_type: str
    question_text: str
    marks: float
    difficulty: str
    tags: str
    assessment_id: str
    assessment_title: str
    status: str
    created_at: Optional[datetime] = None

class QuestionAnalyticsItemOut(BaseModel):
    question_id: str
    question_code: Optional[str] = None
    section: str
    question_type: str
    question_text: str
    difficulty: str
    marks: float
    total_attempts: int
    correct_count: int
    incorrect_count: int
    skipped_count: int
    success_rate: float
    average_time_seconds: int
    difficulty_classification: str

# --- Live Monitoring Schemas ---
class LiveCandidateMonitorItem(BaseModel):
    session_id: str
    candidate_id: str
    candidate_name: str
    candidate_email: str
    assessment_id: str
    assessment_title: str
    started_at: datetime
    time_remaining_seconds: int
    answered_count: int
    total_questions: int
    connection_status: str
    focus_loss_count: int
    risk_level: str

# --- Integrity Dashboard Schemas ---
class IntegrityEventOut(BaseModel):
    id: str
    candidate_id: Optional[str] = None
    candidate_name: Optional[str] = None
    candidate_email: Optional[str] = None
    assessment_id: Optional[str] = None
    assessment_title: Optional[str] = None
    session_id: Optional[str] = None
    event_type: str
    risk_level: str
    details: Optional[Dict[str, Any]] = None
    status: str
    created_at: datetime

class IntegrityActionRequest(BaseModel):
    action: str

# --- Reports Schemas ---
class ReportSummaryOut(BaseModel):
    report_type: str
    generated_at: datetime
    total_records: int
    data: List[Dict[str, Any]]

# --- Legacy Candidate Invite (Preserved for compatibility) ---
class CandidateInviteCreate(BaseModel):
    candidate_email: EmailStr
    candidate_name: str
    assessment_id: str
    expires_in_hours: int = 48

class CandidateInviteOut(BaseModel):
    candidate_id: str
    candidate_email: str
    assessment_id: str
    token_id: str
    raw_token: str
    assessment_link: str
    expires_at: datetime

# --- Audit & Result Inspection Schemas ---
class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    event_type: str
    actor_id: Optional[str] = None
    actor_role: Optional[str] = None
    resource: str
    ip_address: Optional[str] = None
    metadata_json: Optional[Dict[str, Any]] = None
    timestamp: datetime

class CandidateSubmissionDetailOut(BaseModel):
    submission_id: str
    question_id: str
    question_text: str
    question_type: str
    section: Optional[str] = "General"
    selected_option_id: Optional[str] = None
    selected_option_text: Optional[str] = None
    correct_option_text: Optional[str] = None
    text_response: Optional[str] = None
    code_response: Optional[str] = None
    programming_language: Optional[str] = None
    score_earned: float
    marks: float = 1.0
    is_correct: bool
    execution_details: Optional[Dict[str, Any]] = None

class CandidateSessionDetailOut(BaseModel):
    session_id: str
    candidate_name: str
    candidate_email: str
    assessment_title: str
    role: Optional[str] = "Software Engineering"
    status: SessionStatus
    started_at: datetime
    finished_at: Optional[datetime] = None
    focus_loss_count: int
    total_score: float
    max_possible_score: float
    percentage: float = 0.0
    passed: bool = False
    section_scores: Dict[str, Dict[str, float]] = {}
    submissions: List[CandidateSubmissionDetailOut] = []

