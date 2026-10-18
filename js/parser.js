/**
 * Lead Sheet Parser
 * Direct port of LeadSheetParser.java
 * Fault-tolerant ABC notation parser for jazz lead sheets.
 */

class LeadSheetParser {
    /**
     * Parses ABC notation string into a SheetMusic instance.
     * @param {string} input 
     * @returns {SheetMusic}
     */
    static parse(input) {
        if (!input) return new SheetMusic();

        const sheet = new SheetMusic();
        sheet.key = "C";
        sheet.meter = "";

        let keyAccidentals = this.getKeyAccidentals(sheet.key);
        let unitNoteLength = 0.125; // Default L: 1/8

        const lines = input.split(/\r?\n/);
        const allMeasures = [];

        let nextMeasureIsNewLine = false;
        let pendingRepeatStart = false;
        let pendingVolta = 0;
        let activeVolta = 0;
        let pendingSection = "";

        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const rawLine = lines[lineIdx];
            let leadingOffset = 0;
            while (leadingOffset < rawLine.length && /\s/.test(rawLine.charAt(leadingOffset))) {
                leadingOffset++;
            }
            const line = rawLine.substring(leadingOffset).replace(/\s+$/, "");
            if (line.length === 0 || line.startsWith("%")) {
                continue;
            }

            // 1. Header / Metadata line check
            if (this.isHeaderLine(line)) {
                const colonIdx = line.indexOf(":");
                if (colonIdx !== -1) {
                    const key = line.substring(0, colonIdx).trim().toLowerCase();
                    const val = line.substring(colonIdx + 1).trim();
                    switch (key) {
                        case "t":
                        case "title":
                            if (!sheet.title) {
                                sheet.title = val;
                            } else {
                                sheet.subTitle = val;
                            }
                            break;
                        case "k":
                        case "key":
                            sheet.key = val;
                            keyAccidentals = this.getKeyAccidentals(val);
                            break;
                        case "m":
                        case "meter":
                            sheet.meter = val;
                            break;
                        case "l":
                        case "unit":
                            unitNoteLength = this.parseUnitLength(val);
                            sheet.unitLength = val;
                            break;
                        case "c":
                        case "composer":
                            sheet.composer = val;
                            break;
                        case "q":
                        case "tempo":
                            sheet.tempo = val;
                            break;
                        case "r":
                        case "rhythm":
                            sheet.rhythm = val;
                            break;
                        case "g":
                        case "genre":
                        case "group":
                        case "tags":
                            val.split(",").forEach(tag => {
                                const t = tag.trim();
                                if (t && !sheet.tags.includes(t)) {
                                    sheet.tags.push(t);
                                }
                            });
                            break;
                        case "p":
                        case "part":
                        case "parts":
                            pendingSection = val;
                            break;
                    }
                }
                continue;
            }

            // 2. Music notation line parsing
            let pos = 0;
            const len = line.length;

            let currentMeasure = new Measure();
            currentMeasure.sourcePosition = new SourcePosition(lineIdx, 0, rawLine.length, rawLine);
            if (allMeasures.length > 0) {
                currentMeasure.isNewLine = true;
            }
            if (pendingRepeatStart) {
                currentMeasure.repeatStart = true;
                pendingRepeatStart = false;
            }
            if (pendingVolta > 0) {
                activeVolta = pendingVolta;
                currentMeasure.voltaNumber = pendingVolta;
                pendingVolta = 0;
            } else if (activeVolta > 0) {
                currentMeasure.voltaNumber = activeVolta;
            }
            if (pendingSection) {
                currentMeasure.sectionLabel = pendingSection;
                pendingSection = "";
            }

            let currentBeat = 0.0;
            let tupletRemaining = 0;
            let currentTupletNumber = 0;
            let tupletFactor = 1.0;
            const measureAccidentals = {};

            while (pos < len) {
                // Skip whitespaces
                while (pos < len && /\s/.test(line.charAt(pos))) {
                    pos++;
                }
                if (pos >= len) break;

                const c = line.charAt(pos);

                // --- Inline headers [K:...], [M:...], [L:...], [Q:...], [P:...] ---
                if (c === '[' && pos + 2 < len && line.charAt(pos + 2) === ':' && /[A-Za-z]/.test(line.charAt(pos + 1))) {
                    const closeBracket = line.indexOf(']', pos);
                    if (closeBracket !== -1) {
                        const headerKey = line.charAt(pos + 1).toLowerCase();
                        if (headerKey === 'p') {
                            const label = line.substring(pos + 3, closeBracket).trim();
                            if (label) {
                                currentMeasure.sectionLabel = label;
                                currentMeasure.voltaNumber = 0;
                                activeVolta = 0;
                            }
                        } else if (headerKey === 'k') {
                            const newKey = line.substring(pos + 3, closeBracket).trim();
                            if (newKey) {
                                keyAccidentals = this.getKeyAccidentals(newKey);
                            }
                        } else if (headerKey === 'm') {
                            sheet.meter = line.substring(pos + 3, closeBracket).trim();
                        } else if (headerKey === 'l') {
                            unitNoteLength = this.parseUnitLength(line.substring(pos + 3, closeBracket).trim());
                        }
                        pos = closeBracket + 1;
                        continue;
                    }
                }

                // --- Section labels [A], [B], [Intro], etc. ---
                if (c === '[' && pos + 1 < len && /[A-Za-z]/.test(line.charAt(pos + 1))) {
                    const closeBracket = line.indexOf(']', pos);
                    if (closeBracket !== -1) {
                        const label = line.substring(pos + 1, closeBracket).trim();
                        const looksLikeChord = this.isLikelyChordString(label);
                        const isCommonSection = /^(intro|verse|chorus|bridge|outro|coda|ending|head|solo|interlude)$/i.test(label);
                        const isLetterSection = /^[A-Za-z]['’′]*$/.test(label) || /^[A-Z][0-9]?['’′]*$/.test(label);
                        if (!looksLikeChord && (isCommonSection || isLetterSection)) {
                            currentMeasure.sectionLabel = label;
                            currentMeasure.voltaNumber = 0;
                            activeVolta = 0;
                            pos = closeBracket + 1;
                            continue;
                        }
                    }
                }

                // --- Volta brackets (1), (2) or [1, [2 ---
                if ((c === '(' && pos + 2 < len && /\d/.test(line.charAt(pos + 1)) && line.charAt(pos + 2) === ')') ||
                    (c === '[' && pos + 1 < len && /\d/.test(line.charAt(pos + 1)))) {
                    const num = parseInt(line.charAt(pos + 1), 10);
                    activeVolta = num;
                    currentMeasure.voltaNumber = num;
                    pos += 2;
                    if (pos < len && line.charAt(pos) === '.') {
                        pos++;
                    }
                    if (pos < len && (line.charAt(pos) === ')' || line.charAt(pos) === ']')) {
                        pos++;
                    }
                    continue;
                }

                // --- Chords inside brackets [E8c8], [CEG] (Extract top note) ---
                if (c === '[' && !line.startsWith("[|", pos)) {
                    const closeBracket = line.indexOf(']', pos + 1);
                    if (closeBracket !== -1) {
                        const inside = line.substring(pos + 1, closeBracket).trim();
                        if (this.isLikelyChordString(inside)) {
                            const chordStart = pos;
                            pos = closeBracket + 1;

                            let chordDurStart = pos;
                            while (pos < len && this.isDurationChar(line.charAt(pos))) {
                                pos++;
                            }
                            const chordDurStr = line.substring(chordDurStart, pos);
                            const chordDurMultiplier = chordDurStr ? this.parseABCDuration(chordDurStr) : 1.0;

                            let chordTie = false;
                            if (pos < len && line.charAt(pos) === '-') {
                                chordTie = true;
                                pos++;
                            }

                            const chordNotes = this.parseNotesInsideChord(inside, unitNoteLength, measureAccidentals, keyAccidentals);
                            if (chordNotes.length > 0) {
                                let topNote = chordNotes[0];
                                let maxPitchVal = this.getNotePitchValue(topNote);
                                for (let i = 1; i < chordNotes.length; i++) {
                                    const candidate = chordNotes[i];
                                    const pVal = this.getNotePitchValue(candidate);
                                    if (pVal > maxPitchVal) {
                                        maxPitchVal = pVal;
                                        topNote = candidate;
                                    }
                                }

                                let dur = topNote.duration * chordDurMultiplier;
                                let tupletNum = 0;
                                if (tupletRemaining > 0) {
                                    dur *= tupletFactor;
                                    tupletNum = currentTupletNumber;
                                    tupletRemaining--;
                                }
                                topNote.duration = dur;
                                topNote.tupletNumber = tupletNum;
                                if (chordTie) {
                                    topNote.isTieStart = true;
                                }

                                topNote.sourcePosition = new SourcePosition(lineIdx, chordStart + leadingOffset, pos + leadingOffset, line.substring(chordStart, pos));
                                currentMeasure.notes.push(topNote);
                                currentBeat += dur;
                                continue;
                            }
                        }
                    }
                }

                // Skip stray brackets [ or ]
                if (c === '[' || c === ']') {
                    pos++;
                    continue;
                }

                // Skip dynamics / annotations !...! or +...+
                if (c === '!' || c === '+') {
                    const endDelim = line.indexOf(c, pos + 1);
                    if (endDelim !== -1) {
                        pos = endDelim + 1;
                        continue;
                    }
                }

                // Skip grace notes {...}
                if (c === '{') {
                    const closeBrace = line.indexOf('}', pos + 1);
                    if (closeBrace !== -1) {
                        pos = closeBrace + 1;
                        continue;
                    }
                }

                // Skip stray slur close ')'
                if (c === ')') {
                    pos++;
                    continue;
                }

                // Skip articulations (~, H, u, v, staccato dot)
                if (c === '~' || c === 'H' || c === 'u' || c === 'v' || (c === '.' && pos + 1 < len && this.isNoteStartChar(line.charAt(pos + 1)))) {
                    pos++;
                    continue;
                }

                // --- Barline tokens ---
                if (c === '|' || c === ':') {
                    const barStart = pos;
                    let isRepEnd = false;
                    let isRepStart = false;
                    let isDblBar = false;

                    let barEndForPrev = pos;
                    let barStartForNext = pos;

                    if (line.startsWith(":|", pos)) {
                        isRepEnd = true;
                        pos += 2;
                        barEndForPrev = pos;
                        barStartForNext = pos;
                    } else if (line.startsWith("::", pos)) {
                        isRepEnd = true;
                        isRepStart = true;
                        pos += 2;
                        barEndForPrev = barStart + 1;
                        barStartForNext = barStart + 1;
                    } else if (line.startsWith("||:", pos) || line.startsWith("[|:", pos)) {
                        isRepStart = true;
                        pos += 3;
                        barEndForPrev = barStart;
                        barStartForNext = barStart;
                    } else if (line.startsWith("|:", pos)) {
                        isRepStart = true;
                        pos += 2;
                        barEndForPrev = barStart;
                        barStartForNext = barStart;
                    } else if (line.startsWith(":||", pos) || line.startsWith(":|]", pos)) {
                        isRepEnd = true;
                        isDblBar = true;
                        pos += 3;
                        barEndForPrev = pos;
                        barStartForNext = pos;
                    } else if (line.startsWith("||", pos) || line.startsWith("|]", pos)) {
                        isDblBar = true;
                        pos += 2;
                        barEndForPrev = pos;
                        barStartForNext = pos;
                    } else if (line.startsWith("[|", pos)) {
                        pos += 2;
                        barEndForPrev = barStart;
                        barStartForNext = barStart;
                    } else if (c === '|') {
                        pos += 1;
                        if (pos < len && /\d/.test(line.charAt(pos))) {
                            pendingVolta = parseInt(line.charAt(pos), 10);
                            pos++;
                            if (pos < len && line.charAt(pos) === '.') pos++;
                            barEndForPrev = barStart;
                            barStartForNext = barStart;
                        } else {
                            barEndForPrev = pos;
                            barStartForNext = pos;
                        }
                    } else {
                        pos++;
                        barEndForPrev = pos;
                        barStartForNext = pos;
                    }

                    if (isRepEnd) currentMeasure.repeatEnd = true;
                    if (isDblBar) currentMeasure.isDoubleBar = true;

                    if (currentMeasure.notes.length > 0 || currentMeasure.chords.length > 0) {
                        currentMeasure.totalDuration = Math.max(currentBeat, 1.0);
                        currentMeasure.sourcePosition.endOffset = barEndForPrev + leadingOffset;
                        const sOff = Math.min(currentMeasure.sourcePosition.startOffset, rawLine.length);
                        const eOff = Math.min(Math.max(sOff, currentMeasure.sourcePosition.endOffset), rawLine.length);
                        currentMeasure.sourcePosition.originalText = rawLine.substring(sOff, eOff);
                        allMeasures.push(currentMeasure);

                        currentMeasure = new Measure();
                        currentMeasure.sourcePosition = new SourcePosition(lineIdx, barStartForNext + leadingOffset, rawLine.length, rawLine);
                        currentBeat = 0.0;
                        for (const key in measureAccidentals) delete measureAccidentals[key];

                        if (isRepEnd) {
                            activeVolta = 0;
                        } else if (activeVolta > 0) {
                            currentMeasure.voltaNumber = activeVolta;
                        }
                    }

                    if (isRepStart) {
                        currentMeasure.repeatStart = true;
                    }
                    if (pendingVolta > 0) {
                        activeVolta = pendingVolta;
                        currentMeasure.voltaNumber = pendingVolta;
                        pendingVolta = 0;
                    }
                    continue;
                }

                // --- Chord symbols "..." ---
                if (c === '"') {
                    const endQuote = line.indexOf('"', pos + 1);
                    if (endQuote !== -1) {
                        const chordStr = line.substring(pos + 1, endQuote).trim();
                        if (chordStr.startsWith("[") && chordStr.endsWith("]")) {
                            currentMeasure.sectionLabel = chordStr.substring(1, chordStr.length - 1);
                        } else {
                            const cc = new ChordChange(this.normalizeChord(chordStr), currentBeat);
                            cc.sourcePosition = new SourcePosition(lineIdx, pos + leadingOffset, endQuote + 1 + leadingOffset, `"${chordStr}"`);
                            currentMeasure.chords.push(cc);
                        }
                        pos = endQuote + 1;
                        continue;
                    }
                }

                // --- Tuplet prefix (3 or (p:q:r ---
                if (c === '(' && pos + 1 < len && /\d/.test(line.charAt(pos + 1))) {
                    let p = 0;
                    pos++;
                    while (pos < len && /\d/.test(line.charAt(pos))) {
                        p = p * 10 + parseInt(line.charAt(pos), 10);
                        pos++;
                    }
                    let q = 0;
                    let r = p;
                    if (pos < len && line.charAt(pos) === ':') {
                        pos++;
                        while (pos < len && /\d/.test(line.charAt(pos))) {
                            q = q * 10 + parseInt(line.charAt(pos), 10);
                            pos++;
                        }
                        if (pos < len && line.charAt(pos) === ':') {
                            pos++;
                            let customR = 0;
                            while (pos < len && /\d/.test(line.charAt(pos))) {
                                customR = customR * 10 + parseInt(line.charAt(pos), 10);
                                pos++;
                            }
                            if (customR > 0) r = customR;
                        }
                    }
                    if (q === 0) {
                        if (p === 3) q = 2;
                        else if (p === 2) q = 3;
                        else if (p === 4) q = 3;
                        else if (p === 6) q = 4;
                        else q = p - 1;
                    }
                    tupletRemaining = r;
                    currentTupletNumber = p;
                    tupletFactor = q / p;

                    while (pos < len && /\s/.test(line.charAt(pos))) {
                        pos++;
                    }
                    continue;
                }

                // Stray '('
                if (c === '(') {
                    pos++;
                    continue;
                }

                // --- Newline marker nl / NL ---
                if (pos + 1 < len && line.substring(pos, pos + 2).toLowerCase() === "nl") {
                    nextMeasureIsNewLine = true;
                    pos += 2;
                    continue;
                }

                // --- Rest z / Z / x / X / r ---
                if (c === 'z' || c === 'Z' || c === 'x' || c === 'X' || c === 'r') {
                    const restStart = pos;
                    pos++;
                    let durStart = pos;
                    while (pos < len && this.isDurationChar(line.charAt(pos))) {
                        pos++;
                    }
                    const durStr = line.substring(durStart, pos);
                    const baseDur = this.parseABCDuration(durStr);
                    let dur = baseDur * (unitNoteLength / 0.25);
                    let tupletNum = 0;
                    if (tupletRemaining > 0) {
                        dur *= tupletFactor;
                        tupletNum = currentTupletNumber;
                        tupletRemaining--;
                    }

                    const note = new Note("r", 0, dur, true);
                    note.tupletNumber = tupletNum;
                    note.sourcePosition = new SourcePosition(lineIdx, restStart + leadingOffset, pos + leadingOffset, line.substring(restStart, pos));
                    currentMeasure.notes.push(note);
                    currentBeat += dur;
                    continue;
                }

                // --- Note (^, _, =, A-G, a-g) ---
                if (this.isNoteStartChar(c)) {
                    const noteStart = pos;
                    let accPrefix = "";
                    while (pos < len && (line.charAt(pos) === '^' || line.charAt(pos) === '_' || line.charAt(pos) === '=')) {
                        accPrefix += line.charAt(pos);
                        pos++;
                    }
                    if (pos >= len || !this.isPitchChar(line.charAt(pos))) {
                        continue;
                    }

                    const pitchChar = line.charAt(pos);
                    pos++;

                    let octaveModifier = 0;
                    while (pos < len && (line.charAt(pos) === ',' || line.charAt(pos) === '\'')) {
                        if (line.charAt(pos) === ',') octaveModifier--;
                        else octaveModifier++;
                        pos++;
                    }

                    const durStart = pos;
                    while (pos < len && this.isDurationChar(line.charAt(pos))) {
                        pos++;
                    }
                    const durStr = line.substring(durStart, pos);
                    const baseDur = this.parseABCDuration(durStr);
                    let dur = baseDur * (unitNoteLength / 0.25);
                    let tupletNum = 0;
                    if (tupletRemaining > 0) {
                        dur *= tupletFactor;
                        tupletNum = currentTupletNumber;
                        tupletRemaining--;
                    }

                    const pitch = pitchChar.toLowerCase();
                    let octave = (pitchChar === pitchChar.toUpperCase()) ? 4 : 5;
                    octave += octaveModifier;

                    let accidental = "";
                    const pitchKey = pitch + octave;
                    if (accPrefix.includes("^")) {
                        accidental = "#";
                        measureAccidentals[pitchKey] = accidental;
                    } else if (accPrefix.includes("_")) {
                        accidental = "-";
                        measureAccidentals[pitchKey] = accidental;
                    } else if (accPrefix.includes("=")) {
                        accidental = "";
                        measureAccidentals[pitchKey] = accidental;
                    } else if (pitchKey in measureAccidentals) {
                        accidental = measureAccidentals[pitchKey];
                    } else {
                        accidental = keyAccidentals[pitch] || "";
                    }

                    let isTie = false;
                    if (pos < len && line.charAt(pos) === '-') {
                        isTie = true;
                        pos++;
                    }

                    const note = new Note(pitch, octave, dur, false, accidental, tupletNum);
                    note.isTieStart = isTie;
                    note.sourcePosition = new SourcePosition(lineIdx, noteStart + leadingOffset, pos + leadingOffset, line.substring(noteStart, pos));
                    currentMeasure.notes.push(note);
                    currentBeat += dur;
                    continue;
                }

                // Advance if unknown char
                pos++;
            }

            // End of line measure flush
            if (currentMeasure.notes.length > 0 || currentMeasure.chords.length > 0 || currentMeasure.repeatStart || currentMeasure.repeatEnd || currentMeasure.isDoubleBar || currentMeasure.sectionLabel) {
                currentMeasure.totalDuration = Math.max(currentBeat, 1.0);
                if (nextMeasureIsNewLine) {
                    currentMeasure.isNewLine = true;
                    nextMeasureIsNewLine = false;
                }
                currentMeasure.sourcePosition.endOffset = rawLine.length;
                const sOff = Math.min(currentMeasure.sourcePosition.startOffset, rawLine.length);
                const eOff = Math.min(Math.max(sOff, currentMeasure.sourcePosition.endOffset), rawLine.length);
                currentMeasure.sourcePosition.originalText = rawLine.substring(sOff, eOff);
                allMeasures.push(currentMeasure);
                if (currentMeasure.repeatEnd) {
                    activeVolta = 0;
                }
            }
        }

