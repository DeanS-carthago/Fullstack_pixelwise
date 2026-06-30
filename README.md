

# Fullstack Pixelwise 

This repository contains the implementation for the API Security project.  
It keeps the original API key authentication as the baseline and adds a login-based bearer token authentication mechanism as the proposed solution.

## Project Context

The original PixelWise application uses API key authentication and rate limiting as basic protection mechanisms.  
For the project work, an additional bearer token flow was implemented to compare the original baseline with a more controlled authentication approach.

## Authentication Modes

This project contains two authentication modes:

### 1. API Key Authentication

This is the original baseline implementation.

- Endpoint: `/api/classify`
- Required header: `X-API-Key`
- The API key is configured through the `.env` file and injected into the frontend during deployment.

### 2. Bearer Token Authentication

This is the implemented project solution.

- Login endpoint: `/api/token`
- Protected endpoint: `/api/classify-bearer`
- Users authenticate with username and password.
- After successful login, the backend returns a bearer token.
- The token is sent in the HTTP `Authorization` header:

```http
Authorization: Bearer <token>
```

The token is valid for 15 minutes.  
After expiration, a new login is required to use the bearer-token protected endpoint again.

## Environment Variables

Create a local `.env` file based on `.env.example`.

```bash
cp .env.example .env
```

The `.env.example` file contains the required variables for the API key, JWT configuration, login credentials, and database setup.




## VM / Server Setup

For the VM/server setup, use the provided setup script:

```bash
git clone https://github.com/DeanS-carthago/Fullstack_pixelwise
cd Fullstack_pixelwise
cp .env.example .env
bash setup-server.sh
```

The setup script installs system dependencies, creates a Python virtual environment, installs the Python requirements, initializes the database, and configures the deployment environment.

## Notes

- The API key mechanism is kept intentionally as the baseline for comparison.
- The bearer token mechanism represents the implemented project solution.
- No real secrets should be committed to the repository. This is for illustrative purposes only.
