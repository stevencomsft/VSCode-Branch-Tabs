// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { GitExtension, Repository } from "./git";

const PREV_BRANCH_NAME_KEY = "branchTabs_prevBranchName";

function getBranchDocsKey(branchName: string) {
  return `branchTabs_${branchName}_openDocs`;
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const gitExtension =
    vscode.extensions.getExtension<GitExtension>("vscode.git")?.exports;
  const git = gitExtension?.getAPI(1);

  if (git) {
    git.onDidOpenRepository((repository: Repository) => {
      context.workspaceState.update(
        PREV_BRANCH_NAME_KEY,
        repository.state.HEAD?.name
      );

      repository.state.onDidChange(() => {
        const prevBranchName =
          context.workspaceState.get<string>(PREV_BRANCH_NAME_KEY);
        const currBranchName = repository.state.HEAD?.name;

        if (prevBranchName && prevBranchName !== currBranchName) {
          const openDocUris = vscode.workspace.textDocuments
            .map((doc) => doc.uri)
            .filter((uri) => uri.scheme === "file");
          if (openDocUris.length > 0) {
            const branchTabsKey = getBranchDocsKey(prevBranchName);
            context.workspaceState.update(branchTabsKey, openDocUris);
          }
        }

        if (currBranchName && currBranchName !== prevBranchName) {
          const branchTabsKey = getBranchDocsKey(currBranchName);
          const prevBranchDocUris =
            context.workspaceState.get<vscode.Uri[]>(branchTabsKey);
          if (prevBranchDocUris && prevBranchDocUris.length > 0) {
            vscode.commands
              .executeCommand("workbench.action.closeAllEditors")
              .then(() => {
                prevBranchDocUris.forEach((docUri) => {
                  vscode.workspace
                    .openTextDocument(vscode.Uri.file(docUri.path))
                    .then((doc) =>
                      vscode.window.showTextDocument(doc, { preview: false })
                    );
                });
              });
          }
        }

        context.workspaceState.update(PREV_BRANCH_NAME_KEY, currBranchName);
      });
    });
  }
}

// this method is called when your extension is deactivated
export function deactivate() {}
