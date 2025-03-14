import * as vscode from "vscode";

import { performGenerationStep } from "./code-gen";
import { fetchFigmaFrame } from "./fetch-figma";
import { convertFigmaFrameToElement } from "./figma-to-css-parser/parser";

function extractFromCopiedLink(figmaUrl: string): {
  fileKey: string | null;
  frameId: string | null;
} {
  // Regular expression to extract the file key and the node id
  const pattern =
    /https:\/\/www\.figma\.com\/design\/([^/?]+).*?node-id=([\d-]+)/;

  const match = figmaUrl.match(pattern);
  if (match) {
    const fileKey = match[1]; // Group 1: File Key
    const frameId = match[2]; // Group 2: Frame ID
    return { fileKey, frameId };
  } else {
    return { fileKey: null, frameId: null };
  }
}

async function readWorkspaceFile(filePath: string): Promise<string | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return null;
  }

  const rootUri = workspaceFolders[0].uri;
  const fileUri = vscode.Uri.joinPath(rootUri, filePath);

  try {
    const fileData = await vscode.workspace.fs.readFile(fileUri);
    return new TextDecoder().decode(fileData);
  } catch {
    return null;
  }
}

async function generateWithPreprocessing(frameData: any) {
  // log out the experimental figma to css processor result
  const documentNode = (Object.values(frameData.nodes)[0]! as any)
    .document as DocumentNode;

  const processedFigma = convertFigmaFrameToElement(documentNode);

  let global = "";
  let tailwind = "";
  try {
    tailwind = (await readWorkspaceFile("tailwind.config.ts")) || "";
    global = (await readWorkspaceFile("src/app/globals.css")) || "";
  } catch (e) {
    console.warn(e);
  }

  const code = await performGenerationStep({
    promptId: "260c67f5-c348-4483-9011-73453094e5b3",
    variables: {
      frame: JSON.stringify(processedFigma),
      tailwind: tailwind,
      globalcss: global,
    },
  });

  return {
    code,
    processedDoc: JSON.stringify(processedFigma),
    rawDoc: JSON.stringify(documentNode),
  };
}

async function displayAsDocument(doc: string, language: string = "json") {
  const documentRaw = await vscode.workspace.openTextDocument({
    content: doc,
    language: language,
  });
  await vscode.window.showTextDocument(documentRaw);
}

