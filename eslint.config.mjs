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
      "dist/",
      "lib/",
      "example/",
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
];
