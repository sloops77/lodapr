const eslintConfig = require("../.eslintrc");
const testConfig = Object.assign({}, eslintConfig);
Object.assign(testConfig.rules, {
  "max-lines": "off",
  "max-nested-callbacks": [2, 7]
});
module.exports = testConfig;