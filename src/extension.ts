// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {
  commands,
  Disposable,
  ExtensionContext,
  extensions,
  window,
} from "vscode";
import { BranchTabsViewProvider } from "./branchTabsView";
import { GitExtension, Repository } from "./git";
import {
  cleanUpExpiredBranchMemories,
  clearAllBranchMemories,
  disposeFileWatchers,
  resetBranchFileWatchers,
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
        await cleanUpExpiredBranchMemories(context, () =>
          branchTabView.refresh()
        );

        repository.state.onDidChange(
          async () => {
            const currBranchName = repository.state.HEAD?.name;

            if (currBranchName) {
              if (prevBranchName && prevBranchName !== currBranchName) {
                disposeFileWatchers();
                await restoreBranchMemTabs(context, currBranchName);
              }

              resetBranchFileWatchers(context, currBranchName, () =>
                branchTabView.refresh()
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
    commands.registerCommand(
      clearAllCommand,
      async () =>
        await clearAllBranchMemories(context).then(async () => {
          refreshTabView();
          await window.showInformationMessage(
            "Branch Tabs: Cleared All Saved Tabs"
          );
        })
    )
  );

  const disableAutoRestoreCommand = "branchTabs.disableAutoRestore";
  context.subscriptions.push(
    commands.registerCommand(
      disableAutoRestoreCommand,
      async () =>
        await setAutoRestore(context, false).then(async () => {
          refreshTabView();
          await window.showInformationMessage(
            "Branch Tabs: Disabled Auto Restore"
          );
        })
    )
  );

  const enableAutoRestoreCommand = "branchTabs.enableAutoRestore";
  context.subscriptions.push(
    commands.registerCommand(
      enableAutoRestoreCommand,
      async () =>
        await setAutoRestore(context, true).then(async () => {
          refreshTabView();
          await window.showInformationMessage(
            "Branch Tabs: Enabled Auto Restore"
          );
        })
    )
  );
};

// this method is called when your extension is deactivated
export function deactivate(context: ExtensionContext) {
  disposeFileWatchers();
  gitWatchers.forEach((d) => d.dispose());
  context.subscriptions.forEach((s) => s.dispose());
}
