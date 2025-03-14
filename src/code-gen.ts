import { OpenAI, temperature } from "@adaline/openai";
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

const ONE_PROMPT_ID = "260c67f5-c348-4483-9011-73453094e5b3";
const REACT_COMPONENT_ID = "f55e62c3-5530-4226-bdb0-bf0dcd92578a";
const HTML_EXTRACT_ID = "927888a4-3962-4475-a756-d9b1c1f10baf";

async function runCompletion(prompt: string) {
  const result = await gateway.completeChat({
    model: gpt4o,
    config: config,
    messages: [
      {
        role: "system",
        content: [
          {
            modality: "text",
            value: prompt,
          },
        ],
      },
    ],
    options: {
      enableCache: false,
    },
  });
  return result;
}

const unwrapResponseString = (res: any) =>
  res.response.messages[0].content[0].value;

interface Variables {
  [key: string]: string;
}

export async function performGenerationStep({
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

  const completion = await runCompletion(resultPrompt);
  const completionString = unwrapResponseString(completion) as string;
  sendLogToAdaline({
    projectId: promptId,
    model: gpt4o.modelSchema.name,
    provider: openai.name,
    completion: completionString,
    variables: variables,
    latency: completion.latencyInMs,
  });

  return {
    completion: completionString,
    prompt: resultPrompt,
  };
}

// Deprecated
export async function generateReactCode(figmaDoc: string) {
  // turn figma structure into code
  const htmlExtract = await performGenerationStep({
    promptId: HTML_EXTRACT_ID,
    variables: {
      frame: figmaDoc,
    },
  });
  const componentCode = await performGenerationStep({
    promptId: REACT_COMPONENT_ID,
    variables: {
      info: htmlExtract.completion,
    },
  });

  return componentCode;
}
