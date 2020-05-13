

const year = new Date().getFullYear();
const pkg = require('../package.json');
const version = pkg.version;
const name = pkg.name.replace(/^.*?\//, '');
const globalName = (() => {
  let name = pkg.name.replace(/^.*?\//, '');
  name = name.replace('markdown-it', 'markdownit').replace(/-([a-z])/g, function (m, p1) {
    return p1.toUpperCase();
  });
  return name;
})();
const license = pkg.license;

const text = `/*! ${name} ${version} https://github.com//GerHobbelt/${name} @license ${license} */\n\n`;
const match = `/*! ${name} `;    // skip the file where this match is true
module.exports = {
  text,
  match,
  version,
  globalName,
  packageName: name,
  license,
  year
};
