import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models import Submission, Question, QuestionAnswer, QuestionType, EvaluationResult
from app.services.sandbox import evaluate_coding_submission

logger = logging.getLogger("astranex.scoring")

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
            if submission.code_response and answer_key.hidden_test_cases:
                eval_res = evaluate_coding_submission(
                    code=submission.code_response,
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
