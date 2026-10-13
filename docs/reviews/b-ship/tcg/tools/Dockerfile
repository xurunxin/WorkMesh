FROM ubuntu:24.04@sha256:534baea6a22c03a63003dbc8dbe78fe34bc0d7e595d9a9dc9834884ff530eb55
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    qemu-system-x86 qemu-system-arm qemu-utils qemu-efi-aarch64 genisoimage \
    python3 ca-certificates curl time && rm -rf /var/lib/apt/lists/*
WORKDIR /probe
ENTRYPOINT ["python3", "/probe/run.py"]
