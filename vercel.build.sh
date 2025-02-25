#!/bin/bash

# Set NODE_ENV to production
export NODE_ENV=production

# Clear any existing NEXT_PUBLIC_API_URL
unset NEXT_PUBLIC_API_URL

# Install Python packages from requirements.txt
pip install -r requirements.txt

# Install additional packages with specific versions if needed
# Update these versions to match your current requirements
pip install dowse==0.1.6.post1 emp-agents==0.3.0 eth-rpc-py==0.1.26

# Print installed packages for debugging
pip freeze > installed_packages.txt

# Create necessary directories if they don't exist
mkdir -p app/services

# Ensure the script exits with success
exit 0 