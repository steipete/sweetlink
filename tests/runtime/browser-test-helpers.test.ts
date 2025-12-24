// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sweetLinkBrowserTestHelpers } from '../../src/runtime/browser';

const { stripDataUrlPrefix, commandSelectorSummary } = sweetLinkBrowserTestHelpers;

describe('sweetLinkBrowserTestHelpers', () => {
  describe('stripDataUrlPrefix', () => {
    it('removes default JPEG prefix', () => {
      const dataUrl = 'data:image/jpeg;base64,Zm9vYmFy';
      expect(stripDataUrlPrefix(dataUrl)).toBe('Zm9vYmFy');
    });

    it('removes the first comma-delimited header for other MIME types', () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA';
      expect(stripDataUrlPrefix(dataUrl)).toBe('iVBORw0KGgoAAAANSUhEUgAA');
    });

    it('returns the original string when no comma is present', () => {
      const dataUrl = 'not-a-data-url';
      expect(stripDataUrlPrefix(dataUrl)).toBe(dataUrl);
    });
  });

  describe('commandSelectorSummary', () => {
    it('prefers stable identifiers in order of specificity', () => {
      const element = document.createElement('div');
      element.id = 'tweet-card';
      element.dataset.testid = 'tweet-card';
      element.dataset.sweetlinkTarget = 'tweet-card';

      expect(commandSelectorSummary(element)).toBe(
        '#tweet-card [data-testid="tweet-card"] [data-sweetlink-target="tweet-card"]'
      );
    });

    it('falls back to the lowercase tag name when no attributes are present', () => {
      const element = document.createElement('SECTION');
      expect(commandSelectorSummary(element)).toBe('section');
    });
  });
});
