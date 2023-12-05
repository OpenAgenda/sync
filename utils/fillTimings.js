const moment = require('moment-timezone');

const fZ = n => `${n < 10 ? '0': ''}${n}`;

function getHoursBetweenDates(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Calculate the time difference in milliseconds
  const timeDifferenceMs = Math.abs(end - start);

  // Convert milliseconds to hours
  const hours = timeDifferenceMs / (1000 * 60 * 60);

  return hours;
}

module.exports = (start, end) => {

  const debut = new Date(start);
  const fin = new Date(end);
  const allDays = [];
  let cursor = new Date(debut)
  // console.log('initial value given to cursor', cursor);

  while (cursor < fin) {
    allDays.push(new Date(cursor));
    //console.log(cursor, utcToZonedTime(cursor, 'Europe/Paris'));
    cursor.setDate(cursor.getDate() + 1);
  }

  const timings = allDays
    .map(d => moment.tz(d, 'Europe/Paris'))
  	.map((item, index) => {    
      return {
        begin: index === 0 ? 
          start : 
          `${item.format('YYYY')}-${item.format('MM')}-${item.format('DD')}T00:00:00${item.format('Z')}`,
       	end: index >= allDays.length - 1 ? 
          end : 
          `${item.format('YYYY')}-${item.format('MM')}-${item.format('DD')}T23:59:59${item.format('Z')}`,
      };
    });
  

  for (const timing of timings) {
    console.log(timing.begin, timing.end, getHoursBetweenDates(timing.begin, timing.end));
  }

  return timings;
}