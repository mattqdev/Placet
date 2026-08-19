import { runClaudePrompt } from '../ai/claudeCli';

const MAX_PROMPT_CHARS = 4000;

/**
 * Turns a raw user prompt into a short synthesized task title via the
 * `claude` CLI. Deliberately *not* called from the hook forwarder /
 * opencode plugin path — those run synchronously in front of the user's
 * prompt (UserPromptSubmit / chat.message block the assistant until they
 * return), so an LLM round-trip there would add real latency to every
 * single prompt. Instead this runs from the long-lived extension host,
 * after the fast local heuristic title has already been shown, and the
 * result is applied in the background once ready.
 */
export function buildTitlePrompt(prompt: string): string {
  const trimmed = prompt.length > MAX_PROMPT_CHARS ? prompt.slice(0, MAX_PROMPT_CHARS) : prompt;
  return [
    'Summarize the coding request below as a short task title.',
    'Output ONLY the title: 3-8 words, title case, no trailing punctuation, no quotes, no markdown.',
    '',
    `Request:\n${trimmed}`,
  ].join('\n');
}

export async function synthesizeTitle(prompt: string): Promise<string | undefined> {
  if (!prompt.trim()) return undefined;
  try {
    const title = await runClaudePrompt(buildTitlePrompt(prompt), 15000);
    const cleaned = title.replace(/[.!?]+$/, '').trim();
    return cleaned || undefined;
  } catch {
    return undefined;
  }
}
