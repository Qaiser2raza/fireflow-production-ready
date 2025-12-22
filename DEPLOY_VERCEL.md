# 🚀 Deploy FireFlow to Vercel

## Prerequisites
- GitHub/GitLab/Bitbucket account
- Vercel account (free tier works great)
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

### 2️⃣ **Deploy to Vercel**

#### Option A: Using Vercel Dashboard (Recommended for Beginners)

1. **Go to Vercel**:
   - Visit https://vercel.com
   - Sign up or log in
   - Click "Add New Project"

2. **Import Repository**:
   - Select your Git provider (GitHub/GitLab/Bitbucket)
   - Import the fireflow-restaurant repository
   - Vercel will auto-detect it's a Vite project

3. **Configure Project**:
   - Framework Preset: **Vite** (auto-detected)
   - Build Command: `npm run build` (auto-filled)
   - Output Directory: `dist` (auto-filled)

4. **Add Environment Variables**:
   Click "Environment Variables" and add:
   
   ```
   VITE_SUPABASE_URL = https://cmdcqikndkjwvoeszgzx.supabase.co
   VITE_SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtZGNxaWtuZGtqd3ZvZXN6Z3p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4Nzg2MTksImV4cCI6MjA4MTQ1NDYxOX0.zduhVxLwHTM84jYmNAMYoHv1pd96JZ9z0UxYLKfbWi4
   VITE_GEMINI_API_KEY = your_actual_gemini_api_key
   ```

5. **Deploy**:
   - Click "Deploy"
   - Wait 2-3 minutes for the build
   - Your app will be live at `https://your-project.vercel.app`

#### Option B: Using Vercel CLI

1. **Install Vercel CLI**:
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy**:
   ```bash
   vercel
   ```
   
   Follow the prompts:
   - Set up and deploy? **Y**
   - Which scope? (Select your account)
   - Link to existing project? **N**
   - What's your project's name? **fireflow-restaurant**
   - In which directory is your code located? **. (current)**

4. **Add Environment Variables**:
   ```bash
   vercel env add VITE_SUPABASE_URL
   vercel env add VITE_SUPABASE_ANON_KEY
   vercel env add VITE_GEMINI_API_KEY
   ```

5. **Deploy to Production**:
   ```bash
   vercel --prod
   ```

### 3️⃣ **Configure Supabase for Your Domain**

1. Go to your Supabase project dashboard
2. Navigate to **Authentication > URL Configuration**
3. Add your Vercel URL to **Redirect URLs**:
   - `https://your-project.vercel.app/**`
   - `https://your-project.vercel.app/auth/callback`

### 4️⃣ **Custom Domain (Optional)**

1. In Vercel Dashboard, go to your project
2. Click **Settings > Domains**
3. Add your custom domain
4. Follow DNS configuration instructions

### 5️⃣ **Automatic Deployments**

✅ Every push to `main` branch automatically deploys to production
✅ Pull requests create preview deployments
✅ Rollback to previous deployments anytime

## 🔧 Troubleshooting

### Build Fails?
- Check build logs in Vercel dashboard
- Ensure all environment variables are set
- Verify Node.js version (should be 18+)

### App Loads But Features Don't Work?
- Check browser console for errors
- Verify environment variables are correctly set
- Check Supabase project is active and accessible

### Authentication Issues?
- Verify Vercel URL is added to Supabase redirect URLs
- Check CORS settings in Supabase

## 📊 Monitoring & Analytics

Vercel provides:
- ✅ Real-time deployment logs
- ✅ Performance metrics
- ✅ Error tracking
- ✅ Analytics (paid plans)

## 🎯 Next Steps

1. Set up custom domain
2. Enable Vercel Analytics
3. Configure GitHub Actions for CI/CD
4. Set up staging environment

## 💡 Pro Tips

- Use Vercel's preview deployments for testing
- Enable "Automatically expose System Environment Variables" in project settings
- Use Vercel's built-in environment variable management
- Set up Slack/Discord notifications for deployments

## 🆘 Need Help?

- Vercel Docs: https://vercel.com/docs
- Vercel Discord: https://vercel.com/discord
- GitHub Issues: Create an issue in your repository

---

**Your app should now be live at: `https://your-project.vercel.app`** 🎉
