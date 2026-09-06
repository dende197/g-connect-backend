const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Extract detectTrackUi and normalizeClassUi from ui.js to verify in Node runtime
const uiCode = fs.readFileSync(path.join(__dirname, '../ui.js'), 'utf8');

const matchTrack = uiCode.match(/function detectTrackUi\s*\([\s\S]*?\n\}/);
const matchNorm = uiCode.match(/function normalizeClassUi\s*\([\s\S]*?\n\}/);

if (!matchTrack || !matchNorm) throw new Error('Could not find functions in ui.js');

const { detectTrackUi, normalizeClassUi } = new Function(`
    ${matchTrack[0]}
    ${matchNorm[0]}
    return { detectTrackUi, normalizeClassUi };
`)();

describe('UI Class Normalization & Track Preservation (ui.js)', () => {

    test('Preserves already formatted class with track in parentheses', () => {
        assert.strictEqual(normalizeClassUi('4D (SA)'), '4D (SA)');
        assert.strictEqual(normalizeClassUi('5A (LS)'), '5A (LS)');
        assert.strictEqual(normalizeClassUi('3B (SU)'), '3B (SU)');
        assert.strictEqual(normalizeClassUi('1A (CL)'), '1A (CL)');
        assert.strictEqual(normalizeClassUi('2C (LL)'), '2C (LL)');
        assert.strictEqual(normalizeClassUi('4D (LA)'), '4D (LA)');
    });

    test('Detects track when passed as second argument', () => {
        assert.strictEqual(normalizeClassUi('4D', 'SA'), '4D (SA)');
        assert.strictEqual(normalizeClassUi('4d', 'Scienze Applicate'), '4D (SA)');
        assert.strictEqual(normalizeClassUi('5A', 'LS'), '5A (LS)');
        assert.strictEqual(normalizeClassUi('5A', 'Scientifico'), '5A (LS)');
        assert.strictEqual(normalizeClassUi('3B', 'Scienze Umane'), '3B (SU)');
        assert.strictEqual(normalizeClassUi('1A', 'Classico'), '1A (CL)');
    });

    test('Combines compact compound class and track (e.g. 4DSA, 4DLS, 3ACL, 1BSU)', () => {
        assert.strictEqual(normalizeClassUi('4DSA'), '4D (SA)');
        assert.strictEqual(normalizeClassUi('4dsa'), '4D (SA)');
        assert.strictEqual(normalizeClassUi('4DLS'), '4D (LS)');
        assert.strictEqual(normalizeClassUi('3ACL'), '3A (CL)');
        assert.strictEqual(normalizeClassUi('1BSU'), '1B (SU)');
        assert.strictEqual(normalizeClassUi('2ALL'), '2A (LL)');
    });

    test('Parses written words or spaces with track', () => {
        assert.strictEqual(normalizeClassUi('4 D SA'), '4D (SA)');
        assert.strictEqual(normalizeClassUi('4 D SCIENZE APPLICATE'), '4D (SA)');
        assert.strictEqual(normalizeClassUi('QUARTA D SA'), '4D (SA)');
        assert.strictEqual(normalizeClassUi('CLASSE 4 SEZ. D SCIENZE APPLICATE'), '4D (SA)');
    });

    test('Handles classes without track gracefully without adding parentheses', () => {
        assert.strictEqual(normalizeClassUi('4D'), '4D');
        assert.strictEqual(normalizeClassUi('3A'), '3A');
        assert.strictEqual(normalizeClassUi('1B'), '1B');
        assert.strictEqual(normalizeClassUi('5A'), '5A');
    });

    test('Rejects invalid non-class phrases and placeholders', () => {
        assert.strictEqual(normalizeClassUi('4 ORE'), null);
        assert.strictEqual(normalizeClassUi('2 ANNI'), null);
        assert.strictEqual(normalizeClassUi(''), null);
        assert.strictEqual(normalizeClassUi(null), null);
        assert.strictEqual(normalizeClassUi('...'), null);
        assert.strictEqual(normalizeClassUi('..'), null);
        assert.strictEqual(normalizeClassUi('N/D'), null);
        assert.strictEqual(normalizeClassUi('STUDENTE'), null);
        assert.strictEqual(normalizeClassUi('---'), null);
    });

    test('Storage keys for class representative and proposals are partitioned per class and track', () => {
        const getKeyRep = (cls) => 'gc_class_reps_' + (cls || 'DEFAULT').toUpperCase();
        const getKeyProp = (cls) => 'gc_class_proposals_' + (cls || 'DEFAULT').toUpperCase();

        const classA = '4D (SA)';
        const classB = '4D (LS)';
        const classC = '3B';
        const classD = '5A';

        assert.notStrictEqual(getKeyRep(classA), getKeyRep(classB));
        assert.notStrictEqual(getKeyRep(classA), getKeyRep(classC));
        assert.notStrictEqual(getKeyRep(classB), getKeyRep(classD));

        assert.strictEqual(getKeyRep(classA), 'gc_class_reps_4D (SA)');
        assert.strictEqual(getKeyProp(classA), 'gc_class_proposals_4D (SA)');
        assert.strictEqual(getKeyRep(classB), 'gc_class_reps_4D (LS)');
        assert.strictEqual(getKeyProp(classB), 'gc_class_proposals_4D (LS)');
        assert.strictEqual(getKeyRep(classC), 'gc_class_reps_3B');
        assert.strictEqual(getKeyProp(classC), 'gc_class_proposals_3B');
    });
});
