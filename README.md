# markdown-inline-preview-vscode

A VS Code extension for improving the display of markdown directly in the editor. This makes markdown editing more pleasant as you don't need to be switching between the editor and preview as much, and it hides a lot of clutter.

https://github.com/domdomegg/markdown-inline-preview-vscode/assets/4953590/112da46d-214b-4d2c-8f13-c269c8d040cd

Tweaks made include:

- Making headings larger
- Hiding bold, italic, strikethrough and code formatting characters
- Disabling coloring of bold text and headings

## Usage

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=domdomegg.markdown-inline-preview-vscode) or [Open VSX Registry](https://open-vsx.org/extension/domdomegg/markdown-inline-preview-vscode)

<details>
<summary>Recommended `.vscode/settings.json`</summary>

```json
{
  "[markdown]": {
    "editor.quickSuggestions": {
      "other": false,
      "comments": false,
      "strings": false
    },
    "editor.fontFamily": "Fira Sans",
    "editor.wrappingStrategy": "advanced",
    "editor.fontSize": 13,
    "editor.lineHeight": 1.5,
    "editor.cursorBlinking": "phase",
    "editor.lineNumbers": "off",
    "editor.indentSize": "tabSize",
    "editor.tabSize": 6,
    "editor.insertSpaces": false,
    "editor.autoClosingBrackets": "never",
    "editor.bracketPairColorization.enabled": false,
    "editor.matchBrackets": "never",
    "editor.guides.indentation": false,
    "editor.padding.top": 20
  },
  "editor.tokenColorCustomizations": {
    "[Default Dark Modern]": {
      "textMateRules": [
        {
          "scope": "punctuation.definition.list.begin.markdown",
          "settings": {
            "foreground": "#777",
          }
        },
      ]
    }
  }
}
```

</details>

## Contributing

Pull requests are welcomed on GitHub! To get started:

1. Install Git and Node.js
2. Clone the repository
3. Install dependencies with `npm install`
4. Build with `npm run build`

Run the extension locally with the 'Run and Debug' preset in VS Code.

## Releases

Versions follow the [semantic versioning spec](https://semver.org/).

To release:

1. Use `npm version <major | minor | patch>` to bump the version
2. Run `git push --follow-tags` to push with tags
3. Wait for GitHub Actions to publish to the NPM registry.
