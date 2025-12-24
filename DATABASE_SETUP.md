# Database Connection Setup Guide

## Problem
You're seeing PostgreSQL authentication errors (code `28P01`):
```
❌ Database authentication failed. Please check your DATABASE_URL credentials in .env file
   Error: Invalid username or password
```

## Solution

### Step 1: Find Your PostgreSQL Credentials

Your PostgreSQL connection string format is:
```
postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE_NAME
```

**Default PostgreSQL credentials** (if you installed PostgreSQL locally):
- **Username**: Usually `postgres` (or your Windows username)
- **Password**: The password you set during PostgreSQL installation
- **Host**: `localhost`
- **Port**: `5432` (default)
- **Database**: `waiter_saas` (or create it if it doesn't exist)

### Step 2: Update .env File

Open `backend/.env` and update the `DATABASE_URL` line:

**Current (INCORRECT):**
```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/waiter_saas
```

**Replace with your actual credentials:**
```bash
DATABASE_URL=postgresql://YOUR_USERNAME:YOUR_PASSWORD@localhost:5432/waiter_saas
```

**Example:**
```bash
DATABASE_URL=postgresql://postgres:mypassword123@localhost:5432/waiter_saas
```

### Step 3: Test Database Connection

You can test your connection using one of these methods:

#### Option A: Using psql (PostgreSQL CLI)
```bash
psql -U YOUR_USERNAME -d waiter_saas -h localhost
# Enter your password when prompted
```

#### Option B: Using Node.js test script
Create a file `test-db-connection.js`:
```javascript
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Connection failed:', err.message);
    process.exit(1);
  }
  console.log('✅ Database connection successful!');
  console.log('Current time:', res.rows[0].now);
  pool.end();
});
```

Run it:
```bash
node test-db-connection.js
```

#### Option C: Check if database exists
```bash
psql -U YOUR_USERNAME -h localhost -l
```

If `waiter_saas` database doesn't exist, create it:
```bash
psql -U YOUR_USERNAME -h localhost
CREATE DATABASE waiter_saas;
\q
```

### Step 4: Restart the Server

After updating the `.env` file:
```bash
cd backend
npm run dev
```

## Common Issues

### Issue 1: Forgot PostgreSQL Password
If you forgot your PostgreSQL password:

**Windows:**
1. Open Services (Win+R, type `services.msc`)
2. Find "postgresql-x64-XX" service
3. Stop the service
4. Edit `pg_hba.conf` (usually in `C:\Program Files\PostgreSQL\XX\data\`)
5. Change `md5` to `trust` for local connections
6. Start PostgreSQL service
7. Connect and reset password:
   ```sql
   psql -U postgres
   ALTER USER postgres PASSWORD 'newpassword';
   ```
8. Revert `pg_hba.conf` changes (change `trust` back to `md5`)

### Issue 2: PostgreSQL Not Running
Check if PostgreSQL is running:
- **Windows**: Check Services (`services.msc`)
- **Linux/Mac**: `sudo service postgresql status` or `brew services list`

Start PostgreSQL if needed:
- **Windows**: Start "postgresql-x64-XX" service
- **Linux**: `sudo service postgresql start`
- **Mac**: `brew services start postgresql`

### Issue 3: Wrong Port
If PostgreSQL is running on a different port (e.g., 5433), update the port in DATABASE_URL:
```bash
DATABASE_URL=postgresql://username:password@localhost:5433/waiter_saas
```

### Issue 4: Database Doesn't Exist
Create the database:
```bash
psql -U YOUR_USERNAME -h localhost
CREATE DATABASE waiter_saas;
\q
```

Then run migrations:
```bash
npm run db:migrate
```

## Using Docker PostgreSQL (Alternative)

If you prefer using Docker for PostgreSQL:

```bash
# Run PostgreSQL in Docker
docker run --name waiter-postgres \
  -e POSTGRES_USER=waiter_user \
  -e POSTGRES_PASSWORD=waiter_password \
  -e POSTGRES_DB=waiter_saas \
  -p 5432:5432 \
  -d postgres:15

# Update .env
DATABASE_URL=postgresql://waiter_user:waiter_password@localhost:5432/waiter_saas
```

## Security Note

⚠️ **Never commit your `.env` file to version control!**

The `.env` file is already in `.gitignore`, so it won't be committed. Always use strong passwords in production.

## After Fixing

Once your database connection works, you should see:
```
✅ Preloaded X tenants and Y tables into cache
✅ Active requests loaded from database
🚀 Server is running on localhost:3000
```

Instead of authentication errors.

