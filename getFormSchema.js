'use strict';

const axios = require('axios');
const OaError = require('./errors/OaError');


module.exports = async config => {
  const { data } = await axios.get(
    `https://api.openagenda.com/v2/agendas/${config.agendaUid}/settings?key=${config.publicKey}`
  ).catch(error => {
    throw new OaError(error);
  });

  return data.form;
};
