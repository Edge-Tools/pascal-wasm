FROM debian:bookworm-slim AS base

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      fp-compiler make binutils git ca-certificates curl xz-utils python3 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

ARG WASMTIME_VERSION=45.0.0
RUN set -eux; \
    case "$(uname -m)" in \
      x86_64)        WT=x86_64-linux ;; \
      aarch64|arm64) WT=aarch64-linux ;; \
      *) echo "unsupported arch $(uname -m)"; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/wasmtime.tar.xz \
      "https://github.com/bytecodealliance/wasmtime/releases/download/v${WASMTIME_VERSION}/wasmtime-v${WASMTIME_VERSION}-${WT}.tar.xz"; \
    tar -xJf /tmp/wasmtime.tar.xz -C /tmp; \
    cp "/tmp/wasmtime-v${WASMTIME_VERSION}-${WT}/wasmtime" /usr/local/bin/; \
    rm -rf /tmp/wasmtime*; \
    wasmtime --version

ARG FPC_COMMIT=651b2b4310a9b7118a3f3c7189de138835d059b7
ARG VERSION=3.3.1
ENV VERSION=${VERSION}

WORKDIR /src
RUN git init -q fpc \
    && cd fpc \
    && git remote add origin https://gitlab.com/freepascal.org/fpc/source.git \
    && git fetch --depth 1 origin "${FPC_COMMIT}" \
    && git checkout -q FETCH_HEAD \
    && git --no-pager log --oneline -1

FROM base AS builder
WORKDIR /src/fpc
COPY js ./js

RUN make compiler_cycle \
        CPU_TARGET=wasm32 OS_TARGET=wasip1 \
        BINUTILSPREFIX= OPT="-O-" \
        PP=fpc \
        -j"$(nproc)"

RUN set -eux; \
    mkdir -p /dist/rtl/units; \
    cp compiler/ppcwasm32.wasm /dist/pascal.wasm; \
    cp -a rtl/units/wasm32-wasip1 /dist/rtl/units/wasm32-wasip1; \
    cp js/pascal.mjs /dist/pascal.mjs; \
    tar -C /dist -czf /dist/pascal-rtl.tar.gz rtl; \
    echo "=== dist ==="; ls -la /dist; du -sh /dist/rtl

RUN set -eux; \
    [ "$(head -c4 /dist/pascal.wasm | od -An -tx1 | tr -d ' \n')" = "0061736d" ]; \
    [ "$(stat -c%s /dist/pascal.wasm)" -gt 1048576 ]

RUN set -eux; \
    S=/smoke; mkdir -p "$S/rtl/units" "$S/work"; \
    cp -a /dist/rtl/units/wasm32-wasip1 "$S/rtl/units/wasm32-wasip1"; \
    printf 'begin\n  writeln(%s);\nend.\n' "'pascal-wasm smoke ok'" > "$S/work/smoke.pas"; \
    wasmtime run --dir "$S::/" /dist/pascal.wasm \
      -Twasip1 -Pwasm32 -n -Fu/rtl/units/wasm32-wasip1 -O- \
      -o/work/smoke.wasm /work/smoke.pas; \
    [ "$(head -c4 "$S/work/smoke.wasm" | od -An -tx1 | tr -d ' \n')" = "0061736d" ]; \
    OUT="$(wasmtime run "$S/work/smoke.wasm")"; \
    echo "smoke output: [$OUT]"; \
    [ "$OUT" = "pascal-wasm smoke ok" ]

FROM scratch AS exportor
COPY --from=builder /dist /dist
