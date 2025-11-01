import { TextEncoder, TextDecoder } from 'util';
import { jest } from '@jest/globals';

if (!global.TextEncoder) {
  global.TextEncoder = TextEncoder;
}
if (!global.TextDecoder) {
  global.TextDecoder = TextDecoder;
}

if (typeof global.fetch !== 'function') {
  global.fetch = jest.fn();
}
