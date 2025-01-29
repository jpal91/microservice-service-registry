#!/bin/bash

# Default settings
OUTPUT_FILE=""
PRINT_TO_CONSOLE=true
RUN_REQUESTS=true
RUN_REGISTER=true

# Parse command line args
while [[ $# -gt 0 ]]; do
  case $1 in
    -f|--file)
      OUTPUT_FILE="$2"
      PRINT_TO_CONSOLE=false
      shift
      shift
      ;;
    requests)
      RUN_REGISTER=false
      shift
      ;;
    register)
      RUN_REQUESTS=false
      shift
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

# Start server in background
echo "Starting server..."
NODE_ENV="bench" pnpm tsx benchmarks/server.ts &
SERVER_PID=$!

echo $SERVER_PID

# Wait for server to start
sleep 2

# Run benchmarks
if [ "$RUN_REQUESTS" = true ]; then
  if [ "$PRINT_TO_CONSOLE" = true ]; then
    node benchmarks/requests.js
  else
    node benchmarks/requests.js > $OUTPUT_FILE
  fi
fi

if [ "$RUN_REGISTER" = true ]; then
  if [ "$PRINT_TO_CONSOLE" = true ]; then
    node benchmarks/register.js
  else
    node benchmarks/register.js > $OUTPUT_FILE
  fi
fi

# Kill server
kill $SERVER_PID
