ENV_LOCAL_PATH=/app/.env.local

if test -z "${DOTENV_LOCAL}" ; then
    if ! test -f "${ENV_LOCAL_PATH}" ; then
        echo "DOTENV_LOCAL was not found in the ENV variables and .env.local is not set using a bind volume. Make sure to set environment variables properly. "
    fi;
else
    echo "DOTENV_LOCAL was found in the ENV variables. Creating .env.local file."
    cat <<< "$DOTENV_LOCAL" > ${ENV_LOCAL_PATH}
fi;

# Ensure the file exists for dotenv-cli even when env vars are provided directly
if ! test -f "${ENV_LOCAL_PATH}" ; then
    touch ${ENV_LOCAL_PATH}
fi;

export PUBLIC_VERSION=$(node -p "require('./package.json').version")

dotenv -e /app/.env.local -c -- node --dns-result-order=ipv4first /app/build/index.js -- --host 0.0.0.0 --port 3000
