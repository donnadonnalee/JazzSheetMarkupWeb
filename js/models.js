/**
 * Music data model classes
 * Ported from MusicModel.java
 */

class Note {
    constructor(pitch, octave, duration, isRest, accidental = '', tupletNumber = 0) {
        this.pitch = pitch;              // 'c', 'd', 'e', etc.
        this.octave = octave;            // 2, 3, 4, 5, 6
        this.duration = duration;        // 0.5, 1, 2, etc.
        this.isRest = isRest;            // boolean
        this.accidental = accidental;    // '', '#', '-'
        this.tupletNumber = tupletNumber; // 0 or 3, 5, 6, 7, etc.
        this.sourcePosition = null;
    }
}

class ChordChange {
    constructor(chord, position) {
        this.chord = chord;         // "Cmaj7", "Dm7", etc.
        this.position = position;   // Position in measure (0-4)
        this.sourcePosition = null;
    }
}

class Measure {
    constructor() {
        this.notes = [];           // Array of Note objects
        this.chords = [];          // Array of ChordChange objects
        this.totalDuration = 0;    // Total duration (usually 4)
        this.isNewLine = false;    // Start new line
        this.repeatStart = false;  // |:
        this.repeatEnd = false;    // :|
        this.isDoubleBar = false;  // ||
        this.voltaNumber = 0;      // 1, 2, etc. for endings
        this.sectionLabel = '';    // 'A', 'B', 'C', etc.
        this.sourcePosition = null;
    }
}

class SheetMusic {
    constructor() {
        this.title = '';
        this.key = 'C';            // Default key
        this.measures = [];        // Array of Measure objects
    }
}

class SourcePosition {
    constructor(lineNumber = -1, startOffset = -1, endOffset = -1, originalText = '') {
        this.lineNumber = lineNumber;
        this.startOffset = startOffset;
        this.endOffset = endOffset;
        this.originalText = originalText;
    }

    isValid() {
        return this.lineNumber >= 0 && this.startOffset >= 0 && this.endOffset >= this.startOffset;
    }

    getLength() {
        return this.endOffset - this.startOffset;
    }

    toString() {
        return `Line ${this.lineNumber} [${this.startOffset}-${this.endOffset}]: '${this.originalText}'`;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Note, ChordChange, Measure, SheetMusic, SourcePosition };
}
