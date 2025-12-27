# Fix Missing Dependencies via SSH (Server)

## Quick Fix: Install in Volume (docker_backend-veasyo-dev)

```bash
# 1. Stop the container
docker stop veasyo_be

# 2. Install dependencies directly into the volume
docker run --rm \
  -v docker_backend-veasyo-dev:/app \
  node:20-slim sh -c "cd /app && npm install --production"

# 3. Start the container
docker start veasyo_be
```

## Method 1: Using Volume Mount (docker_backend-veasyo-dev)

```bash
# 1. Stop the container (it keeps restarting)
docker stop veasyo_be

# 2. Install dependencies directly into the volume
docker run --rm \
  -v docker_backend-veasyo-dev:/app \
  node:20-slim sh -c "cd /app && npm install --production"

# 3. Start the container
docker start veasyo_be
```

## Method 2: Using the install script

```bash
# Make script executable and run it
chmod +x /path/to/INSTALL_DEPS.sh
./INSTALL_DEPS.sh
```

Or use the quick fix script:
```bash
chmod +x /path/to/SSH_QUICK_FIX.sh
./SSH_QUICK_FIX.sh
```

## Method 2: Copy files into running container (if you can catch it)

```bash
# 1. Stop the container
docker stop waiter-backend

# 2. Start it with a different command to keep it running
docker run -d --name waiter-backend-temp \
  --volumes-from waiter-backend \
  node:20-slim sh -c "cd /app && npm install --production && tail -f /dev/null"

# 3. Copy the node_modules back
docker cp waiter-backend-temp:/app/node_modules ./temp_node_modules
docker cp ./temp_node_modules waiter-backend:/app/

# 4. Remove temp container and start original
docker rm -f waiter-backend-temp
docker start waiter-backend
```

## Method 3: Rebuild the image (For permanent fix)

```bash
# 1. Stop the container
docker stop veasyo_be

# 2. Rebuild the image with fixed Dockerfile
cd /path/to/backend
docker build -t veasyo-backend:latest .

# 3. Restart (adjust based on your docker-compose or run command)
docker start veasyo_be
```

## Quick One-Liner

```bash
docker stop veasyo_be && \
docker run --rm -v docker_backend-veasyo-dev:/app \
  node:20-slim sh -c "cd /app && npm install --production" && \
docker start veasyo_be
```

## Verify Installation

```bash
# Check if joi is installed
docker run --rm -v docker_backend-veasyo-dev:/app \
  node:20-slim sh -c "cd /app && test -d node_modules/joi && echo '✓ joi installed' || echo '✗ joi not found'"
```

