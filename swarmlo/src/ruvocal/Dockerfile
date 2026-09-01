# syntax=docker/dockerfile:1

FROM node:24-slim AS base

# install dotenv-cli
RUN npm install -g dotenv-cli

# switch to a user that works for spaces
RUN userdel -r node
RUN useradd -m -u 1000 user
USER user

ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR /app

# add a .env.local if the user doesn't bind a volume to it
RUN touch /app/.env.local

USER root
RUN apt-get update
RUN apt-get install -y libgomp1 libcurl4 curl dnsutils nano

# ensure npm cache dir exists before adjusting ownership
RUN mkdir -p /home/user/.npm && chown -R 1000:1000 /home/user/.npm

USER user

# Configuration is injected at runtime via the DOTENV_LOCAL env var or a bound
# volume — never baked into the image from a local .env file (secrets must not
# be embedded in images).
ARG DOTENV_LOCAL=
ENV DOTENV_LOCAL=${DOTENV_LOCAL}

COPY --chown=1000 entrypoint.sh /app/entrypoint.sh
COPY --chown=1000 package.json /app/package.json
COPY --chown=1000 package-lock.json /app/package-lock.json

RUN chmod +x /app/entrypoint.sh

FROM node:24 AS builder

WORKDIR /app

COPY --link --chown=1000 package-lock.json package.json ./

ARG APP_BASE=
ARG PUBLIC_APP_COLOR=
ENV BODY_SIZE_LIMIT=15728640

RUN --mount=type=cache,target=/app/.npm \
    npm set cache /app/.npm && \
    npm ci

COPY --link --chown=1000 . .

RUN git config --global --add safe.directory /app && \
    npm run build

# final image
FROM base AS final

# svelte requires APP_BASE at build time so it must be passed as a build arg
ARG APP_BASE=
ARG PUBLIC_APP_COLOR=
ARG PUBLIC_COMMIT_SHA=
ENV PUBLIC_COMMIT_SHA=${PUBLIC_COMMIT_SHA}
ENV BODY_SIZE_LIMIT=15728640

#import the build & dependencies
COPY --from=builder --chown=1000 /app/build /app/build
COPY --from=builder --chown=1000 /app/node_modules /app/node_modules

CMD ["/bin/bash", "-c", "/app/entrypoint.sh"]
