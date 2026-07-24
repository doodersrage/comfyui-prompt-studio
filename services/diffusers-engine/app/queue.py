from __future__ import annotations

import asyncio
import random
import threading
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal, Optional

from app.pipeline import pipeline_holder
from app.schemas import JobProgress, JobStatusResponse, OutputImage, Txt2ImgRequest


JobStatus = Literal["pending", "running", "completed", "error"]


@dataclass
class JobRecord:
    prompt_id: str
    request: Txt2ImgRequest
    status: JobStatus = "pending"
    status_message: str = "Queued"
    progress_value: int = 0
    progress_max: int = 1
    seed: Optional[int] = None
    images: list[OutputImage] = field(default_factory=list)
    error: Optional[str] = None


class JobQueue:
    def __init__(self, output_dir: Path) -> None:
        self.output_dir = output_dir
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self._jobs: dict[str, JobRecord] = {}
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        self._worker_task: asyncio.Task | None = None
        self._lock = threading.Lock()

    def start(self) -> None:
        if self._worker_task is None:
            self._worker_task = asyncio.create_task(self._worker_loop())

    async def enqueue(self, request: Txt2ImgRequest) -> JobRecord:
        prompt_id = str(uuid.uuid4())
        seed = request.seed if request.seed is not None else random.randint(0, 2**31 - 1)
        job = JobRecord(
            prompt_id=prompt_id,
            request=request,
            seed=seed,
            progress_max=max(request.steps, 1),
        )
        with self._lock:
            self._jobs[prompt_id] = job
        await self._queue.put(prompt_id)
        return job

    def get(self, prompt_id: str) -> JobRecord | None:
        with self._lock:
            return self._jobs.get(prompt_id)

    def to_status(self, job: JobRecord) -> JobStatusResponse:
        progress = None
        if job.status in ("pending", "running"):
            progress = JobProgress(value=job.progress_value, max=job.progress_max)
        return JobStatusResponse(
            prompt_id=job.prompt_id,
            status=job.status,
            status_message=job.status_message if job.status != "error" else (job.error or job.status_message),
            progress=progress,
            images=job.images or None,
            seed=job.seed,
        )

    async def _worker_loop(self) -> None:
        while True:
            prompt_id = await self._queue.get()
            try:
                await asyncio.to_thread(self._run_job, prompt_id)
            finally:
                self._queue.task_done()

    def _run_job(self, prompt_id: str) -> None:
        job = self.get(prompt_id)
        if job is None:
            return

        job.status = "running"
        job.status_message = "Generating"
        job.progress_value = 0
        req = job.request
        seed = job.seed if job.seed is not None else 0

        def on_step(value: int, maximum: int) -> None:
            job.progress_value = value
            job.progress_max = maximum
            job.status_message = f"Step {value}/{maximum}"

        try:
            image = pipeline_holder.generate(
                prompt=req.prompt,
                negative_prompt=req.negative_prompt,
                model=req.model,
                width=req.width,
                height=req.height,
                steps=req.steps,
                guidance_scale=req.guidance_scale,
                seed=seed,
                on_step=on_step,
            )
            filename = f"{prompt_id}.png"
            path = self.output_dir / filename
            image.save(path, format="PNG")
            job.images = [OutputImage(filename=filename, subfolder="", type="output")]
            job.status = "completed"
            job.status_message = "Completed"
            job.progress_value = job.progress_max
        except Exception as exc:  # noqa: BLE001 — surface to job status
            job.status = "error"
            job.error = str(exc)
            job.status_message = str(exc)


def resolve_output_path(output_dir: Path, filename: str, subfolder: str = "") -> Path:
    safe_name = Path(filename).name
    if not safe_name or safe_name != filename or ".." in filename:
        raise ValueError("Invalid filename.")
    base = output_dir
    if subfolder:
        safe_sub = Path(subfolder)
        if ".." in safe_sub.parts or safe_sub.is_absolute():
            raise ValueError("Invalid subfolder.")
        base = output_dir / safe_sub
    path = (base / safe_name).resolve()
    if not str(path).startswith(str(output_dir.resolve())):
        raise ValueError("Path escapes output directory.")
    return path
