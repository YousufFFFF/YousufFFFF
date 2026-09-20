const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

/**
 * Metro in a monorepo.
 *
 * Two things need handling:
 *
 * 1. The app imports `@rival/core` and `@rival/api-client` from the workspace,
 *    so Metro has to watch the repo root as well as this directory.
 *
 * 2. The web app in this workspace uses React 19, which npm hoists to the root
 *    `node_modules`. React Native 0.76 needs React 18, which is installed here
 *    in `apps/mobile/node_modules`. Without the override below, the bundle ends
 *    up with React Native's 18 renderer against React 19's DOM client, which
 *    fails at runtime rather than at build time. Pinning the singleton packages
 *    to this app's own copies keeps each app on the React it expects.
 */
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Packages that must resolve to exactly one copy for the app to work.
const SINGLETONS = ['react', 'react-dom', 'react-native', 'react-native-web', 'scheduler'];

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const singleton = SINGLETONS.find((name) => moduleName === name || moduleName.startsWith(`${name}/`));
  if (singleton) {
    const local = path.resolve(projectRoot, 'node_modules', singleton);
    try {
      require.resolve(path.join(local, 'package.json'));
      return context.resolveRequest(
        { ...context, originModulePath: path.join(local, 'index.js') },
        moduleName,
        platform,
      );
    } catch {
      // Not installed locally; fall through to the default resolution.
    }
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
