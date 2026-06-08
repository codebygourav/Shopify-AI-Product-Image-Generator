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

cd /Users/apple/Downloads/ai-image-manager

# One-time (if you haven't since the fix)

npm install
cd extensions/ai-checkout-image && npm install --no-workspaces --legacy-peer-deps
cd ../ai-customer-account-image && npm install --no-workspaces --legacy-peer-deps
cd ../..

# Start dev

shopify app dev

npm install && shopify app dev



Step 1: Push Changes from Your Local Mac Terminal
First, commit and push your local code changes to your remote git repository (e.g. GitHub/GitLab):

bash
# 1. Add all modified files (including extension assets, layout blocks, and import fixes)
git add .
# 2. Commit the changes
git commit -m "Fix frame fitting, skeletons, checkout/orders previews, and routes client bundling"
# 3. Push to your main branch
git push origin main
Step 2: Run These Commands on the Hostinger VPS Terminal
SSH into your Hostinger VPS, pull the latest code, and rebuild the Docker containers.

bash
# 1. Connect to your VPS (replace with your actual VPS IP)
ssh root@<YOUR_VPS_IP>
# 2. Navigate to your project directory
cd /var/www/ai-image-manager
# 3. Pull the latest commits from your repository
git pull origin main
# 4. Rebuild and restart the Docker containers
# (This automatically pushes new database schemas using Prisma and runs the node production build)
docker compose down
docker compose up -d --build
Step 3: Publish Extension Changes to Shopify CDN (From Local Mac Terminal)
Since we modified the Checkout and Customer Account UI extensions, you must deploy the new build bundles to Shopify:

bash
# Run this from your local Mac project folder to update Shopify's extension hosting
shopify app deploy
Verification and Logs
To monitor the sync status, check container health, or verify that the production server built correctly on the Hostinger VPS:

bash
# View the live logs of the node backend container
docker compose logs -f web
1:30 PM
1:37 PM
I will view 

prisma/schema.prisma
 to check the database fields on the AiImageGeneration table.

