# FireFlow POS - Installation Guide

Welcome to FireFlow! This guide covers the complete local installation and setup process for running the FireFlow POS and Backoffice system on a Windows machine.

## Prerequisites

Before starting, ensure your system meets the following requirements:

1.  **Node.js**: Version 18.0.0 or higher.
    -   Download from [nodejs.org](https://nodejs.org/) (LTS version recommended).
    -   Verify installation: Open Command Prompt and type `node -v` and `npm -v`.
2.  **PostgreSQL**: Version 14 or higher.
    -   Download from [postgresql.org](https://www.postgresql.org/download/windows/).
    -   During installation, remember the password you set for the default `postgres` user.
    -   Verify installation: PostgreSQL server should be running in your Windows Services.
3.  **Git** (Optional but recommended):
    -   For pulling future updates. Download from [git-scm.com](https://git-scm.com/).

## Automatic Setup (Recommended)

The easiest way to install and configure FireFlow is using the automated Setup Wizard.

1.  Open the `scripts` folder.
2.  Right-click on `setup.bat` and select **Run as Administrator**.
3.  Follow the on-screen prompts. The wizard will:
    -   Verify Node.js and PostgreSQL installations.
    -   Install all required Node.js dependencies (`npm install`).
    -   Configure your environment variables (`.env` file).
    -   Set up the database schema and seed initial required data (e.g., Chart of Accounts).
    -   Install and start the FireFlow Watchdog auto-recovery service.
    -   Launch the application in your default web browser.

## Manual Setup

If you prefer to set up the system manually or the automated script fails, follow these steps:

### 1. Install Dependencies
Open a terminal in the root FireFlow directory and run:
`npm install`

### 2. Configure Environment Variables
1.  Locate `.env.example` in the root directory.
2.  Copy it and rename the copy to `.env`.
3.  Open `.env` in a text editor.
4.  Update the database credentials if necessary:
    -   `DATABASE_USER=postgres`
    -   `DATABASE_PASSWORD=your_postgres_password`
    -   `DATABASE_NAME=fireflow_local` (or your preferred DB name)
    -   Update the `DATABASE_URL` connection string to match credentials.

### 3. Database Setup
Ensure PostgreSQL is running, then execute the following commands in the terminal:
1.  Deploy the database schema: `npx prisma migrate deploy`
2.  Seed the initial data (crucial for financial accounts): `npm run db:seed`

### 4. Install Watchdog Service (Optional but Recommended for Production)
To ensure FireFlow auto-restarts on crash or system reboot:
1.  Open Command Prompt as Administrator in the `scripts` directory.
2.  Run `install-watchdog.bat`.

### 5. Start the Application
To start the server manually (if not using the Watchdog service):
`npm run start` (or `npm run server` for just the backend, and `npm run dev` for frontend development).
If Watchdog is installed, it handles starting the backend.

## Accessing FireFlow

-   **Local Machine**: Open your browser and go to `http://localhost:3000` (or `http://localhost:5173` if running dev server) / API is on `http://localhost:3001`.
-   **Other LAN Devices**: Need to access FireFlow from a tablet or phone on the same network?
    1.  Ensure the host Windows PC and the mobile device are on the same Wi-Fi network.
    2.  On the host PC, open Command Prompt and type `ipconfig`. Find your IPv4 Address (e.g., `192.168.1.50`).
    3.  On your tablet/device, open the browser and navigate to `http://<YOUR_IPV4_ADDRESS>:3000` (or the respective port).
    4.  *Note:* You may need to allow Node.js/FireFlow through your Windows Defender Firewall for incoming connections on port 3000 and 3001.

## Database Backup

Regular backups are essential for business data safety.

1.  Open the `scripts` folder.
2.  Double-click `backup.bat` (or use Windows Task Scheduler to run it daily).
3.  Backups are saved in the `backups/` directory in the project root.
4.  The script automatically manages space by keeping only the last 7 backups.

### Restoring a Backup
To restore a `.sql` backup file via command line:
`psql -U postgres -d fireflow_local -1 -f path\to\your\backup_file.sql`

## Troubleshooting

-   **Database Connection Failed (P1001)**: Ensure PostgreSQL service is running in Windows Services. Check that your `.env` password matches the one set during PostgreSQL installation.
-   **Port 3001 Already in Use**: Another application (or a hanging FireFlow process) is using the backend port. Run `npm run kill:3001` or restart your computer.
-   **Mobile Devices Cannot Connect**: Ensure network profile is set to "Private" on the Windows host machine, and Firewall rules allow inbound TCP traffic on ports 3000 and 3001.
-   **Prisma Client Errors**: Try regenerating the Prisma client by running `npx prisma generate` in the terminal.
