/**
 * ABC Utilities: ABCConverter & AbcTransposer
 * Direct port of ABCConverter.java and AbcTransposer.java
 */

class ABCConverter {
    static isABCNotation(text) {
        if (!text || !text.trim()) return false;
        const lines = text.split("\n");
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("%")) continue;
            if (/^[XTKMLVQR]:.*/.test(trimmed)) {
                return true;
            }
        }
        return text.includes("|") || text.includes('"');
    }

    static getCurrentUnitNoteLength(text) {
        if (!text) return "1/8";
        const lines = text.split("\n");
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("L:")) {
                const val = trimmed.substring(2).trim();
                if (val.includes("1/4")) return "1/4";
                if (val.includes("1/8")) return "1/8";
                if (val.includes("1/16")) return "1/16";
                return val;
            }
        }
        return "1/8";
    }

    static toggleUnitNoteLength(abc) {
        const currentL = this.getCurrentUnitNoteLength(abc);
        return currentL === "1/4" ? this.convertUnitNoteLength(abc, "1/8") : this.convertUnitNoteLength(abc, "1/4");
    }

    static convertUnitNoteLength(abc, targetL) {
        if (!abc) return "";
        const currentL = this.getCurrentUnitNoteLength(abc);
        if (currentL === targetL) return abc;

        const currentBase = this.parseFraction(currentL, 0.125);
        const targetBase = this.parseFraction(targetL, 0.25);
        if (currentBase <= 0 || targetBase <= 0) return abc;

        const ratio = currentBase / targetBase;
        const lines = abc.split("\n");
        const result = [];
        let hasLHeader = false;
        let keyLineIndex = -1;

        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (trimmed.startsWith("L:")) hasLHeader = true;
            else if (trimmed.startsWith("K:")) keyLineIndex = i;
        }

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            if (trimmed.startsWith("L:")) {
                result.push("L: " + targetL);
                continue;
            }
            if (!hasLHeader && i === keyLineIndex) {
                result.push("L: " + targetL);
            }
            if (/^[A-Za-z]:.*/.test(trimmed) || trimmed.startsWith("%")) {
                result.push(line);
                continue;
            }

            result.push(this.convertScoreLine(line, ratio));
        }

        return result.join("\n");
    }

    static parseFraction(str, defaultVal) {
        try {
            if (str.includes("/")) {
                const parts = str.split("/");
                return parseFloat(parts[0].trim()) / parseFloat(parts[1].trim());
            }
            return parseFloat(str.trim());
        } catch (e) {
            return defaultVal;
        }
    }

    static convertScoreLine(line, ratio) {
        let sb = "";
        const len = line.length;
        let pos = 0;

        while (pos < len) {
            const c = line.charAt(pos);
            // Chord name "..." skip
            if (c === '"') {
                const endQuote = line.indexOf('"', pos + 1);
                if (endQuote !== -1) {
                    sb += line.substring(pos, endQuote + 1);
                    pos = endQuote + 1;
                    continue;
                }
            }

            // Section markers / repeats [A], [B], [1, [2, [| skip
            if (c === '[') {
                const endBracket = line.indexOf(']', pos + 1);
                if (endBracket !== -1) {
                    sb += line.substring(pos, endBracket + 1);
                    pos = endBracket + 1;
                    continue;
                } else {
                    sb += c;
                    pos++;
                    while (pos < len && (/\d|\.|,|\|/.test(line.charAt(pos)))) {
                        sb += line.charAt(pos);
                        pos++;
                    }
                    continue;
                }
            }

            // Tuplet prefix (3 or (p:q:r skip
            if (c === '(' && pos + 1 < len && /\d/.test(line.charAt(pos + 1))) {
                sb += c;
                pos++;
                while (pos < len && (/\d|:/.test(line.charAt(pos)))) {
                    sb += line.charAt(pos);
                    pos++;
                }
                while (pos < len && /\s/.test(line.charAt(pos))) {
                    sb += line.charAt(pos);
                    pos++;
                }
                continue;
            }

            if (LeadSheetParser.isNoteStartChar(c) || c === 'z' || c === 'Z' || c === 'x' || c === 'X' || c === 'r') {
                let tokenStart = pos;
                while (pos < len && (line.charAt(pos) === '^' || line.charAt(pos) === '_' || line.charAt(pos) === '=')) {
                    pos++;
                }
                if (pos < len) pos++; // pitch char or rest char
                while (pos < len && (line.charAt(pos) === ',' || line.charAt(pos) === '\'')) {
                    pos++;
                }
                const prefix = line.substring(tokenStart, pos);

                let durStart = pos;
                while (pos < len && LeadSheetParser.isDurationChar(line.charAt(pos))) {
                    pos++;
                }
                const oldDurStr = line.substring(durStart, pos);
                const oldVal = LeadSheetParser.parseABCDuration(oldDurStr);
                const newVal = oldVal * ratio;
                const newDurStr = this.formatDuration(newVal);

                sb += prefix + newDurStr;
                continue;
            }

            sb += c;
            pos++;
        }
        return sb;
    }

    static formatDuration(val) {
        if (Math.abs(val - 1.0) < 1e-5) return "";
        if (Math.abs(val - 0.5) < 1e-5) return "/";
        if (Math.abs(val - 0.25) < 1e-5) return "/4";
        if (Math.abs(val - 0.125) < 1e-5) return "/8";
        if (Math.abs(val - 1.5) < 1e-5) return "3/2";
        if (Math.abs(val - 0.75) < 1e-5) return "3/4";
        if (Math.abs(val - Math.round(val)) < 1e-5) {
            return String(Math.round(val));
        }
        // Simplify rational fraction
        const denoms = [2, 3, 4, 6, 8, 16];
        for (const d of denoms) {
            const num = Math.round(val * d);
            if (Math.abs(val - (num / d)) < 1e-4) {
                return `${num}/${d}`;
            }
        }
        return String(val);
    }
}

