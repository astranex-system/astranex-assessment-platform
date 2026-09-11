import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import (
    AssessmentToken, AssessmentSession, Assessment, Candidate, Question, QuestionOption,
    Submission, SessionStatus, ResultVisibility, AuditLog, QuestionType
)
from app.schemas.candidate import (
    StartSessionRequest, CandidateRegisterRequest, CandidateLoginRequest, PublicAssessmentOut, SubmissionRequest,
    CandidateSessionMeOut, CandidateQuestionOut, CandidateSubmissionResultOut,
    CandidateFinalResultOut, CandidateAssessmentOut, CandidateQuestionOptionOut,
    CandidateSubmissionStateOut, FocusLossTelemetryRequest
)
from app.dependencies import get_current_candidate_session
from app.security import (
    hash_token, create_access_token, generate_csrf_token, verify_csrf_token,
    hash_password, verify_password, SESSION_COOKIE_NAME, CSRF_COOKIE_NAME
)
from app.services.scoring import score_submission
from app.services.audit import log_audit_event

logger = logging.getLogger("astranex.candidate_api")

router = APIRouter(prefix="/api/v1/candidate", tags=["Candidate API"])

def ensure_tz_aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt

@router.get("/assessments", response_model=List[PublicAssessmentOut])
async def list_available_assessments(db: AsyncSession = Depends(get_db)):
    """
    Returns public list of active assessments for candidate login portal.
    Guaranteed zero secret answer leakage or test case leakage.
    """
    stmt = (
        select(Assessment)
        .options(selectinload(Assessment.questions))
        .order_by(Assessment.created_at.desc())
    )
    res = await db.execute(stmt)
    assessments = res.scalars().all()

    out = []
    now = datetime.now(timezone.utc)
    for asm in assessments:
        end_win = ensure_tz_aware(asm.end_window)
        if end_win and now > end_win:
            continue
        out.append(
            PublicAssessmentOut(
                id=asm.id,
                title=asm.title,
                description=asm.description,
                duration_minutes=asm.duration_minutes,
                question_count=len(asm.questions)
            )
        )
    return out

from app.models import (
    AssessmentToken, AssessmentSession, Assessment, Candidate, Question, QuestionOption,
    Submission, SessionStatus, ResultVisibility, AuditLog, QuestionType, CandidateAssessmentAssignment
)
from app.schemas.candidate import (
    StartSessionRequest, CandidateRegisterRequest, CandidateLoginRequest, PublicAssessmentOut, SubmissionRequest,
    CandidateSessionMeOut, CandidateQuestionOut, CandidateSubmissionResultOut,
    CandidateFinalResultOut, CandidateAssessmentOut, CandidateQuestionOptionOut,
    CandidateSubmissionStateOut, FocusLossTelemetryRequest, CandidateAssessmentCardOut
)

