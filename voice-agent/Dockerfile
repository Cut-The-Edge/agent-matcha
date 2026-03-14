FROM python:3.11-slim

WORKDIR /app

# Install system dependencies required by livekit and audio processing
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        gcc \
        libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency manifest first (layer caching)
COPY pyproject.toml .

# Install Python dependencies
RUN pip install --no-cache-dir .

# Copy application source
COPY . .

# Runtime environment defaults
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

ENTRYPOINT ["python", "agent.py"]
CMD ["start"]
