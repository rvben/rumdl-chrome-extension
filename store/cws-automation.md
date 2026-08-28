# Chrome Web Store Automation

The release workflow can upload a tested extension package, submit it for
review, and publish it automatically after approval. A separate workflow checks
the review and policy status daily. Both workflows stay disabled until all four
required repository variables are present.

## What is automated

- Verify that the Git tag, `manifest.json`, and `package.json` versions match.
- Run the full unit and real-extension browser test suites.
- Build one ZIP and use that exact artifact for both GitHub and Chrome.
- Authenticate with a short-lived Google access token through GitHub OIDC.
- Upload the ZIP through Chrome Web Store API v2.
- Poll asynchronous package processing until it succeeds or fails.
- Submit with automatic publishing after approval and a 100% rollout.
- Fail instead of ignoring Web Store validation warnings.
- Check daily for rejection, policy warnings, or takedown.

Store listing, screenshot, privacy, permission, and visibility changes still
require the Chrome Web Store Developer Dashboard.

## Required repository variables

| Variable | Value |
| --- | --- |
| `CWS_EXTENSION_ID` | The 32-character item ID from the Developer Dashboard |
| `CWS_PUBLISHER_ID` | Publisher ID from **Publisher → Account** |
| `GCP_SERVICE_ACCOUNT` | Service account email used for publishing |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full Workload Identity Provider resource name |

These identifiers are configuration, not secrets. No Google key, OAuth client
secret, or refresh token should be stored in GitHub.

## One-time Google Cloud setup

The commands below use task-specific shell variables intentionally. Replace the
placeholder project ID before running them.

```bash
export CWS_GCP_PROJECT_ID="your-google-cloud-project"
export CWS_GITHUB_REPOSITORY="rvben/rumdl-chrome-extension"
export CWS_SERVICE_ACCOUNT_NAME="rumdl-cws-publisher"
export CWS_WORKLOAD_POOL="github-actions"
export CWS_WORKLOAD_PROVIDER="rumdl-release-tags"

gcloud config set project "$CWS_GCP_PROJECT_ID"
gcloud services enable \
  chromewebstore.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com

gcloud iam service-accounts create "$CWS_SERVICE_ACCOUNT_NAME" \
  --display-name="rumdl Chrome Web Store publisher"

gcloud iam workload-identity-pools create "$CWS_WORKLOAD_POOL" \
  --location=global \
  --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc "$CWS_WORKLOAD_PROVIDER" \
  --location=global \
  --workload-identity-pool="$CWS_WORKLOAD_POOL" \
  --display-name="rumdl release tags" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref,attribute.workflow=assertion.workflow" \
  --attribute-condition="assertion.repository=='$CWS_GITHUB_REPOSITORY' && ((assertion.ref.startsWith('refs/tags/v') && assertion.workflow=='Release') || (assertion.ref=='refs/heads/main' && assertion.workflow=='Chrome Web Store Status'))"
```

Grant only this repository's release-tag identities permission to impersonate
the service account:

```bash
export CWS_GCP_PROJECT_NUMBER="$(gcloud projects describe "$CWS_GCP_PROJECT_ID" --format='value(projectNumber)')"
export CWS_SERVICE_ACCOUNT="$CWS_SERVICE_ACCOUNT_NAME@$CWS_GCP_PROJECT_ID.iam.gserviceaccount.com"

gcloud iam service-accounts add-iam-policy-binding "$CWS_SERVICE_ACCOUNT" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/$CWS_GCP_PROJECT_NUMBER/locations/global/workloadIdentityPools/$CWS_WORKLOAD_POOL/attribute.repository/$CWS_GITHUB_REPOSITORY"

export GCP_WORKLOAD_IDENTITY_PROVIDER="$(gcloud iam workload-identity-pools providers describe "$CWS_WORKLOAD_PROVIDER" \
  --location=global \
  --workload-identity-pool="$CWS_WORKLOAD_POOL" \
  --format='value(name)')"
```

In the Chrome Web Store Developer Dashboard, open **Publisher → Account** and
add the value of `CWS_SERVICE_ACCOUNT` as the publisher's service account.
Google currently permits one service account per publisher.

## Configure GitHub

Authenticate the GitHub CLI, then store the four non-secret values:

```bash
gh auth login

gh variable set CWS_EXTENSION_ID --body "your-32-character-extension-id"
gh variable set CWS_PUBLISHER_ID --body "your-publisher-id"
gh variable set GCP_SERVICE_ACCOUNT --body "$CWS_SERVICE_ACCOUNT"
gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER --body "$GCP_WORKLOAD_IDENTITY_PROVIDER"
```

Optionally add required reviewers to the `chrome-web-store` GitHub environment.
Without an environment protection rule, publishing starts automatically after a
tagged GitHub Release succeeds.

## Validate before the next release

1. Open **Actions → Chrome Web Store Status**.
2. Run the workflow manually.
3. Confirm the job summary reports the current submitted and published states.
4. Confirm no credential or access token appears in the logs.

The daily monitor fails on `REJECTED`, a policy warning, or a takedown so normal
GitHub Actions failure notifications can surface the problem.

## Release flow

After setup, creating and pushing a Conventional Commits release tag is enough:

```bash
git tag v1.0.2
git push origin v1.0.2
```

The workflow runs all checks, creates the GitHub Release, uploads the same ZIP,
and submits it for Chrome Web Store review. The release fails closed when the
package upload, authentication, or Web Store validation does not succeed.

For local API diagnostics, provide a short-lived access token only in the
current shell and run:

```bash
CWS_ACCESS_TOKEN="short-lived-token" \
CWS_EXTENSION_ID="your-extension-id" \
CWS_PUBLISHER_ID="your-publisher-id" \
node scripts/chrome-web-store.mjs status
```

Never commit access tokens or service-account key files.
