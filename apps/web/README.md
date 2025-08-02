# AgentMark Web Application

A multi-tenant web application for developing, testing, and evaluating AI Agents using AgentMark.

## Features

- **Multi-tenant architecture**: Users can belong to multiple organizations (tenants)
- **Tenant selector**: Easily switch between tenants via dropdown next to the logo
- **User authentication**: Secure login and registration system
- **Modern UI**: Built with Next.js 14, Tailwind CSS, and Headless UI
- **Database integration**: Prisma ORM with SQLite (easily configurable for other databases)

## Quick Start

1. **Install dependencies**:
   ```bash
   yarn install
   ```

2. **Set up environment variables**:
   ```bash
   cp .env.example .env
   ```
   
   Update `.env` with your configuration:
   - `DATABASE_URL`: SQLite database path (or other database URL)
   - `NEXTAUTH_SECRET`: Generate a random string for JWT signing
   - `NEXTAUTH_URL`: Your application URL (default: http://localhost:3000)

3. **Set up the database**:
   ```bash
   # Generate Prisma client
   yarn db:generate
   
   # Push schema to database
   yarn db:push
   ```

4. **Start the development server**:
   ```bash
   yarn dev
   ```

   The application will be available at http://localhost:3000

## Multi-Tenant Features

### User Registration
When users sign up, they create both a user account and their first tenant (organization). They automatically become the owner of this tenant.

### Tenant Selection
The tenant selector dropdown appears next to the AgentMark logo in the header. Users can:
- View all tenants they belong to
- See their role in each tenant (member, admin, owner)
- Switch between tenants seamlessly
- The selected tenant is persisted in localStorage

### Role-Based Access
Each user-tenant relationship includes a role:
- **Owner**: Full access to tenant management
- **Admin**: Administrative access within the tenant
- **Member**: Basic access to tenant resources

## Database Schema

The multi-tenant system uses three main models:

- **User**: Individual user accounts
- **Tenant**: Organizations/workspaces
- **UserTenant**: Junction table linking users to tenants with roles

## API Routes

- `POST /api/auth/register`: Create user and tenant
- `GET /api/tenants`: List user's tenants
- `/api/auth/[...nextauth]`: NextAuth.js authentication

## Architecture

- **Frontend**: Next.js 14 with App Router
- **Authentication**: NextAuth.js with credentials provider
- **Database**: Prisma ORM with SQLite (configurable)
- **Styling**: Tailwind CSS with custom design system
- **UI Components**: Headless UI for accessible components
- **State Management**: React Context for tenant state

## Development

### Running from workspace root
```bash
# Development
yarn web:dev

# Build
yarn web:build

# Database operations
yarn db:generate
yarn db:push
yarn db:migrate
```

### Running locally
```bash
cd apps/web
yarn dev
```

## Production Deployment

1. Update environment variables for production
2. Use a production database (PostgreSQL, MySQL, etc.)
3. Build the application: `yarn build`
4. Start the production server: `yarn start`

## Contributing

This web application extends the AgentMark ecosystem with multi-tenant capabilities. When contributing:

1. Follow the existing code style and patterns
2. Ensure TypeScript types are properly defined
3. Test multi-tenant functionality thoroughly
4. Update documentation as needed