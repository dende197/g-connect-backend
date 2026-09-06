const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {
    parseDateValue,
    getSchoolYearFromDate,
    getCurrentSchoolYearKey,
    getAvailableSchoolYears,
    getVotesForSchoolYear,
    getPreviousYearTermComparison
} = require('../lib/helpers');

// Load ui.js in sandbox to verify client-side calculations and empty-state handling
const uiCode = fs.readFileSync(path.join(__dirname, '../ui.js'), 'utf8');

function extractFunctionCode(source, funcName) {
    const regex = new RegExp(`function\\s+${funcName}\\s*\\(`);
    const m = source.match(regex);
    if (!m) return '';
    const startIdx = m.index;
    let paramParen = 0;
    let bodyStart = -1;
    for (let i = startIdx; i < source.length; i++) {
        if (source[i] === '(') {
            paramParen++;
        } else if (source[i] === ')') {
            paramParen--;
            if (paramParen === 0) {
                bodyStart = source.indexOf('{', i);
                break;
            }
        }
    }
    if (bodyStart === -1) return '';
    let braceCount = 0;
    for (let i = bodyStart; i < source.length; i++) {
        if (source[i] === '{') braceCount++;
        else if (source[i] === '}') {
            braceCount--;
            if (braceCount === 0) {
                return source.slice(startIdx, i + 1);
            }
        }
    }
    return '';
}

const uiSandbox = new Function(`
    let state = { voti: [] };
    function getVotiData() { return state.voti || []; }
    function parseArgoDate(raw) {
        if (!raw) return new Date(0);
        if (raw instanceof Date) return raw;
        const s = String(raw).trim();
        const iso = s.match(/^(\\d{4})-(\\d{2})-(\\d{2})/);
        if (iso) return new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10), 12, 0, 0);
        const ita = s.match(/^(\\d{1,2})[\\/\\.-](\\d{1,2})[\\/\\.-](\\d{4})/);
        if (ita) return new Date(parseInt(ita[3], 10), parseInt(ita[2], 10) - 1, parseInt(ita[1], 10), 12, 0, 0);
        const d = new Date(s);
        return isNaN(d.getTime()) ? new Date(0) : d;
    }
    ${extractFunctionCode(uiCode, 'normalizeSubjectName')}
    ${extractFunctionCode(uiCode, 'isArtDrawingSubjectNormalized')}
    ${extractFunctionCode(uiCode, 'getSubjectCanonicalName')}
    ${extractFunctionCode(uiCode, 'getSubjectGroupKey')}
    ${extractFunctionCode(uiCode, 'areSubjectsEquivalent')}
    ${extractFunctionCode(uiCode, 'formatSubjectTitle')}
    ${extractFunctionCode(uiCode, 'isGiustifica')}
    ${extractFunctionCode(uiCode, 'getNumericGradeValue')}
    ${extractFunctionCode(uiCode, 'getVoteDate')}
    ${extractFunctionCode(uiCode, 'averageFromNumeric')}
    ${extractFunctionCode(uiCode, 'calcolaMedia')}
    ${extractFunctionCode(uiCode, 'getSchoolYearFromDate')}
    ${extractFunctionCode(uiCode, 'getCurrentSchoolYearKey')}
    ${extractFunctionCode(uiCode, 'getAvailableSchoolYears')}
    ${extractFunctionCode(uiCode, 'getVotesForSchoolYear')}
    ${extractFunctionCode(uiCode, 'getSchoolYearRanges')}
    ${extractFunctionCode(uiCode, 'getCurrentSchoolTerm')}
    ${extractFunctionCode(uiCode, 'getPreviousYearTermComparison')}
    ${extractFunctionCode(uiCode, 'getGradeMonthlyTrendSummary')}
    return {
        getSchoolYearFromDate,
        getCurrentSchoolYearKey,
        getAvailableSchoolYears,
        getVotesForSchoolYear,
        getGradeMonthlyTrendSummary,
        calcolaMedia,
        getPreviousYearTermComparison,
        areSubjectsEquivalent,
        normalizeSubjectName,
        getSubjectCanonicalName,
        getSubjectGroupKey,
        formatSubjectTitle
    };
`)();


