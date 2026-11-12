// The one place that talks to the Claude API. A skill supplies the instructions and the
// shape of the answer; this sends them and hands the answer back as parsed JSON.
// No SDK: one request, with fetch.

export interface Ask {
  apiKey: string
  model: string
  system: string
  user: string
  /** JSON Schema the answer has to match (structured outputs). */
  schema: unknown
  maxTokens: number
  timeoutMs?: number
}

export type AskFetch = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<Response>

export type HelperErrorCode = 'helper_down' | 'helper_refused' | 'helper_cut_off' | 'helper_key'

export class HelperError extends Error {
  readonly code: HelperErrorCode
  constructor(code: HelperErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code)
    this.name = 'HelperError'
    this.code = code
  }
}

/** The small, fast model: reading a recipe is not hard thinking. Can be changed with the AI_MODEL secret. */
export const DEFAULT_MODEL = 'claude-haiku-5-5'

/** Ask once and return the parsed answer. Throws HelperError. */
export async function ask(request: Ask, fetch: AskFetch): Promise<unknown> {
  let response: Response
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': request.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: request.model,
        max_tokens: request.maxTokens,
        system: request.system,
        messages: [{ role: 'user', content: request.user }],
        output_config: { format: { type: 'json_schema', schema: request.schema } },
      }),
      signal: AbortSignal.timeout(request.timeoutMs ?? 45_000),
    })
  } catch {
    throw new HelperError('helper_down')
  }
  if (response.status === 401 || response.status === 403) throw new HelperError('helper_key')
  if (!response.ok) throw new HelperError('helper_down', `status ${response.status}`)

  let body: { stop_reason?: string; content?: { type?: string; text?: string }[] }
  try {
    body = await response.json()
  } catch {
    throw new HelperError('helper_down', 'unreadable answer')
  }
  if (body.stop_reason === 'refusal') throw new HelperError('helper_refused')
  if (body.stop_reason === 'max_tokens') throw new HelperError('helper_cut_off')
  const text = (body.content ?? []).find((block) => block.type === 'text')?.text
  if (!text) throw new HelperError('helper_down', 'empty answer')
  try {
    return JSON.parse(text)
  } catch {
    throw new HelperError('helper_down', 'answer is not JSON')
  }
}
