#!/bin/bash
# Install npm dependencies in docker_backend-veasyo-dev volume for veasyo_be container

VOLUME_NAME="docker_backend-veasyo-dev"
CONTAINER_NAME="veasyo_be"

echo "=========================================="
echo "Installing npm dependencies"
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
    echo "⚠ Container was already stopped or not running"
fi

# 2. Clean node_modules if it exists (to fix corrupted installs)
echo ""
echo "Step 2: Cleaning existing node_modules (if corrupted)..."
docker run --rm \
  --name temp-clean \
  -v $VOLUME_NAME:/app \
  node:20-slim sh -c "cd /app && rm -rf node_modules package-lock.json 2>/dev/null; echo 'Cleaned'"

# 3. Install dependencies directly into the volume
echo ""
echo "Step 3: Installing production dependencies in volume..."
docker run --rm \
  --name temp-install-deps \
  -v $VOLUME_NAME:/app \
  node:20-slim sh -c "cd /app && npm cache clean --force && npm install --production"

if [ $? -eq 0 ]; then
    echo "✓ Dependencies installed successfully"
else
    echo "✗ Error: Failed to install dependencies"
    exit 1
fi

# 4. Verify installation
echo ""
echo "Step 4: Verifying installation..."
docker run --rm \
  --name temp-verify \
  -v $VOLUME_NAME:/app \
  node:20-slim sh -c "cd /app && test -d node_modules && test -d node_modules/joi && echo '✓ joi module found' || echo '✗ joi module not found'"

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
echo "Done! Dependencies installed and container started."
echo "=========================================="

