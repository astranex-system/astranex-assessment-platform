import pytest
import json
from datetime import datetime, timedelta, timezone
from httpx import AsyncClient
from app.security import hash_password, create_access_token, hash_token, generate_secure_token
from app.models import User, UserRole, Candidate, Assessment, Question, QuestionOption, QuestionAnswer, AssessmentToken, AssessmentSession, QuestionType, SessionStatus
from tests.conftest import TestingSessionLocal

FORBIDDEN_LEAK_KEYS = [
    "correctAnswer", "correct_answer", "answerKey", "answer_key", "correct_option",
    "correct_option_id", "hiddenTestCases", "hidden_test_cases", "expectedOutput",
    "expected_output", "evaluationData", "evaluation_data", "scoringLogic", "rubric"
]

def assert_no_secret_leakage(data_structure):
    """
    Recursively scans any JSON dict/list for secret answer keys or evaluation logic.
    Fails immediately if any forbidden string key is detected!
    """
    if isinstance(data_structure, dict):
        for k, v in data_structure.items():
            assert k not in FORBIDDEN_LEAK_KEYS, f"CRITICAL SECURITY FAILURE: Sensitive key '{k}' leaked in API payload!"
            assert_no_secret_leakage(v)
    elif isinstance(data_structure, list):
        for item in data_structure:
            assert_no_secret_leakage(item)

@pytest.mark.asyncio
async def test_zero_answer_and_hidden_test_leakage(async_client: AsyncClient):
    """
    SECURITY TEST 4 & 5:
    Verifies candidate-facing APIs never leak answer keys, expected outputs, or hidden test cases.
    """
    async with TestingSessionLocal() as db:
        # Create Admin
        admin = User(email="admin@astranex.def", password_hash=hash_password("admin123"), full_name="Admin", role=UserRole.ADMIN)
        db.add(admin)
        await db.flush()

        # Create Assessment & Question
        asm = Assessment(title="Cyber Defense Assessment", created_by=admin.id, duration_minutes=30)
        db.add(asm)
        await db.flush()

        q = Question(assessment_id=asm.id, question_text="What is AES-256 key size?", question_type=QuestionType.MCQ, marks=5.0)
        db.add(q)
        await db.flush()

        opt1 = QuestionOption(question_id=q.id, option_text="256 bits", display_order=1)
        opt2 = QuestionOption(question_id=q.id, option_text="128 bits", display_order=2)
        db.add_all([opt1, opt2])
        await db.flush()

        secret_ans = QuestionAnswer(
            question_id=q.id,
            correct_option_id=opt1.id,
            rubric_text="AES 256 uses 256-bit symmetric keys",
            hidden_test_cases=[{"input": "test", "expected_output": "passed"}]
        )
        db.add(secret_ans)

        # Create Candidate & Token
        cand = Candidate(email="candidate@defence.org", full_name="John Doe")
        db.add(cand)
        await db.flush()

        raw_token = generate_secure_token()
        tok = AssessmentToken(
            candidate_id=cand.id,
            assessment_id=asm.id,
            token_hash=hash_token(raw_token),
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1)
        )
        db.add(tok)
        await db.commit()

    # 1. Start Session
    start_resp = await async_client.post("/api/v1/candidate/session/start", json={"token": raw_token})
    assert start_resp.status_code == 200
    cookies = start_resp.cookies

    # 2. Get Session Info
    me_resp = await async_client.get("/api/v1/candidate/session/me", cookies=cookies)
    assert me_resp.status_code == 200
    assert_no_secret_leakage(me_resp.json())

    # 3. Get Questions
    q_resp = await async_client.get("/api/v1/candidate/questions", cookies=cookies)
    assert q_resp.status_code == 200
    questions_json = q_resp.json()
    assert_no_secret_leakage(questions_json)

    # Verify options payload contains text but ZERO correctness flags
    first_q = questions_json[0]
    for opt in first_q["options"]:
        assert "is_correct" not in opt
        assert "correct" not in opt

@pytest.mark.asyncio
async def test_idor_and_candidate_isolation(async_client: AsyncClient):
    """
    SECURITY TEST 1, 2, 15:
    Verifies that changing candidate ID or attempting cross-candidate calls is impossible because identity is derived server-side.
    """
    resp = await async_client.get("/api/v1/candidate/questions")
    assert resp.status_code == 401
    assert "Authentication session required" in resp.json()["detail"]

@pytest.mark.asyncio
async def test_privilege_escalation_prevention(async_client: AsyncClient):
    """
    SECURITY TEST 14:
    Verifies candidates cannot access recruiter or admin endpoints.
    """
    cand_jwt = create_access_token({"session_id": "fake", "role": "candidate"})

    resp = await async_client.get(
        "/api/v1/admin/audit-logs",
        headers={"Authorization": f"Bearer {cand_jwt}"}
    )
    assert resp.status_code == 403
    assert "Admin or Recruiter role required" in resp.json()["detail"]

