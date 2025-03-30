import { OpenAI } from "@adaline/openai";
import { getAdalinePrompt, sendLogToAdaline } from "./adaline";
import { Gateway } from "@adaline/gateway";
import { Config } from "@adaline/types";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

const openai = new OpenAI();
const gpt4o = openai.chatModel({
  apiKey: OPENAI_API_KEY,
  modelName: "gpt-4o",
});

const gateway = new Gateway({
  enableProxyAgent: false,
});

const config = Config().parse({
  temperature: 0,
});

interface Variables {
  [key: string]: string;
}

export async function* streamGenerationStep({
  promptId,
  variables,
}: {
  variables: Variables;
  promptId: string;
}) {
  const rawPrompt = await getAdalinePrompt(promptId);
  let resultPrompt = rawPrompt;
  for (const key in variables) {
    resultPrompt = resultPrompt.replaceAll(`{${key}}`, variables[key]);
  }

  // stream chat
  const stream = gateway.streamChat({
    model: gpt4o,
    config: config,
    messages: [
      {
        role: "system",
        content: [
          {
            modality: "text",
            value: resultPrompt,
          },
        ],
      },
    ],
  });

  const beginStreamTime = performance.now();
  let textStreamed = "";

  for await (const chunk of stream) {
    const messagesStringInChunk = chunk.response.partialMessages.reduce(
      (prev, message) => {
        const content = message.partialContent;
        if (content.modality === "partial-text") {
          return prev + content.value;
        }
        return prev;
      },
      ""
    );
    textStreamed += messagesStringInChunk;
    yield {
      full: textStreamed,
      partial: messagesStringInChunk,
      prompt: resultPrompt,
    };
  }

  sendLogToAdaline({
    projectId: promptId,
    model: gpt4o.modelSchema.name,
    provider: openai.name,
    completion: textStreamed,
    variables: variables,
    latency: performance.now() - beginStreamTime,
  });
}
