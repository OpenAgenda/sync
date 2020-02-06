const { readdirSync } = require('fs');
const path = require('path');

const matchId = str => str.match(/event\.(.*)\.json/)[1];

module.exports = function listSavedEvents(directory) {
  return readdirSync(path.join(directory, 'data'))
    .sort((a, b) => matchId(a) - matchId(b));
};
