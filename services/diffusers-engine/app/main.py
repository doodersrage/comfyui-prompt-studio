from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from app.model_resolve import describe_search_paths, list_local_models
from app.pipeline import DEFAULT_MODEL, MOCK_MODE, pipeline_holder
from app.queue import JobQueue, resolve_output_path
from app.schemas import (
    HealthResponse,
    JobStatusResponse,
    ListedModelResponse,
    ModelsResponse,
    Txt2ImgRequest,
    Txt2ImgResponse,
    UploadResponse,
)

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = Path(os.environ.get("DIFFUSERS_OUTPUT_DIR", str(ROOT / "outputs"))).resolve()
INPUT_DIR = Path(os.environ.get("DIFFUSERS_INPUT_DIR", str(ROOT / "inputs"))).resolve()
ENGINE_URL = os.environ.get("DIFFUSERS_ENGINE_URL", "http://127.0.0.1:8190").rstrip("/")

INPUT_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Prompt Studio Diffusers Engine", version="0.1.0")
jobs = JobQueue(OUTPUT_DIR)


@app.on_event("startup")
async def on_startup() -> None:
    jobs.start()


@app.get("/v1/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    device, model, mock = pipeline_holder.describe()
    return HealthResponse(
        ok=True,
        device=device,
        model=model or DEFAULT_MODEL,
        mock=mock or MOCK_MODE,
        search_paths=describe_search_paths(),
    )


@app.get("/v1/models", response_model=ModelsResponse)
async def models() -> ModelsResponse:
    listed = list_local_models()
    default_model = next((item.id for item in listed if item.default), None)
    return ModelsResponse(
        models=[
            ListedModelResponse(
                id=item.id,
                label=item.label,
                kind=item.kind,  # type: ignore[arg-type]
                family=item.family,  # type: ignore[arg-type]
                default=item.default,
            )
            for item in listed
        ],
        default_model=default_model,
        search_paths=describe_search_paths(),
    )


@app.post("/v1/txt2img", response_model=Txt2ImgResponse)
async def txt2img(body: Txt2ImgRequest) -> Txt2ImgResponse:
    job = await jobs.enqueue(body)
    return Txt2ImgResponse(prompt_id=job.prompt_id, engine_url=ENGINE_URL)


@app.get("/v1/jobs/{prompt_id}", response_model=JobStatusResponse)
async def job_status(prompt_id: str) -> JobStatusResponse:
    job = jobs.get(prompt_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Unknown prompt_id.")
    return jobs.to_status(job)


@app.get("/v1/view")
async def view(
    filename: str = Query(...),
    subfolder: str = Query(""),
    type: str = Query("output"),  # noqa: A002 — matches Comfy query shape
) -> FileResponse:
    try:
        base = INPUT_DIR if type == "input" else OUTPUT_DIR
        path = resolve_output_path(base, filename, subfolder)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(path, media_type="image/png")


@app.post("/v1/upload", response_model=UploadResponse)
async def upload(image: UploadFile = File(...)) -> UploadResponse:
    if not image.filename:
        raise HTTPException(status_code=400, detail="Image file is required.")
    safe_name = Path(image.filename).name
    if not safe_name or ".." in safe_name:
        raise HTTPException(status_code=400, detail="Invalid filename.")
    dest = INPUT_DIR / safe_name
    data = await image.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty upload.")
    dest.write_bytes(data)
    return UploadResponse(name=safe_name, subfolder="", type="input")
