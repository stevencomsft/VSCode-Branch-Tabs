// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {
  commands,
  ExtensionContext,
  extensions,
  Uri,
  workspace,
} from "vscode";
import { GitExtension, Repository } from "./git";

const PREV_BRANCH_NAME_KEY = "branchTabs_prevBranchName";

function getBranchDocsKey(branchName: string) {
  return `branchTabs_${branchName}_openDocs`;
}

function openFilesInSync(uris: Uri[], index: number) {
  if (index >= uris.length) {
    return;
  }

  commands
    .executeCommand("vscode.open", Uri.file(uris[index].path))
    .then(() => {
      commands.executeCommand("workbench.action.keepEditor").then(() => {
        openFilesInSync(uris, index + 1);
      });
    });
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
                openFilesInSync(prevBranchDocUris, 0);
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
