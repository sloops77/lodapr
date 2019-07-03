module.exports = {
  extends: [
    "airbnb-base",
    "prettier",
  ],
  plugins: ["prettier"],
  parserOptions: {
    sourceType: "module"
  },
  env: {
    node: true,
    jest: true
  },
  rules: {
    complexity: ["error", 6],
    "max-depth": ["error", { max: 2 }],
    "max-lines": ["error", { max: 240, "skipBlankLines": true, "skipComments": true}],
    "max-nested-callbacks": ["error", 2],
    "no-console": ["error", { allow: ["warn", "error"] }],
    "no-use-before-define": 0, // override airbnb
    "no-restricted-syntax": 0,
    "no-continue": 0,
    "no-await-in-loop": 1,
    "prettier/prettier": "error"
  }
};
