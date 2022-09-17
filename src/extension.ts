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
const tempDisposables: Disposable[] = [];
let openTextDocPaths: string[] = [];

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
    git.onDidOpenRepository(
      (repository: Repository) => {
        repository.state.onDidChange(
          async () => {
            const prevBranchName =
              context.workspaceState.get<string>(PREV_BRANCH_NAME_KEY);
            const currBranchName = repository.state.HEAD?.name;

            if (
              prevBranchName &&
              currBranchName &&
              prevBranchName !== currBranchName
            ) {
              if (openTextDocPaths.length > 0) {
                const prevBranchKey = getBranchDocsKey(prevBranchName);
                await context.workspaceState.update(
                  prevBranchKey,
                  openTextDocPaths
                );
              }

              openTextDocPaths = [];
              tempDisposables.forEach((d) => d.dispose());
              workspace.onDidOpenTextDocument(
                (doc) => {
                  if (doc.uri.scheme === "file") {
                    openTextDocPaths.push(doc.uri.path);
                  }
                },
                null,
                tempDisposables
              );
              workspace.onDidCloseTextDocument(
                (doc) => {
                  if (doc.uri.scheme === "file") {
                    openTextDocPaths = openTextDocPaths.filter(
                      (s) => s !== doc.uri.path
                    );
                  }
                },
                null,
                tempDisposables
              );
              const currBranchKey = getBranchDocsKey(currBranchName);
              const stashedDocPaths =
                context.workspaceState.get<string[]>(currBranchKey) ?? [];
              if (stashedDocPaths.length > 0) {
                await commands.executeCommand(
                  "workbench.action.closeAllEditors"
                );

                stashedDocPaths.forEach(async (path) => {
                  await workspace
                    .openTextDocument(Uri.file(path).with({ scheme: "file" }))
                    .then((doc) =>
                      window.showTextDocument(doc, { preview: false })
                    );
                });
              }
            }

            await context.workspaceState.update(
              PREV_BRANCH_NAME_KEY,
              currBranchName
            );
          },
          null,
          disposables
        );
      },
      null,
      disposables
    );
  }
}

// this method is called when your extension is deactivated
export function deactivate() {
  disposables.forEach((d) => d.dispose());
  tempDisposables.forEach((d) => d.dispose());
}
