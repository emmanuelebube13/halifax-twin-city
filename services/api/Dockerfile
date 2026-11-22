# Halifax Digital Twin serving API. UNVERIFIED: Docker is not installed on the build machine.
# Build from the repository root, so config/ is in the build context:
#   docker build -f services/api/Dockerfile -t halifax-twin-api .
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HALIFAX_TWIN_CONFIG_DIR=/app/config

WORKDIR /app/services/api
COPY services/api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY services/api/halifax_api ./halifax_api
COPY config /app/config

# Run as a plain user, not root.
RUN useradd --create-home --uid 10001 api
USER api

EXPOSE 8010
# Inside a container the API must listen on all interfaces; publish the port on 127.0.0.1 only (see compose).
CMD ["python", "-m", "uvicorn", "halifax_api.main:app", "--host", "0.0.0.0", "--port", "8010"]
