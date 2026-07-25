import js from "@eslint/js";
import babelParser from "@babel/eslint-parser";
import globals from "globals";

const sanitizeGlobals = (globalObj) => {
  if (!globalObj) return {};
  const sanitized = {};
  for (const [key, value] of Object.entries(globalObj)) {
    sanitized[key.trim()] = value;
  }
  return sanitized;
};

export default [
  {
    ignores: [
      "node_modules/",
      // Build output — lib/ and dist/ are compiled, native-pkg/ is the
      // generated @telecmi/piopiy-native staging dir (npm run stage:native).
      "dist/",
      "lib/",
      "native-pkg/",
      // Example apps have their own toolchains and lint configs.
      "example/",
      "example-rn/",
      "webpack.config.js",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: ["@babel/preset-env"],
        },
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        ...sanitizeGlobals(globals.browser),
        ...sanitizeGlobals(globals.node),
        ...sanitizeGlobals(globals.es2017),
      },
    },
    rules: {
      "no-unused-vars": "warn",
      "no-console": "error",
      "no-undef": "error",
    },
  },
  {
    // Build/release scripts are plain Node ESM.
    files: ["scripts/**/*.mjs", "scripts/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: sanitizeGlobals(globals.node),
    },
    rules: {
      // Scripts report progress on stdout by design.
      "no-console": "off",
    },
  },
  {
    // Jest test suite.
    files: ["test/**/*.js"],
    languageOptions: {
      globals: {
        ...sanitizeGlobals(globals.node),
        ...sanitizeGlobals(globals.jest),
      },
    },
  },
];
