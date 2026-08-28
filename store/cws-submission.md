# Chrome Web Store Submission — v1.0.1

## Upload

File: `rumdl-extension.zip` (approximately 1.8MB)
Path: `/Users/ruben/Projects/rumdl-repos/rumdl-chrome-extension/rumdl-extension.zip`

Manifest version: `1.0.1`

Package contents verified: 19 files, manifest at ZIP root, 5,885,679 bytes uncompressed.

---

## Store Listing

### Short Description

```
Lint Markdown as you type on GitHub and GitLab, with inline warnings, keyboard navigation, and safe one-click fixes.
```

### Detailed Description

```
rumdl is a fast, privacy-first Markdown linter for your browser. Markdown processing happens locally via WebAssembly. Your Markdown content is never sent to the developer or any third party.

Get instant feedback as you write issues, pull requests, comments, and wiki pages on GitHub and GitLab. Stop getting review comments about Markdown formatting.

Features:
• 70+ lint rules covering headings, lists, links, code blocks, and more
• Keyboard-accessible line markers showing exactly where problems occur
• Responsive warning panel with rule details, locations, and descriptions
• Safe one-click fixes that never overwrite newer typing
• Search, enable, disable, or configure rules from the extension popup
• Automatically matches your site's dark or light theme
• Platform-aware keyboard shortcuts for fast navigation

Supported sites:
• GitHub (issues, pull requests, comments, wikis, discussions)
• GitLab (issues, merge requests, comments, wikis)

Keyboard shortcuts:
• Cmd/Ctrl+Shift+L — Toggle warning panel
• Cmd/Ctrl+Shift+F — Fix all problems
• Cmd/Ctrl+. — Fix problem at cursor
• Cmd/Ctrl+Alt+] — Next warning
• Cmd/Ctrl+Alt+[ — Previous warning

Open source at github.com/rvben/rumdl-chrome-extension

rumdl does not include analytics, advertising, tracking, accounts, or in-app purchases. Extension preferences can be synchronized by Chrome through your browser profile; they never contain Markdown content.
```

### Category

```
Developer Tools
```

### Language

```
English
```

### Screenshots

Upload both current-version screenshots from `store/screenshots/` in this order:

1. `after-01-warning-panel.png` (1280x800)
2. `after-02-gutter-dots.png` (1280x800)

Do not upload the 380x560 popup captures; Chrome Web Store screenshots must be 1280x800 or 640x400.

---

## Privacy

### Single Purpose

```
Provide local Markdown linting and safe formatting assistance inside GitHub and GitLab Markdown editors.
```

### Privacy Policy URL

```
https://github.com/rvben/rumdl-chrome-extension/blob/main/store/privacy-policy.md
```

### Permissions Justification

```
storage: Store extension preferences such as enabled rules, Markdown flavor, and line length. Preferences may synchronize through the user's Chrome profile and never contain Markdown content.
```

### Host Permission Justification (github.com, gitlab.com)

```
The extension injects a content script that adds real-time Markdown linting to textareas on GitHub and GitLab. It reads textarea content in-memory for linting and displays inline warnings. No data is transmitted.
```

### Data-use declarations

- Do not select any collected-data categories: Markdown content is processed locally and is not transmitted to the developer or third parties.
- Certify that the extension does not sell or transfer user data.
- Certify that the extension does not use data for purposes unrelated to its single purpose.
- Certify that the extension does not use data for creditworthiness or lending.

---

## Distribution

- Visibility: **Public**
- Regions: **All regions**
- In-app purchases: **No**
- Publishing: **Automatically publish after review**

## Test Instructions

No test account is required.

1. Install the extension in Chrome 121 or newer.
2. Open a GitHub or GitLab issue, pull/merge request, comment, or wiki editor.
3. Enter Markdown with a duplicate top-level heading, malformed list spacing, or a line longer than 80 characters.
4. Confirm the rumdl status control reports issues and the warning panel lists their rule IDs and locations.
5. Use a Fix button on an auto-fixable warning and confirm the editor updates.

---

## Homepage URL

```
https://github.com/rvben/rumdl-chrome-extension
```

## Support Email

```
support@am8.nl
```

---

## Submission Checklist

- [x] v1.0.1 ZIP built and GitHub release published
- [x] Typecheck, 235 unit tests, and 7 real-extension tests passed
- [x] Real signed-in GitHub editor smoke test completed; draft cleared
- [x] Package manifest and contents verified
- [x] Current-version 1280x800 screenshots selected
- [x] Listing and privacy language reconciled with `chrome.storage.sync`
- [ ] Developer Dashboard authentication completed
- [ ] Package uploaded
- [ ] Store Listing, Privacy, and Distribution tabs saved
- [ ] Submitted for review
