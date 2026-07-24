from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class Txt2ImgRequest(BaseModel):
    prompt: str = Field(min_length=1)
    negative_prompt: str = ""
    model: str = "qwen_image_2512_fp8_e4m3fn.safetensors"
    width: int = Field(default=1024, ge=64, le=2048)
    height: int = Field(default=1024, ge=64, le=2048)
    steps: int = Field(default=40, ge=1, le=150)
    guidance_scale: float = Field(default=5.5, ge=0.0, le=30.0)
    seed: Optional[int] = None
    client_id: Optional[str] = None
    # None = auto-detect workshop roles; True/False force head-and-shoulders crop.
    workshop_crop: Optional[bool] = None
    # Studio model id (e.g. qwen-image-2512-lightning-8) for logging / future rules.
    studio_model: Optional[str] = None
    quality_profile: Optional[str] = None
    # Comfy ImageScaleBy parity — applied after VAE decode (Final/Max polish).
    output_upscale_scale: Optional[float] = Field(default=None, ge=1.0, le=4.0)
    output_upscale_method: Optional[
        Literal["lanczos", "area", "bilinear", "bicubic"]
    ] = None
    # Soft Gaussian before upscale (Diffusers Lightning anti-moiré).
    output_moire_blur_sigma: Optional[float] = Field(default=None, ge=0.0, le=2.0)
    # Max-only mild bicubic↓ (then Lanczos restore to same pixel size).
    output_moire_downscale: Optional[float] = Field(default=None, ge=0.5, le=1.0)


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


class ListedModelResponse(BaseModel):
    id: str
    label: str
    kind: Literal["single_file", "diffusers_dir"]
    family: str = "other"
    default: bool = False
    bucket: Optional[str] = None


class ModelsResponse(BaseModel):
    models: list[ListedModelResponse] = []
    checkpoints: list[ListedModelResponse] = []
    diffusion_models: list[ListedModelResponse] = []
    text_encoders: list[ListedModelResponse] = []
    vaes: list[ListedModelResponse] = []
    loras: list[ListedModelResponse] = []
    default_model: Optional[str] = None
    search_paths: list[str] = []


class WorkflowRequest(BaseModel):
    """Comfy API-format prompt graph (node id → {class_type, inputs})."""

    prompt: dict
    client_id: Optional[str] = None


class WorkflowResponse(BaseModel):
    prompt_id: str
    engine_url: str
    family: str = "unsupported"
    supported: bool = True


class WorkflowClassifyResponse(BaseModel):
    supported: bool
    family: str
    reason: str
    unsupported_nodes: list[str] = []
    assets: dict = Field(default_factory=dict)