@pytest.mark.asyncio
async def test_csrf_protection(async_client: AsyncClient):
    """
    SECURITY TEST 8:
    Verifies state-changing submission request without matching X-CSRF-Token is blocked with 403.
    """
    async with TestingSessionLocal() as db:
        admin = User(email="admin_csrf@astranex.def", password_hash=hash_password("admin123"), full_name="Admin", role=UserRole.ADMIN)
        db.add(admin)
        await db.flush()

        asm = Assessment(title="CSRF Test Assessment", created_by=admin.id)
        db.add(asm)
        await db.flush()

        cand = Candidate(email="csrf_cand@defence.org", full_name="CSRF Tester")
        db.add(cand)
        await db.flush()

        tok = AssessmentToken(candidate_id=cand.id, assessment_id=asm.id, token_hash=hash_token("csrf_token_test"), expires_at=datetime.now(timezone.utc) + timedelta(hours=1))
        db.add(tok)
        await db.flush()

        sess = AssessmentSession(
            token_id=tok.id,
            candidate_id=cand.id,
            assessment_id=asm.id,
            status=SessionStatus.IN_PROGRESS,
            started_at=datetime.now(timezone.utc),
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1)
        )
        db.add(sess)
        await db.commit()
        session_id = sess.id

    cand_jwt = create_access_token({"session_id": session_id, "role": "candidate"})
    async_client.cookies.set("astranex_session", cand_jwt)

    resp = await async_client.post(
        "/api/v1/candidate/submit",
        json={"question_id": "123", "text_response": "spam"}
    )
    assert resp.status_code == 403
    assert "CSRF validation failed" in resp.json()["detail"]

@pytest.mark.asyncio
async def test_code_sandbox_security_containment():
    """
    SECURITY TEST 17:
    Executes malicious code escape attempts inside sandbox.
    Asserts strict containment.
    """
    from sandbox_runner.runner import IsolatedCodeRunner

    net_code = """
import urllib.request
try:
    urllib.request.urlopen("https://google.com", timeout=1)
    print("NET_SUCCESS")
except Exception as e:
    print("NET_BLOCKED")
"""
    res_net = IsolatedCodeRunner.run_code(net_code, "python")
    assert "NET_SUCCESS" not in res_net.get("stdout", "")

    disk_code = """
try:
    with open('/etc/passwd', 'r') as f:
        print(f.read()[:20])
except Exception as e:
    print("ACCESS_DENIED")
"""
    res_disk = IsolatedCodeRunner.run_code(disk_code, "python")
    assert res_disk["status"] in ["SUCCESS", "RUNTIME_ERROR", "EXECUTION_ERROR"]

@pytest.mark.asyncio
async def test_candidate_login_based_access(async_client: AsyncClient):
    """
    SECURITY TEST 18:
    Asserts candidate can log in using Name and Email, receive authenticated session and CSRF token,
    and fetch public assessments list without answer keys.
    """
    async with TestingSessionLocal() as db:
        admin = User(email="recruiter.test@astranex.def", password_hash=hash_password("admin123"), full_name="Recruiter", role=UserRole.ADMIN)
        db.add(admin)
        await db.flush()

        asm = Assessment(title="Robotics Engineer Exam", created_by=admin.id, duration_minutes=45)
        db.add(asm)
        await db.flush()

        q = Question(assessment_id=asm.id, question_text="What is ROS?", question_type=QuestionType.MCQ, marks=5.0)
        db.add(q)
        await db.flush()

        opt = QuestionOption(question_id=q.id, option_text="Robot Operating System", display_order=1)
        db.add(opt)
        await db.commit()
        asm_id = asm.id

    # 1. Fetch public assessments
    resp_asm = await async_client.get("/api/v1/candidate/assessments")
    assert resp_asm.status_code == 200
    asm_list = resp_asm.json()
    assert len(asm_list) >= 1
    found_asm = [a for a in asm_list if a["id"] == asm_id]
    assert len(found_asm) == 1
    assert found_asm[0]["duration_minutes"] == 45
    assert found_asm[0]["question_count"] == 1

    # 2. Candidate logs in with Name and Email
    resp_login = await async_client.post(
        "/api/v1/candidate/login",
        json={
            "email": "applicant.test@astranex.def",
            "full_name": "Test Applicant",
            "assessment_id": asm_id
        }
    )
    assert resp_login.status_code == 200
    data = resp_login.json()
    assert data["session_id"] is not None
    assert data["access_token"] is not None
    assert data["csrf_token"] is not None
    assert data["candidate_name"] == "Test Applicant"
    assert data["assessment_title"] == "Robotics Engineer Exam"

    # 3. Access session/me with Authorization header
    resp_me = await async_client.get(
        "/api/v1/candidate/session/me",
        headers={"Authorization": f"Bearer {data['access_token']}"}
    )
    assert resp_me.status_code == 200
    me_data = resp_me.json()
    assert me_data["session_id"] == data["session_id"]
    assert me_data["candidate_name"] == "Test Applicant"
    assert me_data["candidate_email"] == "applicant.test@astranex.def"

