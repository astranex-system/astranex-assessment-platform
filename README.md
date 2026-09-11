# AstraNex Defence - Secure Online Technical Assessment Platform

A production-grade, zero-trust technical assessment platform built for **AstraNex Defence**.

---

## Security Guarantees & Zero-Trust Architecture

- **Zero Client Answer Leakage**: Answer keys (`QuestionAnswer`), secret hidden test cases, expected outputs, rubrics, and scoring formulas are stored exclusively in an isolated database table (`question_answers`) that is **never** queried or exposed by candidate-facing endpoints, JavaScript bundles, or React props.
- **IDOR Protection**: Identity is derived strictly from server-side HttpOnly, SameSite JWT session cookies (`astranex_session`). Changing URL parameters or request body IDs cannot compromise other candidate sessions.
- **Server-Authoritative Clock**: Time remaining is computed server-side (`expires_at`). Submissions past deadline are rejected with 403 Forbidden regardless of client-side clock manipulation.
- **Isolated Code Execution Sandbox**: Untrusted candidate Python/Node/C++ code executes inside isolated worker environments with CPU quotas (0.5 CPU), memory caps (128MB), process limits (RLIMIT_NPROC), network isolation (`--net=none`), and ephemeral execution timeouts.
- **CSRF & Security Headers**: Double-submit CSRF protection on state-changing endpoints, Strict CSP, HSTS, X-Content-Type-Options: nosniff, Referrer-Policy, and X-Frame-Options: DENY.

---

## Directory Structure

```
astranex-assessment-platform/
├── backend/
│   ├── app/
│   │   ├── database.py         # Async SQLAlchemy setup
│   │   ├── models.py           # Core DB models & isolated secret tables
│   │   ├── security.py         # SHA-256 token hashing, JWT, CSRF validation
│   │   ├── middleware.py       # Security headers, rate limiting, exception sanitization
│   │   ├── dependencies.py     # Session & Auth dependencies
│   │   ├── routers/
│   │   │   ├── candidate.py    # Sanitized Candidate API routes
│   │   │   └── admin.py        # Recruiter & Admin Management API
│   │   └── services/
│   │       ├── scoring.py      # Server-side scoring engine
│   │       ├── sandbox.py      # Hidden test case evaluator
│   │       └── audit.py        # System security audit logging
│   ├── tests/
│   │   ├── conftest.py         # Pytest fixtures (In-memory SQLite)
│   │   └── test_security.py    # Automated security test suite
│   ├── requirements.txt
│   └── Dockerfile
├── sandbox_runner/
│   └── runner.py               # Isolated sandbox code runner with rlimits
├── frontend/
│   ├── src/
│   │   └── app/
│   │       ├── page.tsx        # Candidate Portal Landing & Token Validator
│   │       ├── assessment/     # Live Technical Assessment Interface
│   │       └── admin/          # Recruiter/Admin Control Dashboard
│   ├── package.json
│   └── Dockerfile
├── nginx/
│   └── nginx.conf              # Production Nginx proxy & CSP headers
└── docker-compose.yml
```

---

## Running Automated Security Verification Tests

To verify zero answer leakage, IDOR protection, CSRF enforcement, and code sandbox isolation:

```bash
cd backend
python -m pytest -v tests/test_security.py
```

---

## Deployment with Docker Compose

To deploy the entire stack (PostgreSQL, Redis, FastAPI Backend, Next.js Frontend, Nginx Proxy):

```bash
docker-compose up --build -d
```

Access Points:
- **Candidate Portal**: `http://localhost:3000` (or `http://localhost`)
- **Admin Console**: `http://localhost:3000/admin`
- **Backend Health Check**: `http://localhost:8000/health`