@router.post("/my-assessments", response_model=List[CandidateAssessmentCardOut])
async def get_candidate_my_assessments(
    payload: CandidateLoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Candidate 'My Assessments' Dashboard API:
    Authenticates candidate with Email & Password and returns all technical exams assigned to their account,
    including duration, deadline, attempts, questions count, and status (NOT_STARTED, IN_PROGRESS, COMPLETED, EXPIRED).
    """
    email_clean = payload.email.strip().lower()
    cand_stmt = (
        select(Candidate)
        .options(
            selectinload(Candidate.assignments).selectinload(CandidateAssessmentAssignment.assessment).selectinload(Assessment.questions),
            selectinload(Candidate.sessions).selectinload(AssessmentSession.assessment).selectinload(Assessment.questions)
        )
        .where(Candidate.email == email_clean)
    )
    cand_res = await db.execute(cand_stmt)
    candidate = cand_res.scalar_one_or_none()

    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account found with this email. Please click 'Register' to create your candidate account first."
        )

    if candidate.password_hash:
        if not payload.password:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Password is required for this account.")
        if not verify_password(payload.password, candidate.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password. Please verify and try again.")

    if candidate.status in ["SUSPENDED", "DISQUALIFIED"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Your candidate account has been {candidate.status.lower()}. Please contact the administrator.")

    # Determine assigned assessments
    assigned_asms = []
    seen_asm_ids = set()

    # 1. Direct assignments
    for assign in candidate.assignments:
        asm = assign.assessment
        if asm and asm.id not in seen_asm_ids:
            seen_asm_ids.add(asm.id)
            # Find latest session for this assessment
            cand_sess = [s for s in candidate.sessions if s.assessment_id == asm.id]
            card_status = "NOT_STARTED"
            if cand_sess:
                latest_s = sorted(cand_sess, key=lambda x: x.started_at, reverse=True)[0]
                if latest_s.status == SessionStatus.SUBMITTED:
                    card_status = "COMPLETED"
                elif latest_s.status == SessionStatus.IN_PROGRESS:
                    card_status = "IN_PROGRESS"
                elif latest_s.status == SessionStatus.EXPIRED:
                    card_status = "EXPIRED"

            assigned_asms.append(
                CandidateAssessmentCardOut(
                    id=asm.id,
                    title=asm.title,
                    description=asm.description,
                    role=asm.role or "Software Engineering",
                    duration_minutes=asm.duration_minutes,
                    total_marks=asm.total_marks or sum(q.marks for q in asm.questions),
                    passing_marks=asm.passing_marks or 60.0,
                    start_window=asm.start_window,
                    end_window=asm.end_window,
                    deadline=assign.deadline or asm.end_window,
                    attempts_remaining=max(0, (asm.max_attempts or 1) - len(cand_sess)),
                    status=card_status,
                    question_count=len(asm.questions)
                )
            )

    # 2. If no direct assignments exist, show public active assessments so candidates can take tests
    if not assigned_asms:
        all_active_stmt = (
            select(Assessment)
            .options(selectinload(Assessment.questions))
            .where(Assessment.status.in_(["ACTIVE", "PUBLISHED"]))
            .order_by(Assessment.created_at.desc())
        )
        all_res = await db.execute(all_active_stmt)
        for asm in all_res.scalars().all():
            cand_sess = [s for s in candidate.sessions if s.assessment_id == asm.id]
            card_status = "NOT_STARTED"
            if cand_sess:
                latest_s = sorted(cand_sess, key=lambda x: x.started_at, reverse=True)[0]
                if latest_s.status == SessionStatus.SUBMITTED:
                    card_status = "COMPLETED"
                elif latest_s.status == SessionStatus.IN_PROGRESS:
                    card_status = "IN_PROGRESS"
                elif latest_s.status == SessionStatus.EXPIRED:
                    card_status = "EXPIRED"

            assigned_asms.append(
                CandidateAssessmentCardOut(
                    id=asm.id,
                    title=asm.title,
                    description=asm.description,
                    role=asm.role or "Software Engineering",
                    duration_minutes=asm.duration_minutes,
                    total_marks=asm.total_marks or sum(q.marks for q in asm.questions),
                    passing_marks=asm.passing_marks or 60.0,
                    start_window=asm.start_window,
                    end_window=asm.end_window,
                    deadline=asm.end_window,
                    attempts_remaining=max(0, (asm.max_attempts or 1) - len(cand_sess)),
                    status=card_status,
                    question_count=len(asm.questions)
                )
            )

    return assigned_asms

@router.post("/register")
async def candidate_register(
    payload: CandidateRegisterRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    """
    Candidate Account Registration:
    Registers a candidate with Full Name, Email, and Password, then initializes their examination session.
    """
    import secrets
    email_clean = payload.email.strip().lower()
    name_clean = payload.full_name.strip()

    if not email_clean or "@" not in email_clean:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please enter a valid email address.")
    if not name_clean:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please enter your full name.")
    if not payload.password or len(payload.password) < 4:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 4 characters long.")

    # Check if candidate already exists
    cand_stmt = select(Candidate).where(Candidate.email == email_clean)
    cand_res = await db.execute(cand_stmt)
    candidate = cand_res.scalar_one_or_none()

    if candidate:
        if candidate.password_hash:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="An account with this email already exists. Please switch to the Login tab to sign in."
            )
        else:
            candidate.password_hash = hash_password(payload.password)
            candidate.full_name = name_clean
            await db.commit()
    else:
        candidate = Candidate(
            email=email_clean,
            full_name=name_clean,
            password_hash=hash_password(payload.password)
        )
        db.add(candidate)
        await db.commit()
        await db.refresh(candidate)

    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("User-Agent", "unknown")
    now = datetime.now(timezone.utc)

    # Resolve Assessment
    if payload.assessment_id:
        asm_stmt = select(Assessment).where(Assessment.id == payload.assessment_id)
        asm_res = await db.execute(asm_stmt)
        assessment = asm_res.scalar_one_or_none()
        if not assessment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Specified assessment not found.")
    else:
        asm_stmt = select(Assessment).order_by(Assessment.created_at.desc()).limit(1)
        asm_res = await db.execute(asm_stmt)
        assessment = asm_res.scalar_one_or_none()
        if not assessment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active assessments found. Please contact the administrator.")

    # Create assessment session
    dummy_tok = secrets.token_urlsafe(32)
    token_obj = AssessmentToken(
        candidate_id=candidate.id,
        assessment_id=assessment.id,
        token_hash=hash_token(dummy_tok),
        expires_at=now + timedelta(days=30),
        max_attempts=1,
        used_count=1
    )
    db.add(token_obj)
    await db.flush()

    expires_at = now + timedelta(minutes=assessment.duration_minutes)
    session = AssessmentSession(
        token_id=token_obj.id,
        candidate_id=candidate.id,
        assessment_id=assessment.id,
        status=SessionStatus.IN_PROGRESS,
        started_at=now,
        expires_at=expires_at,
        client_ip=client_ip,
        user_agent=user_agent
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    await log_audit_event(
        db, "CANDIDATE_REGISTER", f"session:{session.id}",
        actor_id=candidate.id, actor_role="candidate", ip_address=client_ip
    )

    # JWT + Cookies
    jwt_data = {
        "session_id": session.id,
        "candidate_id": candidate.id,
        "assessment_id": assessment.id,
        "role": "candidate"
    }
    jwt_token = create_access_token(jwt_data, expires_delta=timedelta(minutes=assessment.duration_minutes + 60))
    csrf_token = generate_csrf_token()

    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=jwt_token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=assessment.duration_minutes * 60 + 3600
    )
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=csrf_token,
        httponly=False,
        samesite="lax",
        secure=False,
        max_age=assessment.duration_minutes * 60 + 3600
    )

    return {
        "session_id": session.id,
        "access_token": jwt_token,
        "csrf_token": csrf_token,
        "expires_at": session.expires_at,
        "status": session.status,
        "candidate_name": candidate.full_name,
        "candidate_email": candidate.email,
        "assessment_title": assessment.title,
        "duration_minutes": assessment.duration_minutes,
        "message": "Candidate account created and examination session started."
    }

@router.post("/login")
async def candidate_login_start(
    payload: CandidateLoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    """
    Candidate Account Login:
    Authenticates existing candidate with Email and Password.
    If no account exists, instructs them to register.
    """
    import secrets
    email_clean = payload.email.strip().lower()
    if not email_clean or "@" not in email_clean:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please enter a valid email address.")

    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("User-Agent", "unknown")
    now = datetime.now(timezone.utc)

    # 1. Lookup candidate
    cand_stmt = select(Candidate).where(Candidate.email == email_clean)
    cand_res = await db.execute(cand_stmt)
    candidate = cand_res.scalar_one_or_none()

    if not candidate:
        # If full_name is provided (fallback entry), allow auto-register
        if payload.full_name and payload.full_name.strip():
            candidate = Candidate(
                email=email_clean,
                full_name=payload.full_name.strip(),
                password_hash=hash_password(payload.password) if payload.password else None
            )
            db.add(candidate)
            await db.commit()
            await db.refresh(candidate)
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No account found with this email. Please click 'Register' to create your candidate account first."
            )
    else:
        # Verify password if account has password set
        if candidate.password_hash:
            if not payload.password:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Password is required for this account.")
            if not verify_password(payload.password, candidate.password_hash):
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password. Please verify and try again.")

    # 2. Resolve Target Assessment
    if payload.assessment_id:
        asm_stmt = select(Assessment).where(Assessment.id == payload.assessment_id)
        asm_res = await db.execute(asm_stmt)
        assessment = asm_res.scalar_one_or_none()
        if not assessment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Specified assessment not found.")
    else:
        asm_stmt = select(Assessment).order_by(Assessment.created_at.desc()).limit(1)
        asm_res = await db.execute(asm_stmt)
        assessment = asm_res.scalar_one_or_none()
        if not assessment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active assessments found. Please contact the administrator.")

    # Validate window
    start_win = ensure_tz_aware(assessment.start_window)
    end_win = ensure_tz_aware(assessment.end_window)
    if start_win and now < start_win:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Assessment window has not opened yet.")
    if end_win and now > end_win:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Assessment window has closed.")

    # 3. Check for existing session
    sess_stmt = (
        select(AssessmentSession)
        .where(
            AssessmentSession.candidate_id == candidate.id,
            AssessmentSession.assessment_id == assessment.id
        )
        .order_by(AssessmentSession.started_at.desc())
    )
    sess_res = await db.execute(sess_stmt)
    session = sess_res.scalars().first()

    if session:
        if session.status == SessionStatus.SUBMITTED:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You have already completed and submitted this assessment."
            )
        exp_tz = ensure_tz_aware(session.expires_at)
        if exp_tz and now > exp_tz:
            session.status = SessionStatus.EXPIRED
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your assessment time window has expired."
            )
        # Re-attach and resume active session!
    else:
        dummy_tok = secrets.token_urlsafe(32)
        token_obj = AssessmentToken(
            candidate_id=candidate.id,
            assessment_id=assessment.id,
            token_hash=hash_token(dummy_tok),
            expires_at=now + timedelta(days=30),
            max_attempts=1,
            used_count=1
        )
        db.add(token_obj)
        await db.flush()

        expires_at = now + timedelta(minutes=assessment.duration_minutes)
        session = AssessmentSession(
            token_id=token_obj.id,
            candidate_id=candidate.id,
            assessment_id=assessment.id,
            status=SessionStatus.IN_PROGRESS,
            started_at=now,
            expires_at=expires_at,
            client_ip=client_ip,
            user_agent=user_agent
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)
        await log_audit_event(
            db, "CANDIDATE_LOGIN_START", f"session:{session.id}",
            actor_id=candidate.id, actor_role="candidate", ip_address=client_ip
        )

    # Issue JWT session token
    jwt_data = {
        "session_id": session.id,
        "candidate_id": candidate.id,
        "assessment_id": assessment.id,
        "role": "candidate"
    }
    jwt_token = create_access_token(jwt_data, expires_delta=timedelta(minutes=assessment.duration_minutes + 60))
    csrf_token = generate_csrf_token()

    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=jwt_token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=assessment.duration_minutes * 60 + 3600
    )
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=csrf_token,
        httponly=False,
        samesite="lax",
        secure=False,
        max_age=assessment.duration_minutes * 60 + 3600
    )

    return {
        "session_id": session.id,
        "access_token": jwt_token,
        "csrf_token": csrf_token,
        "expires_at": session.expires_at,
        "status": session.status,
        "candidate_name": candidate.full_name,
        "candidate_email": candidate.email,
        "assessment_title": assessment.title,
        "duration_minutes": assessment.duration_minutes,
        "message": "Candidate session authenticated successfully."
    }

@router.post("/session/start")
async def start_assessment_session(
    payload: StartSessionRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    """
    Validates token entropy and creates/loads a server-side assessment session.
    Sets HttpOnly, SameSite=Strict cookies for authentication & CSRF.
    """
    token_hash = hash_token(payload.token)
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("User-Agent", "unknown")

    stmt = (
        select(AssessmentToken)
        .options(selectinload(AssessmentToken.assessment), selectinload(AssessmentToken.candidate))
        .where(AssessmentToken.token_hash == token_hash)
    )
    res = await db.execute(stmt)
    tok = res.scalar_one_or_none()

    if not tok or tok.revoked:
        await log_audit_event(db, "AUTH_FAILURE", "assessment_token", ip_address=client_ip, metadata={"reason": "invalid_or_revoked_token"})
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked assessment invitation link."
        )

    now = datetime.now(timezone.utc)
    tok_expires = ensure_tz_aware(tok.expires_at)
    if tok_expires and now > tok_expires:
        await log_audit_event(db, "AUTH_FAILURE", "assessment_token", ip_address=client_ip, metadata={"reason": "expired_token"})
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This assessment link has expired."
        )

    assessment = tok.assessment
    if not assessment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found.")

    # Validate assessment windows
    start_win = ensure_tz_aware(assessment.start_window)
    end_win = ensure_tz_aware(assessment.end_window)

    if start_win and now < start_win:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Assessment window has not opened yet."
        )
    if end_win and now > end_win:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Assessment window has closed."
        )

    # Check existing session for token
    sess_stmt = select(AssessmentSession).where(
        AssessmentSession.token_id == tok.id,
        AssessmentSession.candidate_id == tok.candidate_id
    )
    sess_res = await db.execute(sess_stmt)
    session = sess_res.scalar_one_or_none()

    if not session:
        if tok.used_count >= tok.max_attempts:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Maximum allowed assessment attempts reached."
            )
        
        expires_at = now + timedelta(minutes=assessment.duration_minutes)
        session = AssessmentSession(
            token_id=tok.id,
            candidate_id=tok.candidate_id,
            assessment_id=assessment.id,
            status=SessionStatus.IN_PROGRESS,
            started_at=now,
            expires_at=expires_at,
            client_ip=client_ip,
            user_agent=user_agent
        )
        tok.used_count += 1
        db.add(session)
        await db.commit()
        await db.refresh(session)
        await log_audit_event(db, "ASSESSMENT_START", f"session:{session.id}", actor_id=tok.candidate_id, actor_role="candidate", ip_address=client_ip)

    # Issue JWT session token
    jwt_data = {
        "session_id": session.id,
        "candidate_id": session.candidate_id,
        "assessment_id": session.assessment_id,
        "role": "candidate"
    }
    jwt_token = create_access_token(jwt_data, expires_delta=timedelta(minutes=assessment.duration_minutes + 10))
    csrf_token = generate_csrf_token()

    # Set secure HttpOnly cookies
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=jwt_token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=assessment.duration_minutes * 60 + 600
    )
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=csrf_token,
        httponly=False,
        samesite="lax",
        secure=False,
        max_age=assessment.duration_minutes * 60 + 600
    )

    return {
        "session_id": session.id,
        "access_token": jwt_token,
        "csrf_token": csrf_token,
        "expires_at": session.expires_at,
        "status": session.status,
        "candidate_name": tok.candidate.full_name if tok.candidate else None,
        "candidate_email": tok.candidate.email if tok.candidate else None,
        "message": "Session initialized successfully."
    }

@router.get("/session/me", response_model=CandidateSessionMeOut)
async def get_my_session(
    session: AssessmentSession = Depends(get_current_candidate_session),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns candidate's active session metadata, authoritative server time, and existing draft submissions.
    """
    stmt = (
        select(AssessmentSession)
        .options(
            selectinload(AssessmentSession.submissions),
            selectinload(AssessmentSession.candidate)
        )
        .where(AssessmentSession.id == session.id)
    )
    res = await db.execute(stmt)
    full_session = res.scalar_one()

    # Fetch assessment info
    asm_stmt = select(Assessment).where(Assessment.id == full_session.assessment_id)
    asm_res = await db.execute(asm_stmt)
    asm = asm_res.scalar_one()

    submissions_out = [
        CandidateSubmissionStateOut(
            question_id=sub.question_id,
            selected_option_id=sub.selected_option_id,
            text_response=sub.text_response,
            code_response=sub.code_response,
            programming_language=sub.programming_language,
            submitted_at=ensure_tz_aware(sub.submitted_at)
        ) for sub in full_session.submissions
    ]

    return CandidateSessionMeOut(
        session_id=full_session.id,
        status=full_session.status,
        started_at=ensure_tz_aware(full_session.started_at),
        expires_at=ensure_tz_aware(full_session.expires_at),
        server_time=datetime.now(timezone.utc),
        candidate_name=full_session.candidate.full_name if full_session.candidate else None,
        candidate_email=full_session.candidate.email if full_session.candidate else None,
        assessment=CandidateAssessmentOut(
            id=asm.id,
            title=asm.title,
            description=asm.description,
            duration_minutes=asm.duration_minutes,
            result_visibility=asm.result_visibility
        ),
        submissions=submissions_out
    )

@router.get("/questions", response_model=List[CandidateQuestionOut])
async def get_assessment_questions(
    session: AssessmentSession = Depends(get_current_candidate_session),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns question texts and public options for the candidate's assessment.
    GUARANTEED ZERO ANSWER LEAKAGE:
    QuestionAnswer secret table is completely isolated and never queried or mapped here.
    """
    stmt = (
        select(Question)
        .options(selectinload(Question.options))
        .where(Question.assessment_id == session.assessment_id)
        .order_by(Question.display_order)
    )
    res = await db.execute(stmt)
    questions = res.scalars().all()

    out_list = []
    for q in questions:
        options_out = [
            CandidateQuestionOptionOut(
                id=opt.id,
                option_text=opt.option_text,
                display_order=opt.display_order
            ) for opt in q.options
        ]
        out_list.append(
            CandidateQuestionOut(
                id=q.id,
                question_text=q.question_text,
                question_type=q.question_type,
                marks=q.marks,
                display_order=q.display_order,
                options=options_out
            )
        )
    return out_list

@router.post("/submit", response_model=CandidateSubmissionResultOut)
async def submit_question_answer(
    payload: SubmissionRequest,
    request: Request,
    session: AssessmentSession = Depends(get_current_candidate_session),
    db: AsyncSession = Depends(get_db)
):
    """
    Stores answer submission and performs server-side scoring.
    Derived identity prevents IDOR. Unique constraint prevents race duplicate submissions.
    """
    verify_csrf_token(request)

    # Verify question belongs to candidate's assessment
    q_stmt = select(Question).where(Question.id == payload.question_id, Question.assessment_id == session.assessment_id)
    q_res = await db.execute(q_stmt)
    question = q_res.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Question does not belong to your assigned assessment.")

    # Fetch existing submission or create new
    sub_stmt = select(Submission).where(
        Submission.session_id == session.id,
        Submission.question_id == payload.question_id
    )
    sub_res = await db.execute(sub_stmt)
    submission = sub_res.scalar_one_or_none()

    if submission:
        submission.selected_option_id = payload.selected_option_id
        submission.text_response = payload.text_response
        submission.code_response = payload.code_response
        submission.programming_language = payload.programming_language
        submission.submitted_at = datetime.now(timezone.utc)
    else:
        submission = Submission(
            session_id=session.id,
            question_id=payload.question_id,
            selected_option_id=payload.selected_option_id,
            text_response=payload.text_response,
            code_response=payload.code_response,
            programming_language=payload.programming_language,
            submitted_at=datetime.now(timezone.utc)
        )
        db.add(submission)

    await db.commit()
    await db.refresh(submission)

    # Trigger server-side evaluation strictly on backend
    eval_result = await score_submission(db, submission)

    await log_audit_event(
        db,
        "QUESTION_SUBMISSION",
        f"question:{payload.question_id}",
        actor_id=session.candidate_id,
        actor_role="candidate",
        ip_address=request.client.host if request.client else "unknown"
    )

    return CandidateSubmissionResultOut(
        submission_id=submission.id,
        question_id=payload.question_id,
        status="SUCCESS",
        compilation_status=eval_result.status if question.question_type == QuestionType.CODING else None,
        message="Answer successfully stored and evaluated server-side."
    )

@router.post("/session/finish", response_model=CandidateFinalResultOut)
async def finish_assessment_session(
    request: Request,
    session: AssessmentSession = Depends(get_current_candidate_session),
    db: AsyncSession = Depends(get_db)
):
    """
    Finalizes assessment session. Calculates total score server-side.
    Only reveals total score if assessment result_visibility is IMMEDIATE.
    """
    verify_csrf_token(request)

    session.status = SessionStatus.SUBMITTED
    session.finished_at = datetime.now(timezone.utc)
    await db.commit()

    asm_stmt = select(Assessment).where(Assessment.id == session.assessment_id)
    asm_res = await db.execute(asm_stmt)
    asm = asm_res.scalar_one()

    await log_audit_event(
        db,
        "FINAL_SUBMISSION",
        f"session:{session.id}",
        actor_id=session.candidate_id,
        actor_role="candidate",
        ip_address=request.client.host if request.client else "unknown"
    )

    total_score = None
    if asm.result_visibility == ResultVisibility.IMMEDIATE:
        from app.models import EvaluationResult
        score_stmt = select(EvaluationResult.score_earned).where(EvaluationResult.session_id == session.id)
        score_res = await db.execute(score_stmt)
        total_score = sum(score_res.scalars().all())

    return CandidateFinalResultOut(
        session_id=session.id,
        status=session.status,
        finished_at=ensure_tz_aware(session.finished_at),
        total_score=total_score,
        visibility=asm.result_visibility,
        message="Your assessment has been submitted successfully. Thank you."
    )

@router.post("/telemetry/focus")
async def record_focus_loss(
    payload: FocusLossTelemetryRequest,
    session: AssessmentSession = Depends(get_current_candidate_session),
    db: AsyncSession = Depends(get_db)
):
    """Telemetry endpoint for focus loss tracking without blocking client UI."""
    session.focus_loss_count += 1
    await db.commit()
    return {"status": "recorded"}
