# PimaBill installer

The image behind PimaBill's one-command self-hosted install. Users run it as described in the [self-hosting guide](../docs/content/1.getting-started/4.self-hosting.md).

| File | Purpose |
|---|---|
| `pimabill` | The installer script, with `install` and `upgrade` commands |
| `docker-compose.yml` | The stack it writes to the install folder |
| `Dockerfile` | Builds the image from the repository root |
| `test.sh` | Runs the script against a stand-in for Docker |

## How it works

- The image holds the Docker CLI and talks to the host through the mounted Docker socket.
- `install` keeps any `.env` already in the folder, so running it twice never replaces secrets.
- `upgrade` backs up both databases and `.env`, and stops if a backup is empty.
- The compose file has no bind mounts, because paths inside the installer don't exist on the host. Caddy's config is inline for the same reason.
- The image pins the version in `version.txt`, which matches the tags the Release workflow adds.

## Test it

```bash
sh installer/test.sh
```

CI also runs a real install and upgrade with the `latest` images.
