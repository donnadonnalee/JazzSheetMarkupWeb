/**
 * ABC Notation Converter
 * Ported from ABCConverter.java
 * Converts ABC notation into Lead Sheet Markup
 */

const ABCConverter = {
    /**
     * Determine if given text is likely in ABC Notation.
     */
    isABCNotation(text) {
        if (!text || text.trim() === '') return false;

        const lines = text.split('\n');
        for (let line of lines) {
            line = line.trim();
            if (line === '' || line.startsWith('%')) continue;

            // If app's own metadata is present, it's not ABC
            const lowerLine = line.toLowerCase();
            if (lowerLine.startsWith('title:') || lowerLine.startsWith('key:') ||
                lowerLine.startsWith('composer:') || lowerLine.startsWith('meter:')) {
                return false;
            }

            // ABC header line pattern
            if (/^[XTKMLVQR]:/.test(line)) {
                return true;
            }
        }
        return false;
    },

    /**
     * Convert ABC notation into Lead Sheet Markup.
     */
    convert(abc) {
        if (!abc || abc.trim() === '') return '';

        let title = "Converted Song";
        let key = "C";
        let composer = "";
        let meter = "";
        let tempo = "";
        let rhythm = "";
        let unit = 0.5; // L:1/8 default

        let currentVoice = null;
        let targetVoice = null;

        const lines = abc.split('\n');
        let body = '';

        for (let line of lines) {
            line = line.trim();
            if (line === '' || line.startsWith('%')) continue;

            // Handle voice definitions
            let voiceLine = null;
            if (line.startsWith('V:')) {
                voiceLine = line.substring(2).trim();
            } else if (line.startsWith('[V:') && line.includes(']')) {
                const end = line.indexOf(']');
                voiceLine = line.substring(3, end).trim();
                const rest = line.substring(end + 1).trim();
                line = rest; // Process rest of line as music content
            }

            if (voiceLine !== null) {
                const voiceName = voiceLine.split(/[\s\],]/)[0];
                if (targetVoice === null) targetVoice = voiceName;
                currentVoice = voiceName;
                if (line.startsWith('V:')) continue; // Just voice definition line
            }

            // Header fields
            if (/^[A-Z]:/.test(line)) {
                const header = line.charAt(0);
                const val = line.substring(2).trim();
                switch (header) {
                    case 'T': title = val; break;
                    case 'K': key = val; break;
                    case 'C': composer = val; break;
                    case 'M': meter = val; break;
                    case 'Q': tempo = val; break;
                    case 'R': rhythm = val; break;
                    case 'L':
                        if (val.includes('/')) {
                            const parts = val.split('/');
                            try {
                                unit = parseFloat(parts[0]) / parseFloat(parts[1]) * 4.0;
                            } catch (e) { unit = 0.5; }
                        }
                        break;
                }
                continue;
            }

            // Music content
            if (currentVoice === null || currentVoice === targetVoice) {
                body += line + ' ';
            }
        }

        let sb = '';
        sb += 'title: ' + title + '\n';
        sb += 'key: ' + key + '\n';
        if (composer) sb += 'composer: ' + composer + '\n';
        if (meter) sb += 'meter: ' + meter + '\n';
        if (tempo) sb += 'tempo: ' + tempo + '\n';
        if (rhythm) sb += 'rhythm: ' + rhythm + '\n';
        sb += '\n';

        // Parse body into measures
        const content = this.preprocessVolta(body);
        // Segment into bar lines / repeats and music content
        const segPattern = /[:|]+|[^:|]+/g;
        let match;
        let currentM = '';
        const segments = [];
        while ((match = segPattern.exec(content)) !== null) {
            segments.push(match[0]);
        }

        for (const part of segments) {
            const trimmed = part.trim();
            if (trimmed === '') continue;

            // Bar line or repeat markers
            if (/^[:|\[\]]+$/.test(trimmed)) {
                const mStr = currentM.trim();
                const processed = mStr === '' ? '' : this.processMeasure(mStr, unit);

                if (trimmed === '|') {
                    if (processed !== '') {
                        sb += processed + '\n';
                    } else if (sb.length > 0 && sb.charAt(sb.length - 1) !== '\n') {
                        sb += '\n';
                    }
                } else if (trimmed === '||' || trimmed === '|]') {
                    sb += processed + ' |\n';
                } else if (trimmed === ':|' || trimmed === '::' || trimmed === ':|:') {
                    sb += processed + ' :|\n';
                    if (trimmed === '::' || trimmed === ':|:') sb += '|: ';
                } else if (trimmed === '|:') {
                    if (processed !== '') sb += processed + '\n';
                    sb += '|: ';
                } else if (trimmed.startsWith('[') && trimmed.length > 1) {
                    if (processed !== '') sb += processed + ' ';
                    const marker = trimmed.replace(/[\[\]]/g, '').trim();
                    if (/^\d+$/.test(marker)) sb += '(' + marker + ') ';
                    else sb += '[' + marker + '] ';
                } else {
                    if (processed !== '') sb += processed + ' ';
                }
                currentM = '';
            } else {
                currentM += part;
            }
        }

        // Final trailing measure if any
        if (currentM.trim() !== '') {
            const finalM = this.processMeasure(currentM.trim(), unit);
            if (finalM !== '') sb += finalM + '\n';
        }

        return sb.trim();
    },

    processMeasure(m, unit) {
        let res = '';
        // 1: Chords ("G7"), 2: Tuplet ((3), 3: Potential ABC Chord or Marker ([...]), 4: Solo Note ([_^=]?[a-gA-G][,']*), 5: Solo Duration, 6: Rest
        const p = /("[^"]*")|(\(\d+)|\[([^\]]+)\]([0-9./]*)|([_^\=]?[a-gA-G][,']*)([0-9./]*)|(z|x)([0-9./]*)/g;
        let match;

        let tupletNotesLeft = 0;
        let tupletMultiplier = 1.0;

        while ((match = p.exec(m)) !== null) {
            if (match[1] !== undefined) {
                res += this.normalizeChordSymbol(match[1]) + ' ';
            } else if (match[2] !== undefined) {
                // Tuplet
                try {
                    const n = parseInt(match[2].substring(1));
                    tupletNotesLeft = n;
                    if (n === 3) tupletMultiplier = 2.0 / 3.0;
                    else if (n === 2) tupletMultiplier = 3.0 / 2.0;
                    else if (n === 4) tupletMultiplier = 3.0 / 4.0;
                    else tupletMultiplier = 1.0;
                } catch (e) { tupletNotesLeft = 0; }
            } else if (match[3] !== undefined) {
                const inner = match[3];
                const durStr = match[4];
                // Check if marker [A] or [1]
                if (inner.length <= 2 && /^[A-Z1-9]$/.test(inner)) {
                    if (/^\d$/.test(inner)) res += '(' + inner + ') ';
                    else res += '[' + inner + '] ';
                } else {
                    // ABC Chord [dfb] -> Pick last note
                    const noteP = /([_^\=]?[a-gA-G][,']*)/g;
                    let noteM;
                    let lastNote = null;
                    while ((noteM = noteP.exec(inner)) !== null) {
                        lastNote = noteM[1];
                    }
                    if (lastNote !== null) {
                        let d = this.parseDuration(durStr) * unit;
                        if (tupletNotesLeft > 0) { d *= tupletMultiplier; tupletNotesLeft--; }
                        res += lastNote + MusicUtils.trimDuration(d) + ' ';
                    }
                }
            } else if (match[5] !== undefined) {
                const note = match[5];
                let d = this.parseDuration(match[6]) * unit;
                if (tupletNotesLeft > 0) { d *= tupletMultiplier; tupletNotesLeft--; }
                res += note + MusicUtils.trimDuration(d) + ' ';
            } else if (match[7] !== undefined) {
                let d = this.parseDuration(match[8]) * unit;
                if (tupletNotesLeft > 0) { d *= tupletMultiplier; tupletNotesLeft--; }
                res += 'r' + MusicUtils.trimDuration(d) + ' ';
            }
        }
        return res.trim();
    },

    parseDuration(dur) {
        if (!dur || dur === '') return 1.0;
        try {
            if (dur.startsWith('/')) {
                if (dur.length === 1) return 0.5;
                return 1.0 / parseFloat(dur.substring(1));
            }
            if (dur.includes('/')) {
                const parts = dur.split('/');
                if (parts[1] === '') return parseFloat(parts[0]) / 2.0;
                return parseFloat(parts[0]) / parseFloat(parts[1]);
            }
            return parseFloat(dur);
        } catch (e) {
            return 1.0;
        }
    },

    preprocessVolta(content) {
        if (!content) return '';
        content = content.replace(/:\| *\[?1\.? *\]?/g, ' :| [1] ');
        content = content.replace(/:\| *\[?2\.? *\]?/g, ' :| [2] ');
        content = content.replace(/(?<!:)\| *\[?1\.? *\]?/g, ' | [1] ');
        content = content.replace(/(?<!:)\| *\[?2\.? *\]?/g, ' | [2] ');
        content = content.replace(/\[1\]/g, ' [1] ');
        content = content.replace(/\[2\]/g, ' [2] ');
        return content;
    },

    normalizeChordSymbol(chord) {
        if (!chord) return chord;
        return chord.replace(/([A-G])_/g, '$1b')
                    .replace(/([A-G])\^/g, '$1#')
                    .replace(/([A-G])=/g, '$1')
                    .replace(/\/([A-G])_/g, '/$1b')
                    .replace(/\/([A-G])\^/g, '/$1#')
                    .replace(/\/([A-G])=/g, '/$1');
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ABCConverter;
}
