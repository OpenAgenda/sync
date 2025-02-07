const {
  HTMLToText,
} = require('../utils');

describe('HTMLToText', () => {
  it('takes HTMl, gives text', () => {
    expect(
      HTMLToText('<p>This was HTML with <a href="https://openagenda.com">a link</a></p>')
    ).toBe('This was HTML with a link');
  });
});