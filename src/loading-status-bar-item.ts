import * as vscode from "vscode";

// Function to create and manage a loading status in the status bar
export function createLoadingStatusBarItem(): vscode.StatusBarItem {
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.hide(); // Initially hide the status bar item
  return statusBarItem;
}

// Function to show loading indicator
export function startLoading(statusBarItem: vscode.StatusBarItem) {
  statusBarItem.text = `$(sync~spin) Generating Code...`; // Loading spinner with text
  statusBarItem.show(); // Show the status bar item
}

// Function to hide loading indicator
export function stopLoading(statusBarItem: vscode.StatusBarItem) {
  statusBarItem.hide(); // Hide the status bar item once loading is done
}
