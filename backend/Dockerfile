FROM python:3.10-slim

WORKDIR /app

# Install system dependencies if needed (e.g., for compiled packages)
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose the API port
EXPOSE 8000

# Start with Gunicorn using Uvicorn workers for production
CMD ["gunicorn", "-k", "uvicorn.workers.UvicornWorker", "-w", "4", "server:app", "--bind", "0.0.0.0:8000"]
