# 🚀 Deploy FireFlow to Netlify

## Prerequisites
- GitHub/GitLab/Bitbucket account
- Netlify account (free tier works great)
- Your Supabase credentials
- Your Google Gemini API key

## Step-by-Step Deployment Guide

### 1️⃣ **Prepare Your Repository**

1. Initialize Git (if not already done):
   ```bash
   git init
   git add .
   git commit -m "Initial commit - FireFlow Restaurant System"
   ```

2. Create a new repository on GitHub:
   - Go to https://github.com/new
   - Create a new repository (public or private)
   - Don't initialize with README (we already have files)

3. Push your code:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/fireflow-restaurant.git
   git branch -M main
   git push -u origin main
   ```

### 2️⃣ **Deploy to Netlify**

#### Option A: Using Netlify Dashboard (Recommended for Beginners)

1. **Go to Netlify**:
   - Visit https://app.netlify.com
   - Sign up or log in
   - Click "Add new site" > "Import an existing project"

2. **Connect to Git Provider**:
   - Choose your Git provider (GitHub/GitLab/Bitbucket)
   - Authorize Netlify
   - Select your fireflow-restaurant repository

3. **Configure Build Settings**:
   - Branch to deploy: **main**
   - Build command: `npm run build`
   - Publish directory: `dist`
   - These should be auto-detected from netlify.toml

4. **Add Environment Variables**:
   Click "Show advanced" and add environment variables:
   
   ```
   VITE_SUPABASE_URL = https://cmdcqikndkjwvoeszgzx.supabase.co
   VITE_SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtZGNxaWtuZGtqd3ZvZXN6Z3p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4Nzg2MTksImV4cCI6MjA4MTQ1NDYxOX0.zduhVxLwHTM84jYmNAMYoHv1pd96JZ9z0UxYLKfbWi4
   VITE_GEMINI_API_KEY = your_actual_gemini_api_key
   ```

5. **Deploy**:
   - Click "Deploy site"
   - Wait 2-3 minutes for the build
   - Your app will be live at `https://random-name.netlify.app`

#### Option B: Using Netlify CLI

1. **Install Netlify CLI**:
   ```bash
   npm install -g netlify-cli
   ```

2. **Login to Netlify**:
   ```bash
   netlify login
   ```

3. **Initialize and Deploy**:
   ```bash
   netlify init
   ```
   
   Follow the prompts:
   - Create & configure a new site
   - Choose your team
   - Site name: **fireflow-restaurant** (or custom)
   - Build command: `npm run build`
   - Directory to deploy: `dist`

4. **Add Environment Variables**:
   ```bash
   netlify env:set VITE_SUPABASE_URL "https://cmdcqikndkjwvoeszgzx.supabase.co"
   netlify env:set VITE_SUPABASE_ANON_KEY "your_supabase_anon_key"
   netlify env:set VITE_GEMINI_API_KEY "your_gemini_api_key"
   ```

5. **Deploy to Production**:
   ```bash
   netlify deploy --prod
   ```

#### Option C: Drag & Drop (Quick Test)

1. Build your project locally:
   ```bash
   npm install
   npm run build
   ```

2. Go to https://app.netlify.com/drop
3. Drag the `dist` folder to the drop zone
4. **Note**: Environment variables need to be added manually in site settings

### 3️⃣ **Configure Environment Variables (If Not Done During Setup)**

1. Go to your site dashboard on Netlify
2. Click **Site settings > Environment variables**
3. Click **Add a variable** and add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_GEMINI_API_KEY`
4. Click **Save**
5. Trigger a new deploy: **Deploys > Trigger deploy > Deploy site**

### 4️⃣ **Configure Supabase for Your Domain**

1. Go to your Supabase project dashboard
2. Navigate to **Authentication > URL Configuration**
3. Add your Netlify URL to **Redirect URLs**:
   - `https://your-site.netlify.app/**`
   - `https://your-site.netlify.app/auth/callback`

