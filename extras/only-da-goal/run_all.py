from __future__ import annotations

import ctypes
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
from ctypes import wintypes
from dataclasses import dataclass
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

ROOT_DIR = Path(__file__).resolve().parent
GAMBALATOR_DIR = Path(
    os.environ.get("GAMBALATOR_DIR", ROOT_DIR.parent / "Gambalator")
).expanduser().resolve()
GOAL_PORT = 5000
STARTUP_TIMEOUT_SECONDS = 180
SHUTDOWN_TIMEOUT_SECONDS = 8


@dataclass
class ManagedProcess:
    name: str
    process: subprocess.Popen[bytes]


if os.name == "nt":
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000
    JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS = 9

    class JobObjectBasicLimitInformation(ctypes.Structure):
        _fields_ = [
            ("PerProcessUserTimeLimit", ctypes.c_longlong),
            ("PerJobUserTimeLimit", ctypes.c_longlong),
            ("LimitFlags", wintypes.DWORD),
            ("MinimumWorkingSetSize", ctypes.c_size_t),
            ("MaximumWorkingSetSize", ctypes.c_size_t),
            ("ActiveProcessLimit", wintypes.DWORD),
            ("Affinity", ctypes.c_size_t),
            ("PriorityClass", wintypes.DWORD),
            ("SchedulingClass", wintypes.DWORD),
        ]

    class IoCounters(ctypes.Structure):
        _fields_ = [
            ("ReadOperationCount", ctypes.c_ulonglong),
            ("WriteOperationCount", ctypes.c_ulonglong),
            ("OtherOperationCount", ctypes.c_ulonglong),
            ("ReadTransferCount", ctypes.c_ulonglong),
            ("WriteTransferCount", ctypes.c_ulonglong),
            ("OtherTransferCount", ctypes.c_ulonglong),
        ]

    class JobObjectExtendedLimitInformation(ctypes.Structure):
        _fields_ = [
            ("BasicLimitInformation", JobObjectBasicLimitInformation),
            ("IoInfo", IoCounters),
            ("ProcessMemoryLimit", ctypes.c_size_t),
            ("JobMemoryLimit", ctypes.c_size_t),
            ("PeakProcessMemoryUsed", ctypes.c_size_t),
            ("PeakJobMemoryUsed", ctypes.c_size_t),
        ]


class ProcessJob:
    """Own child process trees and terminate them when the supervisor exits."""

    def __init__(self) -> None:
        self._handle: int | None = None
        if os.name != "nt":
            return

        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel32.CreateJobObjectW.argtypes = [wintypes.LPVOID, wintypes.LPCWSTR]
        kernel32.CreateJobObjectW.restype = wintypes.HANDLE
        kernel32.SetInformationJobObject.argtypes = [
            wintypes.HANDLE,
            ctypes.c_int,
            wintypes.LPVOID,
            wintypes.DWORD,
        ]
        kernel32.SetInformationJobObject.restype = wintypes.BOOL
        kernel32.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
        kernel32.AssignProcessToJobObject.restype = wintypes.BOOL
        kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
        kernel32.CloseHandle.restype = wintypes.BOOL

        handle = kernel32.CreateJobObjectW(None, None)
        if not handle:
            raise ctypes.WinError(ctypes.get_last_error())

        information = JobObjectExtendedLimitInformation()
        information.BasicLimitInformation.LimitFlags = (
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        )
        configured = kernel32.SetInformationJobObject(
            handle,
            JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS,
            ctypes.byref(information),
            ctypes.sizeof(information),
        )
        if not configured:
            error = ctypes.WinError(ctypes.get_last_error())
            kernel32.CloseHandle(handle)
            raise error

        self._handle = int(handle)
        self._kernel32 = kernel32

    def assign(self, process: subprocess.Popen[bytes]) -> None:
        if os.name != "nt" or self._handle is None:
            return
        process_handle = getattr(process, "_handle", None)
        if process_handle is None:
            raise RuntimeError("Cannot access the Windows child-process handle")
        assigned = self._kernel32.AssignProcessToJobObject(
            wintypes.HANDLE(self._handle),
            wintypes.HANDLE(int(process_handle)),
        )
        if not assigned:
            raise ctypes.WinError(ctypes.get_last_error())

    def close(self) -> None:
        if os.name == "nt" and self._handle is not None:
            self._kernel32.CloseHandle(wintypes.HANDLE(self._handle))
            self._handle = None


def gambalator_port() -> int:
    raw_value = os.environ.get("GAMBALATOR_PORT", "5741")
    try:
        port = int(raw_value)
    except ValueError as error:
        raise RuntimeError("GAMBALATOR_PORT must be an integer") from error
    if not 1 <= port <= 65535:
        raise RuntimeError("GAMBALATOR_PORT must be between 1 and 65535")
    return port


def port_is_open(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.3):
            return True
    except OSError:
        return False


