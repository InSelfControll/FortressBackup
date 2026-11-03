# Cloud destinations

In **Storage Locations → Add Location**, select **Azure Blob Storage**, **Google
Drive**, **Google Cloud Storage**, or **OneDrive**. All four use **Restic** for
encrypted backups, snapshot listing, selected-file restore, and recovery to a
replacement Windows device or Linux source. BorgBackup and Rsync do not support
these destinations. A snapshot is the saved version created by a backup.

Google Drive and OneDrive use the bundled Rclone connection adapter underneath
Restic; Rclone is not a competing backup engine. Google Cloud Storage uses
Restic's native `gs:` backend. Google Drive and Google Cloud Storage are separate
services: a Drive account does not automatically create a Cloud Storage bucket.

## Browser sign-in setup (once per controller)

Open the dashboard using its trusted **HTTPS hostname**, select the provider,
and expand **Cloud sign-in setup**. Enter the HTTPS dashboard origin without a
path, for example `https://backup.example.com`. Copy the displayed callback URLs
exactly into the provider's Web application registration. Save its client ID and
client secret in this form; the secret is encrypted on the controller and is not
returned when reopening the form. Leaving it blank preserves the saved secret.
Changing a client ID requires its new secret. Google settings apply to both Google
providers; Microsoft settings apply to OneDrive. Changing registration settings
does not replace existing saved storage accounts: reconnect those separately.

The browser performing sign-in must be able to resolve and reach this HTTPS
hostname. Private-network DNS is sufficient; the callback arrives through the
user's browser. The controller needs outbound HTTPS to the provider APIs. An HTTP
IP dashboard can configure settings and import credentials, but browser sign-in
must start on the configured HTTPS origin. Do not disable certificate validation.

### Google Drive and Google Cloud Storage

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select
   a project. Enable **Google Drive API** for Drive and **Cloud Storage API** for
   Cloud Storage.
2. Configure the Google Auth Platform consent screen, audience, and test users
   if using Testing mode. Register a client of type **Web application**.
3. Add both displayed **Authorized redirect URIs**:
   `https://<dashboard-host>/api/storage-oauth/callback/gdrive` and
   `https://<dashboard-host>/api/storage-oauth/callback/gcs`.
4. Enter the Web client ID (ending `.apps.googleusercontent.com`) and client
   secret into **Cloud sign-in setup**, then save.
5. Click **Sign in with Google**, choose the account, and approve offline access.
   Return to Fortress, name the location, choose its backup folder or bucket, and
   save the location within ten minutes. Allow the sign-in popup if prompted.

Drive requests `https://www.googleapis.com/auth/drive` so it can access an existing
repository folder, including its snapshots. Cloud Storage requests
`https://www.googleapis.com/auth/devstorage.read_write`; Google IAM still controls
which buckets the signed-in account can access. Use an existing bucket and grant
object create/delete/get/list permissions there, such as the Storage Object Admin
role scoped to that bucket. Billing and bucket creation are managed in Google Cloud.

Google requires registration/consent before sign-in works. An external app left
in **Testing** mode generally receives refresh tokens that expire after seven
days for these scopes. Configure production consent and any verification Google
requires before relying on unattended backups. See Google's
[Web server OAuth instructions](https://developers.google.com/identity/protocols/oauth2/web-server).

Alternatively, expand **Or use a Google service account key** for Cloud Storage
and import a JSON key for an account authorized on the existing bucket. External
account executable/URL credential plugins are not supported.

### OneDrive

1. In [Microsoft Entra app registrations](https://entra.microsoft.com/), create
   an application. Choose **Accounts in any organizational directory and personal
   Microsoft accounts** for the current common-authority sign-in flow.
2. Add a **Web** platform with the displayed redirect URI:
   `https://<dashboard-host>/api/storage-oauth/callback/onedrive`.
   Do not register it as a single-page application.
3. Add Microsoft Graph **delegated** `Files.ReadWrite` and `offline_access`
   permissions. Grant consent if your organization's policy requires it.
4. Under **Certificates & secrets**, create a client secret. Put its **Value**
   (not its secret ID) and the application's **Application (client) ID** into the
   Fortress setup form. Record its expiry and replace it before expiration.
5. Click **Sign in with Microsoft**, approve access, then save the location.
   Fortress detects the signed-in account's default personal or business drive;
   arbitrary SharePoint site/library discovery is not provided by browser sign-in.

See Microsoft's [registration guide](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)
and [authorization code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow).
The controller preserves rotated OneDrive tokens before SSH operations and Windows
provisioning; the Windows runtime also preserves its refreshed local Rclone config.
Accounts can still revoke access or require fresh consent. Reconnect the location
and use **Save and connect** in the Windows app to apply changed credentials after
an active operation has finished. Very old/offline copies may require fresh sign-in.

## Other authentication options

**Azure:** enter the existing container, optional repository folder, storage
account name, and storage account key. This version supports the standard Azure
public cloud endpoint and account-key authentication.

**Advanced Drive/OneDrive import:** expand **Advanced: import an existing Rclone
connection**, enter `remote:folder/path`, and import its authenticated,
unencrypted `rclone.conf`. Only the selected remote is retained; a refresh token
is required. OneDrive also needs its drive ID and drive type. Unsupported command
hooks and external credential files are rejected. Imports using Rclone's own app
are refreshed by Rclone. Replace the imported config if authorization expires.

## Verify and use a repository

Credentials are encrypted in the controller database. OAuth app secrets and
storage tokens are never included in list responses. Editing a location with
blank credential fields preserves its credentials. **Test Connection** performs
a read-only authentication/folder probe from the controller. It does not initialize
a Restic repository or verify its encryption password.

Use an existing initialized Restic repository and its existing encryption password
in the saved Restic job. Creating a location does not create or overwrite a
repository. To create a fresh repository, initialize it explicitly with Restic
using the same account and target before running backups.

**Windows:** install the current release, assign the saved Restic repository under
**Managed Clients**, and connect in the app. The app retrieves the selected
repository and credentials over trusted HTTPS and protects the runtime files for
SYSTEM and Administrators. Restic and Rclone are included; OpenSSH is required
only for SFTP. Save and connect applies changed credentials. Wait for active
backups to finish before upgrading or replacing runtime configuration.

**Linux:** deploy **Restic** under **Systems**; deployment also installs Rclone
from the distribution's trusted package repository (for example EPEL on enterprise
Linux). Native Cloud Storage uses Restic directly. Backup, snapshot listing, file
browsing and restore use the same selected storage credentials. Cloud credentials
exist only in a private temporary directory during each SSH operation and are
removed when its shell exits. Cloud connection tests also remove their temporary
credentials.

Before relying on a new destination, run a backup and restore sample files on the
actual target. Protocol and installation tests use disposable credentials; they
do not replace a restore test against your own cloud account.