test('Italian School Year (A.S.) Recognition & Boundary Tests', async (t) => {
    await t.test('September 1st belongs to the new school year', () => {
        const sy1 = getSchoolYearFromDate('2026-09-01');
        assert.strictEqual(sy1.key, '2026/27');
        assert.strictEqual(sy1.startYear, 2026);
        assert.strictEqual(sy1.endYear, 2027);
        assert.strictEqual(sy1.label, 'A.S. 2026/27');

        const sy2 = getSchoolYearFromDate('2025-09-01');
        assert.strictEqual(sy2.key, '2025/26');
    });

    await t.test('August 31st belongs to the previous school year', () => {
        const sy1 = getSchoolYearFromDate('2026-08-31');
        assert.strictEqual(sy1.key, '2025/26');
        assert.strictEqual(sy1.startYear, 2025);
        assert.strictEqual(sy1.endYear, 2026);
        assert.strictEqual(sy1.label, 'A.S. 2025/26');
    });

    await t.test('Mid-year dates (Nov, Jan, May, June) resolve accurately', () => {
        assert.strictEqual(getSchoolYearFromDate('2025-11-15').key, '2025/26');
        assert.strictEqual(getSchoolYearFromDate('2026-01-10').key, '2025/26');
        assert.strictEqual(getSchoolYearFromDate('2026-05-28').key, '2025/26');
        assert.strictEqual(getSchoolYearFromDate('2026-06-05').key, '2025/26');
        assert.strictEqual(getSchoolYearFromDate('2026-10-20').key, '2026/27');
        assert.strictEqual(getSchoolYearFromDate('2027-02-14').key, '2026/27');
    });

    await t.test('Supports Italian DD/MM/YYYY dates and Date instances', () => {
        assert.strictEqual(getSchoolYearFromDate('05/09/2026').key, '2026/27');
        assert.strictEqual(getSchoolYearFromDate('15/05/2026').key, '2025/26');
        assert.strictEqual(getSchoolYearFromDate(new Date(2026, 8, 5)).key, '2026/27');
    });

    await t.test('Returns null on invalid or missing dates without throwing', () => {
        assert.strictEqual(getSchoolYearFromDate(null), null);
        assert.strictEqual(getSchoolYearFromDate(''), null);
        assert.strictEqual(getSchoolYearFromDate('invalid-date'), null);
    });
});

test('School Year Votes Partitioning & Available Years', async (t) => {
    const mockVotes = [
        { materia: 'Matematica', valore: '8', data: '2025-11-10' }, // 2025/26
        { materia: 'Italiano', valore: '7', data: '2026-01-20' },   // 2025/26
        { materia: 'Storia', valore: '9', data: '2026-05-15' },     // 2025/26
        { materia: 'Fisica', valore: '6.5', data: '2026-06-01' },   // 2025/26
        { materia: 'Inglese', valore: '8.5', data: '2026-09-15' }   // 2026/27
    ];

    await t.test('getAvailableSchoolYears returns sorted unique school years including current year', () => {
        const refDate = new Date('2026-09-05');
        const years = getAvailableSchoolYears(mockVotes, refDate);
        assert.deepStrictEqual(years, ['2026/27', '2025/26']);
    });

    await t.test('getAvailableSchoolYears always includes current school year even if 0 votes exist', () => {
        const refDate = new Date('2026-09-05');
        const emptyVotes = [];
        const years = getAvailableSchoolYears(emptyVotes, refDate);
        assert.deepStrictEqual(years, ['2026/27']);
    });

    await t.test('getVotesForSchoolYear filters correctly by school year key', () => {
        const votes2526 = getVotesForSchoolYear('2025/26', mockVotes);
        assert.strictEqual(votes2526.length, 4);
        assert.ok(votes2526.every(v => v.data < '2026-09-01'));

        const votes2627 = getVotesForSchoolYear('2026/27', mockVotes);
        assert.strictEqual(votes2627.length, 1);
        assert.strictEqual(votes2627[0].materia, 'Inglese');
    });

    await t.test('New school year with 0 votes returns empty array', () => {
        const pastOnlyVotes = [
            { materia: 'Matematica', valore: '8', data: '2025-11-10' },
            { materia: 'Italiano', valore: '7', data: '2026-05-15' }
        ];
        const currentYearVotes = getVotesForSchoolYear('2026/27', pastOnlyVotes);
        assert.strictEqual(currentYearVotes.length, 0);
    });
});