def process_creation_options() -> dict[str, object]:
    if os.name == "nt":
        return {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
    return {"start_new_session": True}


def start_process(
    name: str,
    command: list[str],
    working_directory: Path,
    job: ProcessJob,
) -> ManagedProcess:
    print(f"[{name}] Starting in {working_directory}", flush=True)
    process = subprocess.Popen(
        command,
        cwd=working_directory,
        **process_creation_options(),
    )
    try:
        job.assign(process)
    except Exception:
        process.terminate()
        process.wait(timeout=5)
        raise
    return ManagedProcess(name=name, process=process)


def mise_command(*arguments: str) -> list[str]:
    mise = shutil.which("mise")
    if mise is None:
        raise RuntimeError("Gambalator requires mise: https://mise.jdx.dev/")
    if os.name == "nt" and Path(mise).suffix.casefold() in {".bat", ".cmd"}:
        command_processor = os.environ.get("COMSPEC", "cmd.exe")
        return [command_processor, "/d", "/s", "/c", " ".join((mise, *arguments))]
    return [mise, *arguments]


def prepare_gambalator(job: ProcessJob) -> None:
    if not GAMBALATOR_DIR.is_dir():
        raise RuntimeError(f"Gambalator directory was not found: {GAMBALATOR_DIR}")
    if (GAMBALATOR_DIR / "node_modules").is_dir():
        return

    print("[GAMBALATOR] Installing frontend dependencies for the first run...", flush=True)
    setup = start_process(
        "GAMBALATOR SETUP",
        mise_command("run", "setup"),
        GAMBALATOR_DIR,
        job,
    )
    return_code = setup.process.wait()
    if return_code != 0:
        raise RuntimeError(f"Gambalator setup failed with exit code {return_code}")


def http_is_ready(url: str) -> bool:
    try:
        with urlopen(url, timeout=0.7) as response:
            return response.status == 200
    except (OSError, URLError):
        return False


def wait_until_ready(
    processes: list[ManagedProcess],
    services: dict[str, str],
) -> None:
    pending = dict(services)
    deadline = time.monotonic() + STARTUP_TIMEOUT_SECONDS

    while pending:
        for managed in processes:
            return_code = managed.process.poll()
            if return_code is not None:
                raise RuntimeError(
                    f"{managed.name} stopped during startup with exit code {return_code}"
                )

        for name, url in list(pending.items()):
            if http_is_ready(url):
                print(f"[{name}] Ready: {url}", flush=True)
                del pending[name]

        if not pending:
            return
        if time.monotonic() >= deadline:
            waiting_for = ", ".join(pending)
            raise RuntimeError(f"Startup timed out while waiting for: {waiting_for}")
        time.sleep(0.5)


def request_graceful_stop(managed: ManagedProcess) -> None:
    if managed.process.poll() is not None:
        return
    try:
        if os.name == "nt":
            managed.process.send_signal(signal.CTRL_BREAK_EVENT)
        else:
            os.killpg(managed.process.pid, signal.SIGTERM)
    except (OSError, ProcessLookupError):
        pass


def stop_processes(processes: list[ManagedProcess]) -> None:
    alive = [managed for managed in processes if managed.process.poll() is None]
    if not alive:
        return

    print("Stopping Only_DA-Goal and Gambalator...", flush=True)
    for managed in alive:
        request_graceful_stop(managed)

    deadline = time.monotonic() + SHUTDOWN_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        if all(managed.process.poll() is not None for managed in alive):
            return
        time.sleep(0.1)

    for managed in alive:
        if managed.process.poll() is None:
            managed.process.terminate()


def monitor(processes: list[ManagedProcess]) -> int:
    while True:
        for managed in processes:
            return_code = managed.process.poll()
            if return_code is not None:
                print(
                    f"[{managed.name}] Stopped with exit code {return_code}.",
                    flush=True,
                )
                return return_code if return_code != 0 else 1
        time.sleep(0.5)


def main() -> int:
    processes: list[ManagedProcess] = []
    job = ProcessJob()
    try:
        port = gambalator_port()
        occupied = [
            f"Only_DA-Goal ({GOAL_PORT})" if port_is_open(GOAL_PORT) else None,
            f"Gambalator ({port})" if port_is_open(port) else None,
        ]
        occupied = [item for item in occupied if item is not None]
        if occupied:
            raise RuntimeError(
                "These local ports are already occupied: " + ", ".join(occupied)
            )

        prepare_gambalator(job)
        processes.append(
            start_process(
                "GAMBALATOR",
                mise_command("run", "local"),
                GAMBALATOR_DIR,
                job,
            )
        )
        processes.append(
            start_process(
                "ONLY-DA-GOAL",
                [sys.executable, "start.py"],
                ROOT_DIR,
                job,
            )
        )

        goal_url = f"http://127.0.0.1:{GOAL_PORT}/donationGoalRGG"
        gambalator_url = f"http://127.0.0.1:{port}/api/health"
        wait_until_ready(
            processes,
            {
                "ONLY-DA-GOAL": f"http://127.0.0.1:{GOAL_PORT}/",
                "GAMBALATOR": gambalator_url,
            },
        )
        print(flush=True)
        print(f"OBS goal:    {goal_url}", flush=True)
        print(f"Gambalator:  http://127.0.0.1:{port}/", flush=True)
        print("Press Ctrl+C or close this console to stop both applications.", flush=True)
        return monitor(processes)
    except KeyboardInterrupt:
        print("\nShutdown requested.", flush=True)
        return 0
    except Exception as error:  # noqa: BLE001 - present startup failures cleanly.
        print(f"\nStartup failed: {error}", file=sys.stderr, flush=True)
        return 1
    finally:
        stop_processes(processes)
        job.close()


if __name__ == "__main__":
    raise SystemExit(main())
