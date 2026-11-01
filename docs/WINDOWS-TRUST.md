# Windows publisher identity and release checks

The icon and executable version information identify the product visually.
They do not establish a verified publisher or prevent security warnings.

The current project has **no code-signing certificate or signing account**.
Prerelease builds are unsigned and may be flagged as unrecognized by SmartScreen
or blocked by Smart App Control. The installer publisher text and executable
CompanyName are product metadata, not proof of a verified identity.

## Checks performed before publication

- The app, background agent, installer, and uninstaller use the Fortress icon.
  Windows CI verifies icon extraction, executable metadata, installation,
  application launch, upgrade preservation, and uninstall.
- Microsoft Defender scans the actual release files, including archives, with
  updated definitions. Custom scans ignore file exclusions and do not remediate
  artifacts. A detection, scan failure, or changed artifact blocks publication.
  No antivirus settings are changed on users' laptops.
- `Windows-trust-report.json` records each file's SHA-256, Authenticode status,
  signer if present, timestamp presence, and Defender engine/definition versions.
  It explicitly reports SmartScreen reputation as **NotTested**.
- Stable version tags require valid timestamped signatures on all executable and
  PowerShell files. Unsigned prereleases remain explicitly identified as unsigned.
  Signature checks happen before generating the final published checksum list.

A clean scan is evidence about those files and definitions at that time. It is
not a guarantee about future antivirus results or SmartScreen reputation.

## Completing publisher signing

Obtain a publicly trusted code-signing identity for the actual publisher. Options
include Microsoft Artifact Signing with identity validation or a CA-issued code
signing certificate backed by the issuer's required secure key storage.
Private keys, certificate passwords, and signing tokens must not be committed or
pasted into chat. GitHub OIDC can authenticate an eligible cloud signing workflow
without keeping a long-lived certificate password in this repository.

Once that identity is available, integrate its supported signing tool in this order:

1. Sign and timestamp the app, agent, bundled executable dependencies, and
   PowerShell scripts before creating the installed `SHA256SUMS` and ZIP.
2. Use Inno Setup's signing support to sign the uninstaller and final installer.
3. Verify signatures and timestamps on the actual packaged files, scan them, then
   create the final release checksum manifest. Signing changes file hashes.

Do not use a self-signed certificate, install a private root certificate on users'
machines, disable Defender/SmartScreen, or remove download trust markers to claim
public trust. Microsoft states that signing helps establish publisher identity,
but even a signed new app can receive reputation warnings. Store-distributed apps
have a different Microsoft-managed signing/reputation path.

Primary references: [SmartScreen reputation](https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation),
[Artifact Signing setup and eligibility](https://learn.microsoft.com/azure/artifact-signing/quickstart),
[Defender command-line scanning](https://learn.microsoft.com/defender-endpoint/command-line-arguments-microsoft-defender-antivirus),
[Inno Setup signing](https://jrsoftware.org/ishelp/topic_setup_signtool.htm).
