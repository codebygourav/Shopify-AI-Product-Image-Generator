shopify app dev

npx shopify app config push (to run the changes to shopify)

docker compose restart web
npm run deploy

git fetch --all

docker compose build --no-cache web
docker compose up -d
docker compose logs -f web
