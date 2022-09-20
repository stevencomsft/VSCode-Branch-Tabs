// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {
  commands,
  Disposable,
  ExtensionContext,
  extensions,
  window,
} from "vscode";
import { BranchTabEntry, BranchTabsViewProvider } from "./branchTabsView";
import { GitExtension, Repository } from "./git";
import {
  cleanUpExpiredBranchMemories,
  clearAllBranchMemories,
  deleteBranchMemory,
  disposeTabWatcher,
  removeFileFromBranchMemory,
  resetBranchTabWatcher,
  restoreBranchMemTabs,
  setAutoRestore,
} from "./utility";

const gitWatchers: Disposable[] = [];

let prevBranchName: string;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
  const branchTabView = registerScmView(context);
  registerCommandHandlers(context, () => branchTabView.refresh());

  const gitExtension =
    extensions.getExtension<GitExtension>("vscode.git")?.exports;
  const git = gitExtension?.getAPI(1);

  if (git) {
    git.onDidOpenRepository(
      async (repository: Repository) => {
        await cleanUpExpiredBranchMemories(context, () => branchTabView.refresh());

        repository.state.onDidChange(
          async () => {
            const currBranchName = repository.state.HEAD?.name;

            if (currBranchName) {
              if (prevBranchName && prevBranchName !== currBranchName) {
                disposeTabWatcher();
                await restoreBranchMemTabs(context, currBranchName);
              }

              resetBranchTabWatcher(
                context,
                currBranchName,
                () => branchTabView.refresh()
              );
              prevBranchName = currBranchName;
            }
          },
          null,
          gitWatchers
        );
      },
      null,
      gitWatchers
    );
  }
}

const registerScmView = (context: ExtensionContext) => {
  const branchTabView = new BranchTabsViewProvider(context);

  const scmViewDisposable = window.registerTreeDataProvider(
    "branchTabsView",
    branchTabView
  );
  gitWatchers.push(scmViewDisposable);

  return branchTabView;
};

/** Registers the command handlers and callback functions */
const registerCommandHandlers = (
  context: ExtensionContext,
  refreshTabView: () => void
) => {
  const clearAllCommand = "branchTabs.clearAll";
  context.subscriptions.push(
    commands.registerCommand(clearAllCommand, async () => {
      await clearAllBranchMemories(context);
      refreshTabView();
      await window.showInformationMessage(
        "Branch Tabs: Cleared All Saved Tabs"
      );
    })
  );

  const disableAutoRestoreCommand = "branchTabs.disableAutoRestore";
  context.subscriptions.push(
    commands.registerCommand(disableAutoRestoreCommand, async () => {
      await setAutoRestore(context, false);
      refreshTabView();
      await window.showInformationMessage("Branch Tabs: Disabled Auto Restore");
    })
  );

  const enableAutoRestoreCommand = "branchTabs.enableAutoRestore";
  context.subscriptions.push(
    commands.registerCommand(enableAutoRestoreCommand, async () => {
      await setAutoRestore(context, true);
      refreshTabView();
      await window.showInformationMessage("Branch Tabs: Enabled Auto Restore");
    })
  );

  const deleteEntryCommand = "branchTabs.deleteEntry";
  context.subscriptions.push(
    commands.registerCommand(
      deleteEntryCommand,
      async (entry: BranchTabEntry) => {
        await removeFileFromBranchMemory(
          context,
          entry.branchName,
          entry.path!
        );
        refreshTabView();
        await window.showInformationMessage(
          "Branch Tabs: Removed Tab from Branch State"
        );
      }
    )
  );

  const deleteBranchCommand = "branchTabs.deleteBranch";
  context.subscriptions.push(
    commands.registerCommand(
      deleteBranchCommand,
      async (entry: BranchTabEntry) => {
        await deleteBranchMemory(context, entry.branchName);
        refreshTabView();
        await window.showInformationMessage("Branch Tabs: Removed Branch Tabs");
      }
    )
  );
};

// this method is called when your extension is deactivated
export function deactivate(context: ExtensionContext) {
  disposeTabWatcher();
  gitWatchers.forEach((d) => d.dispose());
  context.subscriptions.forEach((s) => s.dispose());
}
