export const APP_FEATURES = [
  { id: "dashboard", label: "Dashboard", description: "Home dashboard and queue overview" },
  { id: "generate", label: "Generate", description: "Keyword and random scene generators" },
  { id: "format", label: "Format", description: "Prompt formatting tool" },
  { id: "lint", label: "Lint", description: "Prompt lint and diagnostics" },
  { id: "topics", label: "Topics", description: "Topic list generator" },
  { id: "character", label: "Character", description: "Character, duo, and compose tools" },
  { id: "background", label: "Background", description: "Background-only scenes" },
  { id: "pet", label: "Pet", description: "Pet scene generator" },
  { id: "fantasy", label: "Fantasy", description: "Fantasy scene generator" },
  { id: "image-prompt", label: "Image → Prompt", description: "Vision upload to prompt" },
  { id: "refine", label: "Refine", description: "Image refinement pipeline" },
  { id: "controlnet", label: "ControlNet", description: "ControlNet prompt builder" },
  { id: "video", label: "Video", description: "Video motion prompts" },
  { id: "negative", label: "Negative", description: "Negative prompt builder" },
  { id: "studio", label: "Studio", description: "History, analytics, and experiments" },
  { id: "gallery", label: "Gallery", description: "ComfyUI output gallery" },
  { id: "variations", label: "Variations", description: "Variation grid and matrix queue" },
  { id: "plugins", label: "Plugins", description: "Custom tool registry" },
  { id: "settings", label: "Settings", description: "App and ComfyUI settings" },
  { id: "profile", label: "Profile", description: "Account, password, and preferences" },
  { id: "comfyui-api", label: "ComfyUI API", description: "Queue and poll ComfyUI jobs" },
  { id: "llm-api", label: "LLM API", description: "Generation and refinement API routes" },
] as const;

export type AppFeatureId = (typeof APP_FEATURES)[number]["id"];

export const ALL_FEATURE_IDS = APP_FEATURES.map((feature) => feature.id) as AppFeatureId[];

const PAGE_FEATURE_MAP: Array<{ prefix: string; feature: AppFeatureId }> = [
  { prefix: "/dashboard", feature: "dashboard" },
  { prefix: "/format", feature: "format" },
  { prefix: "/lint", feature: "lint" },
  { prefix: "/topics", feature: "topics" },
  { prefix: "/character", feature: "character" },
  { prefix: "/background", feature: "background" },
  { prefix: "/pet", feature: "pet" },
  { prefix: "/fantasy", feature: "fantasy" },
  { prefix: "/image-prompt", feature: "image-prompt" },
  { prefix: "/refine", feature: "refine" },
  { prefix: "/controlnet", feature: "controlnet" },
  { prefix: "/video", feature: "video" },
  { prefix: "/negative", feature: "negative" },
  { prefix: "/studio", feature: "studio" },
  { prefix: "/gallery", feature: "gallery" },
  { prefix: "/variations", feature: "variations" },
  { prefix: "/plugins", feature: "plugins" },
  { prefix: "/settings", feature: "settings" },
  { prefix: "/profile", feature: "profile" },
];

const API_FEATURE_MAP: Array<{ prefix: string; feature: AppFeatureId }> = [
  { prefix: "/api/comfyui", feature: "comfyui-api" },
  { prefix: "/api/generate", feature: "llm-api" },
  { prefix: "/api/random-scene", feature: "llm-api" },
  { prefix: "/api/character", feature: "llm-api" },
  { prefix: "/api/background", feature: "llm-api" },
  { prefix: "/api/pet", feature: "llm-api" },
  { prefix: "/api/fantasy", feature: "llm-api" },
  { prefix: "/api/refine", feature: "llm-api" },
  { prefix: "/api/format", feature: "llm-api" },
  { prefix: "/api/lint", feature: "llm-api" },
  { prefix: "/api/topics", feature: "llm-api" },
  { prefix: "/api/negative", feature: "llm-api" },
  { prefix: "/api/controlnet", feature: "llm-api" },
  { prefix: "/api/video-prompt", feature: "llm-api" },
  { prefix: "/api/image-prompt", feature: "llm-api" },
  { prefix: "/api/batch", feature: "llm-api" },
  { prefix: "/api/duo", feature: "llm-api" },
  { prefix: "/api/compose", feature: "llm-api" },
  { prefix: "/api/fix", feature: "llm-api" },
  { prefix: "/api/compact", feature: "llm-api" },
];

export function featureForPath(pathname: string): AppFeatureId | null {
  const path = pathname.split("?")[0] ?? pathname;

  if (path === "/") {
    return "generate";
  }

  for (const entry of PAGE_FEATURE_MAP) {
    if (path === entry.prefix || path.startsWith(`${entry.prefix}/`)) {
      return entry.feature;
    }
  }

  for (const entry of API_FEATURE_MAP) {
    if (path === entry.prefix || path.startsWith(`${entry.prefix}/`)) {
      return entry.feature;
    }
  }

  return null;
}

export function featureLabel(id: AppFeatureId): string {
  return APP_FEATURES.find((feature) => feature.id === id)?.label ?? id;
}
