import * as vscode from 'vscode';

export interface AliasedURIData {
  range: vscode.Range;
  target: string;
}

export class MarkdownDocumentLinkProvider implements vscode.DocumentLinkProvider {
  aliasedURIData: AliasedURIData[] = [];

  private _onDidChangeDocumentLinks = new vscode.EventEmitter<void>();
  readonly onDidChangeDocumentLinks = this._onDidChangeDocumentLinks.event;

  provideDocumentLinks(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    document: vscode.TextDocument,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.DocumentLink[]> {
    return this.aliasedURIData.map((data) => {
      const link = new vscode.DocumentLink(data.range, vscode.Uri.parse(data.target));
      return link;
    });
  }

  triggerUpdate() {
    this._onDidChangeDocumentLinks.fire();
  }
}
