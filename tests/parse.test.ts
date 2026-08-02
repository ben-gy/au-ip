// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <hi@ben.gy>
//
// The pipeline's parsing rules. These import pipeline/parse.mjs directly, which
// is dependency-free on purpose — a test that needed node:zlib or the network
// would only ever be run by hand.

import { describe, expect, it } from 'vitest';
import {
  splitCsvLine, headerIndex, yearOf, daysBetween, cleanState, cleanAuPostcode,
  originOf, normaliseFilerName, filerKey, titleCaseName, parseWipoField,
  parseNiceClass, prettyFieldLabel, NICE_CLASSES, NICE_KIND, pct,
  ORIGIN_SHARE_LAST_RELIABLE_YEAR, VALID_STATES,
} from '../pipeline/parse.mjs';

describe('splitCsvLine', () => {
  it('splits a plain row', () => {
    expect(splitCsvLine('patent,1993032915,petty,ceased')).toEqual(['patent', '1993032915', 'petty', 'ceased']);
  });
  it('keeps commas inside quotes together', () => {
    expect(splitCsvLine('a,"smith, john and co",b')).toEqual(['a', 'smith, john and co', 'b']);
  });
  it('unescapes doubled quotes', () => {
    expect(splitCsvLine('a,"say ""hi""",b')).toEqual(['a', 'say "hi"', 'b']);
  });
  it('preserves empty trailing fields', () => {
    expect(splitCsvLine('a,,,')).toEqual(['a', '', '', '']);
  });
  it('handles a single field with no commas', () => {
    expect(splitCsvLine('solo')).toEqual(['solo']);
  });
  it('handles an empty line', () => {
    expect(splitCsvLine('')).toEqual(['']);
  });
});

describe('headerIndex', () => {
  it('maps column names to positions', () => {
    const ix = headerIndex('ip_right_type,application_number,status', ['status']);
    expect(ix.ip_right_type).toBe(0);
    expect(ix.status).toBe(2);
  });
  it('throws when a required column is missing, naming it', () => {
    expect(() => headerIndex('a,b,c', ['party_name'])).toThrow(/party_name/);
  });
  it('strips a UTF-8 BOM from the first column', () => {
    const ix = headerIndex('﻿ip_right_type,status', ['ip_right_type']);
    expect(ix.ip_right_type).toBe(0);
  });
});

describe('yearOf', () => {
  it('reads the year from an ISO timestamp', () => {
    expect(yearOf('1993-02-10T00:00:00.000Z')).toBe(1993);
  });
  it('returns 0 for a blank date rather than NaN', () => {
    expect(yearOf('')).toBe(0);
    expect(yearOf(undefined)).toBe(0);
  });
  it('rejects implausible years instead of trusting them', () => {
    expect(yearOf('1066-01-01')).toBe(0);
    expect(yearOf('9999-01-01')).toBe(0);
  });
  it('accepts the boundary years', () => {
    expect(yearOf('1850-01-01')).toBe(1850);
    expect(yearOf('2100-01-01')).toBe(2100);
  });
});

describe('daysBetween', () => {
  it('counts whole days', () => {
    expect(daysBetween('2020-01-01T00:00:00Z', '2020-01-31T00:00:00Z')).toBe(30);
  });
  it('returns null when either end is missing', () => {
    expect(daysBetween('', '2020-01-01')).toBeNull();
    expect(daysBetween('2020-01-01', '')).toBeNull();
  });
  it('returns null for an inverted interval rather than a negative lag', () => {
    expect(daysBetween('2020-06-01', '2019-01-01')).toBeNull();
  });
  it('returns null for unparseable input', () => {
    expect(daysBetween('not-a-date', '2020-01-01')).toBeNull();
  });
});

describe('cleanState', () => {
  it('accepts the eight valid codes', () => {
    for (const s of VALID_STATES) expect(cleanState(s)).toBe(s);
  });
  it('maps the long form the data sometimes carries', () => {
    expect(cleanState('queensland')).toBe('qld');
    expect(cleanState('New South Wales')).toBe('nsw');
  });
  it('drops a postcode that leaked into the state column', () => {
    expect(cleanState('5371')).toBe('');
  });
  it('drops anything else rather than guessing', () => {
    expect(cleanState('california')).toBe('');
    expect(cleanState('')).toBe('');
  });
});

describe('cleanAuPostcode', () => {
  it('accepts a four-digit Australian postcode', () => {
    expect(cleanAuPostcode('3000', 'au')).toBe('3000');
  });
  it('rejects a foreign postcode even when it looks Australian', () => {
    // DuPont's US postcode is 19898 — five digits, so length alone catches it.
    expect(cleanAuPostcode('19898', 'us')).toBe('');
    // A Japanese applicant with a 4-digit code must still be rejected on country.
    expect(cleanAuPostcode('4488', 'jp')).toBe('');
  });
  it('rejects a malformed Australian postcode', () => {
    expect(cleanAuPostcode('30001', 'au')).toBe('');
    expect(cleanAuPostcode('abc', 'au')).toBe('');
  });
  it('handles blank input', () => {
    expect(cleanAuPostcode('', 'au')).toBe('');
    expect(cleanAuPostcode('3000', '')).toBe('');
  });
});

describe('originOf', () => {
  it('classifies Australian, foreign and unrecorded separately', () => {
    expect(originOf('au')).toBe('domestic');
    expect(originOf('US')).toBe('foreign');
    expect(originOf('')).toBe('unknown');
    expect(originOf(undefined)).toBe('unknown');
  });
  it('never silently treats a blank country as foreign', () => {
    expect(originOf('   ')).toBe('unknown');
  });
});

