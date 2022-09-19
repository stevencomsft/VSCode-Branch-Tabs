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
} from "vscode";
import { getBranchExpiries, getBranchMemoryPaths } from "./utility";

export class BranchTabsViewProvider
  implements TreeDataProvider<BranchTabEntry>
{
  private _onDidChangeTreeData: EventEmitter<
    BranchTabEntry | undefined | null | void
  > = new EventEmitter<BranchTabEntry | undefined | null | void>();
  readonly onDidChangeTreeData: Event<
    BranchTabEntry | undefined | null | void
  > = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  constructor(private context: ExtensionContext) {}

  getTreeItem(element: BranchTabEntry): TreeItem {
    return element;
  }

  getChildren(element?: BranchTabEntry): Thenable<BranchTabEntry[]> {
    if (element) {
      const branchTabs = getBranchMemoryPaths(this.context, element.branchName);
      return Promise.resolve(
        branchTabs.map((tab) => {
          const fileName = path.basename(tab.path);
          return new BranchTabEntry(
            fileName,
            tab.path,
            TreeItemCollapsibleState.None,
            element.branchName,
            tab.path,
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
          return new BranchTabEntry(
            branchName,
            undefined,
            TreeItemCollapsibleState.Collapsed,
            branchName,
            undefined,
            undefined
          );
        })
      );
    }
  }
}

export class BranchTabEntry extends TreeItem {
  constructor(
    public readonly label: string,
    public readonly description: string | undefined,
    public readonly collapsibleState: TreeItemCollapsibleState,
    public readonly branchName: string,
    public readonly path: string | undefined,
    public readonly command: Command | undefined
  ) {
    super(label, collapsibleState);
    this.tooltip = this.label;
    this.description = description;
    this.contextValue = command ? "branchTabEntry" : 'branch';
  }
}
