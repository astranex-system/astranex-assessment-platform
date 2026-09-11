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
    is_correct: bool = False  # Used by admin to define the correct option during creation

class HiddenTestCaseCreate(BaseModel):
    input: str
    expected_output: str
    points: float = 1.0

class QuestionCreate(BaseModel):
    question_text: str
    question_type: QuestionType
    marks: float = 1.0
    display_order: int = 0
    options: List[QuestionOptionCreate] = []
    # Secret fields provided by Recruiter/Admin only:
    rubric_text: Optional[str] = None
    hidden_test_cases: List[HiddenTestCaseCreate] = []

class AssessmentCreate(BaseModel):
    title: str
    description: Optional[str] = None
    duration_minutes: int = 60
    start_window: Optional[datetime] = None
    end_window: Optional[datetime] = None
    result_visibility: ResultVisibility = ResultVisibility.NEVER

# --- Assessment Link & Candidate Invite Schemas ---
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
    raw_token: str  # Given once to admin/recruiter to copy as invitation link
    assessment_link: str
    expires_at: datetime

# --- Admin Result Inspection Schemas ---
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
    selected_option_id: Optional[str] = None
    text_response: Optional[str] = None
    code_response: Optional[str] = None
    programming_language: Optional[str] = None
    score_earned: float
    is_correct: bool
    execution_details: Optional[Dict[str, Any]] = None

class CandidateSessionDetailOut(BaseModel):
    session_id: str
    candidate_name: str
    candidate_email: str
    assessment_title: str
    status: SessionStatus
    started_at: datetime
    finished_at: Optional[datetime] = None
    focus_loss_count: int
    total_score: float
    max_possible_score: float
    submissions: List[CandidateSubmissionDetailOut] = []
