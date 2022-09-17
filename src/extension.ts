// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {
  commands,
  Disposable,
  ExtensionContext,
  extensions,
  Uri,
  window,
  workspace,
} from "vscode";
import { GitExtension, Repository } from "./git";
import {
  didSwitchToNewBranch,
  getBranchDocsKey,
  getBranchNames,
  resetTempDocTracking,
  restoreBranchDocs,
  stashPrevBranchDocs,
  storeBranchName,
} from "./utility";

interface ISessionState {
  mainDisposables: Disposable[];
  tempDisposables: Disposable[];
  openTextDocPaths: string[];
}

const sessionState: ISessionState = {
  mainDisposables: [],
  tempDisposables: [],
  openTextDocPaths: [],
};

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
  const gitExtension =
    extensions.getExtension<GitExtension>("vscode.git")?.exports;
  const git = gitExtension?.getAPI(1);

  if (git) {
    git.onDidOpenRepository(
      (repository: Repository) => {
        repository.state.onDidChange(
          async () => {
            const { prevBranchName, currBranchName } = getBranchNames(
              context,
              repository
            );

            if (didSwitchToNewBranch(prevBranchName, currBranchName)) {
              await stashPrevBranchDocs(
                context,
                sessionState.openTextDocPaths,
                prevBranchName!
              );

              resetTempDocTracking(
                sessionState.openTextDocPaths,
                sessionState.tempDisposables
              );

              await restoreBranchDocs(context, currBranchName!);
            }

            await storeBranchName(context, currBranchName!);
          },
          null,
          sessionState.mainDisposables
        );
      },
      null,
      sessionState.mainDisposables
    );
  }
}

// this method is called when your extension is deactivated
export function deactivate() {
  sessionState.mainDisposables.forEach((d) => d.dispose());
  sessionState.tempDisposables.forEach((d) => d.dispose());
}
