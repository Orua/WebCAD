# Security and privacy / 安全与隐私

## Reporting

Do not post credentials, private drawings or exploitable details in public Issues. Use the repository's private vulnerability reporting option under GitHub Security when available. Its availability has not been verified by this document. If it is unavailable, open a minimal issue asking the maintainer for a private reporting channel, without including vulnerability details. No response-time commitment is currently published.

For ordinary bugs, provide reproducible steps, the application build identifier and a small synthetic input you have permission to share. Review debug reports and screenshots before posting them. Remove cookies, tokens, account data, customer identifiers, private URLs and local filesystem paths.

## Data processing boundaries

Local browser modeling uses Worker/WASM. Rendering uses browser resources; local file selection alone is not evidence that a server received the file. Browser recovery storage and saved project files may retain project geometry. Save a deliberate copy of your project; browser storage is not a durable backup.

Services, Agent hosts and remote conversion are optional network features. When configured and invoked, they can receive task text, geometry or attachments needed for that operation. Their retention, access control, network endpoints and logging depend on the deployment. Inspect the configured capability and destination before sharing sensitive input. Static asset requests also reach the site's hosting server, which may keep access logs.

This document does not claim an anonymous build has passed acceptance, that every workflow stays offline, or that optional hosts/services have been audited. The [deployment checklist](docs/PUBLIC-DEPLOYMENT.md) requires separate verification of these boundaries. Public frontend access must not grant access to protected Agent or service functions.

## Publishing

Never ship `.env` files, tokens, private source fixtures, server configuration secrets, debug logs or backups. Do not publish a source snapshot as complete corresponding source unless its declared scope and matching native build material support that claim. Review [license decisions](docs/compliance/LICENSE_DECISION.md) alongside security checks; build-integrity success alone does not authorize publication.
