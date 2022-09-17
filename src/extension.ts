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

const gitWatchers: Disposable[] = [];
let fileOpenDisposable: Disposable;
let fileCloseDisposable: Disposable;

const branchTabsKey = (branchName: string) => {
  return `${branchName}_tabs`;
};

const getBranchMemoryPaths = (
  context: ExtensionContext,
  branchName: string
) => {
  return context.workspaceState.get<string[]>(branchTabsKey(branchName)) ?? [];
};

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

const addFileToBranchMemory = async (
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

const disposeFileWatchers = () => {
  if (fileOpenDisposable) {
    fileOpenDisposable.dispose();
  }
  if (fileCloseDisposable) {
    fileCloseDisposable.dispose();
  }
};

const resetBranchFileWatchers = (
  context: ExtensionContext,
  branchName: string
) => {
  disposeFileWatchers();

  fileOpenDisposable = workspace.onDidOpenTextDocument((doc) => {
    if (doc.uri.scheme === "file") {
      addFileToBranchMemory(context, branchName, doc.uri.path);
    }
  });
  fileCloseDisposable = workspace.onDidCloseTextDocument((doc) => {
    if (doc.uri.scheme === "file") {
      removeFileFromBranchMemory(context, branchName, doc.uri.path);
    }
  });
};

const restoreBranchMemTabs = async (
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
            const currBranchName = repository.state.HEAD?.name;

            if (currBranchName) {
              await restoreBranchMemTabs(context, currBranchName);

              resetBranchFileWatchers(context, currBranchName);
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
