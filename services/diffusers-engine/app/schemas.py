from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class Txt2ImgRequest(BaseModel):
    prompt: str = Field(min_length=1)
    negative_prompt: str = ""
    model: str = "stabilityai/sdxl-turbo"
    width: int = Field(default=1024, ge=64, le=2048)
    height: int = Field(default=1024, ge=64, le=2048)
    steps: int = Field(default=40, ge=1, le=150)
    guidance_scale: float = Field(default=5.5, ge=0.0, le=30.0)
    seed: Optional[int] = None
    client_id: Optional[str] = None


class Txt2ImgResponse(BaseModel):
    prompt_id: str
    engine_url: str


class OutputImage(BaseModel):
    filename: str
    subfolder: str = ""
    type: str = "output"


class JobProgress(BaseModel):
    value: int = 0
    max: int = 1


class JobStatusResponse(BaseModel):
    prompt_id: str
    status: Literal["pending", "running", "completed", "error"]
    status_message: Optional[str] = None
    progress: Optional[JobProgress] = None
    images: Optional[list[OutputImage]] = None
    seed: Optional[int] = None


class UploadResponse(BaseModel):
    name: str
    subfolder: str = ""
    type: str = "input"


class HealthResponse(BaseModel):
    ok: bool
    device: str
    model: str
    mock: bool = False
    search_paths: list[str] = []
