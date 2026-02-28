/**
 * Lead Sheet Parser
 * Ported from LeadSheetParser.java
 * Parses custom markup notation into SheetMusic data structure
 */

const LeadSheetParser = {
    /**
     * Main parsing function
     * @param {string} input - Markup text
     * @returns {SheetMusic} - Parsed sheet music data
     */
    parse(input) {
        const sheet = new SheetMusic();
        const lines = input.split('\n');
        let nextMeasureIsNewLine = false;

        // This will hold markers (section labels, repeat starts, etc.) that 
        // haven't been attached to a measure with content yet.
        let pendingMarkers = {
            sectionLabel: null,
            repeatStart: false,
            voltaNumber: 0,
            isNewLine: false
        };

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            if (line === '') continue;

            const lowerLine = line.toLowerCase();

            // 1. Metadata
            if (lowerLine.startsWith('title:')) {
                sheet.title = line.substring(6).trim();
                continue;
            }
            if (lowerLine.startsWith('key:')) {
                sheet.key = line.substring(4).trim();
                continue;
            }

            const measure = new Measure();
            const originalLine = lines[i].trim();

            // Store source position (of the current line)
            measure.sourcePosition = new SourcePosition(i, 0, originalLine.length, originalLine);

            // Handle carried-over "new line" flag
            if (nextMeasureIsNewLine || pendingMarkers.isNewLine) {
                measure.isNewLine = true;
                nextMeasureIsNewLine = false;
                pendingMarkers.isNewLine = false;
            }

            // Handle "nl" in CURRENT line
            if (lowerLine.includes('nl')) {
                nextMeasureIsNewLine = true;
                line = line.replace(/nl/gi, '').trim();
            }

            // 2. Extract markers from the START of the line
            let searching = true;
            while (searching) {
                searching = false;

                // Section Label: [A]
                if (line.startsWith('[')) {
                    const end = line.indexOf(']');
                    if (end !== -1) {
                        measure.sectionLabel = line.substring(1, end);
                        line = line.substring(end + 1).trim();
                        searching = true;
                    }
                }

                // Repeat Start: |:
                if (line.startsWith('|:')) {
                    measure.repeatStart = true;
                    line = line.substring(2).trim();
                    searching = true;
                }

                // Ending Bracket: (1)
                if (line.startsWith('(')) {
                    const end = line.indexOf(')');
                    if (end !== -1) {
                        try {
                            measure.voltaNumber = parseInt(line.substring(1, end));
                            line = line.substring(end + 1).trim();
                            searching = true;
                        } catch (e) {
                            // Invalid number, ignore
                        }
                    }
                }
            }

            // 3. Markers at the END of the line
            if (line.endsWith(':|')) {
                measure.repeatEnd = true;
                line = line.substring(0, line.length - 2).trim();
            } else if (line.endsWith('|')) {
                measure.isDoubleBar = true;
                line = line.substring(0, line.length - 1).trim();
            } else if (line.endsWith(';')) {
                line = line.substring(0, line.length - 1).trim();
            }

            // Try to parse notes and chords
            this.parseMeasureContent(line, measure, i, originalLine);

            // If this line ONLY had markers and NO content (notes/chords/double bar), 
            // carry them over to the next loop iteration.
            // Note: repeatEnd and isDoubleBar usually signify a measure boundary, so we might keep those.
            const hasContent = measure.notes.length > 0 || measure.chords.length > 0 || measure.repeatEnd || measure.isDoubleBar;

            if (!hasContent) {
                // Buffer the markers found on this line
                if (measure.sectionLabel) pendingMarkers.sectionLabel = measure.sectionLabel;
                if (measure.repeatStart) pendingMarkers.repeatStart = true;
                if (measure.voltaNumber > 0) pendingMarkers.voltaNumber = measure.voltaNumber;
                if (measure.isNewLine) pendingMarkers.isNewLine = true;
                // Don't push yet, continue to next line
                continue;
            } else {
                // Merge pending markers into this measure
                if (pendingMarkers.sectionLabel && !measure.sectionLabel) measure.sectionLabel = pendingMarkers.sectionLabel;
                if (pendingMarkers.repeatStart) measure.repeatStart = true;
                if (pendingMarkers.voltaNumber > 0 && measure.voltaNumber === 0) measure.voltaNumber = pendingMarkers.voltaNumber;
                if (pendingMarkers.isNewLine) measure.isNewLine = true;

                // Clear pending markers
                pendingMarkers = { sectionLabel: null, repeatStart: false, voltaNumber: 0, isNewLine: false };

                sheet.measures.push(measure);
            }
        }

        // If something is still pending at the very end, we should probably add a rest measure or just drop it.
        // Usually, markers without content at the end of a file shouldn't happen or don't render much.

        return sheet;
    },

    /**
     * Parse measure content (notes and chords)
     */
    parseMeasureContent(content, measure, lineNumber, originalLine) {
        // Split by commas, but not inside quotes
        const segments = content.split(/,(?![^"]*"[^"]*")/);
        let currentPos = 0;

        for (let segment of segments) {
            segment = segment.trim();
            if (segment === '') continue;

            // Pattern: chord in quotes OR note with optional duration
            // Chord: "ChordName"
            // Note: [lh]{0,2}?[a-gr][+-]?\s*[0-9./]*
            const pattern = /"([^"]+)"|([lh]{0,2}?[a-gr][+-]?|r)\s*([0-9./]*)/g;
            let match;

            while ((match = pattern.exec(segment)) !== null) {
                if (match[1]) {
                    // Chord found
                    const chordName = match[1];
                    const chord = new ChordChange(chordName, currentPos);

                    // Calculate source position
                    const chordStart = originalLine.indexOf('"' + chordName + '"');
                    if (chordStart >= 0) {
                        chord.sourcePosition = new SourcePosition(
                            lineNumber,
                            chordStart,
                            chordStart + chordName.length + 2,
                            '"' + chordName + '"'
                        );
                    }
                    measure.chords.push(chord);
                } else if (match[2]) {
                    // Note found
                    const pitchStr = match[2];
                    const durationStr = match[3];
                    const dr = this.parseDuration(durationStr);
                    const note = this.createNote(pitchStr, dr.value, dr.tuplet);

                    // Calculate source position
                    const noteText = pitchStr + durationStr;
                    const noteStart = originalLine.indexOf(noteText);
                    if (noteStart >= 0) {
                        note.sourcePosition = new SourcePosition(
                            lineNumber,
                            noteStart,
                            noteStart + noteText.length,
                            noteText
                        );
                    }

                    measure.notes.push(note);
                    currentPos += dr.value;
                }
            }
        }

        measure.totalDuration = Math.max(currentPos, 1.0);
    },

    /**
     * Parse duration string
     * Returns {value: number, tuplet: number}
     */
    parseDuration(s) {
        if (!s || s.trim() === '') {
            return { value: 1.0, tuplet: 0 };
        }

        try {
            s = s.trim();
            if (s.includes('/')) {
                const parts = s.split('/');
                let val = parseFloat(parts[0]);
                let tuplet = 0;

                for (let i = 1; i < parts.length; i++) {
                    const div = parseFloat(parts[i]);
                    if (div !== 0) {
                        val /= div;
                        const idiv = Math.floor(div);
                        // Check if not a power of 2
                        if (idiv > 1 && (idiv & (idiv - 1)) !== 0) {
                            tuplet = idiv;
                        }
                    }
                }
                return { value: val, tuplet: tuplet };
            }
            return { value: parseFloat(s), tuplet: 0 };
        } catch (e) {
            return { value: 1.0, tuplet: 0 };
        }
    },

    /**
     * Create note from pitch string
     */
    createNote(pitchStr, duration, tuplet) {
        if (pitchStr === 'r') {
            const note = new Note('r', 0, duration, true);
            note.tupletNumber = tuplet;
            return note;
        }

        let pitch;
        let accidental = '';
        let octave = 4;
        let idx = 0;

        // Parse octave prefix
        if (pitchStr.startsWith('ll')) {
            octave = 2;
            idx = 2;
        } else if (pitchStr.startsWith('hh')) {
            octave = 6;
            idx = 2;
        } else if (pitchStr.startsWith('l')) {
            octave = 3;
            idx = 1;
        } else if (pitchStr.startsWith('h')) {
            octave = 5;
            idx = 1;
        }

        pitch = pitchStr.substring(idx, idx + 1);

        // Parse accidental
        if (pitchStr.length > idx + 1) {
            const acc = pitchStr.substring(idx + 1);
            if (acc === '+') {
                accidental = '#';
            } else if (acc === '-') {
                accidental = '-';
            }
        }

        return new Note(pitch, octave, duration, false, accidental, tuplet);
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LeadSheetParser;
}
