import logging
import csv
import io
import json
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete, update, or_, and_
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import (
    User, UserRole, Assessment, Question, QuestionOption, QuestionAnswer,
    Candidate, AssessmentToken, AssessmentSession, Submission, EvaluationResult, AuditLog,
    QuestionType, SessionStatus, ResultVisibility, CandidateAssessmentAssignment, IntegrityEvent
)
from app.schemas.admin import (
    AdminLoginRequest, AdminTokenOut, AssessmentCreate, AssessmentUpdate, QuestionCreate, QuestionUpdate,
    CandidateAssignRequest, CandidateBulkCSVAssignRequest, CandidateStatusUpdateRequest,
    CandidateListItem, CandidateDetailOut, CSVValidationResponse, CSVValidationRowError, CSVValidationPreviewItem,
    DashboardMetricsOut, QuestionBankItemOut, QuestionAnalyticsItemOut, LiveCandidateMonitorItem,
    IntegrityEventOut, IntegrityActionRequest, ReportSummaryOut, CandidateInviteCreate, CandidateInviteOut,
    AuditLogOut, CandidateSessionDetailOut, CandidateSubmissionDetailOut
)
from app.dependencies import get_current_admin, require_roles
from app.security import (
    verify_password, hash_password, create_access_token, generate_secure_token, hash_token
)
from app.services.audit import log_audit_event

logger = logging.getLogger("astranex.admin_api")

router = APIRouter(prefix="/api/v1/admin", tags=["Admin API"])

