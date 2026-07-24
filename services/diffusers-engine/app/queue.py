from __future__ import annotations

import asyncio
import random
import threading
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal, Optional

from app.comfy_graph import compile_workflow
from app.pipeline import pipeline_holder
from app.postprocess import apply_output_post
from app.schemas import (
    JobProgress,
    JobStatusResponse,
    OutputImage,
    Txt2ImgRequest,
    WorkflowRequest,
)
from app.workflow_exec import execute_compiled


JobStatus = Literal["pending", "running", "completed", "error"]
JobKind = Literal["txt2img", "workflow"]


@dataclass
class JobRecord:
    prompt_id: str
    kind: JobKind
    request: Optional[Txt2ImgRequest] = None
    workflow: Optional[dict[str, Any]] = None
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
            kind="txt2img",
            request=request,
            seed=seed,
            progress_max=max(request.steps, 1),
        )
        with self._lock:
            self._jobs[prompt_id] = job
        await self._queue.put(prompt_id)
        return job

    async def enqueue_workflow(self, request: WorkflowRequest) -> JobRecord:
        prompt_id = str(uuid.uuid4())
        classified = compile_workflow(request.prompt)
        steps = 28
        seed = 0
        if classified.compiled is not None:
            steps = max(classified.compiled.steps, 1)
            seed = classified.compiled.seed
        if seed == 0:
            seed = random.randint(0, 2**31 - 1)
        job = JobRecord(
            prompt_id=prompt_id,
            kind="workflow",
            workflow=request.prompt,
            seed=seed,
            progress_max=steps,
            status_message=(
                f"Queued ({classified.family})"
                if classified.supported
                else "Queued (unsupported)"
            ),
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
        # First Qwen/Flux load parks ~TE+DiT in host RAM before steps start.
        job.status_message = "Loading model weights…"
        job.progress_value = 0

        def on_step(value: int, maximum: int) -> None:
            job.progress_value = value
            job.progress_max = maximum
            job.status_message = f"Step {value}/{maximum}"

        def on_status(message: str) -> None:
            text = (message or "").strip()
            if text:
                job.status_message = text

        try:
            if job.kind == "workflow":
                image = self._run_workflow_job(job, on_step, on_status)
            else:
                image = self._run_txt2img_job(job, on_step, on_status)
                image = self._apply_txt2img_post(job, image, on_status)
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

    def _apply_txt2img_post(self, job: JobRecord, image, on_status=None):  # type: ignore[no-untyped-def]
        req = job.request
        if req is None:
            return image
        scale = req.output_upscale_scale
        blur = req.output_moire_blur_sigma
        down = req.output_moire_downscale
        needs_scale = scale is not None and float(scale) > 1.001
        needs_blur = blur is not None and float(blur) > 0.05
        needs_down = down is not None and 0.5 < float(down) < 0.999
        if not (needs_scale or needs_blur or needs_down):
            return image
        if on_status:
            if needs_scale:
                on_status(f"Output polish {float(scale):.2f}×…")
            else:
                on_status("Output moiré polish…")
        return apply_output_post(
            image,
            scale=float(scale) if needs_scale else None,
            method=req.output_upscale_method or "lanczos",
            moire_blur_sigma=float(blur) if needs_blur else None,
            moire_downscale=float(down) if needs_down else None,
        )

    def _run_txt2img_job(self, job: JobRecord, on_step, on_status=None):  # type: ignore[no-untyped-def]
        req = job.request
        if req is None:
            raise RuntimeError("txt2img job missing request.")
        seed = job.seed if job.seed is not None else 0
        return pipeline_holder.generate(
            prompt=req.prompt,
            negative_prompt=req.negative_prompt,
            model=req.model,
            width=req.width,
            height=req.height,
            steps=req.steps,
            guidance_scale=req.guidance_scale,
            seed=seed,
            on_step=on_step,
            on_status=on_status,
            workshop_crop=req.workshop_crop,
        )

    def _run_workflow_job(self, job: JobRecord, on_step, on_status=None):  # type: ignore[no-untyped-def]
        graph = job.workflow
        if not isinstance(graph, dict):
            raise RuntimeError("workflow job missing prompt graph.")
        classified = compile_workflow(graph)
        if not classified.supported or classified.compiled is None:
            raise RuntimeError(
                classified.reason or "Workflow not supported for native Diffusers execution."
            )
        compiled = classified.compiled
        # Prefer queue-assigned seed when graph seed was 0 / random.
        if job.seed is not None and compiled.seed == 0:
            from dataclasses import replace

            compiled = replace(compiled, seed=int(job.seed))
        job.progress_max = max(compiled.steps, 1)
        job.status_message = f"Generating ({compiled.family})"
        if on_status:
            on_status(job.status_message)
        return execute_compiled(compiled, on_step=on_step)


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
