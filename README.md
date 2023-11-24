# markdown-inline-preview-vscode

A VS Code extension for improving the display of markdown directly in the editor. This makes markdown editing more pleasant as you don't need to be switching between the editor and preview as much, and it hides a lot of clutter.

TODO: screenshot

Tweaks made include:

- Making headings larger
- Hiding bold and italic formatting characters
- Disabling coloring of bold text and headings
- Making indented bullets look nicer
  - TODO: see if we can change bullet style?
- TODO: Hiding link details

## Usage

TODO: usage instructions

## Contributing

Pull requests are welcomed on GitHub! To get started:

1. Install Git and Node.js
2. Clone the repository
3. Install dependencies with `npm install`
4. Run `npm run test` to run tests
5. Build with `npm run build`

## Releases

Versions follow the [semantic versioning spec](https://semver.org/).

To release:

1. Use `npm version <major | minor | patch>` to bump the version
2. Run `git push --follow-tags` to push with tags
3. Wait for GitHub Actions to publish to the NPM registry.
