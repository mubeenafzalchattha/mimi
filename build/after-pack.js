/*
 * Re-sign the completed bundle after electron-builder has copied in app files.
 * This makes an unsigned development build structurally valid on macOS.
 * Gatekeeper will still require an "Open Anyway" approval until the app is
 * signed with a Developer ID certificate and notarized.
 */
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  );
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit'
  });
};
