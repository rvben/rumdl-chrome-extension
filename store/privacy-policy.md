# Privacy Policy — rumdl Chrome Extension

**Last updated:** March 2026

## Data Collection

The rumdl Chrome extension does **not** collect, transmit, or store any personal data. All Markdown linting and auto-fix processing happens entirely on your device using a WebAssembly (WASM) module.

## What the extension accesses

- **Textarea content** on supported sites (GitHub, GitLab) — read in-memory only for linting. Never transmitted anywhere.
- **Chrome storage** (`chrome.storage.sync`) — used solely to persist your extension settings (enabled rules, line length, etc.) across devices via your Chrome profile.

## What the extension does NOT do

- No analytics or telemetry
- No network requests (beyond loading the extension itself)
- No cookies or tracking
- No data shared with third parties
- No user accounts or authentication

## Data retention

No user data is retained or cached beyond the current browser session. Extension settings stored via `chrome.storage.sync` are managed by your Chrome profile and can be cleared by uninstalling the extension.

## Permissions explained

| Permission | Purpose |
|---|---|
| `storage` | Save your extension settings |
| Host permissions (github.com, gitlab.com) | Inject the content script that enables linting on these sites |

The extension also requires `wasm-unsafe-eval` in its content security policy to execute the WebAssembly linting engine. This only applies to the extension's own code and does not affect web pages.

## GDPR and CCPA

Since no personal data is collected or processed, GDPR and CCPA data subject requests are not applicable.

## Open source

The extension source code is publicly available at [github.com/rvben/rumdl-chrome-extension](https://github.com/rvben/rumdl-chrome-extension).

## Contact

For questions about this privacy policy, email support@am8.nl or open an issue on the [GitHub repository](https://github.com/rvben/rumdl-chrome-extension).
