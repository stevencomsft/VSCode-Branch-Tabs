// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { Disposable, ExtensionContext, extensions } from "vscode";
import { GitExtension, Repository } from "./git";
import {
  cleanUpExpiredBranchMemories,
  disposeFileWatchers,
  resetBranchFileWatchers,
  restoreBranchMemTabs,
} from "./utility";

const gitWatchers: Disposable[] = [];

let prevBranchName: string;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
  const gitExtension =
    extensions.getExtension<GitExtension>("vscode.git")?.exports;
  const git = gitExtension?.getAPI(1);

  if (git) {
    git.onDidOpenRepository(
      async (repository: Repository) => {
        await cleanUpExpiredBranchMemories(context);

        repository.state.onDidChange(
          async () => {
            const currBranchName = repository.state.HEAD?.name;

            if (currBranchName) {
              if (prevBranchName && prevBranchName !== currBranchName) {
                await restoreBranchMemTabs(context, currBranchName);
              }

              resetBranchFileWatchers(context, currBranchName);
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

// this method is called when your extension is deactivated
export function deactivate() {
  disposeFileWatchers();
  gitWatchers.forEach((d) => d.dispose());
}
