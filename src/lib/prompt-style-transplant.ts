import { chatCompletion } from "./llm-client";

export async function transplantPromptStyle(input: {
  styleSource: string;
  subjectPrompt: string;
  model?: string;
}): Promise<string> {
  const styleSource = input.styleSource.trim();
  const subjectPrompt = input.subjectPrompt.trim();
  if (!styleSource || !subjectPrompt) {
    throw new Error("Both style source and subject prompt are required.");
  }

  const text = await chatCompletion({
    maxTokens: 900,
    temperature: 0.65,
    model: input.model,
    messages: [
      {
        role: "system",
        content:
          "You rewrite image prompts. Keep the subject and scene content from the SUBJECT prompt. Apply only the lighting, camera, mood, color palette, and compositional language from the STYLE prompt. Output a single final prompt with no commentary.",
      },
      {
        role: "user",
        content: `STYLE PROMPT:\n${styleSource}\n\nSUBJECT PROMPT:\n${subjectPrompt}\n\nRewrite the subject prompt using the style language.`,
      },
    ],
  });

  return text.trim();
}
