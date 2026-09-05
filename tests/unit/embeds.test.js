'use strict';

process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const {
  successEmbed,
  errorEmbed,
  infoEmbed,
  BRAND_FOOTER_TEXT,
} = require('../../src/utils/embeds');

function assertBrandFooter(data) {
  assert.equal(data.timestamp, undefined);
  assert.equal(data.footer.text, BRAND_FOOTER_TEXT);
  assert.ok(data.footer.icon_url);
}

describe('successEmbed', () => {
  test('sets green color', () => {
    assert.equal(successEmbed('T', 'D').toJSON().color, 0x57f287);
  });

  test('sets title and description', () => {
    const data = successEmbed('All Good', 'Things worked.').toJSON();
    assert.equal(data.title, 'All Good');
    assert.equal(data.description, 'Things worked.');
  });

  test('has the brand footer and no timestamp', () => {
    assertBrandFooter(successEmbed('T', 'D').toJSON());
  });
});

describe('errorEmbed', () => {
  test('sets red color', () => {
    assert.equal(errorEmbed('T', 'D').toJSON().color, 0xed4245);
  });

  test('sets title and description', () => {
    const data = errorEmbed('Bad', 'It broke.').toJSON();
    assert.equal(data.title, 'Bad');
    assert.equal(data.description, 'It broke.');
  });

  test('has the brand footer and no timestamp', () => {
    assertBrandFooter(errorEmbed('T', 'D').toJSON());
  });
});

describe('infoEmbed', () => {
  test('sets brand blue color', () => {
    assert.equal(infoEmbed('T', 'D').toJSON().color, 0x5865f2);
  });

  test('sets title and description', () => {
    const data = infoEmbed('FYI', 'Just so you know.').toJSON();
    assert.equal(data.title, 'FYI');
    assert.equal(data.description, 'Just so you know.');
  });

  test('has the brand footer and no timestamp', () => {
    assertBrandFooter(infoEmbed('T', 'D').toJSON());
  });
});

describe('embed edge cases', () => {
  // discord.js validates that title/description are non-empty strings — empty string is invalid by design

  test('handles markdown in description', () => {
    const data = infoEmbed('Title', '**bold** and [link](https://example.com)').toJSON();
    assert.equal(data.description, '**bold** and [link](https://example.com)');
  });
});
