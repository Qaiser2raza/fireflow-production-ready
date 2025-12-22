# 🔧 Troubleshooting Guide

## Common Deployment Issues & Solutions

### 1. Build Failures

#### Error: "Cannot find module '@google/genai'"
```bash
# Solution: Install dependencies
npm install
```

#### Error: "TypeScript compilation failed"
```bash
# Solution: Check TypeScript version
npm install typescript@~5.8.2 --save-dev
```

#### Error: "Vite build failed"
```bash
# Solution: Clear cache and rebuild
rm -rf node_modules dist
npm install
npm run build
```

### 2. Environment Variable Issues

#### Variables Not Working in Production
**Problem**: App works locally but not in production

**Solution**:
1. All variables must start with `VITE_` prefix
2. Set them in your deployment platform (Vercel/Netlify)
3. Redeploy after adding variables

**Check in browser console**:
```javascript
console.log(import.meta.env.VITE_SUPABASE_URL)
```

#### Supabase Connection Fails
**Problem**: "Failed to connect to Supabase"

**Solution**:
1. Verify `VITE_SUPABASE_URL` is correct
2. Check `VITE_SUPABASE_ANON_KEY` is valid
3. Ensure Supabase project is not paused
4. Check network tab in browser devtools

### 3. Routing Issues

#### 404 on Page Refresh
**Problem**: Direct URLs return 404

**Solution for Vercel**:
- Check `vercel.json` has rewrites (already configured)
```json
{
  "rewrites": [{"source": "/(.*)", "destination": "/index.html"}]
}
```

**Solution for Netlify**:
- Check `netlify.toml` has redirects (already configured)
```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### 4. Authentication Issues

#### Login Fails / Redirects Don't Work
**Problem**: Authentication not working after deployment

**Solution**:
1. Go to Supabase Dashboard > Authentication > URL Configuration
2. Add your deployed URL to "Redirect URLs":
   - `https://your-app.vercel.app/**`
   - `https://your-app.netlify.app/**`
3. Add to "Site URL" as well

#### CORS Errors
**Problem**: "CORS policy blocked the request"

**Solution**:
1. Check Supabase API settings
2. Ensure your domain is whitelisted
3. Verify ANON key is correct

### 5. API Key Issues

#### Gemini API Not Working
**Problem**: AURA assistant not responding

**Solutions**:
1. Verify API key is valid: https://makersuite.google.com/app/apikey
2. Check API key is set as `VITE_GEMINI_API_KEY`
3. Ensure you have quota/credits available
4. Check browser console for specific errors

**Test API key**:
```bash
curl -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"Hello"}]}]}' \
  -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=YOUR_API_KEY"
```

### 6. Performance Issues

#### Slow Load Times
**Solutions**:
1. Enable caching in Vercel/Netlify
2. Optimize images
3. Use code splitting
4. Enable compression

#### Large Bundle Size
**Solutions**:
1. Check bundle analyzer
2. Lazy load components
3. Remove unused dependencies

### 7. Database Issues

#### RLS (Row Level Security) Errors
**Problem**: "Permission denied" or "Row level security policy violated"

**Solution**:
1. Check Supabase RLS policies
2. Verify user authentication
3. Run the migration script:
```bash
# In Supabase SQL Editor, run:
# supabase/migrations/001_add_multi_tenancy.sql
```

#### Cannot Insert/Update Records
**Problem**: Database operations fail

**Solutions**:
1. Check user permissions
2. Verify RLS policies allow the operation
3. Check if required fields are provided
4. Verify foreign key relationships

### 8. Vercel-Specific Issues

#### Build Minutes Exceeded
**Solution**: 
- Upgrade to Pro plan OR
- Optimize build time OR
- Switch to Netlify (more free build minutes)

#### Function Timeout
**Solution**:
- Optimize serverless functions
- Consider upgrading plan
- Use edge functions for faster response

### 9. Netlify-Specific Issues

#### Form Submissions Not Working
**Solution**:
Add `netlify` attribute to forms:
```html
<form netlify>
  <!-- form fields -->
</form>
```

#### Build Plugin Errors
**Solution**:
Check `netlify.toml` and remove/fix problematic plugins

### 10. Local Development Issues

#### Port 3000 Already in Use
```bash
# Solution: Use different port
npx vite --port 3001
```

#### Module Resolution Errors
```bash
# Solution: Clear cache
rm -rf node_modules/.vite
npm run dev
```

## Quick Diagnostic Commands

### Check Environment Variables (Local)
```bash
cat .env.local
```

### Test Build Locally
```bash
npm run build && npm run preview
```

### Check Dependencies
```bash
npm list --depth=0
```

### Clear Everything and Start Fresh
```bash
rm -rf node_modules dist .vite
npm install
npm run build
```

## Debug Checklist

When something goes wrong, check these in order:

- [ ] Browser console - Any JavaScript errors?
- [ ] Network tab - Are API calls failing?
- [ ] Build logs - Did the build complete successfully?
- [ ] Environment variables - Are they set correctly?
- [ ] Supabase status - Is the project active?
- [ ] API keys - Are they valid and have quota?
- [ ] DNS settings - Is the domain configured correctly?
- [ ] Redirect URLs - Are they added to Supabase?

## Getting More Help

### Vercel Support
- Docs: https://vercel.com/docs
- Discord: https://vercel.com/discord
- GitHub: https://github.com/vercel/vercel

### Netlify Support
- Docs: https://docs.netlify.com
- Community: https://answers.netlify.com
- Discord: https://discord.gg/netlify

### Supabase Support
- Docs: https://supabase.com/docs
- Discord: https://discord.supabase.com
- GitHub: https://github.com/supabase/supabase

### Stack Overflow
Search for specific errors with tags:
- `vite`
- `react`
- `supabase`
- `vercel` or `netlify`

## Still Stuck?

If you're still experiencing issues:

1. **Gather information**:
   - Exact error message
   - When it occurs (build/runtime)
   - What you've tried
   - Browser console logs
   - Build logs

2. **Check the guides**:
   - DEPLOYMENT_README.md
   - DEPLOY_VERCEL.md
   - DEPLOY_NETLIFY.md

3. **Search for the error**:
   - Google the exact error message
   - Check GitHub issues
   - Search Stack Overflow

4. **Ask for help**:
   - Include all gathered information
   - Share relevant code snippets
   - Mention what you've tried

Remember: Most deployment issues are related to:
1. Environment variables (90% of cases)
2. Build configuration
3. Authentication/CORS setup
4. Missing dependencies

Good luck! 🚀
