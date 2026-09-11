import enum
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy import (
    Column, String, Text, Integer, Float, Boolean, DateTime, ForeignKey, Enum as SQLEnum, JSON, UniqueConstraint
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

class UserRole(str, enum.Enum):
    ADMIN = "admin"
    RECRUITER = "recruiter"
    EVALUATOR = "evaluator"
    CANDIDATE = "candidate"

class QuestionType(str, enum.Enum):
    MCQ = "MCQ"
    CODING = "CODING"
    TEXT = "TEXT"

class SessionStatus(str, enum.Enum):
    IN_PROGRESS = "IN_PROGRESS"
    SUBMITTED = "SUBMITTED"
    EXPIRED = "EXPIRED"

class ResultVisibility(str, enum.Enum):
    NEVER = "NEVER"
    IMMEDIATE = "IMMEDIATE"
    RECRUITER_RELEASE = "RECRUITER_RELEASE"

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(SQLEnum(UserRole), nullable=False, default=UserRole.CANDIDATE)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class Candidate(Base):
    __tablename__ = "candidates"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, nullable=False, index=True)
    full_name = Column(String(255), nullable=False)
    phone = Column(String(50), nullable=True)
    status = Column(String(50), default="ACTIVE")  # ACTIVE, SUSPENDED, DISQUALIFIED
    password_hash = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    tokens = relationship("AssessmentToken", back_populates="candidate", cascade="all, delete-orphan")
    sessions = relationship("AssessmentSession", back_populates="candidate", cascade="all, delete-orphan")
    assignments = relationship("CandidateAssessmentAssignment", back_populates="candidate", cascade="all, delete-orphan")
    integrity_events = relationship("IntegrityEvent", back_populates="candidate", cascade="all, delete-orphan")

class Assessment(Base):
    __tablename__ = "assessments"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    role = Column(String(255), nullable=True, default="Software Engineering")
    duration_minutes = Column(Integer, nullable=False, default=60)
    total_marks = Column(Float, nullable=False, default=100.0)
    passing_marks = Column(Float, nullable=False, default=60.0)
    max_attempts = Column(Integer, nullable=False, default=1)
    status = Column(String(50), nullable=False, default="ACTIVE")  # DRAFT, PUBLISHED, ACTIVE, CLOSED, ARCHIVED
    start_window = Column(DateTime(timezone=True), nullable=True)
    end_window = Column(DateTime(timezone=True), nullable=True)
    result_visibility = Column(SQLEnum(ResultVisibility), default=ResultVisibility.NEVER)
    created_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    questions = relationship("Question", back_populates="assessment", cascade="all, delete-orphan", order_by="Question.display_order")
    tokens = relationship("AssessmentToken", back_populates="assessment", cascade="all, delete-orphan")
    sessions = relationship("AssessmentSession", back_populates="assessment", cascade="all, delete-orphan")
    assignments = relationship("CandidateAssessmentAssignment", back_populates="assessment", cascade="all, delete-orphan")

class CandidateAssessmentAssignment(Base):
    __tablename__ = "candidate_assessment_assignments"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    candidate_id = Column(String(36), ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False)
    assessment_id = Column(String(36), ForeignKey("assessments.id", ondelete="CASCADE"), nullable=False)
    assigned_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    deadline = Column(DateTime(timezone=True), nullable=True)
    attempts_used = Column(Integer, default=0)
    status = Column(String(50), default="NOT_STARTED")  # NOT_STARTED, IN_PROGRESS, COMPLETED, EXPIRED

    __table_args__ = (
        UniqueConstraint("candidate_id", "assessment_id", name="uq_cand_asm_assignment"),
    )

    candidate = relationship("Candidate", back_populates="assignments")
    assessment = relationship("Assessment", back_populates="assignments")

class Question(Base):
    __tablename__ = "questions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    assessment_id = Column(String(36), ForeignKey("assessments.id", ondelete="CASCADE"), nullable=False)
    question_code = Column(String(50), nullable=True)  # e.g. Q001, Q022
    section = Column(String(255), nullable=False, default="General")
    question_text = Column(Text, nullable=False)
    question_type = Column(SQLEnum(QuestionType), nullable=False)
    marks = Column(Float, nullable=False, default=1.0)
    difficulty = Column(String(50), nullable=False, default="Medium")  # Easy, Medium, Hard
    tags = Column(String(255), nullable=True, default="")
    status = Column(String(50), nullable=False, default="ACTIVE")
    display_order = Column(Integer, nullable=False, default=0)

    assessment = relationship("Assessment", back_populates="questions")
    options = relationship("QuestionOption", back_populates="question", cascade="all, delete-orphan", order_by="QuestionOption.display_order")
    answer = relationship("QuestionAnswer", back_populates="question", uselist=False, cascade="all, delete-orphan")

