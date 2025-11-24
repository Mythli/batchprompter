const { execSync } = require('child_process');

const args = process.argv.slice(2);
const versionType = args[0] || 'patch';

console.log(`🚀 Starting release process...`);
console.log(`📦 Version bump type: ${versionType}`);

try {
    // 1. Build
    console.log('\n🔨 Step 1: Building...');
    execSync('pnpm run build', { stdio: 'inherit' });

    // 2. Bump Version (updates package.json, creates git commit and tag)
    console.log(`\n📈 Step 2: Bumping version (${versionType})...`);
    execSync(`npm version ${versionType}`, { stdio: 'inherit' });

    // 3. Push Changes and Tags
    console.log('\n⬆️  Step 3: Pushing to git...');
    execSync('git push --follow-tags', { stdio: 'inherit' });

    // 4. Publish to Registry
    console.log('\n📢 Step 4: Publishing to registry...');
    // --no-git-checks avoids errors if pnpm thinks the repo is dirty (though npm version should have committed everything)
    execSync('pnpm publish --no-git-checks', { stdio: 'inherit' });

    console.log('\n✅ Release completed successfully!');
} catch (error) {
    console.error('\n❌ Release failed.');
    process.exit(1);
}
