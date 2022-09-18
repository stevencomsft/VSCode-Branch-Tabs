import {
  ExtensionContext,
  workspace,
  commands,
  Uri,
  window,
  Disposable,
} from "vscode";

interface IBranchMemExpiries {
  [branchName: string]: number;
}

const AUTO_RESTORE = "AUTO_RESTORE";
const BRANCH_MEM_EXPIRIES_KEY = "BRANCH_MEM_EXPIRIES";
const EXPIRY_TIME = 30 * 24 * 60 * 60 * 1000; // total milliseconds in 30 days

let fileOpenDisposable: Disposable;
let fileCloseDisposable: Disposable;
let visibleEditorChangeDisposable: Disposable;

/**
 * Returns the key used in the workspace memory state for storing branch-specific tabs
 * @param branchName the branch name part of the key
 * @returns a key to be used for getting and updated workspace memory state
 */
const branchTabsKey = (branchName: string) => {
  return `${branchName}_tabs`;
};

/**
 * Gets the branch expiries from workspace memory state
 * @param context the extension context - from the activate method parameters
 * @returns the current branch expiries
 */
export const getBranchExpiries = (context: ExtensionContext) => {
  return (
    context.workspaceState.get<IBranchMemExpiries>(BRANCH_MEM_EXPIRIES_KEY) ??
    {}
  );
};

/**
 * Updates the workspace memory state with new branch expiries
 * @param context the extension context - from the activate method parameters
 * @param branchExpiries the new branch expiries to set into workspace memory state
 */
const updateBranchExpiries = async (
  context: ExtensionContext,
  branchExpiries: IBranchMemExpiries | undefined
) => {
  await context.workspaceState.update(BRANCH_MEM_EXPIRIES_KEY, branchExpiries);
};

/**
 * Clears all stored tab memories and other keys from the workspace memory state
 * @param context the extension context - from the activate method parameters
 */
export const clearAllBranchMemories = async (context: ExtensionContext) => {
  const existingExpiries = getBranchExpiries(context);
  Object.keys(existingExpiries).forEach(async (branchName) => {
    await context.workspaceState.update(branchTabsKey(branchName), undefined);
  });
  await updateBranchExpiries(context, undefined);
  await setAutoRestore(context, false);
};

/**
 * Gets the existing branch expiries and iterates over them to clean up any expired branch tabs
 * @param context the extension context - from the activate method parameters
 */
export const cleanUpExpiredBranchMemories = async (
  context: ExtensionContext,
  refreshTabView: () => void
) => {
  const nowTime = new Date().getTime();

  const newExpiries: IBranchMemExpiries = {};
  const existingExpiries = getBranchExpiries(context);
  Object.keys(existingExpiries).forEach(async (branchName) => {
    const branchExpiry = existingExpiries[branchName];
    if (nowTime > branchExpiry) {
      // it is now past the expiry time, so we should delete the tab memory stored for this branch
      await context.workspaceState.update(branchTabsKey(branchName), undefined);
    } else {
      newExpiries[branchName] = existingExpiries[branchName];
    }
  });
  await updateBranchExpiries(context, newExpiries).then(() => {
    refreshTabView();
  });
};

/**
 * Updates a branch's expiry data for its workspace memory state
 * @param context the extension context - from the activate method parameters
 * @param branchName the branch name to update the expiry for
 */
const updateBranchExpiry = async (
  context: ExtensionContext,
  branchName: string
) => {
  const existingExpiries = getBranchExpiries(context);
  existingExpiries[branchName] = new Date().getTime() + EXPIRY_TIME;
  await updateBranchExpiries(context, existingExpiries);
};

/**
 * Gets all paths stored in the workspace memory state for a specific branch
 * @param context the extension context - from the activate method parameters
 * @param branchName the branch name to retrieve paths for
 * @returns a string array of tab paths
 */
export const getBranchMemoryPaths = (
  context: ExtensionContext,
  branchName: string
): { path: string; viewColumn: number }[] => {
  const paths =
    context.workspaceState.get<{ path: string; viewColumn: number }[]>(
      branchTabsKey(branchName)
    ) ?? [];
  return paths;
};

/**
 * Stores/updated paths in the workspace memory state for a specific branch
 * @param context the extension context - from the activate method parameters
 * @param branchName the branch name to store paths for
 * @param branchMemoryPaths the array of paths to save
 */
