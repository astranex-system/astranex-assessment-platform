import subprocess
import tempfile
import os
import shutil
import time
import resource
from typing import Dict, Any, List, Optional

MAX_CPU_TIME_SECONDS = 3
MAX_MEMORY_BYTES = 128 * 1024 * 1024  # 128 MB
MAX_OUTPUT_BYTES = 64 * 1024  # 64 KB limit

def set_resource_limits():
    """Applies strict OS-level rlimits in worker child process."""
    # Restrict CPU time
    resource.setrlimit(resource.RLIMIT_CPU, (MAX_CPU_TIME_SECONDS, MAX_CPU_TIME_SECONDS + 1))
    # Restrict memory size
    resource.setrlimit(resource.RLIMIT_AS, (MAX_MEMORY_BYTES, MAX_MEMORY_BYTES))
    # Restrict max file size created
    resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_OUTPUT_BYTES, MAX_OUTPUT_BYTES))
    # Prevent fork bomb (process count)
    resource.setrlimit(resource.RLIMIT_NPROC, (30, 30))

class IsolatedCodeRunner:
    """
    Executes untrusted candidate code inside isolated environment.
    Supports Python, JavaScript (Node), and C++.
    """

    @staticmethod
    def run_code(
        code: str,
        language: str,
        stdin_input: str = "",
        timeout_seconds: int = 4
    ) -> Dict[str, Any]:
        temp_dir = tempfile.mkdtemp(prefix="astranex_sandbox_")
        try:
            language = language.lower().strip()
            file_name = "solution"
            cmd = []

            if language in ["python", "py", "python3"]:
                file_path = os.path.join(temp_dir, "solution.py")
                with open(file_path, "w", encoding="utf-8") as f:
                    f.write(code)
                cmd = ["python3", file_path]

            elif language in ["javascript", "js", "node"]:
                file_path = os.path.join(temp_dir, "solution.js")
                with open(file_path, "w", encoding="utf-8") as f:
                    f.write(code)
                cmd = ["node", file_path]

            elif language in ["cpp", "c++", "c"]:
                src_path = os.path.join(temp_dir, "solution.cpp")
                bin_path = os.path.join(temp_dir, "solution.out")
                with open(src_path, "w", encoding="utf-8") as f:
                    f.write(code)
                
                # Compile step
                compile_proc = subprocess.run(
                    ["g++", "-O2", src_path, "-o", bin_path],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if compile_proc.returncode != 0:
                    return {
                        "status": "COMPILATION_ERROR",
                        "stdout": "",
                        "stderr": compile_proc.stderr[:1000],
                        "execution_time": 0.0
                    }
                cmd = [bin_path]
            else:
                return {
                    "status": "UNSUPPORTED_LANGUAGE",
                    "stdout": "",
                    "stderr": f"Language '{language}' is not supported.",
                    "execution_time": 0.0
                }

            start_time = time.time()
            try:
                proc = subprocess.run(
                    cmd,
                    input=stdin_input,
                    capture_output=True,
                    text=True,
                    timeout=timeout_seconds,
                    cwd=temp_dir,
                    preexec_fn=set_resource_limits if os.name != "nt" else None
                )
                exec_time = time.time() - start_time
                
                output = proc.stdout[:MAX_OUTPUT_BYTES]
                err_output = proc.stderr[:MAX_OUTPUT_BYTES]

                if proc.returncode == 0:
                    return {
                        "status": "SUCCESS",
                        "stdout": output,
                        "stderr": err_output,
                        "execution_time": round(exec_time, 3)
                    }
                else:
                    return {
                        "status": "RUNTIME_ERROR",
                        "stdout": output,
                        "stderr": err_output,
                        "execution_time": round(exec_time, 3)
                    }

            except subprocess.TimeoutExpired:
                return {
                    "status": "TIME_LIMIT_EXCEEDED",
                    "stdout": "",
                    "stderr": "Execution timed out (Time Limit Exceeded).",
                    "execution_time": timeout_seconds
                }
            except Exception as e:
                return {
                    "status": "EXECUTION_ERROR",
                    "stdout": "",
                    "stderr": f"Execution error: {str(e)}",
                    "execution_time": 0.0
                }

        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

if __name__ == "__main__":
    res = IsolatedCodeRunner.run_code(
        code="import sys\nprint('Hello ' + sys.stdin.read().strip())",
        language="python",
        stdin_input="AstraNex"
    )
    print("Sandbox Test Result:", res)