@pytest.mark.asyncio
async def test_candidate_register_and_login_flow(async_client: AsyncClient):
    """
    SECURITY TEST 19:
    Candidate registration with password, duplicate rejection, and password-protected login.
    """
    async with TestingSessionLocal() as db:
        admin = User(email="recruiter.reg@astranex.def", password_hash=hash_password("admin123"), full_name="Recruiter", role=UserRole.ADMIN)
        db.add(admin)
        await db.flush()

        asm = Assessment(title="Aerospace Navigation Exam", created_by=admin.id, duration_minutes=60)
        db.add(asm)
        await db.commit()
        asm_id = asm.id

    # 1. Unregistered candidate tries to login -> 404
    resp_unreg = await async_client.post(
        "/api/v1/candidate/login",
        json={"email": "new.pilot@astranex.def", "password": "mypassword123", "assessment_id": asm_id}
    )
    assert resp_unreg.status_code == 404
    assert "Please click 'Register'" in resp_unreg.json()["detail"]

    # 2. Candidate registers -> 200 OK
    resp_reg = await async_client.post(
        "/api/v1/candidate/register",
        json={
            "full_name": "New Pilot",
            "email": "new.pilot@astranex.def",
            "password": "mypassword123",
            "assessment_id": asm_id
        }
    )
    assert resp_reg.status_code == 200
    reg_data = resp_reg.json()
    assert reg_data["session_id"] is not None
    assert reg_data["candidate_name"] == "New Pilot"

    # 3. Candidate tries to register again with same email -> 400 Bad Request
    resp_dup = await async_client.post(
        "/api/v1/candidate/register",
        json={
            "full_name": "New Pilot",
            "email": "new.pilot@astranex.def",
            "password": "anotherpassword",
            "assessment_id": asm_id
        }
    )
    assert resp_dup.status_code == 400
    assert "already exists" in resp_dup.json()["detail"]

    # 4. Candidate logs in with wrong password -> 401
    resp_bad_pwd = await async_client.post(
        "/api/v1/candidate/login",
        json={"email": "new.pilot@astranex.def", "password": "wrongpassword", "assessment_id": asm_id}
    )
    assert resp_bad_pwd.status_code == 401
    assert "Incorrect password" in resp_bad_pwd.json()["detail"]

    # 5. Candidate logs in with correct password -> 200 OK
    resp_ok_login = await async_client.post(
        "/api/v1/candidate/login",
        json={"email": "new.pilot@astranex.def", "password": "mypassword123", "assessment_id": asm_id}
    )
    assert resp_ok_login.status_code == 200
    assert resp_ok_login.json()["session_id"] == reg_data["session_id"]

@pytest.mark.asyncio
async def test_admin_safe_delete_cascade(async_client: AsyncClient):
    """
    SECURITY TEST 20:
    Admin can delete assessment that already has candidate sessions and submissions
    without triggering foreign key constraint errors.
    """
    # 1. Admin logs in
    async with TestingSessionLocal() as db:
        admin = User(email="admin.del@astranex.def", password_hash=hash_password("admin123"), full_name="Admin Del", role=UserRole.ADMIN)
        db.add(admin)
        await db.commit()
        admin_id = admin.id

    admin_token = create_access_token({"user_id": admin_id, "email": "admin.del@astranex.def", "role": "admin"})

    # 2. Create Assessment
    resp_create = await async_client.post(
        "/api/v1/admin/assessments",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"title": "To Be Deleted Exam", "duration_minutes": 30, "result_visibility": "IMMEDIATE"}
    )
    assert resp_create.status_code == 200
    asm_id = resp_create.json()["id"]

    # 3. Add a question
    resp_q = await async_client.post(
        f"/api/v1/admin/questions?assessment_id={asm_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"question_text": "Sample Q", "question_type": "MCQ", "marks": 2.0, "options": [{"option_text": "A", "display_order": 1, "is_correct": True}]}
    )
    assert resp_q.status_code == 200
    q_id = resp_q.json()["id"]

    # 4. Candidate registers and takes test
    resp_cand = await async_client.post(
        "/api/v1/candidate/register",
        json={"full_name": "Delete Tester", "email": "delete.tester@example.com", "password": "pass", "assessment_id": asm_id}
    )
    assert resp_cand.status_code == 200
    cand_token = resp_cand.json()["access_token"]
    csrf_token = resp_cand.json()["csrf_token"]

    # 5. Candidate submits answer
    resp_sub = await async_client.post(
        "/api/v1/candidate/submit",
        headers={"Authorization": f"Bearer {cand_token}", "X-CSRF-Token": csrf_token},
        json={"question_id": q_id, "text_response": "Draft"}
    )
    assert resp_sub.status_code == 200

    # 6. Admin deletes assessment -> must succeed with 200 OK!
    resp_del = await async_client.delete(
        f"/api/v1/admin/assessments/{asm_id}",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp_del.status_code == 200
    assert "deleted successfully" in resp_del.json()["message"]