test('UI Grades Calculations & Zero-State Integrity (ui.js)', async (t) => {
    await t.test('getGradeMonthlyTrendSummary returns media null and empty diff when votes are empty (no fake 7.85)', () => {
        const summary = uiSandbox.getGradeMonthlyTrendSummary([]);
        assert.strictEqual(summary.media, null);
        assert.strictEqual(summary.diffStr, '');
        assert.strictEqual(summary.monthList.length, 0);
        assert.strictEqual(summary.hasComparison, false);
    });

    await t.test('calcolaMedia returns null when given empty array or no valid numeric grades', () => {
        assert.strictEqual(uiSandbox.calcolaMedia([]), null);
        assert.strictEqual(uiSandbox.calcolaMedia([{ valore: '—' }, { valore: 'giustificato' }]), null);
    });

    await t.test('ui.js school year helpers match expected current year 2026/27 in September 2026', () => {
        const refDate = new Date(2026, 8, 5); // 5 Sep 2026
        assert.strictEqual(uiSandbox.getCurrentSchoolYearKey(refDate), '2026/27');

        const pastVotes = [
            { materia: 'Latino', valore: '8', data: '2026-04-12' },
            { materia: 'Filosofia', valore: '9', data: '2026-05-10' }
        ];
        const avail = uiSandbox.getAvailableSchoolYears(pastVotes, refDate);
        assert.deepStrictEqual(avail, ['2026/27', '2025/26']);

        const currVotes = uiSandbox.getVotesForSchoolYear('2026/27', pastVotes);
        assert.strictEqual(currVotes.length, 0);

        const summary = uiSandbox.getGradeMonthlyTrendSummary(currVotes);
        assert.strictEqual(summary.media, null);
    });
});

