import { OpenAI } from "@adaline/openai";
import { Gateway } from "@adaline/gateway";
import { Config } from "@adaline/types";

// Load environment variables from the .env file
const ADALINE_TOKEN = process.env.ADALINE_TOKEN || "";

const cachedPrompts: { [key: string]: string } = {};

export async function getAdalinePrompt(projectId: string): Promise<string> {
  if (cachedPrompts[projectId]) {
    return cachedPrompts[projectId];
  }
  try {
    const response = await fetch(
      `https://api.adaline.ai/v1/deployments/${projectId}/current`,
      {
        headers: {
          Authorization: `Bearer ${ADALINE_TOKEN}`, // Use environment variable
        },
      }
    );

    if (!response.ok) {
      throw new Error("network response was not ok");
    }

    const promptProject: any = await response.json(); // Parse the response
    const prompt = promptProject.messages[0].content[0].value; // Extract prompt

    // save to cached list
    cachedPrompts[projectId] = prompt;

    return prompt;
  } catch (error) {
    console.log(error);
    return "";
  }
}

interface LogData {
  projectId: string;
  provider: string;
  model: string;
  completion: string;
  cost?: string;
  latency?: number;
  inputTokens?: string;
  outputTokens?: string;
  variables?: Record<string, string>;
  metadata?: Record<string, string>;
  referenceId?: string;
}

export async function sendLogToAdaline(
  logData: LogData
): Promise<string | undefined> {
  const url = "https://api.adaline.ai/v1/logs";

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${ADALINE_TOKEN}`,
  };

  const body = JSON.stringify(logData);
  console.log(logData);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: headers,
      body: body,
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.statusText}`);
    }

    // const responseData = await response.json();
    // return responseData.id; // Assuming the ID is returned in the response
  } catch (error) {
    console.error("Error sending log:", error);
    return undefined;
  }
}

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
    // latency: performance.now() - beginStreamTime,
  });
}
