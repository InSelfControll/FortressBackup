# Azure and Google Drive destinations

In **Storage Locations → Add Location**, select **Azure Blob Storage** or
**Google Drive (Rclone)**. Both support Restic backup, snapshot listing, selected
file restore, and restore to another enrolled Windows device or Linux source.
BorgBackup and Rsync do not support these destinations.

For Azure, enter the container, optional repository folder, storage account name,
and storage account key. This version supports the standard Azure public cloud
endpoint and account-key authentication.

For Google Drive, authorize a standard OAuth Drive remote using
[`rclone config`](https://rclone.org/drive/). Enter `remote:folder/path` and import
its unencrypted `rclone.conf` through the dashboard, or paste its contents. Only
the named Drive remote is retained. An OAuth refresh token is required. External
credential files, service-account configurations, and command hooks are rejected.

Credentials are encrypted in the controller database. Editing a location with
blank credential fields preserves its saved credentials. **Test Connection**
performs a read-only authentication/folder probe from the controller. It does not
initialize a Restic repository or verify its encryption password.

Use an existing initialized Restic repository and its existing encryption password
in the saved Restic job. Creating a location does not create or overwrite a
repository. To create a fresh repository, initialize it explicitly with Restic
using the same account and target, before running backups.

For Windows, install the current release, assign the saved repository under
**Managed Clients**, and connect in the app. The app retrieves the selected
repository and credentials over trusted HTTPS and protects the runtime files for
SYSTEM and Administrators. Rclone is included in the Windows installer; OpenSSH
is required only for SFTP. Existing installations receive the updated runtime when
reconnecting after the app upgrade. Wait for active backups to finish before
upgrading.

For Linux, deploy **Restic** again under **Systems**; deployment also installs
Rclone from the distribution's trusted package repository. Rclone must be
available in the configured repositories (for example EPEL on enterprise Linux).
Backup, snapshot listing, and restore use the same saved storage credentials.
Drive credentials exist only in a private temporary file during each SSH
operation and are removed when its shell exits.

Google authorization can be revoked or expire independently of Fortress. If access
is revoked, authorize the remote again and replace its imported configuration.
