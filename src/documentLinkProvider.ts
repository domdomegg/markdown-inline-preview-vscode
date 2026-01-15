import * as vscode from 'vscode';

export interface LinkData {
  range: vscode.Range;
  target: string;
}

export class MarkdownDocumentLinkProvider implements vscode.DocumentLinkProvider {
  links: LinkData[] = [];

  private _onDidChangeDocumentLinks = new vscode.EventEmitter<void>();

  // eslint-disable-next-line no-underscore-dangle
  readonly onDidChangeDocumentLinks = this._onDidChangeDocumentLinks.event;

  provideDocumentLinks(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    document: vscode.TextDocument,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.DocumentLink[]> {
    return this.links.map((data) => new vscode.DocumentLink(data.range, vscode.Uri.parse(data.target)));
  }

  triggerUpdate() {
    // eslint-disable-next-line no-underscore-dangle
    this._onDidChangeDocumentLinks.fire();
  }
}
