# Royal Library — Render Edition

Full-stack Digital Library Management System.

## Stack
- Frontend: HTML/CSS/JavaScript
- Backend: Node.js + Express
- Database: PostgreSQL
- Hosting: Render
- Authentication: bcrypt + JWT

## Render deployment
Create a PostgreSQL database on Render, then create a Web Service from this repository.

Environment variables:
- DATABASE_URL = Internal Database URL from the Render PostgreSQL database
- JWT_SECRET = a long random secret
- ADMIN_EMAIL = admin email
- ADMIN_PASSWORD = strong initial admin password

Build command: `npm install`
Start command: `npm start`

The server automatically creates the required tables and default categories on first start.
