// In Next.js runtime, enforce server-only import. In scripts (Node), skip.
if (process.env.NEXT_RUNTIME) {
  import("server-only").catch(() => {
    console.warn("[openai] server-only import failed, skipping.");
  });
}
import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY?.trim();

export const openai = apiKey ? new OpenAI({ apiKey }) : null;