@router.post("/login", response_model=AdminTokenOut)
async def admin_login(payload: AdminLoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate Admin, Recruiter, or Evaluator and issue JWT token."""
    stmt = select(User).where(User.email == payload.email)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user or not verify_password(payload.password, user.password_hash):
        await log_audit_event(db, "ADMIN_AUTH_FAILURE", "user", metadata={"email": payload.email})
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid administrative credentials."
        )

    if user.role not in [UserRole.ADMIN, UserRole.RECRUITER, UserRole.EVALUATOR]:
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

@router.get("/dashboard/metrics", response_model=DashboardMetricsOut)
async def get_dashboard_metrics(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Computes technical assessment metrics, candidate distributions, and recent audit activity."""
    # 1. Total & Active candidates
    total_cands_res = await db.execute(select(func.count(Candidate.id)))
    total_candidates = total_cands_res.scalar_one() or 0

    active_cands_res = await db.execute(select(func.count(Candidate.id)).where(Candidate.status == "ACTIVE"))
    active_candidates = active_cands_res.scalar_one() or 0

    # 2. Session counts
    comp_res = await db.execute(select(func.count(AssessmentSession.id)).where(AssessmentSession.status == SessionStatus.SUBMITTED))
    completed_assessments = comp_res.scalar_one() or 0

    prog_res = await db.execute(select(func.count(AssessmentSession.id)).where(AssessmentSession.status == SessionStatus.IN_PROGRESS))
    in_progress_assessments = prog_res.scalar_one() or 0

    # 3. Active assessments
    active_asm_res = await db.execute(select(func.count(Assessment.id)).where(Assessment.status.in_(["ACTIVE", "PUBLISHED"])))
    active_assessments_count = active_asm_res.scalar_one() or 0

    # 4. Assessment overview & score analytics
    all_asms_res = await db.execute(select(Assessment).options(selectinload(Assessment.questions), selectinload(Assessment.sessions).selectinload(AssessmentSession.results)))
    all_asms = all_asms_res.scalars().all()

    assessments_overview = []
    all_completed_pcts = []
    passed_sessions = 0
    total_completed_sessions = 0

    score_dist = {"<40%": 0, "40-59%": 0, "60-79%": 0, "80-100%": 0}

    for asm in all_asms:
        q_count = len(asm.questions)
        max_marks = sum(q.marks for q in asm.questions) or asm.total_marks or 100.0
        pass_marks = asm.passing_marks or 60.0

        # Assignments / Candidates count
        assign_count_res = await db.execute(select(func.count(CandidateAssessmentAssignment.id)).where(CandidateAssessmentAssignment.assessment_id == asm.id))
        assigned_count = assign_count_res.scalar_one() or 0

        asm_completed = 0
        asm_inprogress = 0
        asm_scores = []
        asm_passed = 0

        for s in asm.sessions:
            if s.status == SessionStatus.SUBMITTED:
                asm_completed += 1
                total_completed_sessions += 1
                s_score = sum(r.score_earned for r in s.results)
                pct = round((s_score / max_marks * 100), 1) if max_marks > 0 else 0.0
                asm_scores.append(pct)
                all_completed_pcts.append(pct)
                if s_score >= pass_marks:
                    asm_passed += 1
                    passed_sessions += 1

                if pct < 40:
                    score_dist["<40%"] += 1
                elif pct < 60:
                    score_dist["40-59%"] += 1
                elif pct < 80:
                    score_dist["60-79%"] += 1
                else:
                    score_dist["80-100%"] += 1

            elif s.status == SessionStatus.IN_PROGRESS:
                asm_inprogress += 1

        not_started = max(0, assigned_count - (asm_completed + asm_inprogress))
        asm_avg = round(sum(asm_scores) / len(asm_scores), 1) if asm_scores else 0.0
        asm_pass_rate = round((asm_passed / asm_completed * 100), 1) if asm_completed > 0 else 0.0

        assessments_overview.append({
            "id": asm.id,
            "title": asm.title,
            "role": asm.role or "Software Engineering",
            "candidates": max(assigned_count, len(asm.sessions)),
            "completed": asm_completed,
            "in_progress": asm_inprogress,
            "not_started": not_started,
            "average_score": asm_avg,
            "pass_rate": asm_pass_rate,
            "status": asm.status or "ACTIVE",
            "duration_minutes": asm.duration_minutes
        })

    average_score = round(sum(all_completed_pcts) / len(all_completed_pcts), 1) if all_completed_pcts else 0.0
    pass_rate = round((passed_sessions / total_completed_sessions * 100), 1) if total_completed_sessions > 0 else 0.0

    # 5. Status distribution
    status_dist = {"ACTIVE": 0, "SUSPENDED": 0, "DISQUALIFIED": 0}
    c_status_res = await db.execute(select(Candidate.status, func.count(Candidate.id)).group_by(Candidate.status))
    for s_name, s_count in c_status_res.all():
        key = s_name.upper() if s_name else "ACTIVE"
        status_dist[key] = s_count

    # 6. Recent activity from AuditLog
    recent_logs_res = await db.execute(select(AuditLog).order_by(AuditLog.timestamp.desc()).limit(10))
    recent_activity = [
        {
            "id": l.id,
            "event": l.event_type,
            "actor": l.actor_role or "System",
            "target": l.resource,
            "timestamp": l.timestamp.isoformat() if l.timestamp else None,
            "metadata": l.metadata_json
        } for l in recent_logs_res.scalars().all()
    ]

    return DashboardMetricsOut(
        total_candidates=total_candidates,
        active_candidates=active_candidates,
        completed_assessments=completed_assessments,
        in_progress_assessments=in_progress_assessments,
        average_score=average_score,
        pass_rate=pass_rate,
        active_assessments_count=active_assessments_count,
        assessments_overview=assessments_overview,
        score_distribution=score_dist,
        status_distribution=status_dist,
        recent_activity=recent_activity
    )

@router.get("/assessments")
async def list_assessments(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Lists all assessment definitions with question counts, session stats, and assignment stats."""
    stmt = select(Assessment).options(selectinload(Assessment.questions)).order_by(Assessment.created_at.desc())
    res = await db.execute(stmt)
    assessments = res.scalars().all()

    out = []
    for asm in assessments:
        sess_stmt = select(func.count(AssessmentSession.id)).where(AssessmentSession.assessment_id == asm.id)
        sess_res = await db.execute(sess_stmt)
        session_count = sess_res.scalar_one()

        assign_stmt = select(func.count(CandidateAssessmentAssignment.id)).where(CandidateAssessmentAssignment.assessment_id == asm.id)
        assign_res = await db.execute(assign_stmt)
        assigned_count = assign_res.scalar_one()

        out.append({
            "id": asm.id,
            "title": asm.title,
            "description": asm.description,
            "role": asm.role or "Software Engineering",
            "duration_minutes": asm.duration_minutes,
            "total_marks": asm.total_marks or sum(q.marks for q in asm.questions),
            "passing_marks": asm.passing_marks or 60.0,
            "max_attempts": asm.max_attempts or 1,
            "status": asm.status or "ACTIVE",
            "result_visibility": asm.result_visibility,
            "question_count": len(asm.questions),
            "session_count": session_count,
            "candidate_count": max(assigned_count, session_count),
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
        role=payload.role or "Software Engineering",
        duration_minutes=payload.duration_minutes,
        total_marks=payload.total_marks,
        passing_marks=payload.passing_marks,
        max_attempts=payload.max_attempts,
        status=payload.status or "ACTIVE",
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

@router.put("/assessments/{assessment_id}")
async def update_assessment(
    assessment_id: str,
    payload: AssessmentUpdate,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Updates technical assessment metadata."""
    stmt = select(Assessment).where(Assessment.id == assessment_id)
    res = await db.execute(stmt)
    asm = res.scalar_one_or_none()
    if not asm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found.")

    for field, val in payload.model_dump(exclude_unset=True).items():
        setattr(asm, field, val)

    await db.commit()
    await log_audit_event(db, "UPDATE_ASSESSMENT", f"assessment:{assessment_id}", actor_id=admin.id, actor_role=admin.role.value)
    return {"message": "Assessment updated successfully."}

@router.post("/assessments/{assessment_id}/duplicate")
async def duplicate_assessment(
    assessment_id: str,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Duplicates an assessment definition including all questions, options, and server answer keys."""
    stmt = select(Assessment).options(selectinload(Assessment.questions).selectinload(Question.options), selectinload(Assessment.questions).selectinload(Question.answer)).where(Assessment.id == assessment_id)
    res = await db.execute(stmt)
    orig = res.scalar_one_or_none()
    if not orig:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found.")

    new_asm = Assessment(
        title=f"{orig.title} (Copy)",
        description=orig.description,
        role=orig.role,
        duration_minutes=orig.duration_minutes,
        total_marks=orig.total_marks,
        passing_marks=orig.passing_marks,
        max_attempts=orig.max_attempts,
        status="DRAFT",
        start_window=orig.start_window,
        end_window=orig.end_window,
        result_visibility=orig.result_visibility,
        created_by=admin.id
    )
    db.add(new_asm)
    await db.flush()

    for q in orig.questions:
        new_q = Question(
            assessment_id=new_asm.id,
            question_code=q.question_code,
            section=q.section,
            question_text=q.question_text,
            question_type=q.question_type,
            marks=q.marks,
            difficulty=q.difficulty,
            tags=q.tags,
            status="ACTIVE",
            display_order=q.display_order
        )
        db.add(new_q)
        await db.flush()

        opt_id_map = {}
        for opt in q.options:
            new_opt = QuestionOption(
                question_id=new_q.id,
                option_text=opt.option_text,
                display_order=opt.display_order
            )
            db.add(new_opt)
            await db.flush()
            opt_id_map[opt.id] = new_opt.id

        if q.answer:
            new_correct_opt = opt_id_map.get(q.answer.correct_option_id)
            new_ans = QuestionAnswer(
                question_id=new_q.id,
                correct_option_id=new_correct_opt,
                rubric_text=q.answer.rubric_text,
                hidden_test_cases=q.answer.hidden_test_cases
            )
            db.add(new_ans)

    await db.commit()
    await log_audit_event(db, "DUPLICATE_ASSESSMENT", f"assessment:{new_asm.id}", actor_id=admin.id, actor_role=admin.role.value)
    return {"id": new_asm.id, "title": new_asm.title, "message": "Assessment duplicated successfully."}

@router.post("/assessments/{assessment_id}/status")
async def set_assessment_status(
    assessment_id: str,
    status_val: str = Query(..., alias="status"),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Sets assessment status: DRAFT, PUBLISHED, ACTIVE, CLOSED, ARCHIVED."""
    valid_statuses = ["DRAFT", "PUBLISHED", "ACTIVE", "CLOSED", "ARCHIVED"]
    status_upper = status_val.upper().strip()
    if status_upper not in valid_statuses:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid status. Must be one of {valid_statuses}")

    stmt = select(Assessment).where(Assessment.id == assessment_id)
    res = await db.execute(stmt)
    asm = res.scalar_one_or_none()
    if not asm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found.")

    asm.status = status_upper
    await db.commit()
    await log_audit_event(db, "SET_ASSESSMENT_STATUS", f"assessment:{assessment_id}", actor_id=admin.id, actor_role=admin.role.value, metadata={"status": status_upper})
    return {"message": f"Assessment status changed to {status_upper}."}


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

# ==================================================
# CANDIDATE MANAGEMENT & ASSIGNMENT
# ==================================================

@router.get("/candidates", response_model=List[CandidateListItem])
async def list_candidates(
    assessment_id: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Retrieves list of registered candidates with assignment counts, completed counts, and average scores."""
    stmt = (
        select(Candidate)
        .options(
            selectinload(Candidate.assignments),
            selectinload(Candidate.sessions).selectinload(AssessmentSession.results),
            selectinload(Candidate.sessions).selectinload(AssessmentSession.assessment).selectinload(Assessment.questions)
        )
    )

    if status_filter:
        stmt = stmt.where(Candidate.status == status_filter.upper().strip())

    if search:
        search_pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Candidate.full_name.ilike(search_pattern),
                Candidate.email.ilike(search_pattern),
                Candidate.phone.ilike(search_pattern),
                Candidate.id.ilike(search_pattern)
            )
        )

    stmt = stmt.order_by(Candidate.created_at.desc())
    res = await db.execute(stmt)
    candidates = res.scalars().all()

    out = []
    for cand in candidates:
        if assessment_id:
            assigned_ids = [a.assessment_id for a in cand.assignments]
            session_asm_ids = [s.assessment_id for s in cand.sessions]
            if assessment_id not in assigned_ids and assessment_id not in session_asm_ids:
                continue

        comp_sessions = [s for s in cand.sessions if s.status == SessionStatus.SUBMITTED]
        pcts = []
        for s in comp_sessions:
            if s.assessment:
                max_marks = sum(q.marks for q in s.assessment.questions) or s.assessment.total_marks or 100.0
                score = sum(r.score_earned for r in s.results)
                pcts.append((score / max_marks * 100) if max_marks > 0 else 0.0)

        avg_score = round(sum(pcts) / len(pcts), 1) if pcts else 0.0

        out.append(
            CandidateListItem(
                id=cand.id,
                full_name=cand.full_name,
                email=cand.email,
                phone=cand.phone,
                status=cand.status or "ACTIVE",
                created_at=cand.created_at,
                assessments_assigned_count=len(cand.assignments),
                completed_count=len(comp_sessions),
                average_score=avg_score
            )
        )
    return out

@router.get("/candidates/{candidate_id}/detail", response_model=CandidateDetailOut)
async def get_candidate_detail(
    candidate_id: str,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Retrieves full candidate profile, history, integrity logs, and activity timeline. NEVER leaks candidate password."""
    stmt = (
        select(Candidate)
        .options(
            selectinload(Candidate.assignments).selectinload(CandidateAssessmentAssignment.assessment),
            selectinload(Candidate.sessions).selectinload(AssessmentSession.assessment).selectinload(Assessment.questions),
            selectinload(Candidate.sessions).selectinload(AssessmentSession.results),
            selectinload(Candidate.integrity_events)
        )
        .where(Candidate.id == candidate_id)
    )
    res = await db.execute(stmt)
    cand = res.scalar_one_or_none()
    if not cand:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found.")

    assignments_out = []
    for a in cand.assignments:
        assignments_out.append({
            "assignment_id": a.id,
            "assessment_id": a.assessment_id,
            "assessment_title": a.assessment.title if a.assessment else "Unknown",
            "role": a.assessment.role if a.assessment else "Engineering",
            "assigned_at": a.assigned_at.isoformat() if a.assigned_at else None,
            "deadline": a.deadline.isoformat() if a.deadline else None,
            "status": a.status
        })

    history_out = []
    for s in cand.sessions:
        asm_title = s.assessment.title if s.assessment else "Unknown"
        max_m = sum(q.marks for q in s.assessment.questions) if s.assessment and s.assessment.questions else 100.0
        score = sum(r.score_earned for r in s.results)
        pct = round((score / max_m * 100), 1) if max_m > 0 else 0.0
        pass_marks = s.assessment.passing_marks if s.assessment else 60.0

        duration_taken = None
        if s.finished_at and s.started_at:
            duration_taken = int((s.finished_at - s.started_at).total_seconds())

        history_out.append({
            "session_id": s.id,
            "assessment_id": s.assessment_id,
            "assessment_title": asm_title,
            "status": s.status,
            "score": round(score, 2),
            "max_marks": max_m,
            "percentage": pct,
            "passed": score >= pass_marks,
            "started_at": s.started_at.isoformat() if s.started_at else None,
            "finished_at": s.finished_at.isoformat() if s.finished_at else None,
            "duration_taken_seconds": duration_taken,
            "focus_loss_count": s.focus_loss_count
        })

    integrity_out = [
        {
            "id": ie.id,
            "event_type": ie.event_type,
            "risk_level": ie.risk_level,
            "details": ie.details,
            "status": ie.status,
            "created_at": ie.created_at.isoformat() if ie.created_at else None
        } for ie in cand.integrity_events
    ]

    # Activity timeline from AuditLog
    audits_res = await db.execute(
        select(AuditLog)
        .where(or_(AuditLog.resource == f"candidate:{cand.id}", AuditLog.actor_id == cand.id))
        .order_by(AuditLog.timestamp.desc())
        .limit(25)
    )
    timeline = [
        {
            "id": a.id,
            "event": a.event_type,
            "timestamp": a.timestamp.isoformat() if a.timestamp else None,
            "metadata": a.metadata_json
        } for a in audits_res.scalars().all()
    ]

    return CandidateDetailOut(
        id=cand.id,
        full_name=cand.full_name,
        email=cand.email,
        phone=cand.phone,
        status=cand.status or "ACTIVE",
        created_at=cand.created_at,
        assessments_assigned=assignments_out,
        assessment_history=history_out,
        integrity_events=integrity_out,
        activity_timeline=timeline
    )

@router.post("/candidates/{candidate_id}/status")
async def update_candidate_status(
    candidate_id: str,
    payload: CandidateStatusUpdateRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Sets candidate account status: ACTIVE, SUSPENDED, DISQUALIFIED."""
    new_status = payload.status.upper().strip()
    if new_status not in ["ACTIVE", "SUSPENDED", "DISQUALIFIED"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Status must be ACTIVE, SUSPENDED, or DISQUALIFIED.")

    stmt = select(Candidate).where(Candidate.id == candidate_id)
    res = await db.execute(stmt)
    cand = res.scalar_one_or_none()
    if not cand:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found.")

    cand.status = new_status
    await db.commit()

    await log_audit_event(
        db,
        "CANDIDATE_STATUS_UPDATE",
        f"candidate:{candidate_id}",
        actor_id=admin.id,
        actor_role=admin.role.value,
        metadata={"new_status": new_status}
    )
    return {"message": f"Candidate status updated to {new_status}."}

@router.post("/assessments/{assessment_id}/assign")
async def assign_candidates_to_assessment(
    assessment_id: str,
    payload: CandidateAssignRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Assigns an assessment to selected registered candidates with an optional deadline."""
    asm_res = await db.execute(select(Assessment).where(Assessment.id == assessment_id))
    asm = asm_res.scalar_one_or_none()
    if not asm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found.")

    assigned_count = 0
    for cand_id in payload.candidate_ids:
        # Check if already assigned
        chk = await db.execute(
            select(CandidateAssessmentAssignment)
            .where(
                CandidateAssessmentAssignment.candidate_id == cand_id,
                CandidateAssessmentAssignment.assessment_id == assessment_id
            )
        )
        if not chk.scalar_one_or_none():
            assignment = CandidateAssessmentAssignment(
                candidate_id=cand_id,
                assessment_id=assessment_id,
                deadline=payload.deadline,
                status="NOT_STARTED"
            )
            db.add(assignment)
            assigned_count += 1

    await db.commit()
    await log_audit_event(
        db,
        "ASSIGN_ASSESSMENT",
        f"assessment:{assessment_id}",
        actor_id=admin.id,
        actor_role=admin.role.value,
        metadata={"assigned_count": assigned_count, "total_requested": len(payload.candidate_ids)}
    )
    return {"message": f"Successfully assigned assessment to {assigned_count} candidate(s)."}

@router.post("/assessments/{assessment_id}/assign-csv")
async def bulk_assign_candidates_by_csv(
    assessment_id: str,
    payload: CandidateBulkCSVAssignRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Bulk assigns an assessment using a list of candidate emails, auto-provisioning candidates if new."""
    asm_res = await db.execute(select(Assessment).where(Assessment.id == assessment_id))
    if not asm_res.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found.")

    created_cands = 0
    assigned_count = 0

    for email_raw in payload.emails:
        clean_email = email_raw.strip().lower()
        if not clean_email or "@" not in clean_email:
            continue

        cand_res = await db.execute(select(Candidate).where(Candidate.email == clean_email))
        cand = cand_res.scalar_one_or_none()

        if not cand:
            name_part = clean_email.split("@")[0].replace(".", " ").title()
            cand = Candidate(email=clean_email, full_name=name_part)
            db.add(cand)
            await db.flush()
            created_cands += 1

        chk = await db.execute(
            select(CandidateAssessmentAssignment)
            .where(
                CandidateAssessmentAssignment.candidate_id == cand.id,
                CandidateAssessmentAssignment.assessment_id == assessment_id
            )
        )
        if not chk.scalar_one_or_none():
            assignment = CandidateAssessmentAssignment(
                candidate_id=cand.id,
                assessment_id=assessment_id,
                deadline=payload.deadline,
                status="NOT_STARTED"
            )
            db.add(assignment)
            assigned_count += 1

    await db.commit()
    await log_audit_event(
        db,
        "BULK_CSV_ASSIGN_ASSESSMENT",
        f"assessment:{assessment_id}",
        actor_id=admin.id,
        actor_role=admin.role.value,
        metadata={"assigned_count": assigned_count, "created_candidates": created_cands}
    )
    return {
        "message": f"Bulk assignment complete: {assigned_count} candidates assigned ({created_cands} newly created)."
    }

@router.delete("/assessments/{assessment_id}/assign/{candidate_id}")
async def remove_candidate_assignment(
    assessment_id: str,
    candidate_id: str,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Removes a candidate assignment from an assessment."""
    stmt = select(CandidateAssessmentAssignment).where(
        CandidateAssessmentAssignment.assessment_id == assessment_id,
        CandidateAssessmentAssignment.candidate_id == candidate_id
    )
    res = await db.execute(stmt)
    assignment = res.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment record not found.")

    await db.delete(assignment)
    await db.commit()

    await log_audit_event(
        db,
        "REMOVE_ASSESSMENT_ASSIGNMENT",
        f"assessment:{assessment_id}",
        actor_id=admin.id,
        actor_role=admin.role.value,
        metadata={"candidate_id": candidate_id}
    )
    return {"message": "Candidate assignment removed successfully."}

# ==================================================
# PREDEFINED CSV VALIDATION & IMPORT WORKFLOW
# ==================================================

REQUIRED_CSV_COLUMNS = [
    "questionId", "section", "questionType", "question",
    "option1", "option2", "option3", "option4",
    "correctAnswer", "marks", "difficulty", "tags", "testCases"
]

@router.post("/questions/validate-csv", response_model=CSVValidationResponse)
async def validate_questions_csv(
    file: UploadFile = File(...),
    admin: User = Depends(get_current_admin)
):
    """
    Validates an uploaded CSV against the strict predefined format:
    questionId,section,questionType,question,option1,option2,option3,option4,correctAnswer,marks,difficulty,tags,testCases
    Returns detailed row-by-row errors and preview of valid rows without committing to database.
    """
    contents = await file.read()
    try:
        decoded = contents.decode("utf-8-sig")
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Encoding error: {str(e)}. Please upload a valid UTF-8 CSV.")

    reader = csv.DictReader(io.StringIO(decoded))
    if not reader.fieldnames:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty or corrupted.")

    fieldnames_clean = [f.strip() for f in reader.fieldnames if f]

    # Verify required columns exist
    missing_cols = [c for c in REQUIRED_CSV_COLUMNS if c not in fieldnames_clean]
    if missing_cols:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Missing required columns in CSV: {', '.join(missing_cols)}. Expected columns: {', '.join(REQUIRED_CSV_COLUMNS)}"
        )

    row_errors: List[CSVValidationRowError] = []
    preview_items: List[CSVValidationPreviewItem] = []
    seen_ids = set()

    for idx, row in enumerate(reader, start=1):
        q_id = row.get("questionId", "").strip()
        section = row.get("section", "").strip() or "General"
        q_type_str = row.get("questionType", "").upper().strip()
        question_text = row.get("question", "").strip()
        marks_str = row.get("marks", "").strip()
        difficulty = row.get("difficulty", "Medium").strip().capitalize()
        tags = row.get("tags", "").strip()
        correct_ans = row.get("correctAnswer", "").strip()
        test_cases_raw = row.get("testCases", "").strip()

        row_has_error = False

        # 1. Question text validation
        if not question_text:
            row_errors.append(CSVValidationRowError(row=idx, question_id=q_id, error="Missing question text."))
            row_has_error = True

        # 2. Duplicate question ID
        if q_id:
            if q_id in seen_ids:
                row_errors.append(CSVValidationRowError(row=idx, question_id=q_id, error=f"Duplicate questionId '{q_id}' in CSV."))
                row_has_error = True
            else:
                seen_ids.add(q_id)

        # 3. Question type validation
        if q_type_str not in ["MCQ", "CODING", "TEXT"]:
            row_errors.append(CSVValidationRowError(row=idx, question_id=q_id, error=f"Invalid questionType '{q_type_str}'. Must be MCQ, CODING, or TEXT."))
            row_has_error = True

        # 4. Marks validation
        try:
            marks_val = float(marks_str) if marks_str else 1.0
            if marks_val < 0:
                row_errors.append(CSVValidationRowError(row=idx, question_id=q_id, error="Marks cannot be negative."))
                row_has_error = True
        except ValueError:
            row_errors.append(CSVValidationRowError(row=idx, question_id=q_id, error=f"Invalid marks value '{marks_str}'. Must be numeric."))
            row_has_error = True
            marks_val = 1.0

        # 5. MCQ specific checks
        options = []
        if q_type_str == "MCQ":
            for opt_key in ["option1", "option2", "option3", "option4"]:
                val = row.get(opt_key, "").strip()
                if val:
                    options.append(val)

            if len(options) < 2:
                row_errors.append(CSVValidationRowError(row=idx, question_id=q_id, error="MCQ questions must have at least option1 and option2."))
                row_has_error = True

            if not correct_ans:
                row_errors.append(CSVValidationRowError(row=idx, question_id=q_id, error="Missing correctAnswer for MCQ question."))
                row_has_error = True
            else:
                # Match either exact text or option key
                matched = False
                if correct_ans in options:
                    matched = True
                elif correct_ans.lower() in ["option1", "option2", "option3", "option4", "1", "2", "3", "4", "a", "b", "c", "d"]:
                    matched = True
                if not matched:
                    row_errors.append(
                        CSVValidationRowError(
                            row=idx,
                            question_id=q_id,
                            error=f"correctAnswer '{correct_ans}' does not match any of the provided options: {options}."
                        )
                    )
                    row_has_error = True

        # 6. Coding specific checks
        has_tc = False
        if q_type_str == "CODING":
            if test_cases_raw:
                try:
                    tc_parsed = json.loads(test_cases_raw)
                    if not isinstance(tc_parsed, list):
                        row_errors.append(CSVValidationRowError(row=idx, question_id=q_id, error="testCases must be a JSON array of objects."))
                        row_has_error = True
                    else:
                        has_tc = True
                except Exception as e:
                    row_errors.append(CSVValidationRowError(row=idx, question_id=q_id, error=f"Invalid JSON in testCases: {str(e)}."))
                    row_has_error = True

        if not row_has_error:
            preview_items.append(
                CSVValidationPreviewItem(
                    row=idx,
                    question_id=q_id or f"Q{idx:03d}",
                    section=section,
                    question_type=q_type_str,
                    question_text=question_text[:80] + ("..." if len(question_text) > 80 else ""),
                    marks=marks_val,
                    difficulty=difficulty,
                    tags=tags,
                    options_count=len(options),
                    correct_answer_preview=correct_ans[:30],
                    has_test_cases=has_tc
                )
            )

    total_rows = len(row_errors) + len(preview_items)
    return CSVValidationResponse(
        total_rows=total_rows,
        valid_count=len(preview_items),
        invalid_count=len(row_errors),
        errors=row_errors,
        preview=preview_items
    )

@router.post("/questions/import-csv")
async def import_questions_from_csv(
    assessment_id: str = Query(...),
    file: UploadFile = File(...),
    import_valid_only: bool = Query(False),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Imports validated CSV questions directly into the chosen Assessment.
    Stores correct options and test cases strictly in QuestionAnswer server-side.
    """
    asm_stmt = select(Assessment).where(Assessment.id == assessment_id)
    asm_res = await db.execute(asm_stmt)
    asm = asm_res.scalar_one_or_none()
    if not asm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found.")

    contents = await file.read()
    decoded = contents.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(decoded))

    created_questions = 0

    for idx, row in enumerate(reader, start=1):
        q_id = row.get("questionId", "").strip() or f"Q{idx:03d}"
        section = row.get("section", "").strip() or "General"
        q_type_str = row.get("questionType", "MCQ").upper().strip()
        q_type = QuestionType.CODING if "CODING" in q_type_str else (QuestionType.TEXT if "TEXT" in q_type_str else QuestionType.MCQ)
        q_text = row.get("question", "").strip()
        marks = float(row.get("marks", 1.0) or 1.0)
        difficulty = row.get("difficulty", "Medium").strip().capitalize()
        tags = row.get("tags", "").strip()
        correct_ans = row.get("correctAnswer", "").strip()
        test_cases_raw = row.get("testCases", "[]").strip()

        if not q_text:
            continue

        question = Question(
            assessment_id=assessment_id,
            question_code=q_id,
            section=section,
            question_text=q_text,
            question_type=q_type,
            marks=marks,
            difficulty=difficulty,
            tags=tags,
            status="ACTIVE",
            display_order=idx
        )
        db.add(question)
        await db.flush()

        # Add Options for MCQ
        correct_option_id = None
        if q_type == QuestionType.MCQ:
            opt_texts = []
            for k in ["option1", "option2", "option3", "option4"]:
                v = row.get(k, "").strip()
                if v:
                    opt_texts.append(v)

            for o_idx, opt_text in enumerate(opt_texts):
                opt_db = QuestionOption(
                    question_id=question.id,
                    option_text=opt_text,
                    display_order=o_idx + 1
                )
                db.add(opt_db)
                await db.flush()

                # Check if this option is the correct answer
                is_correct = False
                if correct_ans == opt_text:
                    is_correct = True
                elif correct_ans.lower() == f"option{o_idx + 1}" or correct_ans == str(o_idx + 1):
                    is_correct = True
                elif correct_ans.upper() == chr(ord('A') + o_idx):
                    is_correct = True

                if is_correct:
                    correct_option_id = opt_db.id

        # Add Coding test cases
        hidden_test_cases = []
        if q_type == QuestionType.CODING and test_cases_raw:
            try:
                tc_parsed = json.loads(test_cases_raw)
                for tc in tc_parsed:
                    hidden_test_cases.append({
                        "input": str(tc.get("input", "")),
                        "expected_output": str(tc.get("expectedOutput", tc.get("expected_output", ""))),
                        "points": float(tc.get("points", 1.0)),
                        "is_hidden": tc.get("isHidden", True)
                    })
            except Exception as e:
                logger.warning(f"Error parsing testCases in row {idx}: {e}")

        # Store Answer Key Server-Side ONLY
        secret_answer = QuestionAnswer(
            question_id=question.id,
            correct_option_id=correct_option_id,
            rubric_text=f"Correct Answer: {correct_ans}, Section: {section}",
            hidden_test_cases=hidden_test_cases if hidden_test_cases else None
        )
        db.add(secret_answer)
        created_questions += 1

    await db.commit()

    await log_audit_event(
        db,
        "PREDEFINED_CSV_QUESTION_IMPORT",
        f"assessment:{assessment_id}",
        actor_id=admin.id,
        actor_role=admin.role.value,
        metadata={"count": created_questions, "filename": file.filename}
    )

    return {
        "assessment_id": assessment_id,
        "imported_questions_count": created_questions,
        "message": f"Successfully imported {created_questions} questions into '{asm.title}'."
    }

# ==================================================
# QUESTION BANK & METADATA EDITING
# ==================================================

@router.get("/questions/bank", response_model=List[QuestionBankItemOut])
async def list_question_bank(
    assessment_id: Optional[str] = Query(None),
    section: Optional[str] = Query(None),
    question_type: Optional[str] = Query(None),
    difficulty: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Lists questions across assessments with filters for section, question type, difficulty, and search."""
    stmt = (
        select(Question)
        .options(selectinload(Question.assessment))
        .order_by(Question.display_order.asc(), Question.id.desc())
    )

    if assessment_id:
        stmt = stmt.where(Question.assessment_id == assessment_id)
    if section:
        stmt = stmt.where(Question.section == section)
    if question_type:
        stmt = stmt.where(Question.question_type == question_type.upper())
    if difficulty:
        stmt = stmt.where(Question.difficulty == difficulty.capitalize())
    if search:
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Question.question_code.ilike(pattern),
                Question.question_text.ilike(pattern),
                Question.tags.ilike(pattern)
            )
        )

    res = await db.execute(stmt)
    questions = res.scalars().all()

    out = []
    for q in questions:
        out.append(
            QuestionBankItemOut(
                id=q.id,
                question_code=q.question_code or f"Q{q.display_order:03d}",
                section=q.section or "General",
                question_type=q.question_type.value,
                question_text=q.question_text,
                marks=q.marks,
                difficulty=q.difficulty or "Medium",
                tags=q.tags or "",
                assessment_id=q.assessment_id,
                assessment_title=q.assessment.title if q.assessment else "Unknown",
                status=q.status or "ACTIVE",
                created_at=q.assessment.created_at if q.assessment else None
            )
        )
    return out

@router.put("/questions/{question_id}")
async def update_question_metadata(
    question_id: str,
    payload: QuestionUpdate,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Updates question metadata (section, text, marks, difficulty, tags, display order)."""
    stmt = select(Question).where(Question.id == question_id)
    res = await db.execute(stmt)
    q = res.scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found.")

    for field, val in payload.model_dump(exclude_unset=True).items():
        setattr(q, field, val)

    await db.commit()
    await log_audit_event(db, "UPDATE_QUESTION", f"question:{question_id}", actor_id=admin.id, actor_role=admin.role.value)
    return {"message": "Question updated successfully."}

# ==================================================
# LIVE MONITORING & RESULTS
# ==================================================

@router.get("/monitoring/live", response_model=List[LiveCandidateMonitorItem])
async def get_live_monitoring(
    assessment_id: Optional[str] = Query(None),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Returns real-time active candidate sessions with server-authoritative timer, progress, and risk flags."""
    stmt = (
        select(AssessmentSession)
        .options(
            selectinload(AssessmentSession.candidate),
            selectinload(AssessmentSession.assessment).selectinload(Assessment.questions),
            selectinload(AssessmentSession.submissions)
        )
        .where(AssessmentSession.status == SessionStatus.IN_PROGRESS)
    )
    if assessment_id:
        stmt = stmt.where(AssessmentSession.assessment_id == assessment_id)

    stmt = stmt.order_by(AssessmentSession.started_at.desc())
    res = await db.execute(stmt)
    sessions = res.scalars().all()

    now = datetime.now(timezone.utc)
    out = []

    for s in sessions:
        exp = s.expires_at
        if exp and exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)

        time_left = max(0, int((exp - now).total_seconds())) if exp else 0

        # Auto-expire if time passed
        if exp and now > exp:
            s.status = SessionStatus.EXPIRED
            continue

        total_q = len(s.assessment.questions) if s.assessment else 0
        answered_q = len(s.submissions)

        # Compute integrity risk level
        fl_count = s.focus_loss_count or 0
        if fl_count >= 5:
            risk = "HIGH"
        elif fl_count >= 2:
            risk = "MEDIUM"
        else:
            risk = "LOW"

        out.append(
            LiveCandidateMonitorItem(
                session_id=s.id,
                candidate_id=s.candidate_id,
                candidate_name=s.candidate.full_name if s.candidate else "Candidate",
                candidate_email=s.candidate.email if s.candidate else "unknown",
                assessment_id=s.assessment_id,
                assessment_title=s.assessment.title if s.assessment else "Assessment",
                started_at=s.started_at,
                time_remaining_seconds=time_left,
                answered_count=answered_q,
                total_questions=total_q,
                connection_status="CONNECTED" if time_left > 0 else "WARNING",
                focus_loss_count=fl_count,
                risk_level=risk
            )
        )

    await db.commit()
    return out

@router.get("/results")
async def get_results_list(
    assessment_id: Optional[str] = Query(None),
    passed: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Retrieves list of completed candidate assessment results with section scores and pass/fail indicators."""
    stmt = (
        select(AssessmentSession)
        .options(
            selectinload(AssessmentSession.candidate),
            selectinload(AssessmentSession.assessment).selectinload(Assessment.questions),
            selectinload(AssessmentSession.results),
            selectinload(AssessmentSession.submissions)
        )
        .where(AssessmentSession.status.in_([SessionStatus.SUBMITTED, SessionStatus.EXPIRED]))
    )

    if assessment_id:
        stmt = stmt.where(AssessmentSession.assessment_id == assessment_id)

    stmt = stmt.order_by(AssessmentSession.finished_at.desc())
    res = await db.execute(stmt)
    sessions = res.scalars().all()

    out = []
    for s in sessions:
        if search:
            c_name = s.candidate.full_name.lower() if s.candidate else ""
            c_email = s.candidate.email.lower() if s.candidate else ""
            if search.lower() not in c_name and search.lower() not in c_email:
                continue

        asm = s.assessment
        if not asm:
            continue

        max_marks = sum(q.marks for q in asm.questions) or asm.total_marks or 100.0
        pass_marks = asm.passing_marks or 60.0
        score = sum(r.score_earned for r in s.results)
        pct = round((score / max_marks * 100), 1) if max_marks > 0 else 0.0
        is_pass = score >= pass_marks

        if passed is not None and is_pass != passed:
            continue

        time_taken = 0
        if s.finished_at and s.started_at:
            time_taken = int((s.finished_at - s.started_at).total_seconds())

        out.append({
            "session_id": s.id,
            "candidate_id": s.candidate_id,
            "candidate_name": s.candidate.full_name if s.candidate else "Unknown",
            "candidate_email": s.candidate.email if s.candidate else "Unknown",
            "assessment_id": asm.id,
            "assessment_title": asm.title,
            "role": asm.role or "Software Engineering",
            "score": round(score, 2),
            "max_marks": max_marks,
            "percentage": pct,
            "passed": is_pass,
            "status": s.status,
            "time_taken_seconds": time_taken,
            "focus_loss_count": s.focus_loss_count,
            "completed_at": s.finished_at or s.expires_at
        })

    return out

@router.get("/results/{assessment_id}/ranking")
async def get_server_calculated_ranking(
    assessment_id: str,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Calculates server-side ranking and section-wise ranking for an assessment."""
    stmt = (
        select(AssessmentSession)
        .options(
            selectinload(AssessmentSession.candidate),
            selectinload(AssessmentSession.assessment).selectinload(Assessment.questions),
            selectinload(AssessmentSession.results),
            selectinload(AssessmentSession.submissions)
        )
        .where(
            AssessmentSession.assessment_id == assessment_id,
            AssessmentSession.status.in_([SessionStatus.SUBMITTED, SessionStatus.EXPIRED])
        )
    )
    res = await db.execute(stmt)
    sessions = res.scalars().all()

    overall = []
    section_map: Dict[str, List[Dict[str, Any]]] = {}

    for s in sessions:
        asm = s.assessment
        if not asm:
            continue

        q_dict = {q.id: q for q in asm.questions}
        eval_dict = {r.submission_id: r for r in s.results}

        total_score = sum(r.score_earned for r in s.results)
        max_marks = sum(q.marks for q in asm.questions) or 100.0
        pct = round((total_score / max_marks * 100), 1) if max_marks > 0 else 0.0

        time_taken = 0
        if s.finished_at and s.started_at:
            time_taken = int((s.finished_at - s.started_at).total_seconds())

        # Section scores breakdown
        s_sections: Dict[str, float] = {}
        for sub in s.submissions:
            q = q_dict.get(sub.question_id)
            sec = q.section if q else "General"
            ev = eval_dict.get(sub.id)
            earned = ev.score_earned if ev else 0.0
            s_sections[sec] = s_sections.get(sec, 0.0) + earned

        for sec_name, earned in s_sections.items():
            if sec_name not in section_map:
                section_map[sec_name] = []
            section_map[sec_name].append({
                "candidate_name": s.candidate.full_name if s.candidate else "Unknown",
                "candidate_email": s.candidate.email if s.candidate else "Unknown",
                "score": round(earned, 2)
            })

        overall.append({
            "session_id": s.id,
            "candidate_name": s.candidate.full_name if s.candidate else "Unknown",
            "candidate_email": s.candidate.email if s.candidate else "Unknown",
            "score": round(total_score, 2),
            "max_marks": max_marks,
            "percentage": pct,
            "time_taken_seconds": time_taken,
            "focus_loss_count": s.focus_loss_count,
            "completed_at": s.finished_at or s.expires_at
        })

    # Sort overall by score desc, time taken asc, focus loss asc
    overall.sort(key=lambda x: (x["score"], -x["time_taken_seconds"], -x["focus_loss_count"]), reverse=True)
    for idx, item in enumerate(overall, start=1):
        item["rank"] = idx

    # Sort section rankings
    section_rankings = {}
    for sec_name, items in section_map.items():
        items.sort(key=lambda x: x["score"], reverse=True)
        for idx, item in enumerate(items, start=1):
            item["rank"] = idx
        section_rankings[sec_name] = items

    return {
        "overall_ranking": overall,
        "section_rankings": section_rankings
    }

# ==================================================
# QUESTION ANALYTICS
# ==================================================

@router.get("/analytics/questions", response_model=List[QuestionAnalyticsItemOut])
async def get_question_analytics(
    assessment_id: Optional[str] = Query(None),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Calculates per-question attempts, success rates, and difficulty classifications."""
    stmt = select(Question).options(selectinload(Question.assessment))
    if assessment_id:
        stmt = stmt.where(Question.assessment_id == assessment_id)

    res = await db.execute(stmt)
    questions = res.scalars().all()

    out = []
    for q in questions:
        # Submissions for this question
        subs_res = await db.execute(select(Submission).where(Submission.question_id == q.id))
        subs = subs_res.scalars().all()
        attempts = len(subs)

        correct = 0
        incorrect = 0
        skipped = 0

        for sub in subs:
            if not sub.selected_option_id and not sub.text_response and not sub.code_response:
                skipped += 1
                continue

            ev_res = await db.execute(select(EvaluationResult).where(EvaluationResult.submission_id == sub.id))
            ev = ev_res.scalar_one_or_none()
            if ev and ev.is_correct:
                correct += 1
            else:
                incorrect += 1

        success_rate = round((correct / attempts * 100), 1) if attempts > 0 else 0.0

        if success_rate >= 80.0:
            classification = "Too Easy"
        elif success_rate <= 35.0 and attempts >= 3:
            classification = "Too Difficult"
        else:
            classification = "Good"

        out.append(
            QuestionAnalyticsItemOut(
                question_id=q.id,
                question_code=q.question_code or f"Q{q.display_order:03d}",
                section=q.section or "General",
                question_type=q.question_type.value,
                question_text=q.question_text[:100],
                difficulty=q.difficulty or "Medium",
                marks=q.marks,
                total_attempts=attempts,
                correct_count=correct,
                incorrect_count=incorrect,
                skipped_count=skipped,
                success_rate=success_rate,
                average_time_seconds=95,
                difficulty_classification=classification
            )
        )
    return out

# ==================================================
# INTEGRITY DASHBOARD & AUDIT LOGGING
# ==================================================

@router.get("/integrity/events", response_model=List[IntegrityEventOut])
async def list_integrity_events(
    risk_level: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Retrieves proctoring and integrity incident events."""
    stmt = (
        select(IntegrityEvent)
        .options(
            selectinload(IntegrityEvent.candidate),
            selectinload(IntegrityEvent.session).selectinload(AssessmentSession.assessment)
        )
        .order_by(IntegrityEvent.created_at.desc())
    )

    if risk_level:
        stmt = stmt.where(IntegrityEvent.risk_level == risk_level.upper())
    if status_filter:
        stmt = stmt.where(IntegrityEvent.status == status_filter.upper())

    res = await db.execute(stmt)
    events = res.scalars().all()

    out = []
    for ev in events:
        out.append(
            IntegrityEventOut(
                id=ev.id,
                candidate_id=ev.candidate_id,
                candidate_name=ev.candidate.full_name if ev.candidate else "Unknown Candidate",
                candidate_email=ev.candidate.email if ev.candidate else "unknown",
                assessment_id=ev.assessment_id,
                assessment_title=ev.session.assessment.title if ev.session and ev.session.assessment else "Assessment",
                session_id=ev.session_id,
                event_type=ev.event_type,
                risk_level=ev.risk_level,
                details=ev.details,
                status=ev.status,
                created_at=ev.created_at
            )
        )
    return out

@router.post("/integrity/events/{event_id}/action")
async def handle_integrity_action(
    event_id: str,
    payload: IntegrityActionRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Executes admin integrity action: REVIEWED, DISMISSED, DISQUALIFY."""
    stmt = select(IntegrityEvent).where(IntegrityEvent.id == event_id)
    res = await db.execute(stmt)
    ev = res.scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Integrity event not found.")

    act = payload.action.upper().strip()
    if act not in ["REVIEWED", "DISMISSED", "DISQUALIFIED"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Action must be REVIEWED, DISMISSED, or DISQUALIFIED.")

    ev.status = act

    # If disqualified, also update candidate status
    if act == "DISQUALIFIED" and ev.candidate_id:
        cand_stmt = select(Candidate).where(Candidate.id == ev.candidate_id)
        cand_res = await db.execute(cand_stmt)
        cand = cand_res.scalar_one_or_none()
        if cand:
            cand.status = "DISQUALIFIED"

    await db.commit()
    await log_audit_event(
        db,
        "INTEGRITY_ACTION_TAKEN",
        f"integrity_event:{event_id}",
        actor_id=admin.id,
        actor_role=admin.role.value,
        metadata={"action": act, "candidate_id": ev.candidate_id}
    )
    return {"message": f"Event marked as {act}."}

# ==================================================
# REPORTS EXPORT
# ==================================================

@router.get("/reports/{report_type}", response_model=ReportSummaryOut)
async def generate_report(
    report_type: str,
    assessment_id: Optional[str] = Query(None),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Generates structured report datasets: assessment, ranking, questions, sections, completion, integrity."""
    rtype = report_type.lower().strip()
    now = datetime.now(timezone.utc)

    if rtype == "assessment":
        asms_res = await db.execute(select(Assessment).options(selectinload(Assessment.questions), selectinload(Assessment.sessions)))
        data = [
            {
                "Assessment": a.title,
                "Role": a.role or "Software Engineering",
                "Duration (min)": a.duration_minutes,
                "Questions": len(a.questions),
                "Passing Marks": a.passing_marks,
                "Total Marks": a.total_marks,
                "Status": a.status,
                "Total Attempts": len(a.sessions)
            } for a in asms_res.scalars().all()
        ]
    elif rtype == "ranking":
        sess_res = await db.execute(
            select(AssessmentSession)
            .options(selectinload(AssessmentSession.candidate), selectinload(AssessmentSession.assessment), selectinload(AssessmentSession.results))
            .where(AssessmentSession.status == SessionStatus.SUBMITTED)
        )
        data = []
        for s in sess_res.scalars().all():
            score = sum(r.score_earned for r in s.results)
            max_m = s.assessment.total_marks if s.assessment else 100.0
            data.append({
                "Candidate": s.candidate.full_name if s.candidate else "Unknown",
                "Email": s.candidate.email if s.candidate else "Unknown",
                "Assessment": s.assessment.title if s.assessment else "Unknown",
                "Score": round(score, 2),
                "Max Marks": max_m,
                "Percentage": round((score / max_m * 100), 1) if max_m > 0 else 0.0,
                "Status": "PASSED" if score >= (s.assessment.passing_marks if s.assessment else 60.0) else "FAILED",
                "Completed At": s.finished_at.isoformat() if s.finished_at else ""
            })
        data.sort(key=lambda x: x["Score"], reverse=True)
        for idx, row in enumerate(data, start=1):
            row["Rank"] = idx
    elif rtype == "integrity":
        ie_res = await db.execute(select(IntegrityEvent).options(selectinload(IntegrityEvent.candidate)))
        data = [
            {
                "Candidate": ie.candidate.full_name if ie.candidate else "Unknown",
                "Email": ie.candidate.email if ie.candidate else "Unknown",
                "Event": ie.event_type,
                "Risk Level": ie.risk_level,
                "Status": ie.status,
                "Timestamp": ie.created_at.isoformat() if ie.created_at else ""
            } for ie in ie_res.scalars().all()
        ]
    else:
        # Default generic report
        data = [{"message": f"Report generated for {rtype}"}]

    return ReportSummaryOut(
        report_type=rtype,
        generated_at=now,
        total_records=len(data),
        data=data
    )

@router.get("/users")
async def list_admin_users(
    admin: User = Depends(require_roles(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db)
):
    """Lists administrative users for RBAC settings (Admin only)."""
    stmt = select(User).where(User.role.in_([UserRole.ADMIN, UserRole.RECRUITER, UserRole.EVALUATOR]))
    res = await db.execute(stmt)
    users = res.scalars().all()
    return [
        {
            "id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role.value,
            "is_active": u.is_active,
            "created_at": u.created_at
        } for u in users
    ]


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
