import * as vscode from 'vscode';

export type LinkData = {
	range: vscode.Range;
	target: string;
};

export class MarkdownDocumentLinkProvider implements vscode.DocumentLinkProvider {
	readonly onDidChangeDocumentLinks: vscode.Event<void>;

	links: LinkData[] = [];

	private readonly _onDidChangeDocumentLinks = new vscode.EventEmitter<void>();

	constructor() {
		this.onDidChangeDocumentLinks = this._onDidChangeDocumentLinks.event;
	}

	provideDocumentLinks(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		document: vscode.TextDocument,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		token: vscode.CancellationToken,
	): vscode.ProviderResult<vscode.DocumentLink[]> {
		return this.links.map((data) => new vscode.DocumentLink(data.range, vscode.Uri.parse(data.target)));
	}

	triggerUpdate() {
		this._onDidChangeDocumentLinks.fire();
	}
}