const storeBranchMemoryPaths = async (
  context: ExtensionContext,
  branchName: string,
  branchMemoryPaths: { path: string; viewColumn: number }[]
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
 * @param path the path to the file being added
 */
const addFilePathToBranchMemory = async (
  context: ExtensionContext,
  branchName: string,
  path: string
) => {
  const branchMemoryPaths = getBranchMemoryPaths(context, branchName);
  if (!branchMemoryPaths.some((p) => p.path === path)) {
    branchMemoryPaths.push({ path, viewColumn: 1 });
    await storeBranchMemoryPaths(context, branchName, branchMemoryPaths);
  }
};

/**
 * Updates the view column for a file path in the workstate memory state for a specific branch
 * @param context the extension context - from the activate method parameters
 * @param branchName the branch name to add the file path to
 * @param path the path to the file being added
 * @param viewColumn the view column of the file being tracked
 */
const updateFileViewColumn = async (
  context: ExtensionContext,
  branchName: string,
  path: string,
  viewColumn: number
) => {
  const branchMemoryPaths = getBranchMemoryPaths(context, branchName);
  const entryIndex = branchMemoryPaths.findIndex(
    (p) => p.path === path && p.viewColumn !== viewColumn
  );
  if (entryIndex !== -1) {
    branchMemoryPaths.splice(entryIndex, 1, {
      path,
      viewColumn,
    });
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
  path: string
) => {
  let branchMemoryPaths = getBranchMemoryPaths(context, branchName);
  if (branchMemoryPaths.some((p) => p.path === path)) {
    branchMemoryPaths = branchMemoryPaths.filter((p) => p.path !== path);
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
  if (visibleEditorChangeDisposable) {
    visibleEditorChangeDisposable.dispose();
  }
};

/**
 * Resets the file watchers and starts event listening again
 * @param context the extension context - from the activate method parameters
 * @param branchName the branch name to listen to events for
 */
export const resetBranchFileWatchers = (
  context: ExtensionContext,
  branchName: string,
  refreshTabView: () => void
) => {
  disposeFileWatchers();

  fileOpenDisposable = workspace.onDidOpenTextDocument((doc) => {
    if (doc.uri.scheme === "file") {
      addFilePathToBranchMemory(context, branchName, doc.uri.path).then(() => {
        refreshTabView();
      });
    }
  });
  fileCloseDisposable = workspace.onDidCloseTextDocument((doc) => {
    if (doc.uri.scheme === "file") {
      removeFileFromBranchMemory(context, branchName, doc.uri.path).then(() => {
        refreshTabView();
      });
    }
  });
  visibleEditorChangeDisposable = window.onDidChangeVisibleTextEditors(
    (changes) => {
      changes.forEach((change) => {
        if (change.document.uri.scheme === "file") {
          updateFileViewColumn(
            context,
            branchName,
            change.document.uri.path,
            change.viewColumn?.valueOf() ?? 1
          );
        }
      });
    }
  );
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
  const stashedDocPaths = getBranchMemoryPaths(context, branchName);
  if (stashedDocPaths.length > 0) {
    await (shouldAutoRestore(context)
      ? Promise.resolve("Yes")
      : Promise.resolve(
          window.showInformationMessage(
            `Would you like to restore ${stashedDocPaths.length} tab${
              stashedDocPaths.length > 1 ? "s" : ""
            } stashed away for this branch?`,
            { modal: true },
            "Yes",
            "No"
          )
        )
    ).then(async (answer) => {
      if (answer === "Yes") {
        await commands.executeCommand("workbench.action.closeAllEditors");

        stashedDocPaths.forEach(async (p) => {
          await workspace
            .openTextDocument(Uri.file(p.path).with({ scheme: "file" }))
            .then((doc) =>
              window.showTextDocument(doc, {
                preview: false,
                viewColumn: p.viewColumn ?? 1,
              })
            );
        });

        if (!shouldAutoRestore(context)) {
          promptAutoRestore(context);
        } else {
          alertSuccess(context);
        }
      }
    });

    await updateBranchExpiry(context, branchName);
  }
};

/**
 * Checks to see if the user has agreed to auto restore in the workspace memory state
 * @param context the extension context - from the activate method parameters
 * @returns true or false if should auto restore
 */
const shouldAutoRestore = (context: ExtensionContext) => {
  return context.workspaceState.get<boolean>(AUTO_RESTORE) ?? false;
};

/**
 * Sets the auto restore value in the workspace memory state
 * @param context the extension context - from the activate method parameters
 */
export const setAutoRestore = async (
  context: ExtensionContext,
  enabled: boolean
) => {
  await context.workspaceState.update(AUTO_RESTORE, enabled);
};

/**
 * Prompts the user to allow auto restoring of tabs
 * @param context the extension context - from the activate method parameters
 */
const promptAutoRestore = (context: ExtensionContext) => {
  window
    .showInformationMessage(
      "Branch tabs restored. Would you like to automatically restore branch tabs in the future?",
      "Yes",
      "No"
    )
    .then(async (answer) => {
      if (answer === "Yes") {
        await setAutoRestore(context, true);
      }
    });
};

/**
 * Alerts the user of branch tab restoration success
 * @param context the extension context - from the activate method parameters
 */
const alertSuccess = (context: ExtensionContext) => {
  window.showInformationMessage("Branch tabs restored.");
};