        // Clean up empty marker-only measures (e.g. standalone [A] or [B] lines)
        const cleanedMeasures = [];
        let pendingSec = "";
        let pendingRepStart = false;
        let pendingVoltaNum = 0;
        let pendingNewLine = false;

        for (const m of allMeasures) {
            if (m.notes.length === 0 && m.chords.length === 0) {
                if (m.sectionLabel) pendingSec = m.sectionLabel;
                if (m.repeatStart) pendingRepStart = true;
                if (m.voltaNumber > 0) pendingVoltaNum = m.voltaNumber;
                if (m.isNewLine) pendingNewLine = true;
                continue;
            }
            if (pendingSec && !m.sectionLabel) {
                m.sectionLabel = pendingSec;
                pendingSec = "";
            }
            if (pendingRepStart) {
                m.repeatStart = true;
                pendingRepStart = false;
            }
            if (pendingVoltaNum > 0 && m.voltaNumber === 0) {
                m.voltaNumber = pendingVoltaNum;
                pendingVoltaNum = 0;
            }
            if (pendingNewLine) {
                m.isNewLine = true;
                pendingNewLine = false;
            }
            cleanedMeasures.push(m);
        }

        this.linkTiedNotes(cleanedMeasures);
        sheet.measures = cleanedMeasures;
        return sheet;
    }

    /**
     * Link tied notes across measures and line breaks.
     * @param {Array<Measure>} measures 
     */
    static linkTiedNotes(measures) {
        let pendingTie = null;
        for (const m of measures) {
            for (const n of m.notes) {
                if (n.isRest) {
                    pendingTie = null;
                    continue;
                }
                if (pendingTie !== null) {
                    if (n.pitch.toLowerCase() === pendingTie.pitch.toLowerCase() && n.octave === pendingTie.octave) {
                        pendingTie.tiedToNote = n;
                        n.tiedFromNote = pendingTie;
                        n.isTieEnd = true;
                        n.accidental = pendingTie.accidental;
                    }
                    pendingTie = null;
                }
                if (n.isTieStart) {
                    pendingTie = n;
                }
            }
        }
    }

    static isHeaderLine(line) {
        if (/^[A-Za-z]:.*/.test(line)) {
            return true;
        }
        const lower = line.toLowerCase();
        return lower.startsWith("title:") || lower.startsWith("key:") ||
               lower.startsWith("meter:") || lower.startsWith("unit:") ||
               lower.startsWith("composer:") || lower.startsWith("tempo:") ||
               lower.startsWith("rhythm:") || lower.startsWith("genre:") ||
               lower.startsWith("group:") || lower.startsWith("tags:") ||
               lower.startsWith("part:") || lower.startsWith("parts:");
    }

    static isNoteStartChar(c) {
        return c === '^' || c === '_' || c === '=' ||
               (c >= 'A' && c <= 'G') || (c >= 'a' && c <= 'g');
    }

    static isPitchChar(c) {
        return (c >= 'A' && c <= 'G') || (c >= 'a' && c <= 'g');
    }

    static isDurationChar(c) {
        return /\d/.test(c) || c === '/' || c === '.';
    }

    static parseABCDuration(dur) {
        if (!dur || !dur.trim()) return 1.0;
        try {
            dur = dur.trim();
            if (dur === "/") return 0.5;
            if (dur.startsWith("/")) {
                const denom = dur.substring(1);
                if (!denom) return 0.5;
                return 1.0 / parseFloat(denom);
            }
            if (dur.includes("/")) {
                const parts = dur.split("/");
                const num = parseFloat(parts[0]);
                const denom = parts.length > 1 && parts[1] ? parseFloat(parts[1]) : 2.0;
                return num / denom;
            }
            return parseFloat(dur);
        } catch (e) {
            return 1.0;
        }
    }

    static parseUnitLength(val) {
        val = val.trim();
        if (val.includes("/")) {
            const parts = val.split("/");
            try {
                const num = parseFloat(parts[0].trim());
                const den = parseFloat(parts[1].trim());
                return num / den;
            } catch (ignored) {}
        }
        return 0.125;
    }

    static normalizeChord(chord) {
        if (!chord) return "";
        return chord.replace(/b/g, "b").replace(/#/g, "#");
    }

    static getKeyAccidentals(keyName) {
        const map = {};
        if (!keyName || !keyName.trim()) return map;

        const key = keyName.trim();
        const isMinor = key.toLowerCase().endsWith("m");
        const root = isMinor ? key.substring(0, key.length - 1) : key;

        let majorRoot = root;
        if (isMinor) {
            const minorToMajor = {
                "A": "C", "E": "G", "B": "D",
                "F#": "A", "C#": "E", "G#": "B",
                "D#": "F#", "A#": "C#",
                "D": "F", "G": "Bb", "C": "Eb",
                "F": "Ab", "Bb": "Db", "Eb": "Gb",
                "Ab": "Cb"
            };
            majorRoot = minorToMajor[root] || root;
        }

        const majorToSharps = {
            "C": 0, "G": 1, "D": 2, "A": 3, "E": 4, "B": 5, "F#": 6, "C#": 7
        };
        const majorToFlats = {
            "F": 1, "Bb": 2, "Eb": 3, "Ab": 4, "Db": 5, "Gb": 6, "Cb": 7
        };

        if (majorRoot in majorToSharps) {
            const count = majorToSharps[majorRoot];
            const order = ["f", "c", "g", "d", "a", "e", "b"];
            for (let i = 0; i < count; i++) {
                map[order[i]] = "#";
            }
        } else if (majorRoot in majorToFlats) {
            const count = majorToFlats[majorRoot];
            const order = ["b", "e", "a", "d", "g", "c", "f"];
            for (let i = 0; i < count; i++) {
                map[order[i]] = "-";
            }
        }
        return map;
    }

    static isLikelyChordString(text) {
        if (!text || !text.trim()) return false;
        const t = text.trim();
        if (/^(intro|verse|chorus|bridge|outro|coda|ending|fine|head|solo|interlude)$/i.test(t)) {
            return false;
        }
        let pitchCount = 0;
        for (let i = 0; i < t.length; i++) {
            const ch = t.charAt(i);
            if (this.isPitchChar(ch)) {
                pitchCount++;
            } else if (!this.isDurationChar(ch) && ch !== '^' && ch !== '_' && ch !== '=' && ch !== ',' && ch !== '\'' && ch !== '-' && !/\s/.test(ch)) {
                return false;
            }
        }
        return pitchCount >= 2;
    }

    static parseNotesInsideChord(inside, unitNoteLength, measureAccidentals, keyAccidentals) {
        const notes = [];
        let p = 0;
        const len = inside.length;
        while (p < len) {
            while (p < len && /\s/.test(inside.charAt(p))) {
                p++;
            }
            if (p >= len) break;

            const ch = inside.charAt(p);
            if (!this.isNoteStartChar(ch)) {
                p++;
                continue;
            }

            let accPrefix = "";
            while (p < len && (inside.charAt(p) === '^' || inside.charAt(p) === '_' || inside.charAt(p) === '=')) {
                accPrefix += inside.charAt(p);
                p++;
            }
            if (p >= len || !this.isPitchChar(inside.charAt(p))) {
                continue;
            }

            const pitchChar = inside.charAt(p);
            p++;

            let octaveModifier = 0;
            while (p < len && (inside.charAt(p) === ',' || inside.charAt(p) === '\'')) {
                if (inside.charAt(p) === ',') octaveModifier--;
                else octaveModifier++;
                p++;
            }

            const durStart = p;
            while (p < len && this.isDurationChar(inside.charAt(p))) {
                p++;
            }
            const durStr = inside.substring(durStart, p);
            const baseDur = this.parseABCDuration(durStr);
            const dur = baseDur * (unitNoteLength / 0.25);

            const pitch = pitchChar.toLowerCase();
            let octave = (pitchChar === pitchChar.toUpperCase()) ? 4 : 5;
            octave += octaveModifier;

            let accidental = "";
            const pitchKey = pitch + octave;
            if (accPrefix.includes("^")) {
                accidental = "#";
                measureAccidentals[pitchKey] = accidental;
            } else if (accPrefix.includes("_")) {
                accidental = "-";
                measureAccidentals[pitchKey] = accidental;
            } else if (accPrefix.includes("=")) {
                accidental = "";
                measureAccidentals[pitchKey] = accidental;
            } else if (pitchKey in measureAccidentals) {
                accidental = measureAccidentals[pitchKey];
            } else {
                accidental = keyAccidentals[pitch] || "";
            }

            let isTie = false;
            if (p < len && inside.charAt(p) === '-') {
                isTie = true;
                p++;
            }

            const note = new Note(pitch, octave, dur, false, accidental, 0);
            note.isTieStart = isTie;
            notes.push(note);
        }
        return notes;
    }

    static getNotePitchValue(note) {
        if (!note || !note.pitch) return 0;
        const step = "cdefgab".indexOf(note.pitch.charAt(0).toLowerCase());
        if (step === -1) return 0;
        const diatonicSemi = [0, 2, 4, 5, 7, 9, 11];
        let semi = diatonicSemi[step];
        if (note.accidental === "#" || note.accidental === "+") semi += 1;
        else if (note.accidental === "-" || note.accidental === "_") semi -= 1;
        return (note.octave + 1) * 12 + semi;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LeadSheetParser };
}
