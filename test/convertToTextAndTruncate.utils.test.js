const {
  convertToTextAndTruncate,
} = require('../utils');

describe('convertToTextAndTruncate', () => {
  test('without options, guesses input format (HTML)', () => {
    expect(
      convertToTextAndTruncate('<p>This was HTML</p>')
    ).toBe('This was HTML');
  });

  test('without options, guesses input format (markdown)', () => {
    expect(
      convertToTextAndTruncate('**This was markdown**')
    ).toBe('This was markdown');
  });

  test('inputType option at null means no conversion is done', () => {
    expect(
      convertToTextAndTruncate('<p>Unchanged</p>', { inputType: null })
    ).toBe('<p>Unchanged</p>');
  });

  test('truncateAtNewline option', () => {
    expect(
      convertToTextAndTruncate('Here is a line\nHere is another', {
        truncateAtNewline: true,
        inputType: null,
      })
    ).toBe('Here is a line');
  });

  test('truncate at 20 max characters', () => {
    expect(
      convertToTextAndTruncate('**This** should be truncated at the 20th character', { max: 20 }),
    ).toBe('This should be trunc');
  });

  test('add suffix to truncated text', () => {
    expect(
      convertToTextAndTruncate('Here is a suffix: this bit is truncated', { truncateSuffix: ' (...)', max: 23 }),
    ).toBe('Here is a suffix: (...)');
  });

  test('do not truncate in the middle of a word', () => {
    expect(
      convertToTextAndTruncate('**This** should be truncated after the last untruncated word', {
        max: 20,
        truncateWord: false,
      })
    ).toBe('This should be');
  });

  test('OpenAgenda short description use case', () => {
    const shortDescription = convertToTextAndTruncate(
      '<p><strong>Lorem ipsum dolor sit amet</strong>, consectetur adipiscing elit. Morbi malesuada, lectus et aliquam euismod, mi sem scelerisque odio, at bibendum odio lacus posuere sapien. Lorem ipsum dolor sit amet, consectetur adipiscing non.</p>',
      {
        max: 200,
        inputType: 'HTML',
        truncateWord: false,
        truncateAtNewline: true,
        truncateSuffix: ' (...)',
      }
    );

    expect(shortDescription.length).toBeLessThan(200);
  });

  test('handles texts passed under object of lang keys', () => {
    const shortDescription = convertToTextAndTruncate(
      { fr: '<p><strong>Lorem ipsum dolor sit amet</strong>, consectetur adipiscing elit. Morbi malesuada, lectus et aliquam euismod, mi sem scelerisque odio, at bibendum odio lacus posuere sapien. Lorem ipsum dolor sit amet, consectetur adipiscing non.</p>' },
      {
        max: 200,
        inputType: 'HTML',
        truncateWord: false,
        truncateAtNewline: true,
        truncateSuffix: ' (...)',
      }
    );

    expect(shortDescription.fr.length).toBeLessThan(200);
  });
});