describe('normaliseFilerName', () => {
  it('merges the legal-form variants one company files under', () => {
    const a = normaliseFilerName('aristocrat technologies australia pty limited');
    const b = normaliseFilerName('aristocrat technologies pty ltd');
    const c = normaliseFilerName('aristocrat technologies inc');
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(a).toBe('aristocrat technologies');
  });
  it('strips stacked legal forms', () => {
    expect(normaliseFilerName('acme widgets pty ltd')).toBe('acme widgets');
    expect(normaliseFilerName('acme widgets gmbh')).toBe('acme widgets');
  });
  it('leaves a distinctive name intact', () => {
    expect(normaliseFilerName('commonwealth scientific and industrial research organisation'))
      .toBe('commonwealth scientific and industrial research organisation');
  });
  it('does not merge two genuinely different companies', () => {
    expect(normaliseFilerName('boston scientific scimed inc'))
      .not.toBe(normaliseFilerName('boston scientific neuromodulation corporation'));
  });
  it('never reduces a name to nothing', () => {
    expect(normaliseFilerName('ltd')).not.toBe('');
    expect(normaliseFilerName('pty ltd')).not.toBe('');
  });
  it('handles empty and punctuation-only input', () => {
    expect(normaliseFilerName('')).toBe('');
    expect(normaliseFilerName('   ')).toBe('');
    expect(normaliseFilerName('...')).toBe('');
  });
  it('collapses whitespace and strips punctuation', () => {
    expect(normaliseFilerName('  ACME   Widgets, Inc.  ')).toBe('acme widgets');
  });
  it('filerKey agrees with normaliseFilerName', () => {
    expect(filerKey('Acme Widgets Pty Ltd')).toBe(normaliseFilerName('Acme Widgets Pty Ltd'));
  });
});

describe('titleCaseName', () => {
  it('title-cases a lowercase registered name', () => {
    expect(titleCaseName('apple inc')).toBe('Apple Inc');
  });
  it('uses house style for legal forms rather than shouting them', () => {
    expect(titleCaseName('aristocrat technologies pty ltd')).toBe('Aristocrat Technologies Pty Ltd');
    expect(titleCaseName('siemens gmbh')).toBe('Siemens GmbH');
  });
  it('keeps genuine acronyms upper case', () => {
    expect(titleCaseName('csiro')).toBe('CSIRO');
    expect(titleCaseName('lg electronics co ltd')).toBe('LG Electronics Co Ltd');
  });
  it('leaves interior joining words lower case', () => {
    expect(titleCaseName('the university of sydney')).toBe('The University of Sydney');
  });
  it('handles empty input', () => {
    expect(titleCaseName('')).toBe('');
  });
});

describe('parseWipoField', () => {
  it('parses a WIPO-35 field slug', () => {
    expect(parseWipoField('16_pharmaceuticals')).toEqual({ rank: 16, key: '16_pharmaceuticals', label: 'Pharmaceuticals' });
  });
  it('parses the unknown bucket', () => {
    expect(parseWipoField('99_unknown')?.rank).toBe(99);
  });
  it('refuses a bare Nice class number, which is the trade mark vocabulary', () => {
    // classification_area means different things per right type; reading a
    // trade mark's "9" as a patent field would invent a category.
    expect(parseWipoField('9')).toBeNull();
    expect(parseWipoField('35')).toBeNull();
  });
  it('returns null for junk', () => {
    expect(parseWipoField('')).toBeNull();
    expect(parseWipoField('pharmaceuticals')).toBeNull();
  });
  it('prettifies multi-word slugs', () => {
    expect(prettyFieldLabel('civil_engineering')).toBe('Civil engineering');
    expect(prettyFieldLabel('it_methods_for_management')).toBe('IT methods for management');
  });
});

describe('parseNiceClass', () => {
  it('parses the 45 valid classes', () => {
    expect(parseNiceClass('1')).toBe(1);
    expect(parseNiceClass('45')).toBe(45);
  });
  it('rejects out-of-range numbers', () => {
    expect(parseNiceClass('0')).toBeNull();
    expect(parseNiceClass('46')).toBeNull();
  });
  it('rejects a WIPO field slug, which is the patent vocabulary', () => {
    expect(parseNiceClass('16_pharmaceuticals')).toBeNull();
  });
  it('rejects junk', () => {
    expect(parseNiceClass('')).toBeNull();
    expect(parseNiceClass('abc')).toBeNull();
  });
  it('has a label for every class', () => {
    for (let c = 1; c <= 45; c++) expect(NICE_CLASSES[c]).toBeTruthy();
  });
  it('splits goods from services at class 35', () => {
    expect(NICE_KIND(34)).toBe('goods');
    expect(NICE_KIND(35)).toBe('services');
  });
});

describe('pct', () => {
  it('rounds to one decimal', () => {
    expect(pct(1, 3)).toBe(33.3);
  });
  it('returns 0 rather than dividing by zero', () => {
    expect(pct(5, 0)).toBe(0);
  });
  it('handles the full and empty cases', () => {
    expect(pct(7, 7)).toBe(100);
    expect(pct(0, 7)).toBe(0);
  });
});

describe('PCT lag guard', () => {
  it('stops share claims well before the extract date', () => {
    // The 30-month national-phase window means the most recent two years always
    // undercount foreign filings. The cutoff must sit at least two years back.
    expect(ORIGIN_SHARE_LAST_RELIABLE_YEAR).toBeLessThanOrEqual(new Date().getUTCFullYear() - 2);
    expect(ORIGIN_SHARE_LAST_RELIABLE_YEAR).toBeGreaterThan(2015);
  });
});
