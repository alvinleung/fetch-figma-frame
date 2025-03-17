import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { convertFigmaFrameToElement } from "./figma-to-css-parser/parser";

export function parseJsonAndOpenInVSCode(filePath: string): void {
  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      console.error("Error reading file:", err);
      return;
    }

    try {
      const jsonData = JSON.parse(data);
      const parsedFrame = convertFigmaFrameToElement(jsonData);

      const outputFilePath = path.join(
        path.dirname(filePath),
        `${path.basename(
          filePath,
          path.extname(filePath)
        )}-parsed${path.extname(filePath)}`
      );

      fs.writeFile(
        outputFilePath,
        JSON.stringify(parsedFrame, null, 2),
        (err) => {
          if (err) {
            console.error("Error writing parsed JSON to file:", err);
            return;
          }

          exec(`code ${outputFilePath}`, (err) => {
            if (err) {
              console.error("Error opening file in VS Code:", err);
            } else {
              console.log("Parsed JSON file opened in VS Code");
            }
          });
        }
      );
    } catch (err) {
      console.error("Error parsing JSON:", err);
    }
  });
}

if (process.argv.length < 3) {
  console.error("Please provide a file path as an argument.");
  process.exit(1);
}

const filePath = process.argv[2];
parseJsonAndOpenInVSCode(filePath);
