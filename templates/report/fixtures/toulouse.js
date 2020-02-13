'use strict';

module.exports = {
  domain: 'https://openagenda.com',
  data: [
    {
      agenda: {
        uid: 7664114,
        title: 'Launaguet sync test',
        description: 'Launaguet sync test',
        slug: 'launaguet-sync-test',
        url: null,
        official: 0,
        image: null
      },
      stats: { savedEvents: 14, upToDateEvents: 14 }
    },
    {
      agenda: {
        uid: 12345678,
        title: 'Saint Jean',
        description: 'Saint Jean',
        slug: 'saint-jean-test',
        url: null,
        official: 0,
        image: null
      },
      stats: {
        savedEvents: 48,
        mergedSourceEvents: 10,
        invalidImages: 3
      }
    },
    {
      agenda: {
        uid: 12345678,
        title: 'Saint Orens',
        description: 'Saint Orens',
        slug: 'saint-orens-test',
        url: null,
        official: 0,
        image: null
      },
      stats: {
        eventListError: { message: 'Broken json' }
      }
    },
  ]
};
