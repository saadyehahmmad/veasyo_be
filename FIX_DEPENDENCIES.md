# Fix Missing Dependencies on Server (SSH)

## Quick Fix: Install in Volume (docker_backend-veasyo-dev)

```bash
# 1. Stop the container
docker stop veasyo_be

# 2. Install dependencies directly into the volume
docker run --rm \
  -v docker_backend-veasyo-dev:/app \
  node:20-slim sh -c "cd /app && npm install --production"

# 3. Start the container again
docker start veasyo_be
```

## Using the Install Script

```bash
# Make executable and run
chmod +x INSTALL_DEPS.sh
./INSTALL_DEPS.sh
```

## Verify Installation

```bash
# Check if dependencies are installed
docker run --rm -v docker_backend-veasyo-dev:/app \
  node:20-slim sh -c "cd /app && ls -la node_modules | head -20"
```

## Best Solution: Fix the Dockerfile

The real issue is that the Dockerfile needs to ensure `package-lock.json` is properly copied and dependencies are installed. The Dockerfile should be updated to match the Jenkins build process.