class AbcTransposer {
    static NOTES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    static NOTES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

    static ROOT_TO_SEMI = {
        "C": 0, "C#": 1, "DB": 1, "D": 2, "D#": 3, "EB": 3, "E": 4, "F": 5, "F#": 6,
        "GB": 6, "G": 7, "G#": 8, "AB": 8, "A": 9, "A#": 10, "BB": 10, "B": 11
    };

    static DIATONIC_SEMI = [0, 2, 4, 5, 7, 9, 11];
    static DIATONIC_NAMES = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];

    static transpose(abc, semitoneShift) {
        if (!abc) return "";
        const shift = ((semitoneShift % 12) + 12) % 12;
        if (shift === 0) return abc;

        const oldKey = this.extractKey(abc);
        const newKey = this.transposeKeyName(oldKey, semitoneShift);
        const newKeySF = this.getKeySharpsFlats(newKey);

        const oldKeyAcc = LeadSheetParser.getKeyAccidentals(oldKey);
        const newKeyAcc = LeadSheetParser.getKeyAccidentals(newKey);

        const lines = abc.split(/\r?\n/);
        const outputLines = [];

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("%")) {
                outputLines.push(line);
                continue;
            }
            if (LeadSheetParser.isHeaderLine(trimmed)) {
                const parts = line.split(":", 2);
                if (parts.length === 2) {
                    const hKey = parts[0].trim().toLowerCase();
                    if (hKey === "k" || hKey === "key") {
                        outputLines.push("K: " + newKey);
                        continue;
                    }
                }
                outputLines.push(line);
                continue;
            }

            outputLines.push(this.transposeMusicLine(line, semitoneShift, oldKeyAcc, newKeyAcc, newKeySF));
        }

        return outputLines.join("\n");
    }

    static extractKey(abc) {
        const m = abc.match(/(?:^|\n)\s*(?:k|key):\s*([^\n\r%]+)/i);
        return m ? m[1].trim() : "C";
    }

    static transposeKeyName(keyName = "C", semitoneShift = 0) {
        keyName = keyName.trim();
        const m = keyName.match(/^([A-G](?:#|b)?)(.*)$/i);
        if (!m) return keyName;

        let root = m[1].toUpperCase();
        if (root.length > 1 && (root.charAt(1) === 'B' || root.charAt(1) === 'b')) {
            root = root.substring(0, 1) + "b";
        }
        const suffix = m[2];

        const semi = this.ROOT_TO_SEMI[root.toUpperCase()] || 0;
        const newSemi = (semi + (semitoneShift % 12) + 12) % 12;
        const isMinor = suffix.toLowerCase().startsWith("m") || suffix.toLowerCase().startsWith("min");
        const newRoot = this.getBestRootSpelling(newSemi, isMinor, semitoneShift >= 0);

        return newRoot + suffix;
    }

    static getBestRootSpelling(semi, isMinor, preferSharp) {
        if (!isMinor) {
            switch (semi) {
                case 0: return "C";
                case 1: return "Db";
                case 2: return "D";
                case 3: return "Eb";
                case 4: return "E";
                case 5: return "F";
                case 6: return preferSharp ? "F#" : "Gb";
                case 7: return "G";
                case 8: return "Ab";
                case 9: return "A";
                case 10: return "Bb";
                case 11: return "B";
            }
        } else {
            switch (semi) {
                case 0: return "C";
                case 1: return "C#";
                case 2: return "D";
                case 3: return "D#";
                case 4: return "E";
                case 5: return "F";
                case 6: return "F#";
                case 7: return "G";
                case 8: return "G#";
                case 9: return "A";
                case 10: return "Bb";
                case 11: return "B";
            }
        }
        return this.NOTES_SHARP[semi];
    }

    static getKeySharpsFlats(keyName) {
        if (!keyName) return 0;
        const map = LeadSheetParser.getKeyAccidentals(keyName);
        let count = 0;
        for (const k in map) {
            if (map[k] === "#") count++;
            else if (map[k] === "-") count--;
        }
        return count;
    }

    static transposeChord(chord, semitoneShift, keySF) {
        if (!chord || chord.startsWith("N.C") || chord.startsWith("NC")) return chord;
        const parts = chord.split("/");
        const sb = [];
        for (let i = 0; i < parts.length; i++) {
            const p = parts[i].trim();
            if (!p) continue;
            const m = p.match(/^([A-G](?:#|b)?)(.*)$/);
            if (!m) {
                sb.push(p);
                continue;
            }
            const root = m[1];
            const suffix = m[2];
            const semi = this.ROOT_TO_SEMI[root.toUpperCase()];
            if (semi === undefined) {
                sb.push(p);
                continue;
            }
            const newSemi = (semi + (semitoneShift % 12) + 12) % 12;
            const newRoot = (keySF >= 0) ? this.NOTES_SHARP[newSemi] : this.NOTES_FLAT[newSemi];
            sb.push(newRoot + suffix);
        }
        return sb.join("/");
    }

    static transposeMusicLine(line, semitoneShift, oldKeyAcc, newKeyAcc, newKeySF) {
        let sb = "";
        const len = line.length;
        let pos = 0;

        const measureAccidentals = {};
        const outputMeasureAccidentals = {};
        let pendingTieAcc = null;
        let pendingTiePitchKey = null;

        while (pos < len) {
            const c = line.charAt(pos);
            if (c === '|' || c === ':') {
                for (const k in measureAccidentals) delete measureAccidentals[k];
                for (const k in outputMeasureAccidentals) delete outputMeasureAccidentals[k];
            }
            if (c === 'z' || c === 'Z' || c === 'x' || c === 'X' || c === 'r') {
                pendingTieAcc = null;
                pendingTiePitchKey = null;
            }

            if (c === '"') {
                const endQuote = line.indexOf('"', pos + 1);
                if (endQuote !== -1) {
                    const chord = line.substring(pos + 1, endQuote);
                    if (chord.startsWith("[") && chord.endsWith("]")) {
                        sb += '"' + chord + '"';
                    } else {
                        sb += '"' + this.transposeChord(chord, semitoneShift, newKeySF) + '"';
                    }
                    pos = endQuote + 1;
                    continue;
                }
            }

            if (c === '[') {
                const closeBracket = line.indexOf(']', pos + 1);
                if (closeBracket !== -1) {
                    const inside = line.substring(pos + 1, closeBracket).trim();
                    if (!LeadSheetParser.isLikelyChordString(inside)) {
                        // Section marker like [A], [Intro] or inline header or volta [1
                        sb += line.substring(pos, closeBracket + 1);
                        pos = closeBracket + 1;
                        continue;
                    }
                }
            }

            if (LeadSheetParser.isNoteStartChar(c)) {
                let noteStart = pos;
                let acc = "";
                while (pos < len && (line.charAt(pos) === '^' || line.charAt(pos) === '_' || line.charAt(pos) === '=')) {
                    acc += line.charAt(pos);
                    pos++;
                }
                if (pos < len && LeadSheetParser.isPitchChar(line.charAt(pos))) {
                    const pitchChar = line.charAt(pos);
                    pos++;
                    let octMod = 0;
                    while (pos < len && (line.charAt(pos) === ',' || line.charAt(pos) === '\'')) {
                        if (line.charAt(pos) === ',') octMod--;
                        else octMod++;
                        pos++;
                    }

                    let durStart = pos;
                    while (pos < len && (LeadSheetParser.isDurationChar(line.charAt(pos)) || line.charAt(pos) === '-')) {
                        pos++;
                    }
                    const durAndTie = line.substring(durStart, pos);

                    const pitchKey = pitchChar.toLowerCase() + ((pitchChar === pitchChar.toLowerCase() ? 5 : 4) + octMod);
                    let effectiveAcc = "";
                    if (acc) {
                        effectiveAcc = acc;
                        measureAccidentals[pitchKey] = effectiveAcc;
                    } else if (pendingTieAcc && pitchKey === pendingTiePitchKey) {
                        effectiveAcc = pendingTieAcc;
                    } else if (pitchKey in measureAccidentals) {
                        effectiveAcc = measureAccidentals[pitchKey];
                    }

                    if (durAndTie.includes("-")) {
                        pendingTieAcc = effectiveAcc;
                        pendingTiePitchKey = pitchKey;
                    } else {
                        pendingTieAcc = null;
                        pendingTiePitchKey = null;
                    }

                    const transposedNote = this.transposeNote(acc, effectiveAcc, pitchChar, octMod, semitoneShift, oldKeyAcc, newKeyAcc, newKeySF, outputMeasureAccidentals);
                    sb += transposedNote + durAndTie;
                    continue;
                } else {
                    pos = noteStart;
                }
            }

            sb += c;
            pos++;
        }
        return sb;
    }

    static transposeNote(explicitAcc, effectiveAcc, pitchChar, octaveMod, semitoneShift, oldKeyAcc, newKeyAcc, newKeySF, outputMeasureAccidentals) {
        const isLower = (pitchChar === pitchChar.toLowerCase());
        const baseLetter = pitchChar.toLowerCase();
        const diatonicIdx = "cdefgab".indexOf(baseLetter);
        if (diatonicIdx === -1) return pitchChar;

        const baseSemi = this.DIATONIC_SEMI[diatonicIdx];
        const octave = (isLower ? 5 : 4) + octaveMod;

        let accSemi = 0;
        if (effectiveAcc) {
            for (let i = 0; i < effectiveAcc.length; i++) {
                if (effectiveAcc.charAt(i) === '^') accSemi++;
                else if (effectiveAcc.charAt(i) === '_') accSemi--;
            }
        } else {
            const keyAcc = oldKeyAcc[baseLetter];
            if (keyAcc === "#") accSemi = 1;
            else if (keyAcc === "-") accSemi = -1;
        }

        const totalSemi = (octave * 12) + baseSemi + accSemi;
        const transposedTotalSemi = totalSemi + semitoneShift;

        const target = this.findTargetNote(transposedTotalSemi, newKeyAcc, newKeySF);
        const outPitchKey = target.letter + target.octave;

        const keyAcc = newKeyAcc[target.letter] || "";
        const currentAcc = (outPitchKey in outputMeasureAccidentals) ? outputMeasureAccidentals[outPitchKey] : keyAcc;

        let outPrefix = "";
        let needsExplicitAccidental = false;

        if (target.accidental !== currentAcc) {
            needsExplicitAccidental = true;
        } else if (explicitAcc === "=" && !target.accidental) {
            needsExplicitAccidental = true;
        } else if (explicitAcc === "^" && target.accidental === "#") {
            needsExplicitAccidental = true;
        } else if (explicitAcc === "_" && target.accidental === "-") {
            needsExplicitAccidental = true;
        }

        if (needsExplicitAccidental) {
            if (target.accidental === "#") outPrefix = "^";
            else if (target.accidental === "-") outPrefix = "_";
            else if (!target.accidental) outPrefix = "=";
            else if (target.accidental === "##") outPrefix = "^^";
            else if (target.accidental === "--") outPrefix = "__";
            outputMeasureAccidentals[outPitchKey] = target.accidental;
        }

        return this.formatAbcNote(outPrefix, target.letter, target.octave);
    }

    static findTargetNote(transposedTotalSemi, newKeyAcc, newKeySF) {
        const newPitchClass = ((transposedTotalSemi % 12) + 12) % 12;

        for (let i = 0; i < 7; i++) {
            const candidateLetter = this.DIATONIC_NAMES[i];
            const candidateSemi = this.DIATONIC_SEMI[i];
            const kAcc = newKeyAcc[candidateLetter];
            const kOffset = (kAcc === "#") ? 1 : ((kAcc === "-") ? -1 : 0);
            const expectedSemi = (candidateSemi + kOffset + 12) % 12;
            if (expectedSemi === newPitchClass) {
                const oct = Math.floor((transposedTotalSemi - candidateSemi - kOffset) / 12);
                return { letter: candidateLetter, octave: oct, accidental: kAcc || "" };
            }
        }

        for (let i = 0; i < 7; i++) {
            const candidateLetter = this.DIATONIC_NAMES[i];
            const candidateSemi = this.DIATONIC_SEMI[i];
            if (candidateSemi === newPitchClass && candidateLetter in newKeyAcc) {
                const oct = Math.floor((transposedTotalSemi - candidateSemi) / 12);
                return { letter: candidateLetter, octave: oct, accidental: "" };
            }
        }

        const preferSharp = newKeySF >= 0;
        if (preferSharp) {
            for (let i = 0; i < 7; i++) {
                const candidateLetter = this.DIATONIC_NAMES[i];
                if ((candidateLetter === 'b' || candidateLetter === 'e') && newKeySF < 6) continue;
                const candidateSemi = this.DIATONIC_SEMI[i];
                if ((candidateSemi + 1) % 12 === newPitchClass) {
                    const oct = Math.floor((transposedTotalSemi - candidateSemi - 1) / 12);
                    return { letter: candidateLetter, octave: oct, accidental: "#" };
                }
            }
        } else {
            for (let i = 0; i < 7; i++) {
                const candidateLetter = this.DIATONIC_NAMES[i];
                if ((candidateLetter === 'c' || candidateLetter === 'f') && newKeySF > -6) continue;
                const candidateSemi = this.DIATONIC_SEMI[i];
                if ((candidateSemi - 1 + 12) % 12 === newPitchClass) {
                    const oct = Math.floor((transposedTotalSemi - candidateSemi + 1) / 12);
                    return { letter: candidateLetter, octave: oct, accidental: "-" };
                }
            }
        }

        let bestIdx = 0;
        for (let i = 0; i < 7; i++) {
            if (this.DIATONIC_SEMI[i] <= newPitchClass) bestIdx = i;
        }
        const diff = newPitchClass - this.DIATONIC_SEMI[bestIdx];
        const fallbackAcc = diff > 0 ? "#" : (diff < 0 ? "-" : "");
        const fAccSemi = diff > 0 ? 1 : (diff < 0 ? -1 : 0);
        const oct = Math.floor((transposedTotalSemi - this.DIATONIC_SEMI[bestIdx] - fAccSemi) / 12);
        return { letter: this.DIATONIC_NAMES[bestIdx], octave: oct, accidental: fallbackAcc };
    }

    static formatAbcNote(acc, baseLetter, octave) {
        let res = acc;
        if (octave >= 5) {
            res += baseLetter.toLowerCase();
            for (let i = 5; i < octave; i++) res += "'";
        } else {
            res += baseLetter.toUpperCase();
            for (let i = octave; i < 4; i++) res += ",";
        }
        return res;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ABCConverter, AbcTransposer };
}