class QuestionOption(Base):
    __tablename__ = "question_options"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    question_id = Column(String(36), ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    option_text = Column(Text, nullable=False)
    display_order = Column(Integer, nullable=False, default=0)

    question = relationship("Question", back_populates="options")

class QuestionAnswer(Base):
    """
    CRITICAL SECURITY TABLE:
    Stores correct option IDs, expected outputs, hidden test cases, and evaluation rubrics.
    MUST NEVER BE READ OR EXPOSED BY CANDIDATE-FACING ROUTERS OR SERIALIZERS.
    """
    __tablename__ = "question_answers"

    question_id = Column(String(36), ForeignKey("questions.id", ondelete="CASCADE"), primary_key=True)
    correct_option_id = Column(String(36), ForeignKey("question_options.id", ondelete="SET NULL"), nullable=True)
    rubric_text = Column(Text, nullable=True)
    hidden_test_cases = Column(JSON, nullable=True)

    question = relationship("Question", back_populates="answer")

class AssessmentToken(Base):
    __tablename__ = "assessment_tokens"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    candidate_id = Column(String(36), ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False)
    assessment_id = Column(String(36), ForeignKey("assessments.id", ondelete="CASCADE"), nullable=False)
    token_hash = Column(String(255), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    max_attempts = Column(Integer, default=1)
    used_count = Column(Integer, default=0)
    revoked = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    candidate = relationship("Candidate", back_populates="tokens")
    assessment = relationship("Assessment", back_populates="tokens")
    sessions = relationship("AssessmentSession", back_populates="token")

class AssessmentSession(Base):
    __tablename__ = "assessment_sessions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    token_id = Column(String(36), ForeignKey("assessment_tokens.id", ondelete="CASCADE"), nullable=True)
    candidate_id = Column(String(36), ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False)
    assessment_id = Column(String(36), ForeignKey("assessments.id", ondelete="CASCADE"), nullable=False)
    status = Column(SQLEnum(SessionStatus), default=SessionStatus.IN_PROGRESS, nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime(timezone=True), nullable=False)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    client_ip = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    focus_loss_count = Column(Integer, default=0)

    token = relationship("AssessmentToken", back_populates="sessions")
    candidate = relationship("Candidate", back_populates="sessions")
    assessment = relationship("Assessment", back_populates="sessions")
    submissions = relationship("Submission", back_populates="session", cascade="all, delete-orphan")
    results = relationship("EvaluationResult", back_populates="session", cascade="all, delete-orphan")
    integrity_events = relationship("IntegrityEvent", back_populates="session", cascade="all, delete-orphan")

class Submission(Base):
    __tablename__ = "submissions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String(36), ForeignKey("assessment_sessions.id", ondelete="CASCADE"), nullable=False)
    question_id = Column(String(36), ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    selected_option_id = Column(String(36), ForeignKey("question_options.id"), nullable=True)
    text_response = Column(Text, nullable=True)
    code_response = Column(Text, nullable=True)
    programming_language = Column(String(50), nullable=True)
    submitted_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("session_id", "question_id", name="uq_session_question_submission"),
    )

    session = relationship("AssessmentSession", back_populates="submissions")

class EvaluationResult(Base):
    __tablename__ = "evaluation_results"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String(36), ForeignKey("assessment_sessions.id", ondelete="CASCADE"), nullable=False)
    submission_id = Column(String(36), ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False)
    score_earned = Column(Float, nullable=False, default=0.0)
    is_correct = Column(Boolean, nullable=False, default=False)
    execution_details = Column(JSON, nullable=True)
    status = Column(String(50), default="EVALUATED")
    evaluated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    session = relationship("AssessmentSession", back_populates="results")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    event_type = Column(String(100), nullable=False, index=True)
    actor_id = Column(String(36), nullable=True)
    actor_role = Column(String(50), nullable=True)
    resource = Column(String(255), nullable=False)
    ip_address = Column(String(45), nullable=True)
    metadata_json = Column(JSON, nullable=True)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

class IntegrityEvent(Base):
    __tablename__ = "integrity_events"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    candidate_id = Column(String(36), ForeignKey("candidates.id", ondelete="CASCADE"), nullable=True)
    assessment_id = Column(String(36), ForeignKey("assessments.id", ondelete="CASCADE"), nullable=True)
    session_id = Column(String(36), ForeignKey("assessment_sessions.id", ondelete="CASCADE"), nullable=True)
    event_type = Column(String(100), nullable=False)
    risk_level = Column(String(20), default="LOW")  # LOW, MEDIUM, HIGH
    details = Column(JSON, nullable=True)
    status = Column(String(50), default="PENDING")  # PENDING, REVIEWED, DISMISSED, DISQUALIFIED
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

    candidate = relationship("Candidate", back_populates="integrity_events")
    session = relationship("AssessmentSession", back_populates="integrity_events")

