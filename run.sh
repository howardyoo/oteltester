#!/bin/sh

# Run to start the whole system up, 5 services (one is nginx)
# `./run``
# Or, run with a parameter service name (from docker-compose) to restart just that service
# `./run meminator`

if ! docker compose up --build -d "$@"; then
  echo ""
  echo "Failed to build or start services!"
  exit 1
fi

# Check if running in GitHub Codespaces
if [ -n "$CODESPACES" ]; then
  echo "Running in GitHub Codespaces."

  APP_PORT=3000

  URL="https://${CODESPACE_NAME}-${APP_PORT}.app.github.dev"

# Check if running in Gitpod
elif [ -n "$GITPOD_INSTANCE_ID" ]; then
  echo "Running in Gitpod."

  # Get the workspace url
  URL=$(gp url 3000)

else
  # Default to local environment
  echo "Running locally."

  URL="http://localhost:3000/"

fi

echo "Oteltester running on port 3000 at: $URL"