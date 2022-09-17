import {
  commands,
  Disposable,
  ExtensionContext,
  TextDocument,
  Uri,
  window,
  workspace,
} from "vscode";
import { Repository } from "./git";

const PREV_BRANCH_NAME_KEY = "branchTabs_prevBranchName";

export const getBranchDocsKey = (branchName: string) => {
  return `branchTabs_${branchName}_openDocs`;
};

export const getBranchNames = (
  context: ExtensionContext,
  repository: Repository
) => {
  const prevBranchName =
    context.workspaceState.get<string>(PREV_BRANCH_NAME_KEY);
  const currBranchName = repository.state.HEAD?.name;

  return { prevBranchName, currBranchName };
};

export const storeBranchName = async (
  context: ExtensionContext,
  branchName: string
) => {
  await context.workspaceState.update(PREV_BRANCH_NAME_KEY, branchName);
};

export const didSwitchToNewBranch = (
  prevBranchName?: string,
  currBranchName?: string
) => {
  return prevBranchName && currBranchName && prevBranchName !== currBranchName;
};

export const stashPrevBranchDocs = async (
  context: ExtensionContext,
  openTextDocPaths: string[],
  prevBranchName: string
) => {
  if (openTextDocPaths.length > 0) {
    const prevBranchKey = getBranchDocsKey(prevBranchName);
    await context.workspaceState.update(prevBranchKey, openTextDocPaths);
  }
};

export const restoreBranchDocs = async (
  context: ExtensionContext,
  currBranchName: string
) => {
  const currBranchKey = getBranchDocsKey(currBranchName);
  const stashedDocPaths =
    context.workspaceState.get<string[]>(currBranchKey) ?? [];
  if (stashedDocPaths.length > 0) {
    await commands.executeCommand("workbench.action.closeAllEditors");

    stashedDocPaths.forEach(async (path) => {
      await workspace
        .openTextDocument(Uri.file(path).with({ scheme: "file" }))
        .then((doc) => window.showTextDocument(doc, { preview: false }));
    });
  }
};

export const resetTempDocTracking = (
  openTextDocPaths: string[],
  tempDisposables: Disposable[]
) => {
  openTextDocPaths = [];
  tempDisposables.forEach((d) => d.dispose());

  workspace.onDidOpenTextDocument(
    (doc) => trackFileDocument(doc, openTextDocPaths),
    null,
    tempDisposables
  );
  workspace.onDidCloseTextDocument(
    (doc) => stopTrackingFileDocument(doc, openTextDocPaths),
    null,
    tempDisposables
  );
};

export const trackFileDocument = (
  doc: TextDocument,
  openTextDocPaths: string[]
) => {
  if (doc.uri.scheme === "file") {
    openTextDocPaths.push(doc.uri.path);
  }
};

export const stopTrackingFileDocument = (
  doc: TextDocument,
  openTextDocPaths: string[]
) => {
  if (doc.uri.scheme === "file") {
    openTextDocPaths = openTextDocPaths.filter((s) => s !== doc.uri.path);
  }
};
