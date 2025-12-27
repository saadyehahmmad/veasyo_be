#!/bin/bash
# Quick fix script to install npm dependencies in a stopped container
# Uses docker_backend-veasyo-dev volume

VOLUME_NAME="docker_backend-veasyo-dev"
CONTAINER_NAME="veasyo_be"

# 1. Stop the container
echo "Stopping container: $CONTAINER_NAME..."
docker stop $CONTAINER_NAME 2>/dev/null || echo "Container already stopped or not found"

# 2. Clean and reinstall dependencies (fix corrupted installs)
echo "Cleaning and installing dependencies in volume: $VOLUME_NAME..."
docker run --rm \
  --name temp-clean \
  -v $VOLUME_NAME:/app \
  node:20-slim sh -c "cd /app && rm -rf node_modules package-lock.json 2>/dev/null; echo 'Cleaned'"

docker run --rm \
  --name temp-backend-install \
  -v $VOLUME_NAME:/app \
  node:20-slim sh -c "cd /app && npm cache clean --force && npm install --production --no-audit"

if [ $? -eq 0 ]; then
    echo "✓ Dependencies installed successfully in volume"
else
    echo "✗ Error: Failed to install dependencies"
    exit 1
fi

# 3. Copy node_modules from volume into the stopped container
echo "Copying node_modules from volume into container..."
docker run --rm \
  --name temp-copy \
  -v $VOLUME_NAME:/source \
  --volumes-from $CONTAINER_NAME \
  alpine sh -c "cp -r /source/node_modules /app/ 2>/dev/null || echo 'Note: If container uses volume mount, node_modules should already be available'"

# 4. Start the container
echo "Starting container: $CONTAINER_NAME..."
docker start $CONTAINER_NAME 2>/dev/null || echo "Container started or already running"

echo "Done! Dependencies should now be available in the container."

