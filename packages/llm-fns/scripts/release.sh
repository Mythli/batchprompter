#!/bin/bash
set -e
set -x

VERSION_TYPE=${1:-patch}

echo "🚀 Starting release process..."
echo "📦 Version bump type: $VERSION_TYPE"

# 0. Build
echo ""
echo "🔨 Step 0: Testing..."
pnpm run test

# 1. Build
echo ""
echo "🔨 Step 1: Building..."
pnpm run build

# 2. Bump Version (updates package.json, creates git commit and tag)
echo ""
echo "📈 Step 2: Bumping version ($VERSION_TYPE)..."
pnpm version "$VERSION_TYPE" --tag-version-prefix=llm-fns-v

# 3. Push Changes and Tags
echo ""
echo "⬆️  Step 3: Pushing to git..."
git push --follow-tags

# 4. Publish to Registry
echo ""
echo "📢 Step 4: Publishing to registry..."
# --no-git-checks avoids errors if pnpm thinks the repo is dirty (though npm version should have committed everything)
pnpm publish --no-git-checks

echo ""
echo "✅ Release completed successfully!"
