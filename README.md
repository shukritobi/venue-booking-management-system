# Venue Booking Management System

A secure, zero-dependency Node.js venue operations MVP for weddings, corporate events and private functions.

## Included

- Staff login with scrypt password hashing, HttpOnly sessions, CSRF protection and login throttling
- Venue spaces and packages
- Enquiry CRM pipeline
- Booking holds and confirmed events
- Conflict detection across spaces
- Payment records
- Operations tasks
- Dashboard, calendar, reports and CSV export
- Audit history
- Responsive browser interface
- GitHub Pages demo mode using browser-local data

## Run locally

```bash
export ADMIN_EMAIL=owner@example.com
export ADMIN_PASSWORD='use-a-long-random-password'
export SESSION_SECRET='use-at-least-32-random-bytes'
npm start
```

Open `http://localhost:3000`.

## Production requirements

This repository is an operational MVP. Before multiple staff or customers use it, replace the JSON persistence layer with PostgreSQL, add managed file storage, backups, MFA, transactional booking constraints, a job queue, email provider, payment webhook verification and Google/Microsoft calendar OAuth.

## Deployment

A GitHub Pages workflow publishes the interface as an interactive demo. For real multi-user use, deploy the Node server using Docker on Railway, Render, Fly.io, a VPS, or another Node-compatible host and provide the required environment variables.
