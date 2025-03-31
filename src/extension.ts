import * as vscode from "vscode";

import { streamGenerationStep } from "./code-gen";
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

async function* generateWithPreprocessing(frameData: any) {
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

  const stream = streamGenerationStep({
    promptId: "260c67f5-c348-4483-9011-73453094e5b3",
    variables: {
      frame: JSON.stringify(processedFigma),
      tailwind: tailwind,
      globalcss: global,
    },
  });

  for await (const update of stream) {
    yield {
      partial: update.partial,
      full: update.full,
      prompt: update.prompt,
      processedDoc: JSON.stringify(processedFigma),
      rawDoc: JSON.stringify(documentNode),
    };
  }
}

async function displayAsDocument(doc: string, language: string = "json") {
  const documentRaw = await vscode.workspace.openTextDocument({
    content: doc,
    language: language,
  });
  await vscode.window.showTextDocument(documentRaw);
}

export function activate(context: vscode.ExtensionContext) {
  let isGenerating = false;

  // Function to update context
  function setIsGenerating(active: boolean) {
    isGenerating = active;
    vscode.commands.executeCommand(
      "setContext",
      "fetch-figma-frame.isGenerating",
      active
    );
  }

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
        // const { code, rawDoc, processedDoc } = await generateWithPreprocessing(
        //   frameData
        // );

        const stream = generateWithPreprocessing(frameData);

        let rawDoc = "";
        let processedDoc = "";
        let code = "";

        for await (const chunk of stream) {
          code = chunk.full;
          rawDoc = chunk.rawDoc;
          processedDoc = chunk.processedDoc;
        }

        const documentRaw = await vscode.workspace.openTextDocument({
          content: rawDoc,
          language: "json",
        });
        const documentProcessed = await vscode.workspace.openTextDocument({
          content: processedDoc,
          language: "json",
        });
        const codeDoc = await vscode.workspace.openTextDocument({
          content: code,
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

  let isCancellationRequestedByEscape = false;
  vscode.commands.registerCommand("fetch-figma-frame.cancelFigmaFetch", () => {
    isCancellationRequestedByEscape = true;
  });

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

          if (
            token.isCancellationRequested ||
            isCancellationRequestedByEscape
          ) {
            setIsGenerating(false);
            return;
          }

          progress.report({ message: "Generating..." });

          const stream = generateWithPreprocessing(frameData);
          let lastFullContent = "";
          let prompt = "";
          let rawDoc = "";
          let processedDoc = "";

          for await (const update of stream) {
            if (
              token.isCancellationRequested ||
              isCancellationRequestedByEscape
            ) {
              // undo the whole chunk
              vscode.commands.executeCommand("undo");
              setIsGenerating(false);
              return;
            }
            // Update the editor with the latest full content
            const newContent = update.full;
            if (newContent !== lastFullContent) {
              await editor.edit(
                (editBuilder) => {
                  // Disable undo stop for each incremental edit
                  editor.document.languageId; // Triggers internal refresh to keep streaming live

                  // Calculate the end position based on lastFullContent
                  const startPosition = position;
                  const lines = lastFullContent.split("\n");
                  const endPosition = position.translate(
                    lines.length - 1,
                    lines[lines.length - 1].length
                  );
                  const range = new vscode.Range(startPosition, endPosition);

                  editBuilder.replace(range, newContent);
                },
                { undoStopBefore: false, undoStopAfter: false }
              ); // Prevents multiple undo points

              await editor.edit(() => {}, {
                undoStopAfter: true,
                undoStopBefore: true,
              });

              lastFullContent = newContent;
            }

            // capture the stream info for logging
            prompt = update.prompt;
            rawDoc = update.rawDoc;
            processedDoc = update.processedDoc;
          }

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
              displayAsDocument(prompt, "Plain Text");
            });
        } catch (error) {
          setIsGenerating(false);
          vscode.window.showErrorMessage("Failed to fetch Figma Frame");
        }
      };

      // Show loading notification with progress
      isCancellationRequestedByEscape = false;
      setIsGenerating(true);
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Fetch Figma Frame",
          cancellable: true,
        },
        fetchFigmaAndGenerateCodeTask
      );
      // after generating with everything
      setIsGenerating(false);
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
      const hasNodeId = pastedText.includes("node-id=");
      const isFigmaUrl =
        pastedText.startsWith(`https://${figmaDomain}`) ||
        pastedText.startsWith(`http://${figmaDomain}`);

      if (!isFigmaUrl || !hasNodeId) {
        return;
      }

      vscode.commands.executeCommand("undo");
      await vscode.commands.executeCommand(
        "fetch-figma-frame.fetchFrame",
        pastedText
      );
    }
  );

  // Register for automatic disposal on extension shutdown
  context.subscriptions.push(pasteListener);
}

export function deactivate() {}