test('Previous School Year Term Comparison (A.S. 2025/26 Benchmark)', async (t) => {
    const historicalVotes = [
        // Matematica - 1° Quadrimestre A.S. 2025/26 (Sep 1, 2025 – Jan 31, 2026)
        { materia: 'Matematica', valore: '8', data: '2025-10-15' },
        { materia: 'Matematica', valore: '7', data: '2025-11-20' },
        { materia: 'Matematica', valore: '7.5', data: '2026-01-14' },

        // Matematica - 2° Quadrimestre A.S. 2025/26 (Feb 1, 2026 – Aug 31, 2026)
        { materia: 'Matematica', valore: '9', data: '2026-03-12' },
        { materia: 'Matematica', valore: '10', data: '2026-05-18' },

        // Italiano - 1° Quadrimestre A.S. 2025/26
        { materia: 'Italiano', valore: '6.5', data: '2025-11-05' },
        { materia: 'Italiano', valore: '7.5', data: '2026-01-22' },

        // Disegno e Storia dell'Arte - 1° Quadrimestre A.S. 2025/26
        { materia: 'Disegno e storia dell\'arte', valore: '8.5', data: '2025-12-10' },

        // Nuovi voti A.S. 2026/27
        { materia: 'Matematica', valore: '8.5', data: '2026-09-20' }
    ];

    await t.test('Date 25 October 2026 resolves to 1° Quadrimestre and compares with 1°Q 2025/26', () => {
        const refDate = new Date(2026, 9, 25); // 25 Ottobre 2026
        const res = getPreviousYearTermComparison({
            subject: 'Matematica',
            refDate,
            allVotes: historicalVotes
        });

        assert.strictEqual(res.currentYearKey, '2026/27');
        assert.strictEqual(res.prevYearKey, '2025/26');
        assert.strictEqual(res.term, 'first');
        assert.strictEqual(res.termLabel, '1° Quadrimestre');
        assert.strictEqual(res.termShort, '1°Q');
        assert.strictEqual(res.prevTermVotesCount, 3);
        // (8 + 7 + 7.5) / 3 = 7.50
        assert.strictEqual(res.prevTermMedia, 7.5);
        // Full year: (8 + 7 + 7.5 + 9 + 10) / 5 = 8.30
        assert.strictEqual(res.prevYearVotesCount, 5);
        assert.strictEqual(res.prevYearFullMedia, 8.3);
    });

    await t.test('Date 6 April 2027 resolves to 2° Quadrimestre and compares with 2°Q 2025/26', () => {
        const refDate = new Date(2027, 3, 6); // 6 Aprile 2027
        const res = getPreviousYearTermComparison({
            subject: 'Matematica',
            refDate,
            allVotes: historicalVotes
        });

        assert.strictEqual(res.currentYearKey, '2026/27');
        assert.strictEqual(res.prevYearKey, '2025/26');
        assert.strictEqual(res.term, 'second');
        assert.strictEqual(res.termLabel, '2° Quadrimestre');
        assert.strictEqual(res.termShort, '2°Q');
        assert.strictEqual(res.prevTermVotesCount, 2);
        // (9 + 10) / 2 = 9.50
        assert.strictEqual(res.prevTermMedia, 9.5);
    });

    await t.test('General average comparison (subject=null) aggregates all subjects for that term', () => {
        const refDate = new Date(2026, 9, 25); // 25 Ottobre 2026 (1Q)
        const res = getPreviousYearTermComparison({
            subject: null,
            refDate,
            allVotes: historicalVotes
        });

        assert.strictEqual(res.term, 'first');
        assert.strictEqual(res.prevYearKey, '2025/26');
        // All 1Q 25/26 votes:
        // Matematica: 8, 7, 7.5
        // Italiano: 6.5, 7.5
        // Disegno: 8.5
        // Total = 6 votes, Sum = 45 -> Media = 7.50
        assert.strictEqual(res.prevTermVotesCount, 6);
        assert.strictEqual(res.prevTermMedia, 7.5);
    });

    await t.test('Subject with no votes in 2025/26 returns null media gracefully', () => {
        const refDate = new Date(2026, 9, 25);
        const res = getPreviousYearTermComparison({
            subject: 'Fisica Quantistica',
            refDate,
            allVotes: historicalVotes
        });

        assert.strictEqual(res.prevTermVotesCount, 0);
        assert.strictEqual(res.prevTermMedia, null);
        assert.strictEqual(res.prevYearFullMedia, null);
    });

    await t.test('uiSandbox matches subject aliases and Italian grades in term comparison', () => {
        const refDate = new Date(2026, 9, 25);
        const res = uiSandbox.getPreviousYearTermComparison({
            subject: 'Storia dell\'Arte',
            refDate,
            allVotes: historicalVotes
        });

        assert.strictEqual(res.prevTermVotesCount, 1);
        assert.strictEqual(res.prevTermMedia, 8.5);
    });
});

