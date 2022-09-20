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

interface IBranchTabMemory {
  path: string;
  viewColumn: number;
}

const AUTO_RESTORE = "AUTO_RESTORE";
const BRANCH_MEM_EXPIRIES_KEY = "BRANCH_MEM_EXPIRIES";
const EXPIRY_TIME = 30 * 24 * 60 * 60 * 1000; // total milliseconds in 30 days

let tabWatcher: Disposable | null;

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
 * Deletes stored tab memories and related keys from the workspace memory state for a specific branch
 * @param context the extension context - from the activate method parameters
 */
export const deleteBranchMemory = async (
  context: ExtensionContext,
  branchNameToDelete: string
) => {
  const newExpiries: IBranchMemExpiries = {};
  const existingExpiries = getBranchExpiries(context);
  Object.keys(existingExpiries).forEach(async (branchName) => {
    if (branchName !== branchNameToDelete) {
      newExpiries[branchName] = existingExpiries[branchName];
    }
  });
  await updateBranchExpiries(context, newExpiries);
  await context.workspaceState.update(
    branchTabsKey(branchNameToDelete),
    undefined
  );
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
): IBranchTabMemory[] => {
  const paths =
    context.workspaceState.get<IBranchTabMemory[]>(branchTabsKey(branchName)) ??
    [];
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
  branchMemoryPaths: IBranchTabMemory[]
) => {
  await context.workspaceState.update(
    branchTabsKey(branchName),
    branchMemoryPaths
  );
};

/**
 * Removes a single file path to a branch's workspace memory state
 * @param context the extension context - from the activate method parameters
 * @param branchName the branch name to remove the file path from
 * @param filePath the path to the file being removed
 */
export const removeFileFromBranchMemory = async (
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
export const disposeTabWatcher = () => {
  if (tabWatcher) {
    tabWatcher.dispose();
    tabWatcher = null;
  }
};

/**
 * Resets the file watchers and starts event listening again
 * @param context the extension context - from the activate method parameters
 * @param branchName the branch name to listen to events for
 */
export const resetBranchTabWatcher = (
  context: ExtensionContext,
  branchName: string,
  refreshTabView: () => void
) => {
  disposeTabWatcher();

  tabWatcher = window.tabGroups.onDidChangeTabs(async () => {
    const branchMemPaths: IBranchTabMemory[] = [];
    window.tabGroups.all.forEach((tabGroup) => {
      tabGroup.tabs.forEach((tab) => {
        const tabPath = (tab.input as any)?.uri as Uri;
        if (tabPath && !tab.isPreview) {
          branchMemPaths.push({
            path: tabPath.path,
            viewColumn: tabGroup.viewColumn,
          });
        }
      });
    });
    await storeBranchMemoryPaths(context, branchName, branchMemPaths);
    refreshTabView();
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
  const stashedDocPaths = getBranchMemoryPaths(context, branchName);
  if (stashedDocPaths.length > 0) {
    const shouldRestore = await (shouldAutoRestore(context)
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
        ));

    if (shouldRestore === "Yes") {
      await commands.executeCommand("workbench.action.closeAllEditors");

      for (let i = 0; i < stashedDocPaths.length; i++) {
        try {
          const stashedPath = stashedDocPaths[i];
          const openedDoc = await workspace.openTextDocument(
            Uri.file(stashedPath.path)
          );
          await window.showTextDocument(openedDoc, {
            preview: false,
            viewColumn: stashedPath.viewColumn ?? 1,
          });
        } catch (e) {
          console.log("Branch Tabs - error restoring tab: ", e);
        }
      }

      if (!shouldAutoRestore(context)) {
        promptAutoRestore(context);
      } else {
        alertSuccess(context);
      }
    }

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
