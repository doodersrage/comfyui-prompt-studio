import { llmImageStatusHandlers } from '@/lib/llm-image-routes';

const handlers = llmImageStatusHandlers('openai');

export const runtime = handlers.runtime;
export const maxDuration = handlers.maxDuration;
export const GET = handlers.GET;
export const POST = handlers.POST;
export const OPTIONS = handlers.OPTIONS;
