#!/usr/bin/env node
/**
 * CLI wrapper for the prompt tools HTTP API.
 *
 * Usage:
 *   node scripts/qwen-prompt.mjs duo --hints "two gravel cyclists racing"
 *   node scripts/qwen-prompt.mjs pet --hints "golden retriever at the beach"
 *   node scripts/qwen-prompt.mjs fantasy --hints "elven ranger in moonlit forest"
 *   node scripts/qwen-prompt.mjs background --settingType "neon alley"
 *   node scripts/qwen-prompt.mjs lint --hints "gravel" --prompt "..."
 *   node scripts/qwen-prompt.mjs negative --sport cycling
 *   node scripts/qwen-prompt.mjs batch --hints "..." --count 5
 *   node scripts/qwen-prompt.mjs generate --input "neon alley, rain"
 *   node scripts/qwen-prompt.mjs format --input "draft prompt text"
 *   node scripts/qwen-prompt.mjs fix --hints "gravel" --prompt "..."
 *   node scripts/qwen-prompt.mjs compact --prompt "..." --model qwen-image-2512
 *   node scripts/qwen-prompt.mjs comfyui --prompt "..." [--negative "..."]
 *   node scripts/qwen-prompt.mjs topics-batch --topics "a|b|c" --target pet
 */

const BASE_URL = process.env.PROMPT_API_URL ?? 'http://127.0.0.1:47832';

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[index + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        index += 1;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tool = args._[0];

  if (!tool || tool === 'help' || args.help) {
    console.log(`Usage: node scripts/qwen-prompt.mjs <tool> [options]

Tools: duo, character, batch, lint, negative, catalog, compose, generate, format, fix, compact, comfyui, topics-batch, pet, fantasy, background, random-scene, refine, image-prompt, portfolio, webhook-test, recommend, recipes-run
Env: PROMPT_API_URL (default ${BASE_URL})
Portfolio: --input "draft" [--models a,b] [--queue] [--negative "..."]
Recommend: --input "neon alley portrait" [--limit 3]
Recipes-run: --prompt "..." --steps compact,format [--model sdxl-base]`);
    process.exit(0);
  }

  if (tool === 'recommend') {
    const input = String(args.input ?? args.text ?? args._[1] ?? '').trim();
    if (!input) {
      console.error('recommend requires --input');
      process.exit(1);
    }
    const response = await fetch(`${BASE_URL}/api/models/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input, limit: Number(args.limit) || 3 }),
    });
    console.log(JSON.stringify(await response.json(), null, 2));
    return;
  }

  if (tool === 'recipes-run') {
    const prompt = String(args.prompt ?? '').trim();
    const steps = String(args.steps ?? '')
      .split(',')
      .map(step => step.trim())
      .filter(Boolean);
    if (!prompt || steps.length === 0) {
      console.error('recipes-run requires --prompt and --steps (comma-separated)');
      process.exit(1);
    }
    const response = await fetch(`${BASE_URL}/api/recipes/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        model: args.model ?? 'sdxl-base',
        steps: steps.map(id => ({ id })),
      }),
    });
    console.log(JSON.stringify(await response.json(), null, 2));
    return;
  }

  const routes = {
    duo: '/api/duo',
    character: '/api/character',
    batch: '/api/batch',
    lint: '/api/lint',
    negative: '/api/negative',
    catalog: '/api/catalog',
    compose: '/api/compose',
    generate: '/api/generate',
    format: '/api/format',
    fix: '/api/fix',
    compact: '/api/compact',
    comfyui: '/api/comfyui',
    'topics-batch': '/api/topics/batch',
    pet: '/api/pet',
    fantasy: '/api/fantasy',
    roleplay: '/api/roleplay',
    background: '/api/background',
    'random-scene': '/api/random-scene',
    refine: '/api/refine',
    'image-prompt': '/api/image-prompt',
  };

  const path = routes[tool];
  if (!path) {
    console.error(`Unknown tool: ${tool}`);
    process.exit(1);
  }

  if (tool === 'catalog') {
    const query = args.q ? `?q=${encodeURIComponent(String(args.q))}` : '';
    const response = await fetch(`${BASE_URL}${path}${query}`);
    console.log(JSON.stringify(await response.json(), null, 2));
    return;
  }

  if (tool === 'webhook-test') {
    const response = await fetch(`${BASE_URL}/api/webhooks/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: args.url ?? args._[1],
        secret: args.secret,
        payload: {
          event: 'comfyui.job.completed',
          promptId: 'cli-test',
          prompt: args.prompt ?? 'CLI webhook test',
          model: args.model ?? 'qwen-image-2512',
          tool: 'cli',
          status: 'completed',
          imageCount: 1,
          completedAt: Date.now(),
        },
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      console.error(data.error ?? 'Webhook test failed.');
      process.exit(1);
    }
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (tool === 'portfolio') {
    const draft = args.input ?? args.draft ?? args._[1];
    if (!draft?.trim()) {
      console.error('portfolio requires --input or a draft argument');
      process.exit(1);
    }
    const queue = args.queue === true;
    const models = String(args.models ?? 'qwen-image-2512,flux-2-klein')
      .split(',')
      .map(entry => entry.trim())
      .filter(Boolean);
    for (const model of models) {
      const response = await fetch(`${BASE_URL}/api/format`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: draft.trim(),
          mode: 'positive',
          model,
          detail: args.detail ?? 'balanced',
          smartFormat: true,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        console.error(`${model}: ${data.error ?? 'Format failed.'}`);
        continue;
      }
      console.log(`--- ${model} ---`);
      console.log(data.prompt ?? '');
      console.log('');

      if (queue && data.prompt?.trim()) {
        const queueResponse = await fetch(`${BASE_URL}/api/comfyui`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: data.prompt,
            ...(args.negative ? { negativePrompt: String(args.negative) } : {}),
          }),
        });
        const queueData = await queueResponse.json();
        if (!queueResponse.ok) {
          console.error(`${model} queue: ${queueData.error ?? 'ComfyUI queue failed.'}`);
        } else {
          console.log(
            `${model} queued · ${queueData.promptId ? `prompt_id ${queueData.promptId}` : 'ok'}`
          );
        }
      }
    }
    return;
  }

  const body = {
    hints: args.hints,
    prompt: args.prompt,
    input: args.input,
    topics: args.topics
      ? String(args.topics)
          .split('|')
          .map(entry => entry.trim())
          .filter(Boolean)
      : undefined,
    target: args.target,
    model: args.model,
    detail: args.detail,
    teamKit: args['team-kit'] === true || args.teamKit === 'true',
    count: args.count ? Number(args.count) : undefined,
    sport: args.sport,
    preserveSubject: args.preserve === true || args.preserve === 'true',
    extra: args.extra,
    sportPresetId: args.preset,
    mode: args.mode,
    smartFormat: args.smart !== false && args.smart !== 'false',
    negativePrompt: args.negative,
    prompts: args.prompts
      ? String(args.prompts)
          .split('|')
          .map(entry => entry.trim())
          .filter(Boolean)
      : undefined,
    backgroundPrompt: args.background,
    subjectPrompt: args.subject,
    style: args.style,
    settingType: args.settingType,
    timeOfDay: args.timeOfDay,
    mood: args.mood,
    genre: args.genre,
    includePeople: args.includePeople === true || args.includePeople === 'true' || undefined,
    wildness: args.wildness ? Number(args.wildness) : undefined,
    llmTemperature: args.llmTemperature ? Number(args.llmTemperature) : undefined,
    allowTemplateFallback:
      args.allowTemplateFallback === true ||
      args.allowTemplateFallback === 'true' ||
      args.allowTemplateFallback === 'false'
        ? args.allowTemplateFallback === true || args.allowTemplateFallback === 'true'
        : undefined,
    matrixAxisRow: args.matrixAxisRow,
    matrixAxisCol: args.matrixAxisCol,
    matrixRowCount: args.matrixRowCount ? Number(args.matrixRowCount) : undefined,
    matrixColCount: args.matrixColCount ? Number(args.matrixColCount) : undefined,
  };

  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error(data.error ?? 'Request failed');
    process.exit(1);
  }

  if (tool === 'batch' && Array.isArray(data.results)) {
    for (const [index, entry] of data.results.entries()) {
      console.log(`--- variation ${index + 1} ---`);
      console.log(entry.prompt);
      console.log('');
    }
    return;
  }

  if (tool === 'topics-batch' && Array.isArray(data.results)) {
    for (const [index, entry] of data.results.entries()) {
      console.log(`--- topic ${index + 1}: ${entry.topic} ---`);
      console.log(entry.prompt);
      console.log('');
    }
    return;
  }

  if (tool === 'lint' && !args.prompt) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (tool === 'fix' && Array.isArray(data.changes)) {
    console.log(data.prompt ?? '');
    if (data.changes.length > 0) {
      console.error(`Applied: ${data.changes.map(change => change.description).join('; ')}`);
    }
    return;
  }

  if (tool === 'compact') {
    console.log(data.prompt ?? '');
    if (data.beforeChars != null && data.afterChars != null) {
      console.error(
        `Compacted ${data.beforeChars} → ${data.afterChars} chars (max ${data.maxChars})`
      );
    }
    return;
  }

  if (tool === 'comfyui') {
    console.log(
      [
        data.promptId ? `prompt_id ${data.promptId}` : 'queued',
        data.comfyUrl,
        data.queued != null ? `queued ${data.queued}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    );
    return;
  }

  console.log(data.prompt ?? JSON.stringify(data, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
