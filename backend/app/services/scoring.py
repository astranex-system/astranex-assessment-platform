import logging
import re
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models import Submission, Question, QuestionAnswer, QuestionType, EvaluationResult
from app.services.sandbox import evaluate_coding_submission

logger = logging.getLogger("astranex.scoring")

# Default boilerplate templates shipped with CodingPad.tsx
# Any submission whose stripped code matches one of these gets 0 (not attempted)
_BOILERPLATE_TEMPLATES = [
    # Python
    "# AstraNex Python 3 Environment\ndef solution():\n    # Write your solution code here\n    pass\n\nif __name__ == \"__main__\":\n    solution()",
    # JavaScript
    "// AstraNex JavaScript (Node.js) Environment\nfunction solution() {\n    // Write your solution code here\n}\n\nsolution();",
    # C++
    "// AstraNex C++ 17 Environment\n#include <iostream>\n#include <vector>\n#include <string>\n#include <algorithm>\n\nusing namespace std;\n\nint main() {\n    // Write your solution code here\n    return 0;\n}",
    # Java
    "// AstraNex Java Environment\nimport java.util.*;\n\npublic class Solution {\n    public static void main(String[] args) {\n        // Write your solution code here\n    }\n}",
]

_NORMALIZED_TEMPLATES = {t.strip() for t in _BOILERPLATE_TEMPLATES}


def _is_boilerplate_or_empty(code: str) -> bool:
    """Returns True if submitted code is empty, whitespace-only, or an unmodified starter template."""
    stripped = code.strip()
    if not stripped:
        return True
    if stripped in _NORMALIZED_TEMPLATES:
        return True
    # Also detect if candidate only has comments + pass/empty body (no real logic)
    # Remove all comment lines (# ... or // ...) and blank lines, see what's left
    non_trivial_lines = []
    for line in stripped.splitlines():
        l = line.strip()
        if not l:
            continue
        if l.startswith("#") or l.startswith("//"):
            continue
        # Skip pure boilerplate structural tokens (Python/JS/C++ shells)
        if l in {"pass", "return 0;", "solution();", "}", "{", "using namespace std;"}:
            continue
        if l.startswith("def solution") or l.startswith("function solution") or \
           l.startswith("int main") or l.startswith("public class Solution") or \
           l.startswith("public static void main") or l.startswith("#include") or \
           l.startswith("import java") or l.startswith("import sys"):
            continue
        non_trivial_lines.append(l)
    return len(non_trivial_lines) == 0


async def score_submission(db: AsyncSession, submission: Submission) -> EvaluationResult:
    """
    Evaluates a candidate's submission entirely on the server side using the secret QuestionAnswer table.
    Guarantees no evaluation data or answer keys leak to candidate endpoints.
    """
    # Fetch question and secret answer
    stmt = (
        select(Question, QuestionAnswer)
        .outerjoin(QuestionAnswer, Question.id == QuestionAnswer.question_id)
        .where(Question.id == submission.question_id)
    )
    res = await db.execute(stmt)
    row = res.first()
    
    if not row:
        raise ValueError(f"Question {submission.question_id} not found")
    
    question, answer_key = row
    score_earned = 0.0
    is_correct = False
    execution_details = {}

    if not answer_key:
        logger.warning(f"No secret answer key configured for question {question.id}")
    else:
        if question.question_type == QuestionType.MCQ:
            if submission.selected_option_id and submission.selected_option_id == answer_key.correct_option_id:
                score_earned = float(question.marks)
                is_correct = True
            execution_details = {"type": "MCQ_EVALUATION"}

        elif question.question_type == QuestionType.CODING:
            code = submission.code_response or ""
            # Guard: template/empty code never earns points — must contain real logic
            if _is_boilerplate_or_empty(code):
                logger.info(f"Coding submission {submission.id} is boilerplate/empty — scoring 0")
                execution_details = {
                    "type": "CODING_NOT_ATTEMPTED",
                    "reason": "Submission contains no meaningful code beyond the starter template."
                }
            elif answer_key.hidden_test_cases:
                eval_res = evaluate_coding_submission(
                    code=code,
                    language=submission.programming_language or "python",
                    hidden_test_cases=answer_key.hidden_test_cases
                )
                score_earned = eval_res["score"]
                is_correct = eval_res["is_correct"]
                execution_details = {
                    "passed_tests": eval_res["passed_tests"],
                    "total_tests": eval_res["total_tests"],
                    "test_results": eval_res["test_results"]
                }
            else:
                execution_details = {"type": "CODING_NO_TEST_CASES"}

        elif question.question_type == QuestionType.TEXT:
            execution_details = {"type": "MANUAL_REVIEW_REQUIRED"}

    # Check for existing evaluation result for this submission
    existing_stmt = select(EvaluationResult).where(EvaluationResult.submission_id == submission.id)
    existing_res = await db.execute(existing_stmt)
    eval_result = existing_res.scalar_one_or_none()

    if eval_result:
        eval_result.score_earned = score_earned
        eval_result.is_correct = is_correct
        eval_result.execution_details = execution_details
    else:
        eval_result = EvaluationResult(
            session_id=submission.session_id,
            submission_id=submission.id,
            score_earned=score_earned,
            is_correct=is_correct,
            execution_details=execution_details,
            status="EVALUATED"
        )
        db.add(eval_result)

    # Clean up any stale evaluation results for previous submissions of the same question in this session
    from sqlalchemy import delete as sql_delete
    cleanup_stmt = sql_delete(EvaluationResult).where(
        EvaluationResult.session_id == submission.session_id,
        EvaluationResult.submission_id != submission.id,
        EvaluationResult.submission_id.in_(
            select(Submission.id).where(
                Submission.session_id == submission.session_id,
                Submission.question_id == submission.question_id
            )
        )
    )
    await db.execute(cleanup_stmt)

    await db.commit()
    await db.refresh(eval_result)
    return eval_result
