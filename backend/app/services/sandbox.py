import logging
import sys
import os
from typing import List, Dict, Any

# Add root directory to sys.path if sandbox_runner isn't directly importable
try:
    from sandbox_runner.runner import IsolatedCodeRunner
except ModuleNotFoundError:
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../"))
    if project_root not in sys.path:
        sys.path.insert(0, project_root)
    from sandbox_runner.runner import IsolatedCodeRunner

logger = logging.getLogger("astranex.sandbox")

def evaluate_coding_submission(
    code: str,
    language: str,
    hidden_test_cases: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Evaluates candidate submitted code against secret hidden test cases.
    Runs each test case inside the isolated execution sandbox.
    Returns score earned and summary status.
    """
    if not hidden_test_cases:
        return {
            "score": 0.0,
            "passed_tests": 0,
            "total_tests": 0,
            "is_correct": False,
            "details": "No test cases configured."
        }

    total_weight = sum(tc.get("points", 1.0) for tc in hidden_test_cases)
    earned_weight = 0.0
    passed_count = 0
    test_results = []

    for idx, tc in enumerate(hidden_test_cases):
        inp = tc.get("input", "")
        expected = tc.get("expected_output", "").strip()
        points = tc.get("points", 1.0)

        res = IsolatedCodeRunner.run_code(
            code=code,
            language=language,
            stdin_input=inp
        )

        actual_stdout = res.get("stdout", "").strip()
        passed = (res["status"] == "SUCCESS") and (actual_stdout == expected)

        if passed:
            earned_weight += points
            passed_count += 1

        test_results.append({
            "test_case_index": idx,
            "passed": passed,
            "status": res["status"],
            "execution_time": res.get("execution_time", 0.0)
            # NOTE: Expected output and input details stay strictly server-side in DB!
        })

    is_all_correct = (passed_count == len(hidden_test_cases))
    
    return {
        "score": round(earned_weight, 2),
        "passed_tests": passed_count,
        "total_tests": len(hidden_test_cases),
        "is_correct": is_all_correct,
        "test_results": test_results
    }
