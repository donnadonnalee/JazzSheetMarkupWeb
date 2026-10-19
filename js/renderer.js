/**
 * Lead Sheet Canvas Renderer
 * Direct, zero-dependency port of LeadSheetView.java
 * Renders professional jazz lead sheets with beams, ties, stacked jazz chords, and realtime playback highlights.
 */

class LeadSheetRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        this.sheetMusic = null;
        this.darkMode = false;

        // Balance & Layout settings
        this.viewBalanceLevel = 3; // 1: Chord Only, 2: Chord Focus, 3: Balanced, 4: Melody Focus, 5: Melody Max
        this.chordOnlyMode = false;
        this.lineSpacing = 22;
        this.noteRx = 7.8;
        this.noteRy = 5.0;
        this.staffHeight = this.lineSpacing * 4;
        this.MARGIN = 36;
        this.noteSizeScale = 1.0;

        // Transposition
        this.songTransposeOffset = 0;
        this.instrumentTransposeOffset = 0;
        this.transposeChordForInstrument = true;

        // Clef
        this.isBassClef = false;
        this.bassClefOctaveShift = 2;

        // Chord Notation options
        this.useHalfDimSymbol = true; // ø
        this.useMinusForMinor = true; // -
        this.majorNotationMode = 1;   // 1: △, 2: M, 0: Maj
        this.useCircleForDim = true;  // o
        this.usePlusForAug = false;   // +

        // Playback state
        this.currentPlaybackMeasure = null;
        this.playbackHighlightedElement = null;

        // Interaction / bounds
        this.elementBoundsList = [];
        this.autoFitScale = 1.0;

        // Sharp / Flat tables
        this.notesSharp = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];
        this.notesFlat = ["c", "db", "d", "eb", "e", "f", "gb", "g", "ab", "a", "bb", "b"];

        this.KEY_MAP = {
            "C": 0, "G": 1, "D": 2, "A": 3, "E": 4, "B": 5, "F#": 6, "C#": 7,
            "F": -1, "Bb": -2, "Eb": -3, "Ab": -4, "Db": -5, "Gb": -6, "Cb": -7,
            "Am": 0, "Em": 1, "Bm": 2, "F#m": 3, "C#m": 4, "G#m": 5, "D#m": 6,
            "Dm": -1, "Gm": -2, "Cm": -3, "Fm": -4, "Bbm": -5, "Ebm": -6
        };

        this.applyViewBalance();
    }

    setSheetMusic(sheetMusic) {
        this.sheetMusic = sheetMusic;
        this.render();
    }

    setDarkMode(darkMode) {
        this.darkMode = darkMode;
        this.render();
    }

    setViewBalance(level) {
        this.viewBalanceLevel = Math.max(1, Math.min(5, level));
        this.applyViewBalance();
        this.render();
    }

    applyViewBalance() {
        switch (this.viewBalanceLevel) {
            case 1: // Chord Only
                this.chordOnlyMode = true;
                this.baseLineSpacing = 16;
                this.chordScale = 1.85;
                this.noteScale = 0.7;
                break;
            case 2: // Chord Focus (Significantly larger chords for rhythm players)
                this.chordOnlyMode = false;
                this.baseLineSpacing = 9.8;
                this.chordScale = 1.80;
                this.noteScale = 0.85;
                break;
            case 3: // Balanced (Standard ABC / Lead Sheet)
                this.chordOnlyMode = false;
                this.baseLineSpacing = 11.5;
                this.chordScale = 1.15;
                this.noteScale = 1.0;
                break;
            case 4: // Melody Focus (Prominent melody with comfortably readable chords)
                this.chordOnlyMode = false;
                this.baseLineSpacing = 13.0;
                this.chordScale = 1.12;
                this.noteScale = 1.20;
                break;
            case 5: // Melody Max (Maximum melody size while preserving clear chord readability)
                this.chordOnlyMode = false;
                this.baseLineSpacing = 14.5;
                this.chordScale = 0.98;
                this.noteScale = 1.35;
                break;
        }
        this.staffHeight = (this.baseLineSpacing || 11.5) * 4;
    }

    setPlaybackMeasure(measure) {
        const target = (measure && measure.originalMeasure) ? measure.originalMeasure : measure;
        if (this.currentPlaybackMeasure !== target) {
            this.currentPlaybackMeasure = target;
            this.render();
        }
    }

    setPlaybackHighlightedElement(element) {
        if (this.playbackHighlightedElement !== element) {
            this.playbackHighlightedElement = element;
            this.render();
        }
    }

    getEffectiveNoteRx() {
        return this.noteRx * this.noteSizeScale;
    }

    getEffectiveNoteRy() {
        return this.noteRy * this.noteSizeScale;
    }

    getMelodyTransposeOffset() {
        return this.songTransposeOffset + this.instrumentTransposeOffset;
    }

    getChordTransposeOffset() {
        return this.songTransposeOffset + (this.transposeChordForInstrument ? this.instrumentTransposeOffset : 0);
    }

    getCurrentKeySharpsFlats() {
        if (!this.sheetMusic || !this.sheetMusic.key) return 0;
        let key = this.sheetMusic.key.trim();
        const isMinor = key.toLowerCase().endsWith("m");
        let baseKey = isMinor ? key.substring(0, key.length - 1) : key;
        baseKey = baseKey.substring(0, 1).toUpperCase() + (baseKey.length > 1 ? baseKey.substring(1).toLowerCase() : "");
        const lookupKey = baseKey + (isMinor ? "m" : "");
        const base = this.KEY_MAP[lookupKey];
        if (base === undefined) return 0;

        let transposedKeyVal = base + this.getMelodyTransposeOffset() * 7;
        while (transposedKeyVal > 6) transposedKeyVal -= 12;
        while (transposedKeyVal < -6) transposedKeyVal += 12;
        return transposedKeyVal;
    }

    getVisualDuration(note) {
        if (!note || note.tupletNumber <= 1) return note ? note.duration : 1.0;
        const n = note.tupletNumber;
        let m = 1;
        while ((m << 1) < n) m <<= 1;
        return note.duration * n / m;
    }

    getMeterBaseDuration() {
        if (this.sheetMusic && this.sheetMusic.meter) {
            const parts = this.sheetMusic.meter.split("/");
            if (parts.length === 2) {
                const num = parseFloat(parts[0].trim());
                const den = parseFloat(parts[1].trim());
                if (num > 0 && den > 0) {
                    return num * (4.0 / den);
                }
            }
        }
        return 4.0;
    }

    isPickupMeasure(measureIndex) {
        if (!this.sheetMusic || !this.sheetMusic.measures || this.sheetMusic.measures.length < 2) return false;
        if (measureIndex !== 0) return false;
        const m0 = this.sheetMusic.measures[0];
        const meterDur = this.getMeterBaseDuration();
        return m0.totalDuration < (meterDur - 0.1);
    }

    noteHasAccidental(n) {
        if (!n) return false;
        if (n.accidental) return true;
        if (n.pitch && (n.pitch.includes("#") || n.pitch.includes("-") || n.pitch.includes("^") || n.pitch.includes("_"))) return true;
        return false;
    }

    getMeasureMinRequiredWidth(m, keySF) {
        if (!m) return 90;
        if (this.chordOnlyMode) {
            const chordPad = (m.repeatStart ? 28 : 10) + (m.repeatEnd ? 24 : 6);
            return chordPad + Math.max(1, m.chords.length) * 50;
        }

        let pad = (m.repeatStart ? 36 : 18) + (m.repeatEnd ? 24 : 10);
        let noteCount = 0;
        let accCount = 0;
        for (const n of m.notes) {
            if (n.duration > 0) {
                noteCount++;
                if (this.noteHasAccidental(n)) accCount++;
            }
        }

        if (noteCount === 0) {
            const chordMin = pad + Math.max(0, m.chords.length) * 44;
            return Math.max(chordMin, 85);
        }

        let firstNoteAcc = false;
        if (m.notes.length > 0 && this.noteHasAccidental(m.notes[0])) {
            pad += 13;
            firstNoteAcc = true;
        }

        let noteSpace = 0;
        if (noteCount > 1) {
            const subsequentAccCount = firstNoteAcc ? Math.max(0, accCount - 1) : accCount;
            const nonAccCount = Math.max(0, (noteCount - 1) - subsequentAccCount);
            noteSpace = (subsequentAccCount * 25) + (nonAccCount * 14);
        } else {
            noteSpace = 22;
        }

        const chordsMin = pad + m.chords.length * 42;
        const minW = pad + noteSpace;
        return Math.max(minW, chordsMin);
    }

    computeLineSpans(measures, availableWidth, currentKeySF) {
        const spans = [];
        if (!measures || measures.length === 0) return spans;

        const hasPickup = this.isPickupMeasure(0);
        let i = 0;
        if (hasPickup) {
            spans.push({ start: 0, end: 1, count: () => 1 });
            i = 1;
        }

        while (i < measures.length) {
            const len = measures.length;
            const blockStart = i;
            let blockEnd = blockStart + 1;

            while (blockEnd < len && (blockEnd - blockStart) < 4) {
                const nextM = measures[blockEnd];
                if (nextM.isNewLine || (blockEnd === 1 && hasPickup)) {
                    break;
                }
                blockEnd++;
            }

            // Smart Orphan Prevention:
            // If taking 4 measures would leave a lonely orphaned single measure before newline or song end,
            // check if 5 measures can fit on this line (e.g. 1st/2nd endings), or balance into 3 + 2.
            const naturalRunEnd = blockEnd;
            if ((blockEnd - blockStart) === 4 && blockEnd < len) {
                const nextM = measures[blockEnd];
                const afterNextM = (blockEnd + 1 < len) ? measures[blockEnd + 1] : null;
                const leavesOrphan = (!nextM.isNewLine && (!afterNextM || afterNextM.isNewLine));

                if (leavesOrphan) {
                    const firstM = measures[blockStart];
                    const repeatStartW = firstM.repeatStart ? 32 : 0;
                    const keySigW = this.chordOnlyMode ? 0 : this.getKeySignatureWidth(currentKeySF);
                    const totalLineWidth = availableWidth - repeatStartW - keySigW;

                    let sum5MinW = 0;
                    for (let k = blockStart; k <= blockEnd; k++) {
                        sum5MinW += this.getMeasureMinRequiredWidth(measures[k], currentKeySF);
                    }

                    if (sum5MinW <= totalLineWidth) {
                        // All 5 measures fit comfortably on one line
                        blockEnd = blockEnd + 1;
                    } else {
                        // Balance evenly into 3 + 2
                        blockEnd = blockStart + 3;
                    }
                }
            }

            const blockSize = blockEnd - blockStart;
            const firstM = measures[blockStart];
            if (!firstM) break;
            const repeatStartW = firstM.repeatStart ? 32 : 0;
            const keySigW = this.chordOnlyMode ? 0 : this.getKeySignatureWidth(currentKeySF);
            const totalLineWidth = availableWidth - repeatStartW - keySigW;

            let sumMinW = 0;
            for (let k = blockStart; k < blockEnd; k++) {
                sumMinW += this.getMeasureMinRequiredWidth(measures[k], currentKeySF);
            }

            // Keep 4 measures on 1 line unless width is extremely narrow (< 420px)
            const minAllowedWidthFor4 = 420;
            if (sumMinW <= totalLineWidth || (blockSize === 4 && totalLineWidth >= minAllowedWidthFor4) || blockSize <= 1) {
                spans.push({ start: blockStart, end: blockEnd, count: () => blockEnd - blockStart });
            } else {
                if (blockSize === 4) {
                    spans.push({ start: blockStart, end: blockStart + 2, count: () => 2 });
                    spans.push({ start: blockStart + 2, end: blockEnd, count: () => 2 });
                } else if (blockSize === 3) {
                    spans.push({ start: blockStart, end: blockStart + 2, count: () => 2 });
                    spans.push({ start: blockStart + 2, end: blockEnd, count: () => 1 });
                } else if (blockSize === 2) {
                    spans.push({ start: blockStart, end: blockStart + 1, count: () => 1 });
                    spans.push({ start: blockStart + 1, end: blockEnd, count: () => 1 });
                }
            }
            i = blockEnd;
        }

        return spans;
    }

    getKeySignatureWidth(sf) {
        const count = Math.abs(sf);
        if (count === 0) return 0;
        return 6 + (count * 12.5) + 8;
    }

    render() {
        const canvas = this.canvas;
        const ctx = this.ctx;
        if (!canvas || !ctx) return;

        const container = canvas.parentElement;
        const containerWidth = container ? container.clientWidth : 800;
        const containerHeight = container ? container.clientHeight : 600;

        // Display width: Standard Lead Sheet Width
        // Allow expanding smoothly with window/container width up to 1350px for widescreen comfort
        const maxSheetWidth = 1350;
        const displayWidth = Math.min(maxSheetWidth, Math.max(380, containerWidth - 32));
        const dpr = window.devicePixelRatio || 1;

        const measures = this.sheetMusic ? this.sheetMusic.measures : [];
        const currentKeySF = this.getCurrentKeySharpsFlats();
        const availableWidth = Math.max(200, displayWidth - (2 * this.MARGIN));

        const lineSpans = this.computeLineSpans(measures, availableWidth, currentKeySF);
        const lineCount = Math.max(1, lineSpans.length);

        // Header and margins: Generous top margin and prominent Real Book style title
        const isZenMode = typeof document !== 'undefined' && document.body && document.body.classList.contains("zen-mode");
        const isDense = lineCount >= 9;
        const isSemiDense = lineCount >= 6 && lineCount < 9;

        // Elegant, prominent Real Book title font size and vertical position
        const titleFontSize = isDense ? 25 : (isSemiDense ? 29 : 34);
        const titleY = isDense ? 36 : (isSemiDense ? 42 : 48);
        const bottomSafetyMargin = isZenMode ? 72 : 36;

        // Auto-refresh canvas as soon as Caveat font finishes downloading from Google Fonts
        if (typeof document !== 'undefined' && document.fonts && document.fonts.check && !this._caveatLoaded) {
            if (!document.fonts.check(`600 ${titleFontSize}px "Caveat"`)) {
                document.fonts.load(`600 ${titleFontSize}px "Caveat"`).then(() => {
                    this._caveatLoaded = true;
                    this.render();
                }).catch(() => {});
            } else {
                this._caveatLoaded = true;
            }
        }

        // Generous header clearance so Title, Subtitle, Composer, and Tempo/Meter
        // NEVER collide with Line 1 stacked chords, section boxes [A], or volta brackets
        const roughHeaderH = isDense ? 78 : (isSemiDense ? 88 : 100);

        const availableH = Math.max(120, containerHeight - roughHeaderH - bottomSafetyMargin);
        const fitStepY = lineCount > 1 ? (availableH / (lineCount - 0.1)) : availableH;

        // ViewBalance-driven proportional sizing with pristine readability limits (like standard ABC editors)
        const targetBaseSpacing = this.baseLineSpacing || 11.2;
        let baseStepY;

        if (this.chordOnlyMode) {
            baseStepY = Math.max(48, Math.min(fitStepY, 85));
            this.lineSpacing = 14;
            this.staffHeight = 56;
            this.chordFontSize = Math.round(Math.max(24, Math.min(50, baseStepY * 0.46 * (this.chordScale || 1.8))));
        } else {
            // Guarantee minimum natural staff height so lines and note heads never degrade into thin unrecognizable artifacts
            const minAllowedStepY = Math.max(70, targetBaseSpacing * 6.4);
            if (fitStepY >= minAllowedStepY) {
                // Fits gracefully inside one screen
                baseStepY = Math.min(fitStepY, 135);
            } else {
                // Maintain high readability with smooth scrolling when dense
                baseStepY = minAllowedStepY;
            }

            // Staff occupies ~38% of line step, leaving ample space for stacked chords, volta brackets, and ledger lines
            const baseStaffH = baseStepY * 0.38;
            this.lineSpacing = Math.max(9.5, Math.min(15.5, (baseStaffH / 4) * (targetBaseSpacing / 11.2)));
            this.staffHeight = this.lineSpacing * 4;
            this.noteRx = Math.max(4.6, this.lineSpacing * 0.52 * (this.noteScale || 1.0));
            this.noteRy = Math.max(3.0, this.lineSpacing * 0.36 * (this.noteScale || 1.0));
            const maxChordLimit = (this.chordScale || 1.0) >= 1.5 ? 45 : 34;
            this.chordFontSize = Math.round(Math.max(18, Math.min(maxChordLimit, this.lineSpacing * 1.62 * (this.chordScale || 1.0))));
        }

        // Exact startY ensuring line 1 chords (even with high notes & chord lift), section labels, and brackets never collide with title
        const titleBottom = titleY + (titleFontSize * 0.55);
        const maxLine1Clearance = this.chordOnlyMode ? 25 : (Math.max(28, this.lineSpacing * 2.2) + 38);
        const startY = Math.max(roughHeaderH, Math.round(titleBottom + maxLine1Clearance));

        // Required display height: fits container, or expands cleanly if lines require minimum readability height
        const neededHeight = Math.ceil(startY + lineCount * baseStepY + bottomSafetyMargin);
        const displayHeight = Math.max(containerHeight - (isZenMode ? 72 : 12), neededHeight);

        // Native 1:1 HiDPI Canvas backing buffer (Zero CSS blur)
        canvas.width = Math.round(displayWidth * dpr);
        canvas.height = Math.round(displayHeight * dpr);

        canvas.style.width = `${displayWidth}px`;
        canvas.style.height = `${displayHeight}px`;

        ctx.save();
        ctx.scale(dpr, dpr);

        // High contrast crisp background & lines
        const bgColor = this.darkMode ? "#121212" : "#ffffff";
        const primaryColor = this.darkMode ? "#ffffff" : "#111111";
        const secondaryColor = this.darkMode ? "#cccccc" : "#222222";

        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, displayWidth, displayHeight);

        this.elementBoundsList = [];

        if (!this.sheetMusic) {
            ctx.restore();
            return;
        }

        // 1. Draw Title (Scales gracefully when dense)
        const titleX = displayWidth / 2;
        ctx.textAlign = "center";
        ctx.fillStyle = primaryColor;
        ctx.font = `600 ${titleFontSize}px "Caveat", "Segoe UI", sans-serif`;
        const titleText = this.sheetMusic.title || "Untitled Lead Sheet";
        ctx.fillText(titleText, titleX, titleY);

        // 2. Draw Top-Left Meta (Tempo / Meter / Rhythm)
        let metaText = "";
        let bpm = 0;
        if (this.sheetMusic.tempo) {
            const rawTempo = String(this.sheetMusic.tempo).trim();
            const eqMatch = rawTempo.match(/=\s*(\d+)/);
            if (eqMatch) {
                bpm = parseInt(eqMatch[1], 10);
            } else {
                const numMatch = rawTempo.match(/\b(\d{2,3})\b/);
                if (numMatch) {
                    bpm = parseInt(numMatch[1], 10);
                } else {
                    const anyDigits = rawTempo.match(/\d+/g);
                    if (anyDigits && anyDigits.length > 0) {
                        bpm = parseInt(anyDigits[anyDigits.length - 1], 10);
                    }
                }
            }
        }
        if (bpm > 0) {
            metaText = this.getMetronomePrefix(this.sheetMusic) + bpm;
            if (this.sheetMusic.meter && this.sheetMusic.meter.trim() !== "4/4") {
                metaText += "  " + this.sheetMusic.meter.trim();
            }
        } else if (this.sheetMusic.meter && this.sheetMusic.meter.trim() !== "4/4") {
            metaText = this.sheetMusic.meter.trim();
        } else if (this.sheetMusic.tempo) {
            metaText = this.sheetMusic.tempo.trim();
        }
        if (this.sheetMusic.rhythm) {
            metaText = (metaText + " " + this.sheetMusic.rhythm.trim()).trim();
        }

        ctx.textAlign = "left";
        ctx.font = `600 ${isDense ? 12 : 13}px "Inter", sans-serif`;
        ctx.fillStyle = primaryColor;
        let currentMetaX = this.MARGIN;
        const metaY = titleY - 6;

        if (this.isBassClef) {
            metaText = metaText ? "[Bass Clef]  " + metaText : "[Bass Clef]";
        }
        if (metaText) {
            ctx.fillText(metaText, currentMetaX, metaY);
        }

        // 3. Draw Top-Right Meta (Composer / Subtitle)
        const topRightX = displayWidth - this.MARGIN;
        ctx.textAlign = "right";
        if (this.sheetMusic.subTitle) {
            ctx.font = `bold ${isDense ? 12 : 13}px "Inter", sans-serif`;
            ctx.fillStyle = this.darkMode ? "#b0bec5" : "#455a64";
            ctx.fillText(this.sheetMusic.subTitle, topRightX, titleY - 14);
        }
        if (this.sheetMusic.composer) {
            ctx.font = `600 ${isDense ? 12 : 13}px "Inter", sans-serif`;
            ctx.fillStyle = primaryColor;
            const compY = this.sheetMusic.subTitle ? (titleY + 6) : (titleY - 6);
            ctx.fillText(this.sheetMusic.composer, topRightX, compY);
        }

        // 4. Render Measures by Line
        const allNotePositions = new Map();
        let renderLineIdx = 0;

        for (const span of lineSpans) {
            const currentY = startY + renderLineIdx * baseStepY;
            const lineStartIdx = span.start;
            const lineEndIdx = span.end;
            if (lineStartIdx >= measures.length) continue;
            const firstMeasure = measures[lineStartIdx];
            if (!firstMeasure) continue;

            const repeatStartW = firstMeasure.repeatStart ? 32 : 0;
            const keySigW = this.chordOnlyMode ? 0 : this.getKeySignatureWidth(currentKeySF);
            let currentX = this.MARGIN;

            const barHeight = this.chordOnlyMode ? 60 : this.staffHeight;
            const topY = this.chordOnlyMode ? (currentY - 30) : currentY;
            const botY = topY + barHeight;

            if (firstMeasure.repeatStart) {
                // 段の左端の開始小節線としてリピート開始記号 (||:) を描画
                ctx.strokeStyle = primaryColor;
                ctx.lineWidth = 4.5;
                ctx.beginPath();
                ctx.moveTo(this.MARGIN + 2, topY);
                ctx.lineTo(this.MARGIN + 2, botY);
                ctx.stroke();

                ctx.strokeStyle = primaryColor;
                ctx.lineWidth = 1.4;
                ctx.beginPath();
                ctx.moveTo(this.MARGIN + 14, topY);
                ctx.lineTo(this.MARGIN + 14, botY);
                ctx.stroke();

                ctx.fillStyle = primaryColor;
                const dot1Y = this.chordOnlyMode ? (currentY - 15) : (currentY + this.lineSpacing * 1.5);
                const dot2Y = this.chordOnlyMode ? (currentY + 15) : (currentY + this.lineSpacing * 2.5);
                const dotR = Math.max(1.8, Math.min(2.4, this.lineSpacing * 0.18));
                ctx.beginPath();
                ctx.arc(this.MARGIN + 22, dot1Y, dotR, 0, Math.PI * 2);
                ctx.arc(this.MARGIN + 22, dot2Y, dotR, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // 段の左端の通常開始小節線
                ctx.strokeStyle = secondaryColor;
                ctx.lineWidth = 1.1;
                ctx.beginPath();
                ctx.moveTo(this.MARGIN, topY);
                ctx.lineTo(this.MARGIN, botY);
                ctx.stroke();
            }

            currentX += repeatStartW;

            // Draw Key Signature at line start & extend staff seamlessly
            if (!this.chordOnlyMode) {
                ctx.strokeStyle = primaryColor;
                ctx.lineWidth = 1.05;
                for (let lineIdx = 0; lineIdx < 5; lineIdx++) {
                    const ly = currentY + lineIdx * this.lineSpacing;
                    ctx.beginPath();
                    ctx.moveTo(this.MARGIN, ly);
                    ctx.lineTo(this.MARGIN + repeatStartW + keySigW, ly);
                    ctx.stroke();
                }

                if (keySigW > 0) {
                    this.drawKeySignature(ctx, currentKeySF, currentX, currentY);
                    currentX += keySigW;
                }
            }

            const lineContentWidth = displayWidth - this.MARGIN - currentX;
            let totalComplexity = 0;
            for (let k = lineStartIdx; k < lineEndIdx; k++) {
                totalComplexity += this.getMeasureComplexityWeight(measures[k], this.isPickupMeasure(k));
            }
            if (totalComplexity <= 0) totalComplexity = 1.0;

            const measureCountInSpan = lineEndIdx - lineStartIdx;
            const refMeasureWidth = lineContentWidth / 4;

            for (let k = lineStartIdx; k < lineEndIdx; k++) {
                const m = measures[k];
                const weight = this.getMeasureComplexityWeight(m, this.isPickupMeasure(k));
                let mWidth = (weight / totalComplexity) * lineContentWidth;

                // Prevent isolated 1-measure or 2-measure lines from stretching across the entire sheet
                if (measureCountInSpan === 1) {
                    mWidth = Math.min(mWidth, Math.max(180, refMeasureWidth * 1.32));
                } else if (measureCountInSpan === 2) {
                    mWidth = Math.min(mWidth, Math.max(200, refMeasureWidth * 1.36));
                }

                const isLineStart = (k === lineStartIdx);
                const isLastInSong = (k === measures.length - 1);
                this.drawMeasure(ctx, m, currentX, currentY, mWidth, k, isLastInSong, currentKeySF, allNotePositions, isLineStart);
                currentX += mWidth;
            }

            // Draw staff line extension if measures do not fill full width (e.g. 1-measure lines or pickup)
            if (currentX < (displayWidth - this.MARGIN)) {
                if (!this.chordOnlyMode) {
                    ctx.strokeStyle = primaryColor;
                    ctx.lineWidth = 1.05;
                    for (let l = 0; l < 5; l++) {
                        const ly = currentY + l * this.lineSpacing;
                        ctx.beginPath();
                        ctx.moveTo(currentX, ly);
                        ctx.lineTo(displayWidth - this.MARGIN, ly);
                        ctx.stroke();
                    }
                }
            }

            renderLineIdx++;
        }

        // 5. Draw Ties across measures and lines
        if (!this.chordOnlyMode) {
            this.drawTies(ctx, allNotePositions);
        }

        ctx.restore();
    }

    getMeasureComplexityWeight(m, isPickup) {
        if (isPickup) {
            const barDur = this.getMeterBaseDuration();
            const ratio = Math.min(1.0, Math.max(0.15, m.totalDuration / barDur));
            return 0.35 * ratio + 0.10;
        }
        if (this.chordOnlyMode) return 1.0;

        let noteCount = 0;
        let accCount = 0;
        for (const n of m.notes) {
            if (n.duration > 0) {
                noteCount++;
                if (this.noteHasAccidental(n)) accCount++;
            }
        }
        const weight = 0.60 + (noteCount * 0.08) + (accCount * 0.12);
        return Math.max(0.70, Math.min(1.85, weight));
    }

    drawMeasure(ctx, measure, x, y, width, index, isLast, keySF, allNotePositions, isLineStart) {
        const barHeight = this.chordOnlyMode ? 60 : this.staffHeight;
        const topY = this.chordOnlyMode ? (y - 30) : y;
        const primaryColor = this.darkMode ? "#ffffff" : "#111111";
        const secondaryColor = this.darkMode ? "#888888" : "#222222";

        // Record measure bounds
        const measureBounds = { left: x, top: topY - 80, right: x + width, bottom: topY + barHeight + 60 };
        this.elementBoundsList.push({ bounds: measureBounds, type: 'MEASURE', element: measure });

        // Playback measure highlight
        const targetMeasure = (measure && measure.originalMeasure) ? measure.originalMeasure : measure;
        if (this.currentPlaybackMeasure && (targetMeasure === this.currentPlaybackMeasure || measure === this.currentPlaybackMeasure)) {
            ctx.save();
            ctx.fillStyle = this.darkMode ? "rgba(56, 142, 60, 0.25)" : "rgba(76, 175, 80, 0.18)";
            ctx.strokeStyle = this.darkMode ? "#81c784" : "#388e3c";
            ctx.lineWidth = 2.5;

            const padX = 1.5;
            const topHighlight = topY - 35;
            const botHighlight = topY + barHeight + 35;
            this.roundRect(ctx, x + padX, topHighlight, width - padX * 2, botHighlight - topHighlight, 8);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }

        // Lift chord if high notes present (Ledger lines / high melody notes)
        let chordLift = 0;
        const defaultChordBaseY = y - Math.max(16, this.lineSpacing * ((this.chordScale || 1.0) > 1.4 ? 1.9 : 1.5));
        if (!this.chordOnlyMode) {
            const effRy = this.getEffectiveNoteRy();
            let minNoteY = y;
            for (const n of measure.notes) {
                if (!n.isRest && n.duration > 0) {
                    const p = this.getTransposedPitch(n, keySF);
                    const ny = this.calculateTransposedNoteY(p, y);
                    const noteTop = ny - effRy;
                    const stemUp = ny > (y + 2 * this.lineSpacing);
                    const stemTop = stemUp ? (ny - this.lineSpacing * 2.5) : ny;
                    const top = Math.min(noteTop, stemTop);
                    if (top < minNoteY) minNoteY = top;
                }
            }
            // Clearance above highest note head, stem, or ledger line
            const safeChordY = minNoteY - Math.max(8, this.lineSpacing * 0.7);
            if (safeChordY < defaultChordBaseY) {
                // Lift chord up to 55px (allowing high notes and multiple ledger lines without collision)
                chordLift = Math.min(55, defaultChordBaseY - safeChordY);
            }
        }

        // Volta bracket (Proportional to staff spacing)
        if (measure.voltaNumber > 0) {
            const voltaY = this.chordOnlyMode ? (y - this.lineSpacing * 1.8) : (y - this.lineSpacing * 2.4 - chordLift);
            const isVoltaStart = (index === 0 || isLineStart || measure.isNewLine || (this.sheetMusic.measures[index - 1] && this.sheetMusic.measures[index - 1].voltaNumber !== measure.voltaNumber));
            const startLineX = isVoltaStart ? x : (x - 2);
            const hookH = Math.max(8, this.lineSpacing * 0.9);

            ctx.save();
            ctx.strokeStyle = primaryColor;
            ctx.lineWidth = Math.max(1.2, this.lineSpacing * 0.16);
            ctx.beginPath();
            ctx.moveTo(startLineX, voltaY);
            ctx.lineTo(x + width, voltaY);
            if (isVoltaStart) {
                ctx.moveTo(startLineX, voltaY);
                ctx.lineTo(startLineX, voltaY + hookH);
            }
            if (measure.repeatEnd) {
                ctx.moveTo(x + width, voltaY);
                ctx.lineTo(x + width, voltaY + hookH);
            }
            ctx.stroke();

            if (isVoltaStart) {
                const voltaFontSize = Math.max(9, Math.min(14, this.lineSpacing * 1.1));
                ctx.font = `bold ${voltaFontSize}px "Inter", sans-serif`;
                ctx.fillStyle = primaryColor;
                ctx.textAlign = "left";
                ctx.fillText(measure.voltaNumber + ".", startLineX + 4, voltaY + voltaFontSize);
            }
            ctx.restore();
        }

        // Section label [A], [B], etc. (Proportional and compact)
        if (measure.sectionLabel) {
            ctx.save();
            const sx = x - 2;
            const sectionFontSize = Math.max(10, Math.min(16, this.lineSpacing * 1.25));
            const boxH = sectionFontSize * 1.4;
            let sy = this.chordOnlyMode ? (y - this.lineSpacing * 1.6) : (y - this.lineSpacing * 1.6 - chordLift);
            if (measure.voltaNumber > 0) sy -= (this.lineSpacing * 1.2);

            ctx.font = `bold ${sectionFontSize}px "Inter", sans-serif`;
            ctx.textAlign = "center";
            const textWidth = ctx.measureText(measure.sectionLabel).width;
            ctx.strokeStyle = primaryColor;
            ctx.lineWidth = Math.max(1.2, this.lineSpacing * 0.18);
            ctx.strokeRect(sx - 6, sy - boxH * 0.75, textWidth + 12, boxH);

            ctx.fillStyle = primaryColor;
            ctx.fillText(measure.sectionLabel, sx + textWidth / 2, sy);
            ctx.restore();
        }

        // 5 Staff lines
        if (!this.chordOnlyMode) {
            ctx.strokeStyle = primaryColor;
            ctx.lineWidth = Math.max(1.0, Math.min(1.3, this.lineSpacing * 0.14));
            for (let i = 0; i < 5; i++) {
                const ly = y + i * this.lineSpacing;
                ctx.beginPath();
                ctx.moveTo(x, ly);
                ctx.lineTo(x + width, ly);
                ctx.stroke();
            }
        }

        // Draw Barlines
        this.drawBarLines(ctx, measure, x, y, width, isLast, isLineStart);

        // Draw Chords
        const numChords = measure.chords.length;
        let leftPad = (measure.repeatStart && !isLineStart ? (this.chordOnlyMode ? 35 : 25) : 12);
        if (measure.voltaNumber > 0) leftPad += (this.chordOnlyMode ? 20 : 10);
        if (measure.sectionLabel) leftPad += (this.chordOnlyMode ? 35 : 25);
        const rightPad = (measure.repeatEnd ? (this.chordOnlyMode ? 35 : 25) : 8);

        const availableWidthForChords = width - leftPad - rightPad;
        const slotWidth = availableWidthForChords / Math.max(1, numChords);
        const maxAllowedWidth = Math.max(15, slotWidth - 6);
        const baseChordSize = this.chordFontSize;

        for (let i = 0; i < numChords; i++) {
            const cc = measure.chords[i];
            const cx = x + leftPad + (i * slotWidth);
            const cy = this.chordOnlyMode ? (y + 15) : (defaultChordBaseY - chordLift);

            const transposedChord = this.getTransposedChord(cc.chord, keySF);
            const parsed = this.parseChord(transposedChord);

            const naturalWidth = this.measureChordWidth(ctx, parsed, baseChordSize);
            let effectiveSize = baseChordSize;
            if (naturalWidth > maxAllowedWidth && maxAllowedWidth > 20) {
                const shrinkScale = Math.max(0.78, maxAllowedWidth / naturalWidth);
                effectiveSize = Math.max(16, Math.round(baseChordSize * shrinkScale));
            }

            const isHigh = (this.playbackHighlightedElement === cc);
            const renderedWidth = this.drawComplexChord(ctx, parsed, cx, cy, effectiveSize, isHigh);

            const chordBounds = { left: cx - 8, top: cy - effectiveSize * 1.1, right: cx + renderedWidth + 8, bottom: cy + effectiveSize * 0.35 };
            this.elementBoundsList.push({ bounds: chordBounds, type: 'CHORD', element: cc });
        }

        // Draw Notes & Beams
        if (!this.chordOnlyMode) {
            const tempAccState = {};
            const keyAccidentals = this.getKeyAccidentals(keySF);
            const displayAccs = new Array(measure.notes.length);

            for (let k = 0; k < measure.notes.length; k++) {
                const n = measure.notes[k];
                displayAccs[k] = "";
                if (!n.isRest && n.duration > 0) {
                    const pInfo = this.getTransposedPitch(n, keySF);
                    const pKey = pInfo.octave * 7 + pInfo.step;
                    const cur = (pKey in tempAccState) ? tempAccState[pKey] : keyAccidentals[pInfo.step];
                    if (pInfo.accidental !== cur) {
                        if (!n.isTieEnd) {
                            displayAccs[k] = (pInfo.accidental === -1) ? "-" : (pInfo.accidental === 1) ? "#" : "n";
                            tempAccState[pKey] = pInfo.accidental;
                        }
                    }
                }
            }

            const isPickup = this.isPickupMeasure(index);
            let noteLeftPad = isPickup ? 12 : (measure.repeatStart && !isLineStart ? 38 : 22);
            if (measure.notes.length > 0 && displayAccs[0]) {
                noteLeftPad += 13;
            }
            const noteRightPad = measure.repeatEnd ? 24 : 10;
            const usableWidth = width - noteLeftPad - noteRightPad;
            let currentNoteX = x + noteLeftPad;

            let totalWeight = 0;
            const noteWeights = new Array(measure.notes.length);
            for (let k = 0; k < measure.notes.length; k++) {
                const n = measure.notes[k];
                if (n.duration <= 0) continue;
                let w = Math.pow(Math.max(0.15, n.duration), 0.58);
                if (k + 1 < measure.notes.length && displayAccs[k + 1]) {
                    w += 0.35;
                }
                noteWeights[k] = w;
                totalWeight += w;
            }
            if (totalWeight <= 0) totalWeight = 1.0;

            const effRx = this.getEffectiveNoteRx();
            const idealSteps = new Array(measure.notes.length);
            let sumIdealSteps = 0;
            let lastValidNoteIdx = -1;

            for (let k = 0; k < measure.notes.length; k++) {
                const n = measure.notes[k];
                if (n.duration <= 0) continue;
                lastValidNoteIdx = k;
                let minStep = 14;
                if (k + 1 < measure.notes.length && displayAccs[k + 1]) {
                    minStep = Math.max(25, effRx + 17);
                }
                const step = (noteWeights[k] / totalWeight) * usableWidth;
                idealSteps[k] = Math.max(minStep, step);
            }
            for (let k = 0; k < lastValidNoteIdx; k++) {
                if (measure.notes[k].duration > 0) {
                    sumIdealSteps += idealSteps[k];
                }
            }
            const stepScale = (sumIdealSteps > usableWidth && sumIdealSteps > 0) ? (usableWidth / sumIdealSteps) : 1.0;

            const infoList = [];
            for (let k = 0; k < measure.notes.length; k++) {
                const note = measure.notes[k];
                if (note.duration === 0) continue;
                const info = {
                    note,
                    x: currentNoteX,
                    isRest: note.isRest,
                    displayAcc: displayAccs[k],
                    staffTopY: y,
                    measureLeftX: x,
                    measureRightX: x + width
                };

                if (!note.isRest) {
                    const pitchInfo = this.getTransposedPitch(note, keySF);
                    info.y = this.calculateTransposedNoteY(pitchInfo, y);

                    const stemUp = info.y > (y + 2 * this.lineSpacing);
                    const stemHeight = this.lineSpacing * 2.5;
                    info.stemTopY = stemUp ? (info.y - stemHeight) : (info.y + stemHeight);
                    if (stemUp && info.stemTopY < y - 6) info.stemTopY = y - 6;
                    if (!stemUp && info.stemTopY > y + this.staffHeight + 8) info.stemTopY = y + this.staffHeight + 8;
                    info.stemUp = stemUp;

                    if (allNotePositions) allNotePositions.set(note, info);

                    const leftMargin = info.displayAcc ? 40 : 15;
                    const noteBounds = {
                        left: info.x - leftMargin,
                        top: Math.min(info.y, info.stemTopY) - 15,
                        right: info.x + 15,
                        bottom: Math.max(info.y, info.stemTopY) + 15
                    };
                    this.elementBoundsList.push({ bounds: noteBounds, type: 'NOTE', element: note });
                } else {
                    const restBounds = { left: info.x - 20, top: y, right: info.x + 20, bottom: y + this.staffHeight };
                    this.elementBoundsList.push({ bounds: restBounds, type: 'NOTE', element: note });
                }

                infoList.push(info);
                if (k < lastValidNoteIdx) {
                    currentNoteX += idealSteps[k] * stepScale;
                }
            }

            // Beaming logic
            const isBeamed = new Array(infoList.length).fill(false);
            for (let i = 0; i < infoList.length; i++) {
                if (isBeamed[i]) continue;
                const info = infoList[i];
                let wasBeamed = false;

                if (!info.isRest && this.getVisualDuration(info.note) < 0.99) {
                    let notePos = 0;
                    for (let k = 0; k < i; k++) notePos += measure.notes[k].duration;

                    let beamEnd = i;
                    let beamDur = 0;
                    const firstStemUp = info.stemTopY < info.y;
                    const firstTuplet = info.note.tupletNumber;

                    let beatUnit = 1.0;
                    if (this.sheetMusic && this.sheetMusic.meter) {
                        const parts = this.sheetMusic.meter.trim().split("/");
                        if (parts.length === 2 && parseInt(parts[1].trim(), 10) === 8) {
                            beatUnit = 1.5;
                        }
                    }

                    for (let j = i + 1; j < infoList.length; j++) {
                        const n = infoList[j];
                        if (n.isRest || this.getVisualDuration(n.note) >= 0.99) break;

                        beamDur += measure.notes[j - 1].duration;
                        if (firstTuplet > 0) {
                            if (n.note.tupletNumber !== firstTuplet) break;
                            if (beamDur >= 0.99) break;
                        } else {
                            const posMod = (notePos + beamDur) % beatUnit;
                            if (beamDur >= beatUnit - 0.01 || posMod < 0.05 || posMod > (beatUnit - 0.05)) {
                                break;
                            }
                        }
                        beamEnd = j;
                    }

                    if (beamEnd > i) {
                        const off = firstStemUp ? (effRx * 0.82) : (-effRx * 0.82);
                        const stemHeight = this.lineSpacing * 2.5;
                        let beamEndY = firstStemUp ? (infoList[beamEnd].y - stemHeight) : (infoList[beamEnd].y + stemHeight);
                        if (firstStemUp && beamEndY < y - 6) beamEndY = y - 6;
                        if (!firstStemUp && beamEndY > y + this.staffHeight + 8) beamEndY = y + this.staffHeight + 8;

                        ctx.save();
                        ctx.strokeStyle = primaryColor;
                        ctx.lineWidth = Math.max(2.5, Math.min(4.5, this.lineSpacing * 0.38));
                        ctx.beginPath();
                        ctx.moveTo(info.x + off, info.stemTopY);
                        ctx.lineTo(infoList[beamEnd].x + off, beamEndY);
                        ctx.stroke();

                        const beam1StartX = info.x + off;
                        const beam1StartY = info.stemTopY;
                        const beam1EndX = infoList[beamEnd].x + off;
                        const beam1EndY = beamEndY;
                        const slope = (beam1EndY - beam1StartY) / (beam1EndX - beam1StartX);

                        const beamGap = this.lineSpacing * 0.8;
                        const beam2StartY = beam1StartY + (firstStemUp ? beamGap : -beamGap);

                        for (let k = i; k <= beamEnd; k++) {
                            const b = infoList[k];
                            if (this.getVisualDuration(b.note) <= 0.26) {
                                const bX = b.x + off;
                                const beam2Y = beam2StartY + slope * (bX - beam1StartX);
                                const nextIs16th = (k < beamEnd && this.getVisualDuration(infoList[k + 1].note) <= 0.26);
                                const prevIs16th = (k > i && this.getVisualDuration(infoList[k - 1].note) <= 0.26);

                                if (nextIs16th) {
                                    const nextB = infoList[k + 1];
                                    const nextBX = nextB.x + off;
                                    const nextBeam2Y = beam2StartY + slope * (nextBX - beam1StartX);
                                    ctx.beginPath();
                                    ctx.moveTo(bX, beam2Y);
                                    ctx.lineTo(nextBX, nextBeam2Y);
                                    ctx.stroke();
                                } else if (!prevIs16th) {
                                    const stubLen = 15;
                                    const direction = (k === beamEnd) ? -1 : 1;
                                    ctx.beginPath();
                                    ctx.moveTo(bX, beam2Y);
                                    ctx.lineTo(bX + stubLen * direction, beam2Y);
                                    ctx.stroke();
                                }
                            }
                        }

                        ctx.lineWidth = Math.max(1.2, Math.min(1.8, this.lineSpacing * 0.18));
                        for (let k = i; k <= beamEnd; k++) {
                            const b = infoList[k];
                            const bStemTopY = beam1StartY + slope * ((b.x + off) - beam1StartX);
                            const isHigh = (this.playbackHighlightedElement === b.note);

                            ctx.save();
                            if (isHigh) {
                                ctx.strokeStyle = "#e53935";
                                ctx.fillStyle = "#e53935";
                            }
                            ctx.beginPath();
                            ctx.moveTo(b.x + off, b.y);
                            ctx.lineTo(b.x + off, bStemTopY);
                            ctx.stroke();

                            this.drawSingleNoteHead(ctx, b.note, b.x, b.y, y, b.displayAcc, isHigh);
                            ctx.restore();
                            isBeamed[k] = true;
                        }
                        ctx.restore();

                        i = beamEnd;
                        wasBeamed = true;
                    }
                }

                if (!wasBeamed) {
                    const isHigh = (this.playbackHighlightedElement === info.note);
                    if (info.isRest) {
                        this.drawRest(ctx, info.note, info.x, y, isHigh);
                    } else {
                        this.drawNoteWithAccidental(ctx, info.note, info.x, info.y, y, info.displayAcc, isHigh);
                    }
                }
            }

            // Tuplet Brackets
            let currentTupletNum = 0;
            let tupletStartX = 0;
            let tupletCount = 0;
            for (let k = 0; k < infoList.length; k++) {
                const nInfo = infoList[k];
                const note = nInfo.note;
                if (note.tupletNumber > 0 && currentTupletNum === 0) {
                    currentTupletNum = note.tupletNumber;
                    tupletStartX = nInfo.x - 10;
                    tupletCount = 0;
                }
                if (currentTupletNum > 0) {
                    tupletCount++;
                    if (tupletCount === currentTupletNum) {
                        this.drawTupletBracket(ctx, tupletStartX, nInfo.x + 15, y, currentTupletNum);
                        currentTupletNum = 0;
                        tupletCount = 0;
                    }
                }
            }
        }
    }

    drawSingleNoteHead(ctx, note, nx, ny, staffTopY, acc, isHigh = false) {
        const visualDur = this.getVisualDuration(note);
        const effRx = this.getEffectiveNoteRx();
        const effRy = this.getEffectiveNoteRy();
        const primaryColor = isHigh ? "#e53935" : (this.darkMode ? "#ffffff" : "#111111");
        const secondaryColor = this.darkMode ? "#888888" : "#222222";

        // Accidental
        if (acc) {
            ctx.save();
            const accFontSize = Math.max(11, Math.min(22, this.lineSpacing * 1.55));
            ctx.font = `bold ${accFontSize}px "Inter", sans-serif`;
            ctx.fillStyle = primaryColor;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            const accX = nx - Math.max(10, effRx * 1.8);
            const accOffY = (acc === "-") ? (-accFontSize * 0.16) : 0;
            if (acc === "-") ctx.fillText("♭", accX, ny + accOffY);
            else if (acc === "#") ctx.fillText("♯", accX, ny + accOffY);
            else if (acc === "n") ctx.fillText("♮", accX, ny + accOffY);
            ctx.restore();
        }

        // Ledger lines
        const ledgerHalfWidth = effRx * 1.7;
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = Math.max(1.1, Math.min(1.6, this.lineSpacing * 0.16));
        if (ny < staffTopY - 2) {
            for (let ly = staffTopY - this.lineSpacing; ly >= ny - 2; ly -= this.lineSpacing) {
                ctx.beginPath();
                ctx.moveTo(nx - ledgerHalfWidth, ly);
                ctx.lineTo(nx + ledgerHalfWidth, ly);
                ctx.stroke();
            }
        } else if (ny > staffTopY + this.staffHeight + 2) {
            for (let ly = staffTopY + this.staffHeight + this.lineSpacing; ly <= ny + 2; ly += this.lineSpacing) {
                ctx.beginPath();
                ctx.moveTo(nx - ledgerHalfWidth, ly);
                ctx.lineTo(nx + ledgerHalfWidth, ly);
                ctx.stroke();
            }
        }

        // Oval Note Head (rotated -20 deg)
        ctx.save();
        ctx.translate(nx, ny);
        ctx.rotate(-20 * Math.PI / 180);

        if (visualDur >= 3.99) {
            // Whole note
            ctx.strokeStyle = primaryColor;
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.ellipse(0, 0, effRx * 1.15, effRy, 0, 0, Math.PI * 2);
            ctx.stroke();
        } else if (visualDur >= 1.99) {
            // Half note
            ctx.strokeStyle = primaryColor;
            ctx.lineWidth = 2.0;
            ctx.beginPath();
            ctx.ellipse(0, 0, effRx, effRy, 0, 0, Math.PI * 2);
            ctx.stroke();
        } else {
            // Quarter / 8th / 16th note
            ctx.fillStyle = primaryColor;
            ctx.beginPath();
            ctx.ellipse(0, 0, effRx, effRy, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // Dot for dotted notes
        if (Math.abs(visualDur - 1.5) < 0.05 || Math.abs(visualDur - 3.0) < 0.05 ||
            Math.abs(visualDur - 0.75) < 0.05 || Math.abs(visualDur - 6.0) < 0.05) {
            const diff = (ny - staffTopY) / this.lineSpacing;
            const onStaffLine = Math.abs(diff - Math.round(diff)) < 0.15;
            const dotY = onStaffLine ? (ny - this.lineSpacing * 0.25) : ny;
            const dotX = nx + effRx + 6;
            ctx.fillStyle = primaryColor;
            ctx.beginPath();
            ctx.arc(dotX, dotY, this.lineSpacing * 0.15, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawNoteWithAccidental(ctx, note, nx, ny, staffTopY, acc, isHigh = false) {
        this.drawSingleNoteHead(ctx, note, nx, ny, staffTopY, acc, isHigh);
        const visualDur = this.getVisualDuration(note);
        const primaryColor = isHigh ? "#e53935" : (this.darkMode ? "#ffffff" : "#111111");

        if (visualDur < 3.99) {
            const stemUp = ny > (staffTopY + 2 * this.lineSpacing);
            const effRx = this.getEffectiveNoteRx();
            const off = stemUp ? (effRx * 0.82) : (-effRx * 0.82);
            const stemHeight = this.lineSpacing * 2.5;
            let endY = stemUp ? ny - stemHeight : ny + stemHeight;
            if (stemUp && endY < staffTopY - 6) endY = staffTopY - 6;
            if (!stemUp && endY > staffTopY + this.staffHeight + 8) endY = staffTopY + this.staffHeight + 8;

            ctx.save();
            ctx.strokeStyle = primaryColor;
            ctx.lineWidth = Math.max(1.2, Math.min(1.8, this.lineSpacing * 0.18));
            ctx.beginPath();
            ctx.moveTo(nx + off, ny);
            ctx.lineTo(nx + off, endY);
            ctx.stroke();

            if (visualDur < 0.99) {
                this.drawFlag(ctx, nx + off, endY, stemUp, primaryColor);
                if (visualDur <= 0.26) {
                    const secondFlagOffset = Math.round(this.lineSpacing * 0.58);
                    this.drawFlag(ctx, nx + off, stemUp ? endY + secondFlagOffset : endY - secondFlagOffset, stemUp, primaryColor);
                }
            }
            ctx.restore();
        }
    }

    drawFlag(ctx, sx, sy, up, color) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1.3, Math.min(1.8, this.lineSpacing * 0.15));
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(sx, sy);

        // Standard musical flag proportions: height ~1.65x lineSpacing, width ~0.72x lineSpacing
        const flagLen = Math.round(this.lineSpacing * 1.65);
        const flagW = Math.round(this.lineSpacing * 0.72);

        if (up) {
            // Stem Up: Flag hangs down to the right
            ctx.bezierCurveTo(sx + flagW, sy + flagLen * 0.28, sx + flagW * 0.85, sy + flagLen * 0.72, sx + flagW * 0.2, sy + flagLen);
        } else {
            // Stem Down: Flag points up to the right
            ctx.bezierCurveTo(sx + flagW, sy - flagLen * 0.28, sx + flagW * 0.85, sy - flagLen * 0.72, sx + flagW * 0.2, sy - flagLen);
        }
        ctx.stroke();
        ctx.restore();
    }

    drawRest(ctx, note, rx, staffTopY, isHigh = false) {
        const visualDur = this.getVisualDuration(note);
        const midY = staffTopY + 2 * this.lineSpacing;
        const color = isHigh ? "#e53935" : (this.darkMode ? "#ffffff" : "#111111");

        ctx.save();
        ctx.fillStyle = color;

        // Standard musical dimensions: width ~1.35x lineSpacing, height ~0.48x lineSpacing (half the staff space)
        const restW = Math.max(10, Math.round(this.lineSpacing * 1.35));
        const restH = Math.max(4, Math.round(this.lineSpacing * 0.48));

        if (visualDur >= 3.99) {
            // Whole rest: Hangs DOWN from line 4 (second line from top)
            const line4Y = staffTopY + this.lineSpacing;
            ctx.fillRect(rx - restW / 2, line4Y, restW, restH);
        } else if (visualDur >= 1.99) {
            // Half rest: Sits UPON line 3 (middle staff line)
            ctx.fillRect(rx - restW / 2, midY - restH, restW, restH);
        } else if (visualDur >= 0.99) {
            // Quarter rest
            const qSize = Math.round(this.lineSpacing * 2.5);
            ctx.font = `${qSize}px "Noto Music", "Times New Roman", serif`;
            ctx.textAlign = "center";
            ctx.fillText("𝄽", rx, midY + qSize * 0.32);
            if (Math.abs(visualDur - 1.5) < 0.05) {
                ctx.beginPath();
                ctx.arc(rx + restW / 2 + 5, staffTopY + this.lineSpacing * 1.5, Math.max(1.8, this.lineSpacing * 0.16), 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (visualDur > 0.26) {
            // 8th rest
            const eSize = Math.round(this.lineSpacing * 2.2);
            ctx.font = `${eSize}px "Noto Music", "Times New Roman", serif`;
            ctx.textAlign = "center";
            ctx.fillText("𝄾", rx, midY + eSize * 0.30);
            if (Math.abs(visualDur - 0.75) < 0.05) {
                ctx.beginPath();
                ctx.arc(rx + restW / 2 + 5, staffTopY + this.lineSpacing * 1.5, Math.max(1.8, this.lineSpacing * 0.16), 0, Math.PI * 2);
                ctx.fill();
            }
        } else {
            // 16th rest
            const sSize = Math.round(this.lineSpacing * 2.2);
            ctx.font = `${sSize}px "Noto Music", "Times New Roman", serif`;
            ctx.textAlign = "center";
            ctx.fillText("𝄿", rx, midY + sSize * 0.30);
            if (Math.abs(visualDur - 0.375) < 0.05) {
                ctx.beginPath();
                ctx.arc(rx + restW / 2 + 5, staffTopY + this.lineSpacing * 1.5, Math.max(1.8, this.lineSpacing * 0.16), 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }

    drawTies(ctx, noteMap) {
        if (this.chordOnlyMode || !noteMap || noteMap.size === 0) return;

        const defaultColor = this.darkMode ? "#ffffff" : "#111111";

        for (const [note, startInfo] of noteMap.entries()) {
            if (!note.isTieStart || !note.tiedToNote) continue;

            const nextNote = note.tiedToNote;
            const endInfo = noteMap.get(nextNote);
            if (!endInfo) continue;

            const curveDown = startInfo.stemUp;
            const arcDirection = curveDown ? 1.0 : -1.0;
            const yOffset = curveDown ? 12 : -12;
            const sameLine = Math.abs(startInfo.staffTopY - endInfo.staffTopY) < 10;
            const isTieHigh = (this.playbackHighlightedElement === note || this.playbackHighlightedElement === nextNote);

            ctx.save();
            ctx.strokeStyle = isTieHigh ? "#e53935" : defaultColor;
            ctx.lineWidth = 2.2;

            if (sameLine && endInfo.x > startInfo.x) {
                // Same line tie
                const x1 = startInfo.x + 8;
                const y1 = startInfo.y + yOffset;
                const x2 = endInfo.x - 8;
                const y2 = endInfo.y + yOffset;

                const midX = (x1 + x2) / 2;
                const dist = Math.abs(x2 - x1);
                const bow = Math.min(22, Math.max(10, dist * 0.16)) * arcDirection;
                const ctrlY = ((y1 + y2) / 2) + bow;

                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.quadraticCurveTo(midX, ctrlY, x2, y2);
                ctx.stroke();
            } else {
                // Cross-line tie
                // 1. Arc exiting to right
                const x1 = startInfo.x + 8;
                const y1 = startInfo.y + yOffset;
                const exitX = Math.max(x1 + 35, startInfo.measureRightX - 5);
                const midX1 = (x1 + exitX) / 2;
                const ctrlY1 = y1 + (12 * arcDirection);

                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.quadraticCurveTo(midX1, ctrlY1, exitX, y1 + (6 * arcDirection));
                ctx.stroke();

                // 2. Arc entering from left
                const enterX = Math.min(endInfo.x - 35, endInfo.measureLeftX + 15);
                const x2 = endInfo.x - 8;
                const y2 = endInfo.y + yOffset;
                const midX2 = (enterX + x2) / 2;
                const ctrlY2 = y2 + (12 * arcDirection);

                ctx.beginPath();
                ctx.moveTo(enterX, y2 + (6 * arcDirection));
                ctx.quadraticCurveTo(midX2, ctrlY2, x2, y2);
                ctx.stroke();
            }
            ctx.restore();
        }
    }

    drawTupletBracket(ctx, startX, endX, staffTopY, number) {
        const bracketY = staffTopY + this.staffHeight + 12;
        const color = this.darkMode ? "#ffffff" : "#111111";

        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 1.4;

        ctx.beginPath();
        ctx.moveTo(startX, bracketY - 6);
        ctx.lineTo(startX, bracketY);
        const midX = (startX + endX) / 2;
        ctx.lineTo(midX - 10, bracketY);
        ctx.moveTo(midX + 10, bracketY);
        ctx.lineTo(endX, bracketY);
        ctx.lineTo(endX, bracketY - 6);
        ctx.stroke();

        ctx.font = 'bold 13px "Inter", sans-serif';
        ctx.textAlign = "center";
        ctx.fillText(String(number), midX, bracketY + 4);
        ctx.restore();
    }

    drawBarLines(ctx, measure, x, y, width, isLast, isLineStart) {
        const barHeight = this.chordOnlyMode ? 60 : this.staffHeight;
        const topY = this.chordOnlyMode ? (y - 30) : y;
        const botY = topY + barHeight;
        const primaryColor = this.darkMode ? "#ffffff" : "#111111";

        const heavyBarW = Math.max(2.8, Math.min(3.8, this.lineSpacing * 0.28));
        const thinBarW = 1.1;
        const dotR = Math.max(1.8, Math.min(2.4, this.lineSpacing * 0.18));

        ctx.save();
        if (measure.repeatStart) {
            if (!isLineStart) {
                ctx.strokeStyle = primaryColor;
                ctx.lineWidth = heavyBarW;
                ctx.beginPath();
                ctx.moveTo(x + 2, topY);
                ctx.lineTo(x + 2, botY);
                ctx.stroke();

                ctx.lineWidth = thinBarW;
                ctx.beginPath();
                ctx.moveTo(x + 10, topY);
                ctx.lineTo(x + 10, botY);
                ctx.stroke();

                ctx.fillStyle = primaryColor;
                const dot1Y = this.chordOnlyMode ? (y - 15) : (y + this.lineSpacing * 1.5);
                const dot2Y = this.chordOnlyMode ? (y + 15) : (y + this.lineSpacing * 2.5);
                ctx.beginPath();
                ctx.arc(x + 18, dot1Y, dotR, 0, Math.PI * 2);
                ctx.arc(x + 18, dot2Y, dotR, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (!isLineStart && x === this.MARGIN) {
            ctx.strokeStyle = primaryColor;
            ctx.lineWidth = thinBarW;
            ctx.beginPath();
            ctx.moveTo(x, topY);
            ctx.lineTo(x, botY);
            ctx.stroke();
        }

        if (measure.repeatEnd) {
            ctx.strokeStyle = primaryColor;
            ctx.lineWidth = heavyBarW;
            ctx.beginPath();
            ctx.moveTo(x + width - 4, topY);
            ctx.lineTo(x + width - 4, botY);
            ctx.stroke();

            ctx.lineWidth = thinBarW;
            ctx.beginPath();
            ctx.moveTo(x + width - 12, topY);
            ctx.lineTo(x + width - 12, botY);
            ctx.stroke();

            ctx.fillStyle = primaryColor;
            const dot1Y = this.chordOnlyMode ? (y - 15) : (y + this.lineSpacing * 1.5);
            const dot2Y = this.chordOnlyMode ? (y + 15) : (y + this.lineSpacing * 2.5);
            ctx.beginPath();
            ctx.arc(x + width - 20, dot1Y, dotR, 0, Math.PI * 2);
            ctx.arc(x + width - 20, dot2Y, dotR, 0, Math.PI * 2);
            ctx.fill();
        } else if (isLast) {
            ctx.strokeStyle = primaryColor;
            ctx.lineWidth = thinBarW;
            ctx.beginPath();
            ctx.moveTo(x + width - 10, topY);
            ctx.lineTo(x + width - 10, botY);
            ctx.stroke();

            ctx.lineWidth = heavyBarW;
            ctx.beginPath();
            ctx.moveTo(x + width - 4, topY);
            ctx.lineTo(x + width - 4, botY);
            ctx.stroke();
        } else if (measure.isDoubleBar) {
            ctx.strokeStyle = primaryColor;
            ctx.lineWidth = thinBarW;
            ctx.beginPath();
            ctx.moveTo(x + width - 6, topY);
            ctx.lineTo(x + width - 6, botY);
            ctx.moveTo(x + width, topY);
            ctx.lineTo(x + width, botY);
            ctx.stroke();
        } else {
            ctx.strokeStyle = primaryColor;
            ctx.lineWidth = thinBarW;
            ctx.beginPath();
            ctx.moveTo(x + width, topY);
            ctx.lineTo(x + width, botY);
            ctx.stroke();
        }
        ctx.restore();
    }

    drawKeySignature(ctx, sf, x, y) {
        const count = Math.abs(sf);
        if (count === 0) return;
        const symbol = sf > 0 ? "♯" : "♭";
        const sharpYOffsetsTreble = [0, 1.5, -0.5, 1.0, 2.5, 0.5, 2.0];
        const flatYOffsetsTreble = [2.0, 0.5, 2.5, 1.0, 3.0, 1.5, 3.5];
        const sharpYOffsetsBass = [1.0, 2.5, 0.5, 2.0, 3.5, 1.5, 3.0];
        const flatYOffsetsBass = [3.0, 1.5, 3.5, 2.0, 0.5, 2.5, 1.0];

        const offsets = this.isBassClef ? (sf > 0 ? sharpYOffsetsBass : flatYOffsetsBass) : (sf > 0 ? sharpYOffsetsTreble : flatYOffsetsTreble);
        const startX = x + 6;

        ctx.save();
        const fontSize = Math.max(16, Math.min(24, Math.round(this.lineSpacing * 1.7)));
        ctx.font = `bold ${fontSize}px "Inter", sans-serif`;
        ctx.fillStyle = this.darkMode ? "#ffffff" : "#111111";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";

        // Accidental vertical center offset:
        // Sharp center grid aligns with font middle.
        // Flat round belly is below font midpoint, so shift up by ~16% to center the belly on the exact staff line/space.
        const yAdjustment = (sf > 0) ? 0 : (-fontSize * 0.16);

        for (let i = 0; i < count; i++) {
            const ly = y + offsets[i] * this.lineSpacing;
            ctx.fillText(symbol, startX + i * 12.5, ly + yAdjustment);
        }
        ctx.restore();
    }

    getTransposedChord(originalChord, keySF) {
        if (!originalChord) return "";
        if (originalChord.startsWith("N.C")) return this.formatChord(originalChord);

        const chordOffset = this.getChordTransposeOffset();
        if (chordOffset === 0) return this.formatChord(originalChord);

        const parts = originalChord.split("/");
        const sb = [];
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (!part) continue;

            let root = "";
            let suffix = "";
            if (part.length >= 2 && (part.charAt(1) === '#' || part.charAt(1) === 'b')) {
                root = part.substring(0, 2);
                suffix = part.substring(2);
            } else {
                root = part.substring(0, 1);
                suffix = part.substring(1);
            }

            const semi = this.getSemitones(root);
            if (semi === -1) {
                sb.push(part);
            } else {
                const newSemi = (semi + (chordOffset % 12) + 12) % 12;
                const newRootRaw = (keySF >= 0) ? this.notesSharp[newSemi] : this.notesFlat[newSemi];
                let newRoot = newRootRaw.substring(0, 1).toUpperCase();
                if (newRootRaw.length > 1) newRoot += newRootRaw.substring(1);
                sb.push(newRoot + suffix);
            }
        }
        return this.formatChord(sb.join("/"));
    }

    getSemitones(root) {
        if (!root) return -1;
        const r = root.toLowerCase().replace("-", "b").replace("+", "#").replace("n", "");
        for (let i = 0; i < 12; i++) {
            if (this.notesFlat[i] === r || this.notesSharp[i] === r) return i;
        }
        if (r === "cb") return 11;
        if (r === "fb") return 4;
        if (r === "e#") return 5;
        if (r === "b#") return 0;
        return -1;
    }

    formatChord(chord) {
        let result = chord;
        const dimPlaceholder = "___DIM___";
        const majPlaceholder = "___MAJ___";
        if (this.useHalfDimSymbol) result = result.replace(/m7-5/g, "ø").replace(/m7b5/g, "ø");
        if (this.usePlusForAug) result = result.replace(/aug/g, "+");
        if (result.includes("dim")) result = result.replace(/dim/g, dimPlaceholder);
        result = result.replace(/Maj7/g, majPlaceholder + "7").replace(/maj7/g, majPlaceholder + "7")
            .replace(/M7/g, majPlaceholder + "7").replace(/Maj/g, majPlaceholder).replace(/maj/g, majPlaceholder);
        if (this.useMinusForMinor) {
            result = result.replace(/m7/g, "-7").replace(/m9/g, "-9").replace(/m11/g, "-11");
            if (result.endsWith("m")) result = result.substring(0, result.length - 1) + "-";
            else result = result.replace(/m /g, "- ");
        }
        if (this.majorNotationMode === 1) result = result.replace(new RegExp(majPlaceholder, 'g'), "△");
        else if (this.majorNotationMode === 2) result = result.replace(new RegExp(majPlaceholder, 'g'), "M");
        else result = result.replace(new RegExp(majPlaceholder, 'g'), "Maj");

        if (this.useCircleForDim) result = result.replace(new RegExp(dimPlaceholder + "7", 'g'), "o7").replace(new RegExp(dimPlaceholder, 'g'), "o");
        else result = result.replace(new RegExp(dimPlaceholder, 'g'), "dim");
        return result;
    }

    parseChord(chord) {
        const pc = { root: "", quality: "", tensions: [], bass: "" };
        if (!chord) return pc;
        if (chord.startsWith("N.C")) {
            pc.root = chord;
            return pc;
        }

        let remaining = chord.trim();
        const slashIdx = remaining.indexOf('/');
        if (slashIdx >= 0) {
            pc.bass = remaining.substring(slashIdx);
            remaining = remaining.substring(0, slashIdx).trim();
        }

        if (remaining.length >= 2 && (remaining.charAt(1) === '#' || remaining.charAt(1) === 'b')) {
            pc.root = remaining.substring(0, 2);
            remaining = remaining.substring(2);
        } else if (remaining.length > 0) {
            pc.root = remaining.substring(0, 1);
            remaining = remaining.substring(1);
        }

        if (!remaining) return pc;

        const openParen = remaining.indexOf('(');
        const closeParen = remaining.indexOf(')');
        if (openParen >= 0 && closeParen > openParen) {
            pc.quality = remaining.substring(0, openParen).trim();
            const parenContent = remaining.substring(openParen + 1, closeParen).trim();
            const tParts = parenContent.split(/[,/]/);
            for (const tp of tParts) {
                const tr = tp.trim();
                if (tr) pc.tensions.push(tr);
            }
            const afterParen = remaining.substring(closeParen + 1).trim();
            if (afterParen) pc.tensions.push(afterParen);
            return pc;
        }

        const m = remaining.match(/^(.*?)(alt|b9|#9|#11|b13|b5|#5|\+9|-9|\+5|-5|add9)$/);
        if (m) {
            const q = m[1].trim();
            const t = m[2].trim();
            if (!q) pc.quality = t;
            else {
                pc.quality = q;
                pc.tensions.push(t);
            }
        } else {
            pc.quality = remaining;
        }
        return pc;
    }

    measureChordWidth(ctx, pc, baseSize) {
        ctx.save();
        const scaleFactor = baseSize / 50;
        let rootLetter = pc.root;
        let rootAcc = "";
        if (pc.root.length >= 2 && (pc.root.charAt(1) === '#' || pc.root.charAt(1) === 'b')) {
            rootLetter = pc.root.substring(0, 1);
            rootAcc = pc.root.substring(1, 2);
        }

        ctx.font = `bold ${baseSize}px "Oswald", "Inter", sans-serif`;
        const wRootLetter = ctx.measureText(rootLetter).width;
        let wRootAcc = 0;
        if (rootAcc) {
            ctx.font = `bold ${Math.round(baseSize * 0.68)}px "Oswald", "Inter", sans-serif`;
            wRootAcc = ctx.measureText(rootAcc).width + 1.0 * scaleFactor;
        }
        const wRoot = wRootLetter + wRootAcc;

        let wQuality = 0;
        if (pc.quality) {
            const qFontSize = Math.round(baseSize * 0.65);
            ctx.font = `bold ${qFontSize}px "Oswald", "Inter", sans-serif`;
            if (pc.quality.startsWith("-")) {
                const barW = Math.max(8, Math.round(qFontSize * 0.62));
                const restText = pc.quality.substring(1);
                const barGap = restText ? Math.max(2.5, Math.round(scaleFactor * 2.5)) : 0;
                const restW = restText ? ctx.measureText(restText).width : 0;
                wQuality = barW + barGap + restW;
            } else {
                wQuality = ctx.measureText(pc.quality).width;
            }
        }

        let wTension = 0;
        if (pc.tensions.length > 0) {
            const tFontSize = Math.round(baseSize * 0.48);
            ctx.font = `bold ${tFontSize}px "Oswald", "Inter", sans-serif`;
            let curTX = 0;
            for (let ti = 0; ti < pc.tensions.length; ti++) {
                const t = pc.tensions[ti].replace(/[()]/g, "");
                if (ti > 0) curTX += 3 * scaleFactor;
                if (t.startsWith("-")) {
                    const tBarW = Math.max(6, Math.round(tFontSize * 0.58));
                    curTX += tBarW + Math.max(1.5, Math.round(scaleFactor * 1.5));
                    const tRest = t.substring(1);
                    if (tRest) curTX += ctx.measureText(tRest).width;
                } else {
                    curTX += ctx.measureText(t).width;
                }
            }
            wTension = curTX;
        }

        const suffixWidth = Math.max(wQuality, wTension);

        let bassMain = pc.bass;
        let bassAcc = "";
        if (pc.bass.length >= 3 && (pc.bass.charAt(2) === '#' || pc.bass.charAt(2) === 'b')) {
            bassMain = pc.bass.substring(0, 2);
            bassAcc = pc.bass.substring(2, 3);
        }

        let wBass = 0;
        if (pc.bass) {
            ctx.font = `bold ${Math.round(baseSize * 0.62)}px "Oswald", "Inter", sans-serif`;
            const wBMain = ctx.measureText(bassMain).width;
            let wBAcc = 0;
            if (bassAcc) {
                ctx.font = `bold ${Math.round(baseSize * 0.45)}px "Oswald", "Inter", sans-serif`;
                wBAcc = ctx.measureText(bassAcc).width + 0.8 * scaleFactor;
            }
            wBass = wBMain + wBAcc + 1.5 * scaleFactor;
        }

        ctx.restore();
        let total = wRoot;
        if (suffixWidth > 0) total += 1.5 * scaleFactor + suffixWidth;
        if (wBass > 0) total += wBass;
        return total;
    }

    drawComplexChord(ctx, pc, x, y, baseSize, isHigh = false) {
        ctx.save();
        ctx.textAlign = "left";
        const color = isHigh ? "#e53935" : (this.darkMode ? "#ffffff" : "#111111");
        ctx.fillStyle = color;

        let currentX = x;
        const scaleFactor = baseSize / 50;

        let rootLetter = pc.root;
        let rootAcc = "";
        if (pc.root.length >= 2 && (pc.root.charAt(1) === '#' || pc.root.charAt(1) === 'b')) {
            rootLetter = pc.root.substring(0, 1);
            rootAcc = pc.root.substring(1, 2);
        }

        // 1. Root Letter
        ctx.font = `bold ${baseSize}px "Oswald", "Inter", sans-serif`;
        ctx.fillText(rootLetter, currentX, y);
        currentX += ctx.measureText(rootLetter).width;

        // 1b. Root Accidental
        if (rootAcc) {
            ctx.font = `bold ${Math.round(baseSize * 0.68)}px "Oswald", "Inter", sans-serif`;
            const accY = y - baseSize * 0.16;
            ctx.fillText(rootAcc, currentX, accY);
            currentX += ctx.measureText(rootAcc).width + 1.0 * scaleFactor;
        }

        const suffixStartX = currentX + 1.5 * scaleFactor;

        // 2. Quality (Crisp, bold Real Book jazz minus and quality text)
        let qualityWidth = 0;
        if (pc.quality) {
            const qFontSize = Math.round(baseSize * 0.65);
            ctx.font = `bold ${qFontSize}px "Oswald", "Inter", sans-serif`;
            if (pc.quality.startsWith("-")) {
                const barW = Math.max(8, Math.round(qFontSize * 0.62));
                const barH = Math.max(2.8, Math.round(qFontSize * 0.18));
                const barY = Math.round(y - qFontSize * 0.36);
                const restText = pc.quality.substring(1);
                const barGap = restText ? Math.max(2.5, Math.round(scaleFactor * 2.5)) : 0;

                // Draw prominent jazz minus bar
                ctx.save();
                ctx.fillStyle = color;
                if (ctx.roundRect) {
                    ctx.beginPath();
                    ctx.roundRect(suffixStartX, barY - Math.round(barH / 2), barW, barH, Math.min(1.5, barH / 2));
                    ctx.fill();
                } else {
                    ctx.fillRect(suffixStartX, barY - Math.round(barH / 2), barW, barH);
                }
                ctx.restore();

                let restW = 0;
                if (restText) {
                    ctx.fillText(restText, suffixStartX + barW + barGap, y);
                    restW = ctx.measureText(restText).width;
                }
                qualityWidth = barW + barGap + restW;
            } else {
                ctx.fillText(pc.quality, suffixStartX, y);
                qualityWidth = ctx.measureText(pc.quality).width;
            }
        }

        // 3. Tension (Stacked above quality with bold minus for altered tensions)
        let tensionWidth = 0;
        if (pc.tensions.length > 0) {
            const tFontSize = Math.round(baseSize * 0.48);
            ctx.font = `bold ${tFontSize}px "Oswald", "Inter", sans-serif`;
            const tY = pc.quality ? (y - baseSize * 0.52) : (y - baseSize * 0.38);
            let curTX = suffixStartX;
            for (let ti = 0; ti < pc.tensions.length; ti++) {
                const t = pc.tensions[ti].replace(/[()]/g, "");
                if (ti > 0) curTX += 3 * scaleFactor;
                if (t.startsWith("-")) {
                    const tBarW = Math.max(6, Math.round(tFontSize * 0.58));
                    const tBarH = Math.max(2.2, Math.round(tFontSize * 0.18));
                    const tBarY = Math.round(tY - tFontSize * 0.36);
                    ctx.save();
                    ctx.fillStyle = color;
                    if (ctx.roundRect) {
                        ctx.beginPath();
                        ctx.roundRect(curTX, tBarY - Math.round(tBarH / 2), tBarW, tBarH, Math.min(1.2, tBarH / 2));
                        ctx.fill();
                    } else {
                        ctx.fillRect(curTX, tBarY - Math.round(tBarH / 2), tBarW, tBarH);
                    }
                    ctx.restore();
                    curTX += tBarW + Math.max(1.5, Math.round(scaleFactor * 1.5));
                    const tRest = t.substring(1);
                    if (tRest) {
                        ctx.fillText(tRest, curTX, tY);
                        curTX += ctx.measureText(tRest).width;
                    }
                } else {
                    ctx.fillText(t, curTX, tY);
                    curTX += ctx.measureText(t).width;
                }
            }
            tensionWidth = curTX - suffixStartX;
        }

        const suffixWidth = Math.max(qualityWidth, tensionWidth);
        currentX = suffixStartX + suffixWidth;

        // 4. Bass (Slash chord)
        let bassMain = pc.bass;
        let bassAcc = "";
        if (pc.bass.length >= 3 && (pc.bass.charAt(2) === '#' || pc.bass.charAt(2) === 'b')) {
            bassMain = pc.bass.substring(0, 2);
            bassAcc = pc.bass.substring(2, 3);
        }

        if (pc.bass) {
            const bY = y + baseSize * 0.12;
            currentX += 1.5 * scaleFactor;
            ctx.font = `bold ${Math.round(baseSize * 0.62)}px "Oswald", "Inter", sans-serif`;
            ctx.fillText(bassMain, currentX, bY);
            currentX += ctx.measureText(bassMain).width;

            if (bassAcc) {
                ctx.font = `bold ${Math.round(baseSize * 0.45)}px "Oswald", "Inter", sans-serif`;
                const bAccY = bY - baseSize * 0.10;
                ctx.fillText(bassAcc, currentX, bAccY);
                currentX += ctx.measureText(bassAcc).width + 0.8 * scaleFactor;
            }
        }

        ctx.restore();
        return currentX - x;
    }

    getTransposedPitch(note, keySF) {
        const result = { step: 0, octave: 4, accidental: 0 };
        if (!note || note.isRest) return result;

        const melodyOffset = this.getMelodyTransposeOffset();
        if (melodyOffset % 12 === 0) {
            const step = (note.pitch) ? "cdefgab".indexOf(note.pitch.charAt(0).toLowerCase()) : -1;
            if (step !== -1) {
                result.step = step;
                result.octave = note.octave + (melodyOffset / 12);
                if (note.accidental === "#" || note.accidental === "+") result.accidental = 1;
                else if (note.accidental === "-" || note.accidental === "_") result.accidental = -1;
                else result.accidental = 0;
                return result;
            }
        }

        const baseStep = note.pitch ? "cdefgab".indexOf(note.pitch.charAt(0).toLowerCase()) : 0;
        const diatonicSemi = [0, 2, 4, 5, 7, 9, 11];
        const accOffset = (note.accidental === "#" || note.accidental === "+") ? 1 : ((note.accidental === "-" || note.accidental === "_") ? -1 : 0);
        const semi = diatonicSemi[baseStep >= 0 ? baseStep : 0] + accOffset + (note.octave - 4) * 12;
        const totalTransposedSemi = semi + melodyOffset;
        const transposedSemi = ((totalTransposedSemi % 12) + 12) % 12;
        let octave = 4 + Math.floor(totalTransposedSemi / 12);

        if (octave >= 6) octave--;
        else if (octave < 3) octave++;

        const scaleSemi = [0, 2, 4, 5, 7, 9, 11];
        for (let i = 0; i < 7; i++) {
            if (scaleSemi[i] === transposedSemi) {
                result.step = i;
                result.octave = octave;
                result.accidental = 0;
                return result;
            }
        }

        const preferFlat = (keySF < 0) || (keySF === 0 && (melodyOffset !== 0 || note.accidental === "-" || note.accidental === "_"));
        if (preferFlat) {
            for (let i = 0; i < 7; i++) {
                if (scaleSemi[i] === (transposedSemi + 1) % 12) {
                    result.step = i;
                    result.octave = octave;
                    result.accidental = -1;
                    return result;
                }
            }
        } else {
            for (let i = 0; i < 7; i++) {
                if (scaleSemi[i] === (transposedSemi - 1 + 12) % 12) {
                    result.step = i;
                    result.octave = octave;
                    result.accidental = 1;
                    return result;
                }
            }
        }
        return result;
    }

    getKeyAccidentals(keySF) {
        const accs = new Array(7).fill(0);
        if (keySF > 0) {
            const order = [3, 0, 4, 1, 5, 2, 6]; // F, C, G, D, A, E, B
            for (let i = 0; i < keySF; i++) accs[order[i]] = 1;
        } else if (keySF < 0) {
            const order = [6, 2, 5, 1, 4, 0, 3]; // B, E, A, D, G, C, F
            for (let i = 0; i < Math.abs(keySF); i++) accs[order[i]] = -1;
        }
        return accs;
    }

    calculateTransposedNoteY(p, staffTopY) {
        const staffStepsFromC4 = p.step + (p.octave - 4) * 7;
        const centerOffset = (this.bassClefOctaveShift === 2) ? 8 : 1;
        const stepsFromCenter = this.isBassClef ? (staffStepsFromC4 - centerOffset) : (staffStepsFromC4 - 6);
        return (staffTopY + 2 * this.lineSpacing) - (stepsFromCenter * (this.lineSpacing / 2));
    }

    getMetronomePrefix(sheet) {
        if (!sheet) return "♩ = ";
        const t = sheet.tempo ? sheet.tempo.trim() : "";
        if (t.includes("3/8=")) return "♩. = ";
        if (t.includes("1/8=")) return "♪ = ";
        if (t.includes("1/4=")) return "♩ = ";
        if (t.includes("1/2=")) return "𝅗 = ";
        if (sheet.unitLength === "1/8" && sheet.meter && (sheet.meter.includes("6/8") || sheet.meter.includes("9/8") || sheet.meter.includes("12/8"))) {
            return "♩. = ";
        } else if (sheet.unitLength === "1/8" && !t.includes("1/4")) {
            return "♪ = ";
        }
        return "♩ = ";
    }

    roundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LeadSheetRenderer };
}
