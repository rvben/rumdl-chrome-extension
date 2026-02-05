# rumdl for GitHub

A Chrome extension that provides real-time Markdown linting for GitHub.com editors using [rumdl](https://github.com/rvben/rumdl).

## Features

- **Real-time linting**: Lint your markdown as you type in GitHub issue descriptions, PR descriptions, comments, and more
- **Visual indicators**: Underline markers show warning locations directly in the editor
- **Warning panel**: Side panel showing all issues with click-to-jump navigation
- **Auto-fix**: Fix all auto-fixable issues with one click
- **Per-issue fixes**: Fix individual issues inline
- **Configuration**: Customize line length, disabled rules, and markdown flavor
- **Theme support**: Automatic dark/light mode support matching GitHub's theme

## Supported GitHub Editors

- Issue descriptions
- PR descriptions
- Issue/PR comments
- Review comments
- Inline PR comments
- Wiki pages
- Discussions

## Installation

### From Source (Development)

1. Clone the repository:
   ```bash
   git clone https://github.com/rvben/rumdl.git
   cd rumdl/chrome-extension
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

4. Load in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `chrome-extension` folder

### From Chrome Web Store

Coming soon!

## Configuration

Click the extension icon in the toolbar to access settings:

- **Enable rumdl**: Toggle linting on/off
- **Markdown Flavor**: Choose between Standard, MkDocs, MDX, Quarto, or Obsidian flavors
- **Line Length**: Set the maximum line length (default: 80)
- **Disabled Rules**: Comma-separated list of rules to disable (e.g., `MD041, MD013`)
- **Inline markers**: Show/hide underline markers in the editor
- **Auto-format on submit**: Automatically fix issues before submitting (experimental)

## Architecture

The extension uses WebAssembly to run rumdl directly in the browser:

- **Service Worker**: Loads the WASM module and handles linting requests
- **Content Script**: Detects GitHub editors and manages the lint overlay
- **Popup**: Configuration UI

The WASM binary is ~2.5 MB (downloaded once and cached).

## Development

```bash
# Install dependencies
npm install

# Build the extension
npm run build

# Type-check without building
npm run typecheck

# Clean build artifacts
npm run clean

# Create a packaged extension
npm run package
```

## License

MIT - see [LICENSE](../LICENSE)