test('Grades Carousel Subjects & Equivalence Mapping', async (t) => {
    const expectedCanonical = [
        'Italiano',
        'Storia Triennio',
        "Disegno e Storia Dell'arte Triennio",
        'Filosofia',
        'Educazione Civica',
        'Inglese',
        'Informatica',
        'Scienze Naturali',
        'Fisica',
        'Matematica',
        'Scienze Motorie e Sportive'
    ];

    await t.test('All 11 canonical subjects are recognized and formatted exactly as requested', () => {
        expectedCanonical.forEach(name => {
            const canonical = uiSandbox.getSubjectCanonicalName(name);
            assert.strictEqual(canonical, name, `Subject ${name} should resolve canonically`);
            const formatted = uiSandbox.formatSubjectTitle(name);
            assert.strictEqual(formatted, name, `Subject ${name} should format accurately`);
        });
    });

    await t.test('Scraped DidUP aliases map to accurate canonical names', () => {
        assert.strictEqual(uiSandbox.getSubjectCanonicalName('LINGUA E LETTERATURA ITALIANA'), 'Italiano');
        assert.strictEqual(uiSandbox.getSubjectCanonicalName('STORIA'), 'Storia Triennio');
        assert.strictEqual(uiSandbox.getSubjectCanonicalName('DISEGNO E STORIA DELL\'ARTE'), "Disegno e Storia Dell'arte Triennio");
        assert.strictEqual(uiSandbox.getSubjectCanonicalName('FILOSOFIA'), 'Filosofia');
        assert.strictEqual(uiSandbox.getSubjectCanonicalName('ED. CIVICA'), 'Educazione Civica');
        assert.strictEqual(uiSandbox.getSubjectCanonicalName('LINGUA E CULTURA INGLESE'), 'Inglese');
        assert.strictEqual(uiSandbox.getSubjectCanonicalName('LINGUA STRANIERA'), 'Inglese');
        assert.strictEqual(uiSandbox.getSubjectCanonicalName('INFORMATICA'), 'Informatica');
        assert.strictEqual(uiSandbox.getSubjectCanonicalName('SCIENZE NATURALI'), 'Scienze Naturali');
        assert.strictEqual(uiSandbox.getSubjectCanonicalName('SCIENZE'), 'Scienze Naturali');
        assert.strictEqual(uiSandbox.getSubjectCanonicalName('FISICA'), 'Fisica');
        assert.strictEqual(uiSandbox.getSubjectCanonicalName('MATEMATICA'), 'Matematica');
        assert.strictEqual(uiSandbox.getSubjectCanonicalName('SCIENZE MOTORIE'), 'Scienze Motorie e Sportive');
        assert.strictEqual(uiSandbox.getSubjectCanonicalName('EDUCAZIONE FISICA'), 'Scienze Motorie e Sportive');
    });

    await t.test('areSubjectsEquivalent matches scraped variants with canonical widget names', () => {
        assert.strictEqual(uiSandbox.areSubjectsEquivalent('Italiano', 'LINGUA E LETTERATURA ITALIANA'), true);
        assert.strictEqual(uiSandbox.areSubjectsEquivalent('Storia Triennio', 'STORIA'), true);
        assert.strictEqual(uiSandbox.areSubjectsEquivalent("Disegno e Storia Dell'arte Triennio", 'DISEGNO E STORIA DELL\'ARTE'), true);
        assert.strictEqual(uiSandbox.areSubjectsEquivalent('Inglese', 'LINGUA E CULTURA INGLESE'), true);
        assert.strictEqual(uiSandbox.areSubjectsEquivalent('Scienze Motorie e Sportive', 'SCIENZE MOTORIE'), true);
        assert.strictEqual(uiSandbox.areSubjectsEquivalent('Scienze Naturali', 'SCIENZE'), true);
        assert.strictEqual(uiSandbox.areSubjectsEquivalent('Fisica', 'FISICA'), true);
        // Ensure distinct subjects do not collide
        assert.strictEqual(uiSandbox.areSubjectsEquivalent('Fisica', 'SCIENZE MOTORIE'), false);
        assert.strictEqual(uiSandbox.areSubjectsEquivalent('Scienze Naturali', 'SCIENZE MOTORIE'), false);
        assert.strictEqual(uiSandbox.areSubjectsEquivalent('Storia Triennio', "Disegno e Storia Dell'arte Triennio"), false);
    });
});


