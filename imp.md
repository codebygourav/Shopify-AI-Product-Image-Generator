shopify app dev

npx shopify app config push (to run the changes to shopify)

prisma migrate dev  
prisma db push

docker compose restart web
npm run deploy

git fetch --all
"npx shopify app deploy --allow-updates" to ensure that all layout stylesheets and assets are pushed to Shopify's CDN. I will wait for the deployment to finish.

docker compose build --no-cache web
docker compose up -d
docker compose logs -f web

prisma error:
docker compose exec web npx prisma db push
docker compose restart web
docker compose logs -f web
