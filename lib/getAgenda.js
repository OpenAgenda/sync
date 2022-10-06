'use strict';

const axios = require('axios');
const OaError = require('../errors/OaError');


module.exports = async (agendaUid, publicKey) => {
  const { data } = await axios.get(
    `https://api.openagenda.com/v2/agendas/${agendaUid}?key=${publicKey}`
  ).catch(error => {
    throw new OaError(error);
  });

  return data;
};
