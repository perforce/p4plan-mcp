// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { z } from 'zod';
import { jsonSchemaPropertyToZod } from './mcp-server.factory';

function parse(property: Record<string, unknown>, value: unknown): unknown {
  return jsonSchemaPropertyToZod(property).parse(value);
}

function accepts(property: Record<string, unknown>, value: unknown): boolean {
  return jsonSchemaPropertyToZod(property).safeParse(value).success;
}

describe('jsonSchemaPropertyToZod', () => {
  describe('string', () => {
    it('accepts strings and numbers/booleans as strings', () => {
      expect(parse({ type: 'string' }, 'abc')).toBe('abc');
      expect(parse({ type: 'string' }, 144483)).toBe('144483');
      expect(parse({ type: 'string' }, true)).toBe('true');
    });

    it('rejects objects', () => {
      expect(accepts({ type: 'string' }, { id: 1 })).toBe(false);
    });
  });

  describe('number', () => {
    it('accepts numeric strings', () => {
      expect(parse({ type: 'number' }, '2.5')).toBe(2.5);
      expect(parse({ type: 'number' }, ' 3 ')).toBe(3);
    });

    it('rejects non-numeric strings', () => {
      expect(accepts({ type: 'number' }, 'two')).toBe(false);
      expect(accepts({ type: 'number' }, '')).toBe(false);
    });
  });

  describe('boolean', () => {
    it.each([
      ['true', true],
      ['False', false],
      ['yes', true],
      ['NO', false],
      ['1', true],
      [0, false],
    ])('accepts %p as %p', (input, expected) => {
      expect(parse({ type: 'boolean' }, input)).toBe(expected);
    });

    it('rejects anything else', () => {
      expect(accepts({ type: 'boolean' }, 'maybe')).toBe(false);
      expect(accepts({ type: 'boolean' }, 'constructor')).toBe(false);
      expect(accepts({ type: 'boolean' }, 2)).toBe(false);
    });
  });

  describe('enum', () => {
    const property = {
      type: 'string',
      enum: ['notDone', 'inProgress', 'veryHigh'],
      enumAliases: { started: 'inProgress' },
    };

    it('matches ignoring case, spaces, underscores and hyphens', () => {
      expect(parse(property, 'notDone')).toBe('notDone');
      expect(parse(property, 'Not done')).toBe('notDone');
      expect(parse(property, 'IN_PROGRESS')).toBe('inProgress');
      expect(parse(property, 'very-high')).toBe('veryHigh');
    });

    it('matches enumAliases', () => {
      expect(parse(property, 'Started')).toBe('inProgress');
    });

    it('rejects values that do not match', () => {
      expect(accepts(property, 'done')).toBe(false);
    });

    it('leaves ambiguous values for validation to reject', () => {
      const ambiguous = { type: 'string', enum: ['aB', 'ab'] };
      expect(parse(ambiguous, 'ab')).toBe('ab');
      expect(accepts(ambiguous, 'A B')).toBe(false);
    });
  });

  describe('array', () => {
    const strings = { type: 'array', items: { type: 'string' } };

    it('accepts arrays, JSON-encoded arrays and comma-separated strings', () => {
      expect(parse(strings, ['1', '2'])).toEqual(['1', '2']);
      expect(parse(strings, '["1","2"]')).toEqual(['1', '2']);
      expect(parse(strings, '1, 2,')).toEqual(['1', '2']);
    });

    it('parses a JSON-encoded object instead of splitting it on commas', () => {
      const items = {
        type: 'array',
        items: {
          anyOf: [
            {
              type: 'object',
              properties: {
                name: { type: 'string' },
                icon: { type: 'string' },
              },
              required: ['name'],
            },
            { type: 'string' },
          ],
        },
      };
      expect(parse(items, '{"name":"Low","icon":"greenCircle"}')).toEqual([
        { name: 'Low', icon: 'greenCircle' },
      ]);
      expect(parse(items, ['{"name":"High","icon":"redBox"}', 'Mid'])).toEqual([
        { name: 'High', icon: 'redBox' },
        'Mid',
      ]);
    });

    it('rejects malformed JSON and empty strings instead of splitting them', () => {
      expect(accepts(strings, "['1','2']")).toBe(false);
      expect(accepts(strings, '["1", "2",]')).toBe(false);
      expect(accepts(strings, '')).toBe(false);
      expect(accepts(strings, '   ')).toBe(false);
    });

    it('only splits comma-separated strings for plain string lists', () => {
      const labels = {
        type: 'array',
        items: {
          anyOf: [
            {
              type: 'object',
              properties: { name: { type: 'string' } },
              required: ['name'],
            },
            { type: 'string' },
          ],
        },
      };
      const enumList = {
        type: 'array',
        items: { type: 'string', enum: ['a', 'b'] },
      };
      expect(accepts(labels, 'Q1, 2026')).toBe(false);
      expect(parse(labels, ['Q1, 2026'])).toEqual(['Q1, 2026']);
      expect(accepts(enumList, 'a, b')).toBe(false);
    });

    it('wraps a single non-string value', () => {
      expect(parse(strings, 7)).toEqual(['7']);
    });

    it('wraps a single object for object items', () => {
      const objects = {
        type: 'array',
        items: {
          type: 'object',
          properties: { userID: { type: 'string' } },
          required: ['userID'],
        },
      };
      expect(parse(objects, { userID: '5' })).toEqual([{ userID: '5' }]);
      expect(parse(objects, '[{"userID":"5"}]')).toEqual([{ userID: '5' }]);
      expect(accepts(objects, 'a, b')).toBe(false);
    });
  });

  describe('object', () => {
    it('accepts JSON-encoded objects and coerces nested fields', () => {
      const property = {
        type: 'object',
        properties: { percentage: { type: 'number' } },
        required: ['percentage'],
      };
      expect(parse(property, '{"percentage":"50"}')).toEqual({
        percentage: 50,
      });
    });
  });

  describe('anyOf', () => {
    it('accepts any of the listed shapes', () => {
      const property = {
        anyOf: [
          { type: 'string' },
          {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
          },
        ],
      };
      expect(parse(property, 'Frontend')).toBe('Frontend');
      expect(parse(property, { name: 'Backend' })).toEqual({ name: 'Backend' });
    });
  });

  it('publishes descriptions, types and enums unchanged', () => {
    const schema = z.object({
      status: jsonSchemaPropertyToZod({
        type: 'string',
        enum: ['notDone', 'completed'],
        description: 'The status',
      }),
      flag: jsonSchemaPropertyToZod({
        type: 'boolean',
        description: 'A flag',
      }).optional(),
    });

    expect(z.toJSONSchema(schema, { io: 'input' }).properties).toEqual({
      status: {
        type: 'string',
        enum: ['notDone', 'completed'],
        description: 'The status',
      },
      flag: { type: 'boolean', description: 'A flag' },
    });
  });
});
