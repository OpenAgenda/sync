const isURL200 = require('../utils/isURL200');

describe('utils', () => {
  describe('isURL200', () => {
    it('URL with copyright unicode', async () => {
      const is200 = await isURL200(
        'https://mediatheques.villeurbanne.fr/agenda/wp-content/uploads/2023/02/230412_merepoule_©Filmsdupreau.jpg'
      );

      expect(is200).toBe(true);
    });
  });
});
