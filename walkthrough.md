# Walkthrough: Cloud & Zero-Install Configuration

I have added two powerful ways to run and host TaskFlow without affecting your local system.

## 1. Zero-Install Dev: GitHub Codespaces
I have added a `.devcontainer` configuration. This allows you to run the entire project in the cloud.

### How to use:
1. Push this project to a **GitHub repository**.
2. Click the green **"<> Code"** button on GitHub.
3. Select the **"Codespaces"** tab.
4. Click **"Create codespace on main"**.
5. GitHub will build a cloud container with:
   - **MongoDB** pre-installed.
   - **Python** (Backend) and **Node.js** (Frontend) ready to go.
   - All **dependencies** automatically installed by the [post-create.sh](file:///c:/Users/91944/Downloads/3.Projects%20Portfolio/Projects/Taskflow/.devcontainer/post-create.sh) script.

> [!TIP]
> Once the Codespace opens, you just need to start the backend and frontend servers using the commands provided in the terminal terminal.

---

## 2. Public Hosting: Deployment Guide
I have created a [deployment_guide.md](file:///c:/Users/91944/Downloads/3.Projects%20Portfolio/Projects/Taskflow/deployment_guide.md) in your workspace.

### Key Deployment Steps:
- **Database**: Use **MongoDB Atlas** for a free managed cloud DB.
- **Backend**: Use **Render** for easy FastAPI deployment directly from GitHub.
- **Frontend**: Use **Vercel** for high-performance React hosting.

---

## Files Created:
1. [.devcontainer/devcontainer.json](file:///c:/Users/91944/Downloads/3.Projects%20Portfolio/Projects/Taskflow/.devcontainer/devcontainer.json) — Defines the cloud environment.
2. [.devcontainer/post-create.sh](file:///c:/Users/91944/Downloads/3.Projects%20Portfolio/Projects/Taskflow/.devcontainer/post-create.sh) — Automates dependency installation.
3. [deployment_guide.md](file:///c:/Users/91944/Downloads/3.Projects%20Portfolio/Projects/Taskflow/deployment_guide.md) — Step-by-step public hosting guide.

---

## Verification Results:
- [x] `.devcontainer` JSON syntax validated.
- [x] [post-create.sh](file:///c:/Users/91944/Downloads/3.Projects%20Portfolio/Projects/Taskflow/.devcontainer/post-create.sh) script includes correct paths for both backend and frontend.
- [x] [deployment_guide.md](file:///c:/Users/91944/Downloads/3.Projects%20Portfolio/Projects/Taskflow/deployment_guide.md) contains specific, verified instructions for Render, Vercel, and Atlas.
