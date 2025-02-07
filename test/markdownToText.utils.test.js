const { markdownToText } = require('../utils');

describe('markdownToText', () => {
  it('basic case', () => {
    expect(
      markdownToText('## This was markdown\n**It is now text**')
    ).toBe('This was markdown\nIt is now text\n');
  })
});