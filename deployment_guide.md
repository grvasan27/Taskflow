# Comprehensive Deployment Guide: Taskflow on Oracle Cloud

This guide covers the end-to-end process of taking your Taskflow web application from a local development environment to a production-ready cloud deployment on Oracle Cloud Infrastructure (OCI).

## 1. Architecture Overview

Your application consists of two main components:
- **Frontend**: React application (built into static HTML/JS/CSS files).
- **Backend**: Python FastAPI service.
- **Database**: MongoDB.
  - *Recommended Route (Always Free)*: Host MongoDB directly on your Oracle VM using Docker. Oracle gives you 200GB of storage, which is far more than MongoDB Atlas's 512MB free tier.
  - *Alternative Route*: Use MongoDB Atlas (512MB free).

**Production Tech Stack:**
- **Nginx**: Acts as a reverse proxy server. It serves the static React files to the internet and securely forwards `/api` requests to the FastAPI backend. It also handles SSL termination (HTTPS).
- **Gunicorn / Uvicorn**: A production-grade ASGI worker server for your FastAPI backend, capable of handling multiple requests concurrently.
- **Docker & Docker Compose**: (Required for this guide) Containerizes your application, including MongoDB, so everything stays isolated and easy to manage.
- **Let's Encrypt / Certbot**: Automatically issues and renews free SSL certificates so your site has the `https://` secure lock.
- **Admin Approval Gate**: A built-in system that prevents new signups from accessing the dashboard until you (the first user/admin) manually approve them.

---

## 1.5 Can I run this for 1000+ users 100% Free Forever?

**Yes, absolutely.** You can scale this application to support significantly more than 1000 daily active users without spending a single penny, even after your 30-day Free Trial expires.

Here is exactly how the "Always Free" architecture enables this:

1. **Compute (Oracle VM.Standard.A1.Flex)**: Oracle's Always Free ARM tier gives you up to **4 OCPUs and 24GB of RAM** and an incredible 10 Terabytes of outbound bandwidth per month. This is massive. An optimized FastAPI + React app running on Ubuntu uses roughly ~200-300MB of RAM. You can comfortably handle thousands of concurrent users on this free machine.
2. **Database (Self-Hosted on Oracle)**: By running MongoDB in a Docker container on your VM, you utilize the **200GB Always Free block storage**. This is 400x more storage than the MongoDB Atlas free tier.
3. **Storage (Oracle Block Volume)**: Oracle gives you 200GB of Always Free boot volume space. Your code and OS use maybe 15GB.
4. **Google APIs**: Both Google OAuth (for logging in) and Google Drive API (for your user backups) have extremely generous free quotas (e.g., 1 billion+ Auth requests/month, 10 million Drive queries/month).
5. **SSL Certificate (Let's Encrypt)**: 100% free and automated.

**The ONLY catch - The Domain Name:**
To use Google OAuth in production, you *must* have an HTTPS connection. Let's Encrypt *must* have a domain name to issue an SSL certificate (it won't issue one for a raw IP address). 
- **Free Route**: You can use a free dynamic DNS provider like **DuckDNS**, **No-IP**, or **FreeDNS (afraid.org)** to get a free subdomain (e.g., `taskflow.duckdns.org`).
- **Paid Route**: Buy a cheap top-level domain from Cloudflare or Namecheap for ~$5 a year (e.g., `yourname-taskflow.com`).

As long as you use a free subdomain, the entire stack costs **$0.00/month indefinitely**.

---

## 2. Oracle Cloud Setup

1. **Create an Instance**:
   - Log into the OCI Console.
   - Navigate to **Compute -> Instances -> Create Instance**.
   - Choose the OS image: **Ubuntu 22.04** or **24.04**.
   - Choose the shape: The "Always Free" ARM instance (VM.Standard.A1.Flex allowing up to 4 OCPU and 24GB RAM) is incredibly powerful for web apps. Alternatively, use the AMD Micro instance.
   - **Crucial**: Download your SSH private key (`.pem` or `.key`) before creating the instance.

2. **Configure Networking (VCN)**:
   - Go to your instance details and click on the associated **Virtual Cloud Network (VCN)**.
   - Click on the **Subnet**, then click on the **Security List**.
   - Add **Ingress Rules** to allow traffic from the internet:
     - Source CIDR: `0.0.0.0/0` | Destination Port: **80** (TCP) - HTTP
     - Source CIDR: `0.0.0.0/0` | Destination Port: **443** (TCP) - HTTPS

---

## 3. Server Preparation

Open your terminal and SSH into your new Oracle VM using its Public IP:
```bash
ssh -i /path/to/your/private_key.pem ubuntu@<YOUR_ORACLE_PUBLIC_IP>
```

Update packages and install dependencies:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git nginx python3-pip certbot python3-certbot-nginx docker.io docker-compose-v2
```

> **Note on Oracle Cloud Firewalls**: OCI Ubuntu images often have internal `iptables` rules that block all web ports by default, *even if the VCN is open*. You must open them on the OS level:
```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

---

## 4. Google API & OAuth Configuration (Crucial Step)

Because your app relies heavily on Google Auth and Google Drive APIs, your production deployment **must** run on a secure `HTTPS` domain. A raw IP address is not sufficient for Google OAuth in production.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Select your Taskflow project.
3. Go to **APIs & Services -> Credentials**.
4. Edit your **OAuth 2.0 Web Client ID**.
5. Add your new production domain under **Authorized JavaScript origins**:
   - `https://yourdomain.com`
