# Deploy to GitHub Pages

1. The repository lives at https://github.com/tomaszwojcikowski/trunk-slosh .
2. Add the remote and push:

```bash
git remote add github git@github.com:tomaszwojcikowski/trunk-slosh.git
git push -u github main
```

3. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. After the first green `CI` workflow on `main`, the site is at:

`https://tomaszwojcikowski.github.io/trunk-slosh/`

The workflow sets `VITE_BASE_PATH=/trunk-slosh/` for asset paths.
