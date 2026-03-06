import { createChatHandler } from "glove-next";

export const POST = createChatHandler({
  provider: "openrouter",
  model: "minimax/minimax-m2.5",
  apiKey: process.env.OPENROUTER_API_KEY
});
