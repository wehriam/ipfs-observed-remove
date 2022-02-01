module.exports = {
  presets: [
    ['@babel/preset-flow', {
      allowDeclareFields: true,
    }],
  ],
  plugins: [
    ['@babel/plugin-transform-flow-strip-types', {
      allowDeclareFields: true,
    }],
    '@babel/plugin-proposal-class-properties',
  ],
  env: {
    test: {
      plugins: ['@babel/plugin-transform-modules-commonjs'],
    },
    esm: {},
    cjs: {
      presets: [
        ['@babel/env', {
          targets: {
            node: true,
          },
        }],
      ],
      exclude: '@babel/plugin-transform-regenerator',
    },
  },
};
