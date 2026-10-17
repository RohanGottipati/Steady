# Encrypted files with git-crypt

[git-crypt](https://github.com/AGWA/git-crypt) encrypts selected files in Git
while keeping them readable in an unlocked working directory.

The repository's `.gitattributes` selects `.env`, `.env.*`, and `secrets/**`
for encryption. `.env.example` and `.gitattributes` stay readable. Environment
files remain ignored by default, so each developer can keep local credentials
private or explicitly opt a file into encrypted version control.

These rules alone do not activate encryption. Each checkout needs git-crypt
initialized or unlocked before adding secrets.

## First setup (one maintainer, once)

On macOS, install the tool:

```bash
brew install git-crypt
```

From the repository root, initialize encryption and export a recovery key outside
the repository. Use a new filename; keep the key in a password manager or another
secure location and share it with authorized collaborators through a secure channel.

```bash
git-crypt init
mkdir -p "$HOME/.config/steady"
chmod 700 "$HOME/.config/steady"
git-crypt export-key "$HOME/.config/steady/repository.git-crypt-key"
chmod 600 "$HOME/.config/steady/repository.git-crypt-key"
```

Do not commit the exported key. The local key inside `.git` is not included in
commits; exporting and backing it up is necessary to unlock another clone.

To opt the existing `.env.local` into encrypted version control after setup:

```bash
git add .gitattributes
git add -f .env.local
git-crypt status -e
```

Review the status before committing. If git-crypt reports an encrypted file is
stored unencrypted, run `git-crypt status --fix` and review again. Avoid commands
that print secret contents when reviewing changes.

Files placed in `secrets/` can be added normally after initialization. Put only
material intended for sharing in that directory. Raw datasets remain subject to
the project's existing licensing and Git ignore rules.

## Another checkout

Install git-crypt and obtain the exported key securely, then run:

```bash
git-crypt unlock /absolute/path/to/repository.git-crypt-key
git-crypt status -e
```

After unlocking, use Git normally. If `.env.local` is not tracked, follow the
README's `cp .env.example .env.local` setup instead.

GPG access is also supported: `git-crypt add-gpg-user FINGERPRINT` creates and
commits an encrypted key under `.git-crypt/`. Collaborators with the matching
private key can then run `git-crypt unlock` without a key file.

## Deployment and existing history

Configure deployment credentials in the hosting provider's environment settings.
A normal clone without the key contains ciphertext for protected files; any job
that needs their contents must install git-crypt and unlock first.

Encryption applies when files are added to Git. It does not remove plaintext
from earlier commits; rotate any credentials previously committed in plaintext.
An unlocked working directory still contains readable secrets.
