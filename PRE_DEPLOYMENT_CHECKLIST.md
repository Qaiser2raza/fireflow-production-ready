# ✅ Pre-Deployment Checklist

Use this checklist before deploying your FireFlow Restaurant System to production.

## 🔐 Security & Credentials

- [ ] **Gemini API Key**
  - [ ] Obtained from Google AI Studio
  - [ ] Tested and working
  - [ ] Added to environment variables
  - [ ] NOT committed to Git

- [ ] **Supabase Configuration**
  - [ ] Project is active
  - [ ] URL is correct: `https://cmdcqikndkjwvoeszgzx.supabase.co`
  - [ ] Anon key is valid
  - [ ] Service role key is secure (if used)

- [ ] **Environment Variables**
  - [ ] All start with `VITE_` prefix
  - [ ] Listed in `.env.example`
  - [ ] NOT committed in `.env.local`
  - [ ] Ready to add to deployment platform

## 🗄️ Database Setup

- [ ] **Supabase Database**
  - [ ] All tables created
  - [ ] RLS policies configured
  - [ ] Migration script run: `001_add_multi_tenancy.sql`
  - [ ] Test data added (optional)

- [ ] **Authentication**
  - [ ] Email auth enabled in Supabase
  - [ ] Password requirements set
  - [ ] Redirect URLs configured (add after deployment)

## 💻 Code & Configuration

- [ ] **Dependencies**
  - [ ] `npm install` runs without errors
  - [ ] All packages are latest compatible versions
  - [ ] No critical security vulnerabilities

- [ ] **Configuration Files**
  - [ ] `vercel.json` or `netlify.toml` present
  - [ ] `.gitignore` includes `.env*` files
  - [ ] `package.json` has correct scripts
  - [ ] `vite.config.ts` configured properly

- [ ] **TypeScript**
  - [ ] No TypeScript errors: `npx tsc --noEmit`
  - [ ] Types are properly defined
  - [ ] `tsconfig.json` is configured

## 🧪 Testing

- [ ] **Local Development**
  - [ ] `npm run dev` works
  - [ ] All features load correctly
  - [ ] No console errors
  - [ ] Authentication works

- [ ] **Production Build**
  - [ ] `npm run build` succeeds
  - [ ] `npm run preview` works
  - [ ] No build warnings (or acceptable ones)
  - [ ] Bundle size is reasonable

- [ ] **Feature Testing**
  - [ ] POS system works
  - [ ] KDS displays orders
  - [ ] Payment processing works
  - [ ] Menu management functional
  - [ ] Staff management works
  - [ ] Floor plan displays
  - [ ] AURA assistant responds
  - [ ] Dashboard shows data

## 🌐 Git & Repository

- [ ] **Version Control**
  - [ ] Git initialized: `git init`
  - [ ] All files added: `git add .`
  - [ ] Initial commit made
  - [ ] Remote repository created (GitHub/GitLab/Bitbucket)
  - [ ] Code pushed: `git push -u origin main`

- [ ] **Repository Settings**
  - [ ] Repository is private (recommended) or public
  - [ ] README.md is informative
  - [ ] `.gitignore` is comprehensive
  - [ ] No sensitive data in history

## 🚀 Deployment Platform

Choose ONE platform and complete its checklist:

### Option A: Vercel

- [ ] **Account Setup**
  - [ ] Vercel account created
  - [ ] CLI installed: `npm install -g vercel`
  - [ ] Logged in: `vercel login`

- [ ] **Project Configuration**
  - [ ] Project imported or initialized
  - [ ] Build command: `npm run build`
  - [ ] Output directory: `dist`
  - [ ] Framework detected as Vite

- [ ] **Environment Variables**
  - [ ] `VITE_SUPABASE_URL` added
  - [ ] `VITE_SUPABASE_ANON_KEY` added
  - [ ] `VITE_GEMINI_API_KEY` added

### Option B: Netlify

- [ ] **Account Setup**
  - [ ] Netlify account created
  - [ ] CLI installed: `npm install -g netlify-cli`
  - [ ] Logged in: `netlify login`

- [ ] **Project Configuration**
  - [ ] Project imported or initialized
  - [ ] Build command: `npm run build`
  - [ ] Publish directory: `dist`
  - [ ] `netlify.toml` present

- [ ] **Environment Variables**
  - [ ] `VITE_SUPABASE_URL` added
  - [ ] `VITE_SUPABASE_ANON_KEY` added
  - [ ] `VITE_GEMINI_API_KEY` added

## 🔗 Post-Deployment (Complete After First Deploy)

- [ ] **Supabase Configuration**
  - [ ] Add deployment URL to Redirect URLs
  - [ ] Format: `https://your-app.vercel.app/**`
  - [ ] Add to Site URL as well
  - [ ] Test authentication flow

- [ ] **DNS & Domain (If using custom domain)**
  - [ ] Domain purchased
  - [ ] DNS configured
  - [ ] SSL certificate active (automatic)
  - [ ] Domain redirects to HTTPS

- [ ] **Testing Production**
  - [ ] Visit deployed URL
  - [ ] Test all major features
  - [ ] Check mobile responsiveness
  - [ ] Test authentication
  - [ ] Verify API connections
  - [ ] Check browser console for errors

- [ ] **Monitoring & Analytics**
  - [ ] Deployment notifications set up
  - [ ] Error tracking configured (optional)
  - [ ] Analytics enabled (optional)

## 📚 Documentation

- [ ] **README Files**
  - [ ] DEPLOYMENT_README.md reviewed
  - [ ] DEPLOY_VERCEL.md or DEPLOY_NETLIFY.md ready
  - [ ] TROUBLESHOOTING.md available
  - [ ] Team members can access guides

- [ ] **Environment Setup**
  - [ ] `.env.example` is complete
  - [ ] Instructions for new developers
  - [ ] API key acquisition documented

## 🎯 Final Steps

- [ ] **Backup Strategy**
  - [ ] Supabase backups enabled
  - [ ] Code backed up on Git
  - [ ] Database export downloaded

- [ ] **Team Communication**
  - [ ] Deployment plan shared with team
  - [ ] Credentials securely shared (if needed)
  - [ ] Roles and responsibilities clear

- [ ] **Go-Live Plan**
  - [ ] Deployment time scheduled
  - [ ] Rollback plan prepared
  - [ ] Team available for monitoring
  - [ ] Communication channels ready

## 🚨 Final Pre-Flight Check

Before clicking "Deploy":

1. **Did you set ALL environment variables?**
   - VITE_SUPABASE_URL ✓
   - VITE_SUPABASE_ANON_KEY ✓
   - VITE_GEMINI_API_KEY ✓

2. **Did you test the production build locally?**
   ```bash
   npm run build && npm run preview
   ```

3. **Is your code pushed to Git?**
   ```bash
   git status
   ```

4. **Are you ready to add the deployment URL to Supabase?**
   (Do this immediately after deployment)

## ✨ You're Ready!

If all boxes are checked, you're ready to deploy! 🚀

**Next steps**:
1. Follow [DEPLOY_VERCEL.md](./DEPLOY_VERCEL.md) or [DEPLOY_NETLIFY.md](./DEPLOY_NETLIFY.md)
2. Deploy your application
3. Complete post-deployment checklist
4. Test everything thoroughly
5. Celebrate! 🎉

---

## 📞 Need Help?

If you're unsure about any item:
- Review the deployment guides
- Check TROUBLESHOOTING.md
- Test locally first
- Ask questions before deploying

**Remember**: It's better to spend extra time on preparation than to fix issues in production!

Good luck! 🔥
