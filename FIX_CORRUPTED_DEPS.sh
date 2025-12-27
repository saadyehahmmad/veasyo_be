#!/bin/bash
# Fix corrupted node_modules by cleaning and reinstalling
# For docker_backend-veasyo-dev volume and veasyo_be container

VOLUME_NAME="docker_backend-veasyo-dev"
CONTAINER_NAME="veasyo_be"

echo "=========================================="
echo "Fixing Corrupted Dependencies"
echo "Volume: $VOLUME_NAME"
echo "Container: $CONTAINER_NAME"
echo "=========================================="

# 1. Stop the container
echo ""
echo "Step 1: Stopping container..."
docker stop $CONTAINER_NAME 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✓ Container stopped"
else
    echo "⚠ Container was already stopped"
fi

# 2. Remove corrupted node_modules and package-lock.json
echo ""
echo "Step 2: Removing corrupted node_modules and package-lock.json..."
docker run --rm \
  --name temp-clean \
  -v $VOLUME_NAME:/app \
  node:20-slim sh -c "cd /app && rm -rf node_modules package-lock.json && echo '✓ Cleaned'"

# 3. Clear npm cache and reinstall
echo ""
echo "Step 3: Clearing npm cache and reinstalling dependencies..."
docker run --rm \
  --name temp-reinstall \
  -v $VOLUME_NAME:/app \
  node:20-slim sh -c "cd /app && npm cache clean --force && npm install --production --no-audit --no-fund"

if [ $? -eq 0 ]; then
    echo "✓ Dependencies reinstalled successfully"
else
    echo "✗ Error: Failed to reinstall dependencies"
    exit 1
fi

# 4. Verify critical packages
echo ""
echo "Step 4: Verifying critical packages..."
docker run --rm \
  --name temp-verify \
  -v $VOLUME_NAME:/app \
  node:20-slim sh -c "cd /app && \
    test -d node_modules/joi && echo '✓ joi found' || echo '✗ joi missing' && \
    test -d node_modules/lodash.mergewith && echo '✓ lodash.mergewith found' || echo '✗ lodash.mergewith missing' && \
    test -f node_modules/lodash.mergewith/index.js && \
      (head -n 5 node_modules/lodash.mergewith/index.js | grep -q 'function' && echo '✓ lodash.mergewith file valid' || echo '✗ lodash.mergewith file corrupted')"

# 5. Start the container
echo ""
echo "Step 5: Starting container..."
docker start $CONTAINER_NAME

if [ $? -eq 0 ]; then
    echo "✓ Container started successfully"
else
    echo "✗ Error: Failed to start container"
    exit 1
fi

echo ""
echo "=========================================="
echo "Done! Dependencies fixed and container started."
echo "=========================================="

