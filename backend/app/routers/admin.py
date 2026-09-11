import logging
import csv
import io
import json
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import (
    User, UserRole, Assessment, Question, QuestionOption, QuestionAnswer,
    Candidate, AssessmentToken, AssessmentSession, Submission, EvaluationResult, AuditLog, QuestionType
)
from app.schemas.admin import (
    AdminLoginRequest, AdminTokenOut, AssessmentCreate, QuestionCreate,
    CandidateInviteCreate, CandidateInviteOut, AuditLogOut, CandidateSessionDetailOut, CandidateSubmissionDetailOut
)
from app.dependencies import get_current_admin
from app.security import (
    verify_password, hash_password, create_access_token, generate_secure_token, hash_token
)
from app.services.audit import log_audit_event

logger = logging.getLogger("astranex.admin_api")

router = APIRouter(prefix="/api/v1/admin", tags=["Admin API"])

@router.post("/login", response_model=AdminTokenOut)
async def admin_login(payload: AdminLoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate Admin or Recruiter and issue JWT token."""
    stmt = select(User).where(User.email == payload.email)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user or not verify_password(payload.password, user.password_hash):
        await log_audit_event(db, "ADMIN_AUTH_FAILURE", "user", metadata={"email": payload.email})
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid administrative credentials."
        )

    if user.role not in [UserRole.ADMIN, UserRole.RECRUITER]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Role unauthorized.")

    token = create_access_token({"user_id": user.id, "email": user.email, "role": user.role.value})
    await log_audit_event(db, "ADMIN_LOGIN", f"user:{user.id}", actor_id=user.id, actor_role=user.role.value)

    return AdminTokenOut(
        access_token=token,
        token_type="bearer",
        user_id=user.id,
        email=user.email,
        role=user.role
    )

@router.post("/assessments")
async def create_assessment(
    payload: AssessmentCreate,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Creates a new technical assessment definition."""
    assessment = Assessment(
        title=payload.title,
        description=payload.description,
        duration_minutes=payload.duration_minutes,
        start_window=payload.start_window,
        end_window=payload.end_window,
        result_visibility=payload.result_visibility,
        created_by=admin.id
    )
    db.add(assessment)
    await db.commit()
    await db.refresh(assessment)

    await log_audit_event(db, "CREATE_ASSESSMENT", f"assessment:{assessment.id}", actor_id=admin.id, actor_role=admin.role.value)
    return {"id": assessment.id, "title": assessment.title, "message": "Assessment created."}

@router.post("/questions")
async def create_question(
    payload: QuestionCreate,
    assessment_id: str = Query(...),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Creates question, public options, and populates the secret QuestionAnswer table (answer key / test cases).
    """
    asm_stmt = select(Assessment).where(Assessment.id == assessment_id)
    asm_res = await db.execute(asm_stmt)
    if not asm_res.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found.")

    question = Question(
        assessment_id=assessment_id,
        question_text=payload.question_text,
        question_type=payload.question_type,
        marks=payload.marks,
        display_order=payload.display_order
    )
    db.add(question)
    await db.flush()

    correct_option_id = None
    for opt in payload.options:
        opt_db = QuestionOption(
            question_id=question.id,
            option_text=opt.option_text,
            display_order=opt.display_order
        )
        db.add(opt_db)
        await db.flush()
        if opt.is_correct:
            correct_option_id = opt_db.id

    hidden_tc_dicts = [tc.model_dump() for tc in payload.hidden_test_cases]
    secret_answer = QuestionAnswer(
        question_id=question.id,
        correct_option_id=correct_option_id,
        rubric_text=payload.rubric_text,
        hidden_test_cases=hidden_tc_dicts if hidden_tc_dicts else None
    )
    db.add(secret_answer)

    await db.commit()
    await db.refresh(question)

    await log_audit_event(db, "CREATE_QUESTION", f"question:{question.id}", actor_id=admin.id, actor_role=admin.role.value)
    return {"id": question.id, "message": "Question created with secret answer key stored server-side."}

@router.post("/questions/upload-csv")
async def upload_questions_csv(
    assessment_id: str = Query(...),
    file: UploadFile = File(...),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Parses a CSV file containing questions (coding or MCQ), extracts test cases,
    and populates question records along with secret server-side answer keys.
    CSV format headers: type,section,topic,subTopic,tags,questionText,language,testCases,marks,difficulty,timeLimit,memoryLimit
    """
    asm_stmt = select(Assessment).where(Assessment.id == assessment_id)
    asm_res = await db.execute(asm_stmt)
    if not asm_res.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found.")

    contents = await file.read()
    decoded = contents.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(decoded))

    created_count = 0
    for idx, row in enumerate(reader):
        q_type_str = row.get("type", "coding").upper().strip()
        q_type = QuestionType.CODING if "CODING" in q_type_str else QuestionType.MCQ
        q_text = row.get("questionText", "").strip()
        marks = float(row.get("marks", 5.0))

        if not q_text:
            continue

        question = Question(
            assessment_id=assessment_id,
            question_text=q_text,
            question_type=q_type,
            marks=marks,
            display_order=idx + 1
        )
        db.add(question)
        await db.flush()

        # Parse test cases JSON string if present
        tc_json_raw = row.get("testCases", "[]")
        test_cases_parsed = []
        if tc_json_raw:
            try:
                test_cases_parsed = json.loads(tc_json_raw)
            except Exception as e:
                logger.warning(f"Failed to parse testCases JSON in CSV row {idx}: {e}")

        # Map test cases into standard hidden_test_cases format
        hidden_test_cases = []
        for tc in test_cases_parsed:
            hidden_test_cases.append({
                "input": tc.get("input", ""),
                "expected_output": tc.get("expectedOutput", tc.get("expected_output", "")),
                "points": float(tc.get("points", 1.0)),
                "is_hidden": tc.get("isHidden", True)
            })

        secret_answer = QuestionAnswer(
            question_id=question.id,
            correct_option_id=None,
            rubric_text=f"Difficulty: {row.get('difficulty', 'medium')}, Tags: {row.get('tags', '')}",
            hidden_test_cases=hidden_test_cases if hidden_test_cases else None
        )
        db.add(secret_answer)
        created_count += 1

    await db.commit()

    await log_audit_event(
        db,
        "BULK_QUESTION_IMPORT",
        f"assessment:{assessment_id}",
        actor_id=admin.id,
        actor_role=admin.role.value,
        metadata={"count": created_count, "filename": file.filename}
    )

    return {
        "assessment_id": assessment_id,
        "imported_questions_count": created_count,
        "message": f"Successfully imported {created_count} questions from CSV with secret server-side answer keys."
    }

@router.post("/invites", response_model=CandidateInviteOut)
async def generate_candidate_invite(
    payload: CandidateInviteCreate,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Generates single-use cryptographically secure candidate token. Stores only SHA-256 hash in DB.
    """
    cand_stmt = select(Candidate).where(Candidate.email == payload.candidate_email)
    cand_res = await db.execute(cand_stmt)
    candidate = cand_res.scalar_one_or_none()

    if not candidate:
        candidate = Candidate(email=payload.candidate_email, full_name=payload.candidate_name)
        db.add(candidate)
        await db.flush()

    raw_token = generate_secure_token(32)
    tok_hash = hash_token(raw_token)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=payload.expires_in_hours)

    tok = AssessmentToken(
        candidate_id=candidate.id,
        assessment_id=payload.assessment_id,
        token_hash=tok_hash,
        expires_at=expires_at,
        max_attempts=1
    )
    db.add(tok)
    await db.commit()
    await db.refresh(tok)

    await log_audit_event(db, "GENERATE_INVITE", f"candidate:{candidate.id}", actor_id=admin.id, actor_role=admin.role.value)

    return CandidateInviteOut(
        candidate_id=candidate.id,
        candidate_email=candidate.email,
        assessment_id=payload.assessment_id,
        token_id=tok.id,
        raw_token=raw_token,
        assessment_link=f"/assessment?token={raw_token}",
        expires_at=expires_at
    )

@router.get("/sessions/{session_id}", response_model=CandidateSessionDetailOut)
async def get_candidate_session_detail(
    session_id: str,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Allows Recruiter/Admin to view detailed candidate session and submission evaluation results."""
    stmt = (
        select(AssessmentSession)
        .options(
            selectinload(AssessmentSession.candidate),
            selectinload(AssessmentSession.submissions),
            selectinload(AssessmentSession.results)
        )
        .where(AssessmentSession.id == session_id)
    )
    res = await db.execute(stmt)
    sess = res.scalar_one_or_none()

    if not sess:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")

    asm_stmt = select(Assessment).options(selectinload(Assessment.questions)).where(Assessment.id == sess.assessment_id)
    asm_res = await db.execute(asm_stmt)
    asm = asm_res.scalar_one()

    max_possible_score = sum(q.marks for q in asm.questions)

    eval_map = {r.submission_id: r for r in sess.results}
    q_map = {q.id: q for q in asm.questions}

    sub_details = []
    total_score = 0.0
    for sub in sess.submissions:
        eval_r = eval_map.get(sub.id)
        q = q_map.get(sub.question_id)
        score = eval_r.score_earned if eval_r else 0.0
        total_score += score

        sub_details.append(
            CandidateSubmissionDetailOut(
                submission_id=sub.id,
                question_id=sub.question_id,
                question_text=q.question_text if q else "Unknown",
                question_type=q.question_type.value if q else "UNKNOWN",
                selected_option_id=sub.selected_option_id,
                text_response=sub.text_response,
                code_response=sub.code_response,
                programming_language=sub.programming_language,
                score_earned=score,
                is_correct=eval_r.is_correct if eval_r else False,
                execution_details=eval_r.execution_details if eval_r else None
            )
        )

    return CandidateSessionDetailOut(
        session_id=sess.id,
        candidate_name=sess.candidate.full_name,
        candidate_email=sess.candidate.email,
        assessment_title=asm.title,
        status=sess.status,
        started_at=sess.started_at,
        finished_at=sess.finished_at,
        focus_loss_count=sess.focus_loss_count,
        total_score=round(total_score, 2),
        max_possible_score=max_possible_score,
        submissions=sub_details
    )

@router.get("/audit-logs", response_model=List[AuditLogOut])
async def get_audit_logs(
    limit: int = 50,
    offset: int = 0,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve audit logs for platform security oversight."""
    stmt = select(AuditLog).order_by(AuditLog.timestamp.desc()).offset(offset).limit(limit)
    res = await db.execute(stmt)
    return res.scalars().all()
