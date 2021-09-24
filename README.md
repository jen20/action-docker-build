**This repository is no longer maintained. An active fork is available at https://github.com/pulumi/action-docker-build, which should be used instead.**


# Docker Image Builder for GitHub Actions

This repository contains a GitHub Action to build, tag and push a Docker image based on a `Dockerfile`.

## Configuration

The inputs to the action are documented below. At least one of `tag-latest`, `tag-snapshot` or `additional-tags` must be
specified, or the action will fail. Generally, pull requests and pushes to `master` should be built with `tag-snapshot`
enabled, and release tags should be built with `tag-latest` enabled.

```yaml
- uses: jen20/action-docker-build@v1
  with:
      # Required. The name of the Docker repository to push to.
      repository: jen20/test-action-docker-build
      # Required. The username with which to authenticate with the
      # specified Docker registry.
      username: jen20
      # Required. The password with which to authenticate with the
      # specified Docker registry. It is strongly recommended that
      # this value be considered a secret.
      password: ${{ secrets.DOCKER_HUB_PASSWORD }}
      # Optional. The path to the Dockerfile relative to the root
      # of the repository. Defaults to "Dockerfile".
      dockerfile: Dockerfile
      # Optional. The URL of the Docker registry to which to push.
      # Uses the Docker CLI default if unset.
      registry: https://customregistry.example.com/v2
      # Optional. Whether or not to apply the `latest` tag to the
      # built image, and push it to the registry. Defaults to false.
      tag-latest: true
      # Optional. Whether or not to apply a `snapshot` tag to the
      # built image, and push it to the registry. Snapshot tags consist
      # of the build date (in `YYYYMMDD-HHMMSS` format) and the short
      # commit hash of the source material. Defaults to false.
      tag-snapshot: true
      # Optional. A list of additional tags to apply to the image, and
      # push to the registry. Tags must be listed in a comma-separated
      # fashion.
      additional-tags: firstadditionaltag, secondadditionaltag
```

## Notes on Docker Credentials

The action uses `docker login` in order to authenticate with a registry. Sadly none of Docker's credential helpers seem
to work with GitHub actions (citing a lack of X11 support for `secretservice`, and "inappropriate ioctl for device" when
initializing a GPG key for use with `pass`). Consequently, the login falls back to storing the credentials as base-64
encoded strings in a configuration directory with a warning emitted showing the path.

Pull requests to use a credentials helper are welcomed!
