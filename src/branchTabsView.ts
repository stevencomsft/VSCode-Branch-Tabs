import path = require("path");
import {
  Command,
  commands,
  Event,
  EventEmitter,
  ExtensionContext,
  TreeDataProvider,
  TreeItem,
  TreeItemCollapsibleState,
  Uri,
  window,
} from "vscode";
import { getBranchExpiries, getBranchMemoryPaths } from "./utility";

export class BranchTabsViewProvider implements TreeDataProvider<Dependency> {
  private _onDidChangeTreeData: EventEmitter<
    Dependency | undefined | null | void
  > = new EventEmitter<Dependency | undefined | null | void>();
  readonly onDidChangeTreeData: Event<Dependency | undefined | null | void> =
    this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  constructor(private context: ExtensionContext) {}

  getTreeItem(element: Dependency): TreeItem {
    return element;
  }

  getChildren(element?: Dependency): Thenable<Dependency[]> {
    if (element) {
      const branchTabs = getBranchMemoryPaths(this.context, element.label);
      return Promise.resolve(
        branchTabs.map((tab) => {
          const fileName = path.basename(tab.path);
          return new Dependency(
            fileName,
            tab.path,
            TreeItemCollapsibleState.None,
            {
              title: "Open Tab",
              command: "vscode.open",
              arguments: [Uri.file(tab.path)],
            }
          );
        })
      );
    } else {
      const allBranchTabs = getBranchExpiries(this.context);
      return Promise.resolve(
        Object.keys(allBranchTabs).map((branchName) => {
          return new Dependency(
            branchName,
            undefined,
            TreeItemCollapsibleState.Collapsed,
            undefined
          );
        })
      );
    }
  }
}

class Dependency extends TreeItem {
  constructor(
    public readonly label: string,
    public readonly description: string | undefined,
    public readonly collapsibleState: TreeItemCollapsibleState,
    command: Command | undefined
  ) {
    super(label, collapsibleState);
    this.tooltip = this.label;
    this.description = description;
    this.command = command;
  }
}