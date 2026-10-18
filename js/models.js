/**
 * Music Models
 * Direct port of MusicModel.java & SourcePosition.java
 */

class SourcePosition {
    constructor(lineNumber = -1, startOffset = -1, endOffset = -1, originalText = "") {
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

class Note {
    constructor(pitch, octave, duration, isRest = false, accidental = "", tupletNumber = 0) {
        this.pitch = pitch;
        this.octave = octave;
        this.duration = duration;
        this.isRest = isRest;
        this.accidental = accidental || "";
        this.tupletNumber = tupletNumber || 0;
        this.isTieStart = false;
        this.isTieEnd = false;
        this.tiedToNote = null;
        this.tiedFromNote = null;
        this.sourcePosition = new SourcePosition();
        this.originalNote = this;
    }
}

class ChordChange {
    constructor(chord, position = 0) {
        this.chord = chord;
        this.position = position;
        this.sourcePosition = new SourcePosition();
        this.originalChord = this;
    }
}

class Measure {
    constructor() {
        this.notes = [];
        this.chords = [];
        this.totalDuration = 0;
        this.isNewLine = false;
        this.repeatStart = false;
        this.repeatEnd = false;
        this.isDoubleBar = false;
        this.voltaNumber = 0;
        this.sectionLabel = "";
        this.sourcePosition = new SourcePosition();
        this.originalMeasure = this;
    }
}

class SheetMusic {
    constructor() {
        this.title = "";
        this.subTitle = "";
        this.key = "C";
        this.composer = "";
        this.meter = "";
        this.tempo = "";
        this.rhythm = "";
        this.unitLength = "1/8";
        this.tags = [];
        this.measures = [];
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SourcePosition, Note, ChordChange, Measure, SheetMusic };
}
