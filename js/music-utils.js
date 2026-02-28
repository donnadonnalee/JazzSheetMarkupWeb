/**
 * Music utility functions
 * Ported from MusicUtils.java
 */

const MusicUtils = {
    // Pitch to semitone mapping (relative to middle C)
    PITCH_TO_SEMITONE: {
        'llc': -24, 'llc+': -23, 'llc-': -25,
        'lld': -22, 'lld+': -21, 'lld-': -23,
        'lle': -20, 'lle+': -19, 'lle-': -21,
        'llf': -19, 'llf+': -18, 'llf-': -20,
        'llg': -17, 'llg+': -16, 'llg-': -18,
        'lla': -15, 'lla+': -14, 'lla-': -16,
        'llb': -13, 'llb+': -12, 'llb-': -14,
        'lc': -12, 'lc+': -11, 'lc-': -13,
        'ld': -10, 'ld+': -9, 'ld-': -11,
        'le': -8, 'le+': -7, 'le-': -9,
        'lf': -7, 'lf+': -6, 'lf-': -8,
        'lg': -5, 'lg+': -4, 'lg-': -6,
        'la': -3, 'la+': -2, 'la-': -4,
        'lb': -1, 'lb+': 0, 'lb-': -2,
        'c': 0, 'c+': 1, 'c-': -1,
        'd': 2, 'd+': 3, 'd-': 1,
        'e': 4, 'e+': 5, 'e-': 3,
        'f': 5, 'f+': 6, 'f-': 4,
        'g': 7, 'g+': 8, 'g-': 6,
        'a': 9, 'a+': 10, 'a-': 8,
        'b': 11, 'b+': 12, 'b-': 10,
        'hc': 12, 'hc+': 13, 'hc-': 11,
        'hd': 14, 'hd+': 15, 'hd-': 13,
        'he': 16, 'he+': 17, 'he-': 15,
        'hf': 17, 'hf+': 18, 'hf-': 16,
        'hg': 19, 'hg+': 20, 'hg-': 18,
        'ha': 21, 'ha+': 22, 'ha-': 20,
        'hb': 23, 'hb+': 24, 'hb-': 22,
        'hhc': 24, 'hhc+': 25, 'hhc-': 23,
        'hhd': 26, 'hhd+': 27, 'hhd-': 25,
        'hhe': 28, 'hhe+': 29, 'hhe-': 27,
        'hhf': 29, 'hhf+': 30, 'hhf-': 28,
        'hhg': 31, 'hhg+': 32, 'hhg-': 30,
        'hha': 33, 'hha+': 34, 'hha-': 32,
        'hhb': 35, 'hhb+': 36, 'hhb-': 34
    },

    SEMITONE_TO_PITCH: ['c', 'd-', 'd', 'e-', 'e', 'f', 'g-', 'g', 'a-', 'a', 'b-', 'b'],

    // Root note to semitone mapping
    ROOT_TO_SEMITONE: {
        'C': 0, 'C#': 1, 'Db': 1,
        'D': 2, 'D#': 3, 'Eb': 3,
        'E': 4, 'F': 5, 'F#': 6,
        'Gb': 6, 'G': 7, 'G#': 8,
        'Ab': 8, 'A': 9, 'A#': 10,
        'Bb': 10, 'B': 11
    },

    SEMITONE_TO_ROOT: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],

    /**
     * Transpose a chord by semitone shift
     */
    transposeChord(chord, semitoneShift) {
        if (chord.includes('/')) {
            const parts = chord.split('/');
            return this.transposeChord(parts[0], semitoneShift) + '/' + this.transposeChord(parts[1], semitoneShift);
        }

        const match = chord.match(/^([A-G](?:#|b)?)(.*)$/);
        if (!match) return chord;

        const root = match[1];
        const suffix = match[2];
        const semitone = this.ROOT_TO_SEMITONE[root];

        if (semitone === undefined) return chord;

        const newIndex = (semitone + semitoneShift + 12) % 12;
        return this.SEMITONE_TO_ROOT[newIndex] + suffix;
    },

    /**
     * Transpose a pitch notation (e.g., 'c1', 'hd0.5')
     */
    transposePitch(pitch, semitoneShift) {
        if (pitch === 'r') return 'r';
        if (semitoneShift === 0) return pitch;

        // Separate pitch core from duration
        let i = pitch.length - 1;
        while (i >= 0 && '0123456789./'.includes(pitch[i])) i--;

        const core = pitch.substring(0, i + 1);
        const duration = pitch.substring(i + 1);

        const semi = this.PITCH_TO_SEMITONE[core];
        if (semi === undefined) return pitch;

        const newSemi = semi + semitoneShift;
        const pc = ((newSemi % 12) + 12) % 12;

        let prefix = '';
        if (newSemi < -12) prefix = 'll';
        else if (newSemi < 0) prefix = 'l';
        else if (newSemi < 12) prefix = '';
        else if (newSemi < 24) prefix = 'h';
        else prefix = 'hh';

        return prefix + this.SEMITONE_TO_PITCH[pc] + duration;
    },

    /**
     * Transpose entire markup text
     */
    transposeMarkup(markup, semitoneShift) {
        const lines = markup.split('\n');
        const result = [];

        for (let line of lines) {
            if (line.startsWith('title:')) {
                result.push(line);
                continue;
            }

            if (line.startsWith('key:')) {
                const keyName = line.substring(4).trim();
                result.push('key: ' + this.transposeKeyName(keyName, semitoneShift));
                continue;
            }

            // Transpose chords and notes in the line
            let processed = this.transposeChordsInLine(line, semitoneShift);
            processed = this.transposePitchesInLine(processed, semitoneShift);
            result.push(processed);
        }

        return result.join('\n');
    },

    transposeKeyName(key, semitoneShift) {
        const isMinor = key.endsWith('m');
        const root = isMinor ? key.slice(0, -1) : key;
        const base = this.ROOT_TO_SEMITONE[root];
        if (base === undefined) return key;

        const newIndex = (base + semitoneShift + 12) % 12;
        return this.SEMITONE_TO_ROOT[newIndex] + (isMinor ? 'm' : '');
    },

    transposePitchesInLine(line, semitoneShift) {
        let result = '';
        let inChord = false;
        let i = 0;

        while (i < line.length) {
            const ch = line[i];

            if (ch === '"') {
                inChord = !inChord;
                result += ch;
                i++;
                continue;
            }

            if (inChord) {
                result += ch;
                i++;
                continue;
            }

            // Check if this is a pitch start
            if (this.isPitchStart(line, i)) {
                const start = i;
                i = this.readPitchToken(line, i);
                const pitchToken = line.substring(start, i);
                result += this.transposePitch(pitchToken, semitoneShift);
                continue;
            }

            result += ch;
            i++;
        }

        return result;
    },

    transposeChordsInLine(line, semitoneShift) {
        return line.replace(/"([^"]+)"/g, (match, chord) => {
            return '"' + this.transposeChord(chord, semitoneShift) + '"';
        });
    },

    isPitchStart(s, i) {
        if (i >= s.length) return false;

        const prefixes = ['llc', 'lld', 'lle', 'llf', 'llg', 'lla', 'llb',
            'lc', 'ld', 'le', 'lf', 'lg', 'la', 'lb',
            'hc', 'hd', 'he', 'hf', 'hg', 'ha', 'hb',
            'hhc', 'hhd', 'hhe', 'hhf', 'hhg', 'hha', 'hhb'];

        for (const prefix of prefixes) {
            if (s.startsWith(prefix, i)) return true;
        }

        return 'cdefgabr'.includes(s[i]);
    },

    readPitchToken(s, i) {
        // Check for double prefix (ll, hh)
        if (i + 1 < s.length && s.substring(i, i + 2) === 'll' || s.substring(i, i + 2) === 'hh') {
            if (i + 2 < s.length && 'cdefgab'.includes(s[i + 2])) {
                i += 3;
            } else {
                i += 1;
            }
        }
        // Check for single prefix (l, h)
        else if ('lh'.includes(s[i]) && i + 1 < s.length && 'cdefgab'.includes(s[i + 1])) {
            i += 2;
        }
        // Check for rest or note
        else if ('cdefgabr'.includes(s[i])) {
            i += 1;
        }

        // Check for accidental
        if (i < s.length && (s[i] === '+' || s[i] === '-')) {
            i++;
        }

        // Read duration
        while (i < s.length && '0123456789./'.includes(s[i])) {
            i++;
        }

        return i;
    },

    /**
     * Parse duration string to number
     */
    parseDuration(s) {
        if (!s || s.trim() === '') return 1.0;

        try {
            if (s.includes('/')) {
                const parts = s.split('/');
                let val = parseFloat(parts[0]);
                for (let i = 1; i < parts.length; i++) {
                    const div = parseFloat(parts[i]);
                    if (div !== 0) {
                        val /= div;
                    }
                }
                return val;
            }
            return parseFloat(s);
        } catch (e) {
            return 1.0;
        }
    },

    /**
     * Format duration for display
     */
    trimDuration(d) {
        if (Math.abs(d - 0.5) < 0.0001) return '0.5';
        if (Math.abs(d - 1.0) < 0.0001) return '1';
        if (Math.abs(d - 2.0) < 0.0001) return '2';
        return d.toFixed(3);
    },

    /**
     * Get semitone shift from one key to another
     */
    getSemitoneShift(fromKey, toKey) {
        const from = this.ROOT_TO_SEMITONE[fromKey] || 0;
        const to = this.ROOT_TO_SEMITONE[toKey] || 0;
        return (to - from + 12) % 12;
    },

    /**
     * Get expected accidental for a note in a key signature
     * @param {string} step - Note step (c, d, e, f, g, a, b)
     * @param {number} sf - Sharps (>0) or Flats (<0) count
     * @returns {number} 1 (sharp), -1 (flat), or 0 (natural)
     */
    getAccidentalInKey(step, sf) {
        if (sf === 0) return 0;
        const stepLower = step.toLowerCase();
        if (sf > 0) { // Sharps
            const sharpOrder = ['f', 'c', 'g', 'd', 'a', 'e', 'b'];
            for (let i = 0; i < sf && i < 7; i++) {
                if (sharpOrder[i] === stepLower) return 1;
            }
        } else { // Flats
            const flatOrder = ['b', 'e', 'a', 'd', 'g', 'c', 'f'];
            for (let i = 0; i < Math.abs(sf) && i < 7; i++) {
                if (flatOrder[i] === stepLower) return -1;
            }
        }
        return 0;
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MusicUtils;
}
