/** Expo's preset handles the JSX runtime, TypeScript and expo-router. */
module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
