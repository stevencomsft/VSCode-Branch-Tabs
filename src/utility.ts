import {
  ExtensionContext,
  workspace,
  commands,
  Uri,
  window,
  Disposable,
} from "vscode";

let fileOpenDisposable: Disposable;
let fileCloseDisposable: Disposable;

/**
 * Returns the key used in the workspace memory state for storing branch-specific tabs
 * @param branchName the branch name part of the key
 * @returns a key to be used for getting and updated workspace memory state
 */
const branchTabsKey = (branchName: string) => {
  return `${branchName}_tabs`;
};

/**
 * Gets all paths stored in the workspace memory state for a specific branch
 * @param context the extension context - from the activate method parameters
 * @param branchName the branch name to retrieve paths for
 * @returns a string array of tab paths
 */
const getBranchMemoryPaths = (
  context: ExtensionContext,
  branchName: string
) => {
  return context.workspaceState.get<string[]>(branchTabsKey(branchName)) ?? [];
};

/**
 * Stores/updated paths in the workspace memory state for a specific branch
 * @param context the extension context - from the activate method parameters
 * @param branchName the branch name to store paths for
 * @param branchMemoryPaths the string array of paths to save
 */
const storeBranchMemoryPaths = async (
  context: ExtensionContext,
  branchName: string,
  branchMemoryPaths: string[]
) => {
  await context.workspaceState.update(
    branchTabsKey(branchName),
    branchMemoryPaths
  );
};

/**
 * Adds a single file path to a branch's workspace memory state
 * @param context the extension context - from the activate method parameters
 * @param branchName the branch name to add the file path to
 * @param filePath the path to the file being added
 */
const addFilePathToBranchMemory = async (
  context: ExtensionContext,
  branchName: string,
  filePath: string
) => {
  const branchMemoryPaths = getBranchMemoryPaths(context, branchName);
  if (!branchMemoryPaths.includes(filePath)) {
    branchMemoryPaths.push(filePath);
    await storeBranchMemoryPaths(context, branchName, branchMemoryPaths);
  }
};

/**
 * Removes a single file path to a branch's workspace memory state
 * @param context the extension context - from the activate method parameters
 * @param branchName the branch name to remove the file path from
 * @param filePath the path to the file being removed
 */
const removeFileFromBranchMemory = async (
  context: ExtensionContext,
  branchName: string,
  filePath: string
) => {
  let branchMemoryPaths = getBranchMemoryPaths(context, branchName);
  if (branchMemoryPaths.includes(filePath)) {
    branchMemoryPaths = branchMemoryPaths.filter((path) => path !== filePath);
    await storeBranchMemoryPaths(context, branchName, branchMemoryPaths);
  }
};

/** Disposes of the file watchers - stops all events from firing */
export const disposeFileWatchers = () => {
  if (fileOpenDisposable) {
    fileOpenDisposable.dispose();
  }
  if (fileCloseDisposable) {
    fileCloseDisposable.dispose();
  }
};

/**
 * Resets the file watchers and starts event listening again
 * @param context the extension context - from the activate method parameters
 * @param branchName the branch name to listen to events for
 */
export const resetBranchFileWatchers = (
  context: ExtensionContext,
  branchName: string
) => {
  disposeFileWatchers();

  fileOpenDisposable = workspace.onDidOpenTextDocument((doc) => {
    if (doc.uri.scheme === "file") {
      addFilePathToBranchMemory(context, branchName, doc.uri.path);
    }
  });
  fileCloseDisposable = workspace.onDidCloseTextDocument((doc) => {
    if (doc.uri.scheme === "file") {
      removeFileFromBranchMemory(context, branchName, doc.uri.path);
    }
  });
};

/**
 * Restores all file path tabs from workspace memory state for a specific branch
 * @param context the extension context - from the activate method parameters
 * @param branchName the branch name to restore tabs for
 */
export const restoreBranchMemTabs = async (
  context: ExtensionContext,
  branchName: string
) => {
  const currBranchKey = branchTabsKey(branchName);
  const stashedDocPaths =
    context.workspaceState.get<string[]>(currBranchKey) ?? [];
  if (stashedDocPaths.length > 0) {
    disposeFileWatchers();
    await commands.executeCommand("workbench.action.closeAllEditors");

    stashedDocPaths.forEach(async (path) => {
      await workspace
        .openTextDocument(Uri.file(path).with({ scheme: "file" }))
        .then((doc) => window.showTextDocument(doc, { preview: false }));
    });
  }
};
