# Privacy Policy — rumdl Chrome Extension

**Last updated:** March 2026

## Data Collection

The rumdl Chrome extension does **not** collect, transmit, or store any user data. All markdown linting and auto-fix processing happens entirely on your device using a WebAssembly (WASM) module.

## What the extension accesses

- **Textarea content** on supported sites (GitHub, GitLab) — read in-memory only for linting. Never transmitted anywhere.
- **Chrome storage** (`chrome.storage.sync`) — used solely to persist your extension settings (enabled rules, line length, etc.) across devices via your Chrome profile.

## What the extension does NOT do

- No analytics or telemetry
- No network requests (beyond loading the extension itself)
- No cookies or tracking
- No data shared with third parties
- No user accounts or authentication

## Permissions explained

| Permission | Purpose |
|---|---|
| `storage` | Save your extension settings |
| `activeTab` | Read textarea content on the current tab for linting |
| Host permissions (github.com, gitlab.com) | Inject the content script that enables linting on these sites |

## Open source

The extension source code is publicly available at [github.com/rvben/rumdl-chrome-extension](https://github.com/rvben/rumdl-chrome-extension).

## Contact

For questions about this privacy policy, open an issue on the GitHub repository.