export function activate(context: vscode.ExtensionContext) {
  /**
   * =============================================
   * EXTRACT THE DATA FOR DEV
   * =============================================
   */
  vscode.commands.registerCommand(
    "fetch-figma-frame.fetchFrameData",
    async (figmaLink?: string) => {
      figmaLink =
        figmaLink ||
        (await vscode.window.showInputBox({
          prompt: "Enter link to frame",
        }));
      if (!figmaLink) {
        return;
      }
      const { fileKey, frameId } = extractFromCopiedLink(figmaLink);
      if (!fileKey || !frameId) {
        return;
      }

      try {
        const frameData = await fetchFigmaFrame(fileKey, frameId);
        if (frameData instanceof Error) {
          vscode.window.showErrorMessage(frameData.message);
        }
        const { code, rawDoc, processedDoc } = await generateWithPreprocessing(
          frameData
        );

        const documentRaw = await vscode.workspace.openTextDocument({
          content: rawDoc,
          language: "json",
        });
        const documentProcessed = await vscode.workspace.openTextDocument({
          content: processedDoc,
          language: "json",
        });
        const codeDoc = await vscode.workspace.openTextDocument({
          content: code.completion,
          language: "TypeScript JSX",
        });

        await vscode.window.showTextDocument(documentRaw);
        await vscode.window.showTextDocument(documentProcessed);
        await vscode.window.showTextDocument(codeDoc);
      } catch (e: any) {
        vscode.window.showErrorMessage(e);
      }
    }
  );

  /**
   * =============================================
   * MAIN BODY FOR THE PROCESSING LOGIC
   * =============================================
   */
  let disposable = vscode.commands.registerCommand(
    "fetch-figma-frame.fetchFrame",
    async (figmaLink?: string) => {
      figmaLink =
        figmaLink ||
        (await vscode.window.showInputBox({
          prompt: "Enter link to frame",
        }));

      if (!figmaLink) {
        return;
      }

      const { fileKey, frameId } = extractFromCopiedLink(figmaLink);

      if (!fileKey || !frameId) {
        return;
      }

      // step 0 - capture the user input right away
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor!");
        return;
      }
      const position = editor.selection.active; // Cursor position

      const fetchFigmaAndGenerateCodeTask = async (
        progress: vscode.Progress<{
          message?: string;
          increment?: number;
        }>,
        token: vscode.CancellationToken
      ) => {
        try {
          // Fetch the Figma frame
          progress.report({ message: "Fetching..." });

          const frameData = await fetchFigmaFrame(fileKey, frameId);
          // const frameDataString = JSON.stringify(frameData, null, 2);

          if (token.isCancellationRequested) {
            return;
          }

          progress.report({ message: "Generating..." });
          const { code, processedDoc, rawDoc } =
            await generateWithPreprocessing(frameData);

          if (token.isCancellationRequested) {
            return;
          }
          // Generate the React code (old implementation)
          // progress.report({ message: "Extracing HTML(1/2)" });

          // // turn figma structure into code
          // const htmlExtract = await performGenerationStep({
          //   promptId: "927888a4-3962-4475-a756-d9b1c1f10baf",
          //   variables: {
          //     frame: frameDataString,
          //   },
          // });

          // if (token.isCancellationRequested) {
          //   return;
          // }

          // progress.report({ message: "Generating Component(2/2)" });
          // const code = await performGenerationStep({
          //   promptId: "f55e62c3-5530-4226-bdb0-bf0dcd92578a",
          //   variables: {
          //     info: htmlExtract,
          //   },
          // });

          // if (token.isCancellationRequested) {
          //   return;
          // }

          // Fetch the Figma frame
          // progress.report({ message: "Generating..." });
          // const code = await performGenerationStep({
          //   promptId: "260c67f5-c348-4483-9011-73453094e5b3",
          //   variables: {
          //     frame: frameDataString,
          //   },
          // });

          // Step 2: Insert the code into the editor
          editor.edit((editBuilder) => {
            editBuilder.insert(position, code.completion);
          });

          // Stop loading
          vscode.window
            .showInformationMessage(
              "Figma Frame fetched and inserted successfully!",
              "Open Log"
            )
            .then((selection) => {
              if (selection !== "Open Log") {
                return;
              }

              // render the content in new window
              displayAsDocument(rawDoc);
              displayAsDocument(processedDoc);
              displayAsDocument(code.prompt, "Plain Text");
            });
        } catch (error) {
          vscode.window.showErrorMessage("Failed to fetch Figma Frame");
        }
      };

      // Show loading notification with progress
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Fetch Figma Frame",
          cancellable: true,
        },
        fetchFigmaAndGenerateCodeTask
      );
    }
  );

  /**
   * =============================================
   * MAKE THIS EXTENSION LISTEN FOR USER PASTING
   * =============================================
   */
  const figmaDomain = "www.figma.com"; // Replace with your domain

  const pasteListener = vscode.workspace.onDidChangeTextDocument(
    async (event) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      // Get the first content change from the event
      const change = event.contentChanges[0];
      const pastedText = change.text;

      // Ensure we are detecting the correct URL pattern
      if (
        pastedText.startsWith(`https://${figmaDomain}`) ||
        pastedText.startsWith(`http://${figmaDomain}`)
      ) {
        const hasNodeId = pastedText.includes("node-id=");
        if (hasNodeId) {
          const position = change.range.start; // Starting position of the change
          const length = pastedText.length; // Length of the inserted URL

          // Create a range based on the start position and length of the inserted text
          const range = new vscode.Range(
            position,
            position.translate(0, length)
          );

          // Remove the original pasted URL
          await editor.edit((editBuilder) => {
            editBuilder.replace(range, ""); // Replace the pasted URL with an empty string
          });

          // Now, execute the fetchFigma command without the URL in the document
          await vscode.commands.executeCommand(
            "fetch-figma-frame.fetchFrame",
            pastedText
          );
        }
      }
    }
  );

  // Register for automatic disposal on extension shutdown
  context.subscriptions.push(pasteListener);
}

export function deactivate() {}
