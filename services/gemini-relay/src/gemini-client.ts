import { GoogleGenerativeAI } from '@google/generative-ai';
import type { RelayGenerateRequest, BilingualText } from '@nanchang/shared';
import { ParseError } from './errors';

/**
 * Calls Gemini with the given request and returns bilingual commentary text.
 *
 * The response MUST contain both 'en' and 'zh' string fields — single-pass
 * bilingual generation is a hard contract requirement (see BilingualText TSDoc).
 * If either field is absent the job fails as 'parse', never stored partially.
 */
export async function callGemini(
  apiKey: string,
  request: RelayGenerateRequest,
): Promise<BilingualText> {
  const genAI = new GoogleGenerativeAI(apiKey);

  // Pass responseSchema as-is to Gemini. The HK API (Phase 3) is responsible
  // for constructing a schema that declares en+zh as required string properties.
  const model = genAI.getGenerativeModel({
    model: request.model,
    systemInstruction: request.systemInstruction,
    generationConfig: {
      responseMimeType: 'application/json',
      // The relay is a thin pass-through; the HK API owns schema construction.
      responseSchema: request.responseSchema as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    },
  });

  const result = await model.generateContent(request.userPrompt);
  const rawText = result.response.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new ParseError(`Gemini returned non-JSON response: ${rawText.slice(0, 300)}`);
  }

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.en !== 'string' || typeof obj.zh !== 'string') {
    throw new ParseError(
      `Gemini response missing required 'en'/'zh' string fields. ` +
        `Got keys: ${Object.keys(obj).join(', ')} — value: ${JSON.stringify(obj).slice(0, 300)}`,
    );
  }

  return { en: obj.en, zh: obj.zh };
}
