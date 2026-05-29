# Shopify AI Image Manager - Hostinger VPS Deployment Guide

This guide explains how to host your custom Shopify App on **Hostinger VPS** (Virtual Private Server) using your persistent SQLite database, and how to publish it on your live store: **https://orvellastudio.com/**.

It is fully customized for your subdomain: **shopify-ai.deploymeta.com** and your VPS IP: **187.127.145.3** (configured via Cloudflare).

---

## 1. Cloudflare DNS & SSL Settings (Important!)
Since you are using **Cloudflare** to manage `shopify-ai.deploymeta.com` (as seen in your dashboard screenshot), you get **free, automated SSL (HTTPS)** out of the box!

### Cloudflare SSL/TLS Configuration:
1. Log in to your Cloudflare Dashboard.
2. Go to **SSL/TLS** > **Overview** in the left sidebar.
3. You will see 4 modes: *Off*, *Flexible*, *Full*, and *Full (Strict)*.
   * **If set to "Flexible" (Easiest):** Cloudflare will handle HTTPS for your users/Shopify, and talk to your VPS via HTTP (Port 80). **You do not need to install Let's Encrypt Certbot on your VPS!** Nginx only needs a basic port 80 configuration.
   * **If set to "Full" or "Full (Strict)" (Most Secure):** You must install a free SSL certificate on your VPS using Certbot (Step 8 below) so Cloudflare can communicate securely with your VPS. 
   
   *(We recommend setting it to **Full** and running Certbot to ensure maximum security).*

---

## 2. Step-by-Step Hostinger VPS Deployment

### Step 1: Connect to your Hostinger VPS
Open your local computer terminal (Terminal on Mac) and SSH into your VPS:
```bash
ssh root@187.127.145.3
```
*(Enter your root password when prompted)*

---

### Step 2: Install Dependencies on the VPS
Once logged in, run this command block to update your server and install Node.js, Git, Nginx, and PM2 (Process Manager):
```bash
# Update server packages
sudo apt update && sudo apt upgrade -y

# Install Node.js (v20)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify Node and NPM installation
node -v
npm -v

# Install Git and Nginx
sudo apt install git nginx -y

# Install PM2 globally (to run your app 24/7 in the background)
sudo npm install pm2 -g
```

---

### Step 3: Clone Your Code to the VPS
1. Go to the `/var/www` directory:
```bash
cd /var/www
```

2. Clone your repository (replace with your actual GitHub repository URL):
```bash
git clone https://github.com/your-username/ai-image-manager.git
cd ai-image-manager
```
*(If your repository is private, it will ask for your GitHub username and password/Personal Access Token).*

3. Install your project dependencies:
```bash
npm install
```

---

### Step 4: Configure the Production Environment Variables
Create your production `.env` file on the server:
```bash
nano .env
```
Copy and paste the following environment variables (replace the dummy values with your actual Shopify Credentials and OpenAI API Key):
```env
PORT=3000
NODE_ENV=production
DATABASE_URL="file:./db.sqlite"
SHOPIFY_API_KEY="your_shopify_client_id"
SHOPIFY_API_SECRET="your_shopify_client_secret"
OPENAI_API_KEY="your_openai_api_key"
APP_URL="https://shopify-ai.deploymeta.com"
```
*Press `CTRL + O` then `Enter` to save, and `CTRL + X` to exit nano.*

---

### Step 5: Build and Initialize the SQLite Database
Because your VPS has persistent storage, **SQLite works perfectly!** You do not need to pay for or configure an external database.

Run these commands to build your application assets and generate the SQLite database tables:
```bash
# Build the React Router frontend and backend bundle
npm run build

# Generate Prisma client and run migrations to create the database tables
npx prisma generate
npx prisma migrate deploy
```

---

### Step 6: Start your App in the Background with PM2
To keep your app running continuously (even if you close your terminal or the server restarts):
```bash
# Start your app under the name "shopify-ai-app"
pm2 start npm --name "shopify-ai-app" -- run start

# Make PM2 launch automatically on server boots
pm2 startup
# (Run the exact command that PM2 outputs in your terminal screen)

# Save the current running processes list
pm2 save
```

---

### Step 7: Configure Nginx as a Reverse Proxy
By default, your Node app runs on port `3000`. We will configure Nginx to listen on port `80` (HTTP) and forward traffic to port `3000` for your subdomain.

1. Create a new Nginx configuration file:
```bash
sudo nano /etc/nginx/sites-available/shopify-app
```

2. Paste this configuration:
```nginx
server {
    listen 80;
    server_name shopify-ai.deploymeta.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```
*Save and close (`CTRL + O`, `Enter`, `CTRL + X`).*

3. Enable the configuration and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/shopify-app /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t   # Checks configuration for errors
sudo systemctl restart nginx
```

---

### Step 8: Get Free SSL (HTTPS) for your Subdomain
If you set Cloudflare's SSL/TLS mode to **Full** or **Full (Strict)**, run these commands to install an SSL certificate on the VPS:
```bash
# Install Certbot for Nginx
sudo apt install certbot python3-certbot-nginx -y

# Obtain the SSL certificate
sudo certbot --nginx -d shopify-ai.deploymeta.com
```
*Follow the prompts (enter your email, agree to terms). Certbot will automatically configure SSL inside your Nginx configuration!*

---

## 3. Registering Your App in Shopify Partner Dashboard

Now that your server is live and secure, tell Shopify where it is:

1. Open your **Shopify Partner Dashboard** > **Apps** > **AI Image Manager**.
2. Click **Configuration** in the left menu.
3. Update the URLs to match your new subdomain:
   * **App URL:** `https://shopify-ai.deploymeta.com`
   * **Allowed redirection URL:** `https://shopify-ai.deploymeta.com/auth/callback`
4. Update the **App Proxy** configuration (if your app uses storefront API queries):
   * **Proxy URL:** `https://shopify-ai.deploymeta.com/api`
5. Save your changes.

### Deploy the Theme App Extensions:
Back on your **local computer terminal** (inside `/Users/apple/Downloads/ai-image-manager`), run:
```bash
npm run deploy
```
*This command pushes your custom theme blocks (like the AI Image Generator block) directly to Shopify's CDN so they can load on your storefront.*

---

## 4. Install the App on your Store & Enable Blocks

1. Go to your **Shopify Partner Dashboard** > **Apps** > **AI Image Manager**.
2. Click **Select store** and choose your live store (`orvellastudio.com` or `orvella-70`).
3. Click **Install app** to authorize and install the app in the merchant admin.
4. **Activate Storefront Blocks:**
   * Go to your Shopify Store Admin > **Online Store** > **Themes** > **Customize** (on your active theme).
   * Navigate to the Product Page or Cart page template.
   * Click **Add block** or **Add section** in the sidebar.
   * Choose your custom app blocks (like `AI Image Generator` or `AI Cart Preview`).
   * Save and publish your theme changes!

Your AI Image Manager app is now completely live, self-hosted for free on your Hostinger VPS, and securely handling image generations on your live store!
