FROM python:3.11-slim

WORKDIR /app

# gcc for building some python packages, redis-server so we don't need a
# separate paid Azure Cache for Redis instance (keeps this a single, cheap
# Azure App Service container)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc redis-server \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY supervisord.conf /etc/supervisord.conf

# Azure App Service (Linux) persists /home across restarts/deploys.
# We point uploads/sqlite/chroma storage there via env vars set in Azure,
# so data survives container restarts without needing a paid database.
RUN mkdir -p /app/uploads /app/chroma_data

EXPOSE 8000

CMD ["supervisord", "-c", "/etc/supervisord.conf"]
