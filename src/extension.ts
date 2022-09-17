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

const disposables: Disposable[] = [];

const PREV_BRANCH_NAME_KEY = "branchTabs_prevBranchName";

function getBranchDocsKey(branchName: string) {
  return `branchTabs_${branchName}_openDocs`;
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
  const gitExtension =
    extensions.getExtension<GitExtension>("vscode.git")?.exports;
  const git = gitExtension?.getAPI(1);

  if (git) {
    git.onDidOpenRepository((repository: Repository) => {
      repository.state.onDidChange(() => {
        const prevBranchName =
          context.workspaceState.get<string>(PREV_BRANCH_NAME_KEY);
        const currBranchName = repository.state.HEAD?.name;

        if (prevBranchName && prevBranchName !== currBranchName) {
          const openDocUris = workspace.textDocuments
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
            context.workspaceState.get<Uri[]>(branchTabsKey);
          if (prevBranchDocUris && prevBranchDocUris.length > 0) {
            commands
              .executeCommand("workbench.action.closeAllEditors")
              .then(() => {
                prevBranchDocUris.forEach(async (doc) => {
                  await workspace
                    .openTextDocument(Uri.file(doc.path))
                    .then((doc) =>
                      window.showTextDocument(doc, { preview: false })
                    );
                });
              });
          }
        }

        context.workspaceState.update(PREV_BRANCH_NAME_KEY, currBranchName);
      }, disposables);
    }, disposables);
  }
}

// this method is called when your extension is deactivated
export function deactivate() {
  disposables.forEach((d) => d.dispose());
}
