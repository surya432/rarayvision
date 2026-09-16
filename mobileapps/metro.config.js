const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
    resolver: {
        extraNodeModules: {
            '@core': path.resolve(__dirname, 'src/core'),
            '@router': path.resolve(__dirname, 'src/router'),
            '@components': path.resolve(__dirname, 'src/components'),
        },
    },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