### 5️⃣ **Custom Domain (Optional)**

1. In Netlify Dashboard, go to **Domain settings**
2. Click **Add custom domain**
3. Follow DNS configuration instructions:
   - For Netlify DNS: Automatic setup
   - For external DNS: Add CNAME or A record

### 6️⃣ **Enable Additional Features**

#### Form Handling (If using forms)
```html
<!-- Add to your forms -->
<form netlify>
  <!-- form fields -->
</form>
```

#### Serverless Functions (Optional)
Create a `netlify/functions` directory for backend logic

#### Split Testing
Set up A/B testing in Netlify dashboard

### 7️⃣ **Automatic Deployments**

✅ Every push to `main` branch automatically deploys to production
✅ Pull requests create deploy previews
✅ Rollback to previous deployments anytime

## 🔧 Troubleshooting

### Build Fails?
- Check deploy logs in Netlify dashboard
- Ensure all environment variables are set correctly
- Verify Node.js version in build settings
- Check netlify.toml configuration

### App Loads But Features Don't Work?
- Open browser console and check for errors
- Verify environment variables in **Site settings > Environment variables**
- Ensure variables start with `VITE_` prefix
- Check if Supabase project is active

### Authentication Issues?
- Verify Netlify URL is added to Supabase redirect URLs
- Check CORS settings in Supabase
- Ensure correct environment variables

### Routing Issues (404 on refresh)?
- netlify.toml should have redirects configured (already included)
- Verify the redirect rule is present:
  ```toml
  [[redirects]]
    from = "/*"
    to = "/index.html"
    status = 200
  ```

### Environment Variables Not Working?
- Must start with `VITE_` prefix for Vite to expose them
- Redeploy after adding/changing variables
- Check variable names match exactly

## 📊 Monitoring & Analytics

Netlify provides:
- ✅ Real-time deployment logs
- ✅ Build performance metrics
- ✅ Bandwidth monitoring
- ✅ Form submissions tracking
- ✅ Netlify Analytics (paid add-on)

## 🎯 Next Steps

1. **Set up custom domain**
2. **Enable Netlify Analytics**
3. **Configure branch deploys** for staging
4. **Set up deploy notifications** (Slack, Discord, Email)
5. **Add build plugins** for optimization

## 💡 Pro Tips

- **Deploy Previews**: Every PR gets its own preview URL
- **Split Testing**: Test different versions with traffic splitting
- **Edge Functions**: Use for serverless backend logic
- **Build Hooks**: Trigger builds from external services
- **Deploy Contexts**: Different env variables for production/preview

## 🔐 Security Best Practices

1. Never commit `.env` files
2. Use Netlify's environment variable management
3. Enable HTTPS (automatic with Netlify)
4. Set up proper CORS in Supabase
5. Use environment-specific configs

## 🆘 Need Help?

- Netlify Docs: https://docs.netlify.com
- Netlify Community: https://answers.netlify.com
- Netlify Discord: https://discord.gg/netlify
- GitHub Issues: Create an issue in your repository

## 📱 Netlify Mobile App

Download the Netlify mobile app to:
- Monitor deployments
- View analytics
- Get notifications
- Manage sites on the go

## 🎉 Success!

**Your app should now be live at: `https://your-site.netlify.app`**

You can now:
- Share the link with your team
- Set up a custom domain
- Monitor performance and usage
- Scale as needed

---

## 🆚 Vercel vs Netlify - Quick Comparison

| Feature | Netlify | Vercel |
|---------|---------|--------|
| Build minutes (free) | 300/month | 6000/month |
| Bandwidth (free) | 100GB/month | 100GB/month |
| Edge Functions | ✅ Yes | ✅ Yes |
| Form Handling | ✅ Built-in | ❌ Need serverless |
| Split Testing | ✅ Built-in | ❌ Paid plans |
| Analytics | Paid add-on | Free (basic) |
| Best for | Full-featured apps | Next.js apps |

Both are excellent choices for your FireFlow app! 🚀