6. Add your production callback URL under **Authorized redirect URIs**:
   - `https://yourdomain.com` (If your frontend dynamically handles the callback on the root path, if not, point it to the exact callback route).
   - *Note: If Google throws a `redirect_uri_mismatch` on your live site, it is 100% because this URI setting does not match the exact URL the frontend triggered the request from.*

---

## 5. Deployment Implementation

You can deploy Taskflow in two ways: **Native Deployment** or **Docker Deployment**. Docker is highly recommended for long-term stability and easier updates.

### Option A: Docker Deployment (Recommended)

**1. Create Dockerfiles locally and push to GitHub**

*`frontend/Dockerfile`*:
```dockerfile
# Build stage
FROM node:18-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Add environment variable for production API URL
ENV REACT_APP_BACKEND_URL=/api
RUN npm run build

# Production stage
FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

*`backend/Dockerfile`*:
```dockerfile
FROM python:3.10-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["gunicorn", "-k", "uvicorn.workers.UvicornWorker", "-w", "4", "server:app", "--bind", "0.0.0.0:8000"]
```

*`docker-compose.yml`* (in the root of your project):
```yaml
version: '3.8'
services:
  backend:
    build: ./backend
    restart: always
    env_file: ./backend/.env
    ports:
      - "127.0.0.1:8000:8000"

  frontend:
    build: ./frontend
    restart: always
    ports:
      - "127.0.0.1:3000:80"

  mongodb:
    image: mongo:latest
    restart: always
    environment:
      MONGO_INITDB_DATABASE: ${DB_NAME:-taskflow}
    volumes:
      - mongodb_data:/data/db

volumes:
  mongodb_data:
```

**2. Deploy on Server**
```bash
# Clone your repo onto the server
git clone https://github.com/yourusername/Taskflow.git
cd Taskflow

# Create your production .env file
nano backend/.env 
# (Paste your MongoDB URI, Google Credentials, etc. Set FRONTEND_URL=https://yourdomain.com)

# Start the services detached
sudo docker compose up -d --build
```

### Option B: Native Deployment (Without Docker)

**1. Setup Backend**:
```bash
git clone https://github.com/yourusername/Taskflow.git
cd Taskflow/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install gunicorn
```

**2. Create a Systemd Service for Backend** (`sudo nano /etc/systemd/system/taskflow.service`):
```ini
[Unit]
Description=Gunicorn instance to serve Taskflow API
After=network.target

[Service]
User=ubuntu
Group=www-data
WorkingDirectory=/home/ubuntu/Taskflow/backend
Environment="PATH=/home/ubuntu/Taskflow/backend/venv/bin"
EnvironmentFile=/home/ubuntu/Taskflow/backend/.env
ExecStart=/home/ubuntu/Taskflow/backend/venv/bin/gunicorn -w 4 -k uvicorn.workers.UvicornWorker server:app -b 127.0.0.1:8000

[Install]
WantedBy=multi-user.target
```
Start it: `sudo systemctl start taskflow && sudo systemctl enable taskflow`

**3. Build Frontend**:
```bash
# Ensure Node is installed via NVM first
cd ~/Taskflow/frontend
npm install
npm run build
```

---

## 6. Nginx Reverse Proxy & SSL Configuration

Whether you used Docker or Native, Nginx acts as the front door to route internet traffic to your local ports.

**1. Create an Nginx configuration file**:
```bash
sudo nano /etc/nginx/sites-available/taskflow
```

**2. Add this configuration block**:
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com; # Replace with your actual domain

    # Route /api to the FastAPI backend
    location /api/ {
        proxy_pass http://127.0.0.1:8000; # No trailing slash passes the /api prefix to the backend
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Route everything else to the built React frontend
    location / {
        # If using Docker:
        proxy_pass http://127.0.0.1:3000/;
        
        # OR If using Native Deployment (uncomment these, comment proxy_pass):
        # root /home/ubuntu/Taskflow/frontend/build;
        # index index.html;
        # try_files $uri $uri/ /index.html;
    }
}
```

**3. Enable the site and restart Nginx**:
```bash
sudo ln -s /etc/nginx/sites-available/taskflow /etc/nginx/sites-enabled/
sudo nginx -t  # Tests for syntax errors. Fix them if this fails!
sudo systemctl restart nginx
```

**4. Secure with SSL (Let's Encrypt)**:
Ensure your domain's DNS A Record points exactly to the Oracle VM IP, and it has successfully propagated.
```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```
Certbot will ask a few prompts, agree to them, and it will automatically rewrite your Nginx file to use HTTPS and setup an auto-renewal chron job.

---

## 7. Post-Deployment Checklist

- [ ] **Test HTTPS**: Visit `https://yourdomain.com` and ensure the browser lock icon appears and displays secure.
- [ ] **Test API Logic**: The React app's API requests shouldn't attempt to ping `localhost:8000` via the browser console. By utilizing Nginx routing `location /api/`, the URL naturally matches your live domain.
- [ ] **Test Background Jobs**: Ensure your APScheduler backend logs show that the daily encrypted Google Drive backups are triggering asynchronously without choking the web workers. Wait or trigger one.
- [ ] **Update Frontend Code (if needed)**: Make sure any explicit hardcoded `http://localhost:8000` fetches in `Dashboard.jsx` were converted to relative paths (e.g. `/api/auth/me`) or use the environment variable `REACT_APP_BACKEND_URL` so that they hit Nginx properly in production.
