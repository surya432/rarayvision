FROM python:3.11-slim

ARG HTTP_PROXY
ARG APT_PROXY
ARG NO_PROXY

# Meneruskan Proxy saat build time & runtime
ENV http_proxy=$HTTP_PROXY
ENV https_proxy=$HTTP_PROXY
ENV no_proxy=$NO_PROXY

# Anteseden: ENV sudah ada, tapi perlu set PIP_TIMEOUT
ENV PIP_TIMEOUT=300
ENV PIP_RETRIES=5


WORKDIR /app

# Install system dependencies required by OpenCV and ONNX
RUN  if [ -n "$HTTP_PROXY" ]; then \
        echo "Acquire::http::Proxy \"$HTTP_PROXY\";" > /etc/apt/apt.conf.d/proxy.conf; \
        echo "Acquire::https::Proxy \"$HTTP_PROXY\";" >> /etc/apt/apt.conf.d/proxy.conf; \
    fi \
    && apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
# Gunakan --no-cache-dir agar ukuran image Docker tetap kecil/ramping

COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install  --retries=4 --timeout=300 -vvv -r requirements.txt

# Copy application code
COPY . .

EXPOSE 5000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "5000"]
