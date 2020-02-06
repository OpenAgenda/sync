"use strict";

const axios = require( 'axios' );


module.exports = async config => {
  const { data } = await axios.get(
    `https://api.openagenda.com/v2/agendas/${config.agendaUid}/settings?key=${config.publicKey}`
  );

  return data.form;
};
