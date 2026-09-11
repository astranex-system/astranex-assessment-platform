import logging
import csv
import io
import json
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete, update
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import (
    User, UserRole, Assessment, Question, QuestionOption, QuestionAnswer,
    Candidate, AssessmentToken, AssessmentSession, Submission, EvaluationResult, AuditLog, QuestionType, SessionStatus
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

@router.get("/assessments")
async def list_assessments(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Lists all assessment definitions with question counts and session stats."""
    stmt = select(Assessment).options(selectinload(Assessment.questions)).order_by(Assessment.created_at.desc())
    res = await db.execute(stmt)
    assessments = res.scalars().all()

    out = []
    for asm in assessments:
        sess_stmt = select(func.count(AssessmentSession.id)).where(AssessmentSession.assessment_id == asm.id)
        sess_res = await db.execute(sess_stmt)
        session_count = sess_res.scalar_one()

        out.append({
            "id": asm.id,
            "title": asm.title,
            "description": asm.description,
            "duration_minutes": asm.duration_minutes,
            "result_visibility": asm.result_visibility,
            "question_count": len(asm.questions),
            "total_marks": sum(q.marks for q in asm.questions),
            "session_count": session_count,
            "created_at": asm.created_at
        })
    return out

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
    return {"id": assessment.id, "title": assessment.title, "message": "Assessment created successfully."}

@router.delete("/assessments/{assessment_id}")
async def delete_assessment(
    assessment_id: str,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Deletes an assessment and all associated questions/sessions without foreign key errors."""
    stmt = select(Assessment).where(Assessment.id == assessment_id)
    res = await db.execute(stmt)
    asm = res.scalar_one_or_none()
    if not asm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found.")

    # 1. Clean up child assessment sessions and submissions
    sess_stmt = select(AssessmentSession.id).where(AssessmentSession.assessment_id == assessment_id)
    sess_res = await db.execute(sess_stmt)
    sess_ids = sess_res.scalars().all()
    if sess_ids:
        await db.execute(delete(EvaluationResult).where(EvaluationResult.session_id.in_(sess_ids)))
        await db.execute(delete(Submission).where(Submission.session_id.in_(sess_ids)))
        await db.execute(delete(AssessmentSession).where(AssessmentSession.id.in_(sess_ids)))

    # 2. Clean up tokens
    await db.execute(delete(AssessmentToken).where(AssessmentToken.assessment_id == assessment_id))

    # 3. Clean up questions, options, and answer keys
    q_stmt = select(Question.id).where(Question.assessment_id == assessment_id)
    q_res = await db.execute(q_stmt)
    q_ids = q_res.scalars().all()
    if q_ids:
        await db.execute(delete(QuestionAnswer).where(QuestionAnswer.question_id.in_(q_ids)))
        await db.execute(delete(QuestionOption).where(QuestionOption.question_id.in_(q_ids)))
        await db.execute(delete(Question).where(Question.id.in_(q_ids)))

    # 4. Safely delete assessment
    await db.delete(asm)
    await db.commit()

    await log_audit_event(db, "DELETE_ASSESSMENT", f"assessment:{assessment_id}", actor_id=admin.id, actor_role=admin.role.value)
    return {"message": "Assessment deleted successfully."}

@router.get("/assessments/{assessment_id}/questions")
async def list_assessment_questions_for_admin(
    assessment_id: str,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Retrieves all questions for an assessment including secret answer keys for editing."""
    stmt = (
        select(Question)
        .options(selectinload(Question.options), selectinload(Question.answer))
        .where(Question.assessment_id == assessment_id)
        .order_by(Question.display_order)
    )
    res = await db.execute(stmt)
    questions = res.scalars().all()

    out = []
    for q in questions:
        ans = q.answer
        opts = [
            {
                "id": opt.id,
                "option_text": opt.option_text,
                "display_order": opt.display_order,
                "is_correct": (ans and ans.correct_option_id == opt.id)
            } for opt in q.options
        ]
        out.append({
            "id": q.id,
            "question_text": q.question_text,
            "question_type": q.question_type,
            "marks": q.marks,
            "display_order": q.display_order,
            "options": opts,
            "hidden_test_cases": ans.hidden_test_cases if ans else [],
            "rubric_text": ans.rubric_text if ans else None
        })
    return out

@router.post("/questions")
async def create_question(
    payload: QuestionCreate,
    assessment_id: str = Query(...),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Creates a new question with secret server-side answer keys."""
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
    return {"id": question.id, "message": "Question created successfully."}

@router.delete("/questions/{question_id}")
async def delete_question(
    question_id: str,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Deletes a single question and cleans up associated options, answers, and submissions."""
    stmt = select(Question).where(Question.id == question_id)
    res = await db.execute(stmt)
    q = res.scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found.")

    # 1. Delete submissions referencing this question
    sub_stmt = select(Submission.id).where(Submission.question_id == question_id)
    sub_res = await db.execute(sub_stmt)
    sub_ids = sub_res.scalars().all()
    if sub_ids:
        await db.execute(delete(EvaluationResult).where(EvaluationResult.submission_id.in_(sub_ids)))
        await db.execute(delete(Submission).where(Submission.id.in_(sub_ids)))

    # 2. Delete answer key and options
    await db.execute(delete(QuestionAnswer).where(QuestionAnswer.question_id == question_id))
    await db.execute(delete(QuestionOption).where(QuestionOption.question_id == question_id))

    # 3. Delete question
    await db.delete(q)
    await db.commit()

    await log_audit_event(db, "DELETE_QUESTION", f"question:{question_id}", actor_id=admin.id, actor_role=admin.role.value)
    return {"message": "Question deleted successfully."}

@router.delete("/sessions/{session_id}")
async def delete_candidate_session(
    session_id: str,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Deletes a candidate session to clear test attempts or test submissions."""
    stmt = select(AssessmentSession).where(AssessmentSession.id == session_id)
    res = await db.execute(stmt)
    sess = res.scalar_one_or_none()
    if not sess:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")

    await db.execute(delete(EvaluationResult).where(EvaluationResult.session_id == session_id))
    await db.execute(delete(Submission).where(Submission.session_id == session_id))
    await db.delete(sess)
    await db.commit()

    await log_audit_event(db, "DELETE_SESSION", f"session:{session_id}", actor_id=admin.id, actor_role=admin.role.value)
    return {"message": "Candidate session removed successfully."}

@router.post("/questions/upload-csv")
async def upload_questions_csv(
    assessment_id: str = Query(...),
    file: UploadFile = File(...),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Bulk imports questions from a CSV file."""
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

        tc_json_raw = row.get("testCases", "[]")
        test_cases_parsed = []
        if tc_json_raw:
            try:
                test_cases_parsed = json.loads(tc_json_raw)
            except Exception as e:
                logger.warning(f"Failed to parse testCases JSON in CSV row {idx}: {e}")

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
    """Generates single-use cryptographically secure candidate token."""
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

@router.get("/leaderboard")
async def get_exam_leaderboard(
    assessment_id: Optional[str] = Query(None),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Computes live exam leaderboard rankings across candidate sessions.
    Ranks by score, completion time, and focus loss integrity.
    """
    stmt = (
        select(AssessmentSession)
        .options(
            selectinload(AssessmentSession.candidate),
            selectinload(AssessmentSession.results),
            selectinload(AssessmentSession.submissions)
        )
    )
    if assessment_id:
        stmt = stmt.where(AssessmentSession.assessment_id == assessment_id)

    stmt = stmt.order_by(AssessmentSession.started_at.desc())
    res = await db.execute(stmt)
    sessions = res.scalars().all()

    leaderboard = []
    for sess in sessions:
        asm_stmt = select(Assessment).options(selectinload(Assessment.questions)).where(Assessment.id == sess.assessment_id)
        asm_res = await db.execute(asm_stmt)
        asm = asm_res.scalar_one_or_none()
        if not asm:
            continue

        total_score = sum(r.score_earned for r in sess.results)
        max_marks = sum(q.marks for q in asm.questions)
        pct = round((total_score / max_marks * 100), 1) if max_marks > 0 else 0.0

        leaderboard.append({
            "session_id": sess.id,
            "candidate_name": sess.candidate.full_name,
            "candidate_email": sess.candidate.email,
            "assessment_id": asm.id,
            "assessment_title": asm.title,
            "status": sess.status,
            "total_score": round(total_score, 2),
            "max_marks": max_marks,
            "percentage": pct,
            "focus_loss_count": sess.focus_loss_count,
            "started_at": sess.started_at,
            "finished_at": sess.finished_at,
            "submitted_count": len(sess.submissions)
        })

    # Sort leaderboard by percentage descending, then focus loss count ascending
    leaderboard.sort(key=lambda item: (item["percentage"], -item["focus_loss_count"]), reverse=True)

    # Assign ranks
    for idx, item in enumerate(leaderboard):
        item["rank"] = idx + 1

    return leaderboard

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
