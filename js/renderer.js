/**
 * Lead Sheet Renderer
 * Ported from LeadSheetView.java
 * Renders SheetMusic data on HTML5 Canvas
 */

class LeadSheetRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.sheetMusic = null;
        this.dpr = window.devicePixelRatio || 1;

        // Rendering parameters
        this.lineSpacing = 8;  // Space between staff lines
        this.measureWidth = 200;
        this.marginLeft = 30; // Reduced from 60
        this.marginTop = 60;  // Slightly reduced from 80
        this.marginRight = 20; // Reduced from 40
        this.currentY = this.marginTop;

        // Settings (can be changed externally)
        this.transposeOffset = 0;
        this.chordOnlyMode = false;
        this.lineSpacingScale = 1.0;
        this.chordFontSize = 24;
        this.scaleFactor = 1.0;

        // Chord notation settings
        this.useDelta = false;
        this.useMinus = false;
        this.usePlus = false;
        this.usePhi = false;
        this.useDimMinus = false;
    }

    setSheetMusic(sheetMusic) {
        this.sheetMusic = sheetMusic;
    }

    setTransposeOffset(offset) {
        this.transposeOffset = offset;
    }

    setChordOnlyMode(enabled) {
        this.chordOnlyMode = enabled;
    }

    setLineSpacingScale(scale) {
        this.lineSpacingScale = scale;
        this.lineSpacing = 8 * scale;
    }

    /**
     * Main render function
     */
    render() {
        if (!this.sheetMusic) return;

        // Calculate key signature for width estimation
        let keySF = this.getCurrentKeySharpsFlats();
        let headerWidth = 0;
        if (!this.chordOnlyMode) {
            const keySigWidth = Math.abs(keySF) * 10;
            headerWidth = 40 + keySigWidth + 10; // Clef(40) + KeySig + Padding(10)
        } else {
            headerWidth = 20; // Indent for chord only mode
        }

        const logicalWidth = this.canvas.clientWidth || 2000;
        const availableWidth = logicalWidth - this.marginLeft - this.marginRight - headerWidth;
        this.measureWidth = availableWidth / 4;
        const lineHeight = this.lineSpacing * 12;

        // PRE-CALCULATE HEIGHT
        // We need to estimate how many lines are needed.
        // Explicit 'nl' (isNewLine) complicates this, so we do a quick pass.
        let estimatedY = this.marginTop + 40;
        let lineCount = 1;
        let mCount = 0;
        for (let i = 0; i < this.sheetMusic.measures.length; i++) {
            const m = this.sheetMusic.measures[i];
            if (m.isNewLine || mCount >= 4) {
                lineCount++;
                mCount = 0;
            }
            mCount++;
        }
        const requiredHeight = estimatedY + (lineCount * lineHeight) + 60;

        // Resize canvas if needed (with HiDPI support)
        const targetWidth = logicalWidth * this.dpr;
        const targetHeight = requiredHeight * this.dpr;

        if (this.canvas.height !== targetHeight || this.canvas.width !== targetWidth) {
            this.canvas.width = targetWidth;
            this.canvas.height = targetHeight;
            this.canvas.style.width = logicalWidth + 'px';
            this.canvas.style.height = requiredHeight + 'px';
            this.ctx.scale(this.dpr, this.dpr);
        }

        // Clear canvas and draw background AFTER potential resize
        this.ctx.clearRect(0, 0, logicalWidth, requiredHeight);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, 0, logicalWidth, requiredHeight);

        // Calculate key signature
        keySF = this.getCurrentKeySharpsFlats();

        // Reset Y position
        this.currentY = this.marginTop + 40;
        let currentX = this.marginLeft;
        let isFirstMeasureInLine = true;
        let measureCounter = 0;

        // Draw title with more spacing
        if (this.sheetMusic.title) {
            this.ctx.font = 'bold 36px "Caveat", cursive';
            this.ctx.fillStyle = '#000000';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(this.sheetMusic.title, logicalWidth / 2, 45);
        }

        for (let i = 0; i < this.sheetMusic.measures.length; i++) {
            const measure = this.sheetMusic.measures[i];

            // Check for new line (Explicit 'nl' OR every 4 measures)
            // Note: measureCounter is 0-indexed count on current line (0, 1, 2, 3)
            const autoLineBreak = !measure.isNewLine && measureCounter >= 4;

            if (measure.isNewLine || isFirstMeasureInLine || autoLineBreak) {
                if (!isFirstMeasureInLine) { // Don't move down for the very first line
                    this.currentY += lineHeight;
                }

                // Reset for new line
                currentX = this.marginLeft;
                isFirstMeasureInLine = false;
                measureCounter = 0;

                // Draw Clef and Key Signature at start of line
                if (!this.chordOnlyMode) {
                    // Draw staff background for header area (Clef + KeySig)
                    // Fixed width for header area: Clef(40) + KeySig + Padding
                    // Simply calculate positions

                    // Draw Clef
                    this.drawStaff(currentX, this.currentY, 40); // Backup staff for clef
                    this.drawClef(currentX, this.currentY);
                    currentX += 40;

                    // Draw Key Signature
                    const keySigWidth = this.drawKeySignature(keySF, currentX, this.currentY);
                    this.drawStaff(currentX, this.currentY, keySigWidth + 10); // Backup staff for key sig
                    currentX += keySigWidth + 10;
                } else {
                    currentX += 20; // Indent for chord only mode
                }
            }

            // Determine if this is the last measure of the piece
            const isPieceEnd = (i === this.sheetMusic.measures.length - 1);

            // Draw the measure (Staff lines will be drawn inside drawMeasure)
            this.drawMeasure(measure, currentX, this.currentY, this.measureWidth, i, isPieceEnd, keySF);

            currentX += this.measureWidth;
            measureCounter++;
        }
    }

    /**
     * Draw five horizontal staff lines
     */
    drawStaff(x, y, width) {
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 1;

        for (let i = 0; i < 5; i++) {
            const lineY = y + i * this.lineSpacing;
            this.ctx.beginPath();
            this.ctx.moveTo(x, lineY);
            this.ctx.lineTo(x + width, lineY);
            this.ctx.stroke();
        }
    }

    /**
     * Draw treble clef
     */
    drawClef(x, y) {
        this.ctx.font = '40px "Noto Music", serif';
        this.ctx.fillStyle = '#000000';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('𝄞', x, y + this.lineSpacing * 2);
    }

    /**
     * Draw key signature (sharps or flats)
     */
    drawKeySignature(sf, x, y) {
        if (sf === 0) return 0;

        const symbol = sf > 0 ? '#' : '♭';
        const count = Math.abs(sf);

        // Positions for sharps/flats on staff (line numbers from bottom)
        const sharpPositions = [4, 2.5, 4.5, 3, 1.5, 3.5, 2]; // F C G D A E B
        const flatPositions = [2, 3.5, 2.5, 4, 3, 4.5, 4]; // B E A D G C F
        const positions = sf > 0 ? sharpPositions : flatPositions;

        this.ctx.font = '24px "Noto Music", serif';
        this.ctx.fillStyle = '#000000';
        this.ctx.textAlign = 'center';

        for (let i = 0; i < count && i < positions.length; i++) {
            const posY = y + this.lineSpacing * (4 - positions[i]);
            this.ctx.fillText(symbol, x + i * 12, posY);
        }

        return count * 12;
    }

    /**
     * Draw a single measure
     */
    /**
     * Draw a single measure
     */
    drawMeasure(measure, x, y, width, index, isPieceEnd, keySF) {
        const staffTopY = y;

        // Draw staff lines for this measure (if not chord only)
        if (!this.chordOnlyMode) {
            this.drawStaff(x, y, width);
        }

        const staffBottomY = y + this.lineSpacing * 4;

        // Calculate total duration for proportional spacing
        let totalDuration = 0;
        for (const note of measure.notes) {
            totalDuration += note.duration;
        }
        if (totalDuration === 0) totalDuration = 4; // Default validation

        let contentStartX = x + 10; // Left padding (Reduced from 20)
        let contentWidth = width - 20; // Total width minus padding (Reduced from 40)

        // Adjust for repeat signs to prevent overlap
        if (measure.repeatStart) {
            contentStartX += 15;
            contentWidth -= 15;
        }

        // Draw section label
        if (measure.sectionLabel) {
            this.ctx.font = 'bold 26px sans-serif';
            this.ctx.fillStyle = '#000000';
            this.ctx.textAlign = 'left';
            this.ctx.fillText('[' + measure.sectionLabel + ']', x - 40, staffTopY - 40);
        }

        // Draw volta bracket
        if (measure.voltaNumber > 0) {
            this.drawVoltaBracket(x, staffTopY - 20, width, measure.voltaNumber);
        }

        // Draw repeat start
        if (measure.repeatStart) {
            this.drawRepeatSign(x, staffTopY, true);
        }

        // Draw chords
        for (const chord of measure.chords) {
            // Use same proportional logic for chords
            const chordX = contentStartX + (chord.position / totalDuration) * contentWidth;
            const transposedChord = this.getTransposedChord(chord.chord, keySF);
            const formattedChord = this.formatChord(transposedChord);
            this.drawChord(formattedChord, chordX, staffTopY - 30);
        }

        // Draw notes (unless chord-only mode)
        if (!this.chordOnlyMode) {
            const noteInfos = [];
            // Track cumulative duration for positioning
            let currentDurationPos = 0;

            // First pass: collect note information
            for (const note of measure.notes) {
                // Calculate proportional X
                const noteX = contentStartX + (currentDurationPos / totalDuration) * contentWidth;

                if (!note.isRest) {
                    const transposed = this.getTransposedPitch(note, keySF);
                    const { y: noteY, staffPosition } = this.calculateNoteY(transposed.step, transposed.octave, staffTopY);
                    const isDotted = this.isDottedDuration(note.duration);
                    const stemUp = noteY > staffTopY + this.lineSpacing * 2;

                    noteInfos.push({
                        note,
                        x: noteX,
                        y: noteY,
                        staffPosition,
                        transposed,
                        isDotted,
                        stemUp,
                        isRest: false
                    });
                } else {
                    noteInfos.push({
                        note,
                        x: noteX,
                        y: 0,
                        staffPosition: 0,
                        isRest: true
                    });
                }

                currentDurationPos += note.duration;
            }

            // Second pass: detect beams
            const beamGroups = this.detectBeamGroups(noteInfos);

            // NEW: Unify stem directions for notes in beam groups
            const centerY = staffTopY + this.lineSpacing * 2;
            for (const beamGroup of beamGroups) {
                // Calculate average Y position to decide common stem direction
                let sumY = 0;
                let count = 0;
                for (const idx of beamGroup) {
                    if (!noteInfos[idx].isRest) {
                        sumY += noteInfos[idx].y;
                        count++;
                    }
                }

                if (count > 0) {
                    const avgY = sumY / count;
                    // avgY > centerY means the average note is lower on the staff (higher Y), so stems should go UP
                    const commonStemUp = avgY > centerY;

                    for (const idx of beamGroup) {
                        noteInfos[idx].stemUp = commonStemUp;
                    }
                }
            }

            // Third pass: draw notes with beams
            for (let i = 0; i < noteInfos.length; i++) {
                const info = noteInfos[i];
                const note = info.note;

                if (info.isRest) {
                    this.drawRest(note.duration, info.x, staffTopY);
                } else {
                    // Draw accidental if needed
                    if (info.transposed.displayAcc) {
                        this.drawAccidental(info.transposed.displayAcc, info.x - 9, info.y);
                    }

                    // Draw note head with dot if needed
                    this.drawNoteHead(note.duration, info.x, info.y, info.isDotted);

                    // Draw ledger lines
                    if (info.staffPosition <= -2) {
                        // Below staff (C4 and lower)
                        for (let pos = -2; pos >= info.staffPosition; pos -= 2) {
                            const ledgerY = staffTopY + this.lineSpacing * 4 - (pos * this.lineSpacing / 2);
                            this.drawLedgerLine(info.x, ledgerY);
                        }
                    } else if (info.staffPosition >= 10) {
                        // Above staff (A5 and higher)
                        for (let pos = 10; pos <= info.staffPosition; pos += 2) {
                            const ledgerY = staffTopY + this.lineSpacing * 4 - (pos * this.lineSpacing / 2);
                            this.drawLedgerLine(info.x, ledgerY);
                        }
                    }

                    // Draw stem for all notes except whole notes (duration < 4)
                    if (note.duration < 4) {
                        const stemHeight = this.lineSpacing * 3.5;
                        this.drawStem(info.x, info.y, stemHeight, info.stemUp);

                        // Check if this note is part of a beam group
                        const beamGroup = beamGroups.find(g => g.includes(i));

                        if (beamGroup && note.duration <= 0.5) {
                            // Will be drawn as part of beam
                            // Don't draw flags individually
                        } else if (note.duration <= 0.5) {
                            // Draw individual flag
                            this.drawFlag(info.x, info.y, stemHeight, info.stemUp, note.duration);
                        }
                    }
                }
            }

            // Draw beams
            for (const beamGroup of beamGroups) {
                this.drawBeam(noteInfos, beamGroup, staffTopY);
            }

            // Draw tuplet brackets if needed
            this.drawTupletBrackets(noteInfos, staffTopY);
        }

        // Draw bar line at end (adjust -2 to ensure visibility inside canvas and within fixed width)
        this.drawBarLines(measure, x + width - 2, staffTopY, isPieceEnd);
    }

    /**
     * Calculate Y position for a note based on pitch
     */
    calculateNoteY(step, octave, staffTopY) {
        // Map pitch to position on staff
        // Middle C (C4) is on first ledger line below staff
        const pitchMap = { 'c': 0, 'd': 1, 'e': 2, 'f': 3, 'g': 4, 'a': 5, 'b': 6 };
        const stepNum = pitchMap[step.toLowerCase()] || 0;

        // Calculate position relative to C4
        const positionFromC4 = (octave - 4) * 7 + stepNum;

        // C4 is at position -1 from bottom staff line (first ledger line below)
        // Bottom staff line is 0, each line/space up is +1
        // ADJUSTED: Lower by one octave (octave - 5 instead of octave - 4)
        // staffPosition 0 is the bottom line (E4)
        // staffPosition -2 is C4 (middle C)
        const staffPosition = ((octave - 5) * 7 + stepNum) + 5;

        const y = staffTopY + this.lineSpacing * 4 - (staffPosition * this.lineSpacing / 2);
        return { y, staffPosition };
    }

    /**
     * Draw a ledger line
     */
    drawLedgerLine(x, y) {
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(x - 10, y);
        this.ctx.lineTo(x + 10, y);
        this.ctx.stroke();
    }

    /**
     * Draw note head (with optional dot)
     */
    drawNoteHead(duration, x, y, isDotted = false) {
        this.ctx.fillStyle = '#000000';
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 1.5;

        const width = 9;
        const height = 6;

        // Correct duration thresholds:
        // duration >= 2 → Whole note (hollow, no stem later)
        // duration > 1 AND < 2 → Half note (hollow with stem) - e.g., 1.5 for dotted half
        // duration <= 1 → Quarter and shorter (filled with stem)
        if (duration > 2) {
            // Whole note - hollow oval, no stem (includes dotted whole: 3)
            this.ctx.beginPath();
            this.ctx.ellipse(x, y, width / 2, height / 2, 0, 0, Math.PI * 2);
            this.ctx.stroke();
        } else if (duration >= 2) {
            // Half note - hollow oval with stem (includes dotted half: 1.5)
            this.ctx.beginPath();
            this.ctx.ellipse(x, y, width / 2, height / 2, 0, 0, Math.PI * 2);
            this.ctx.stroke();
        } else {
            // Quarter note and shorter - filled oval with stem (duration <= 1)
            this.ctx.beginPath();
            this.ctx.ellipse(x, y, width / 2, height / 2, 0, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // Draw dot if dotted note
        if (isDotted) {
            this.ctx.beginPath();
            this.ctx.arc(x + 10, y, 2, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    /**
     * Draw stem
     */
    drawStem(x, y, height, up) {
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();

        if (up) {
            this.ctx.moveTo(x + 4, y);
            this.ctx.lineTo(x + 4, y - height);
        } else {
            this.ctx.moveTo(x - 4, y);
            this.ctx.lineTo(x - 4, y + height);
        }
        this.ctx.stroke();
    }

    /**
     * Draw flag for eighth/sixteenth notes (larger size)
     */
    drawFlag(x, y, stemHeight, up, duration) {
        const flagCount = duration <= 0.25 ? 2 : 1; // Two flags for sixteenth, one for eighth

        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 2.5;
        this.ctx.lineCap = 'round';

        const flagSize = 15; // Increased from 8 to 15

        for (let i = 0; i < flagCount; i++) {
            this.ctx.beginPath();
            if (up) {
                const flagY = y - stemHeight + i * 6;
                this.ctx.moveTo(x + 4, flagY);
                this.ctx.quadraticCurveTo(x + flagSize + 4, flagY + 6, x + flagSize - 2, flagY + flagSize);
            } else {
                const flagY = y + stemHeight - i * 6;
                this.ctx.moveTo(x - 4, flagY);
                this.ctx.quadraticCurveTo(x - flagSize - 4, flagY - 6, x - flagSize + 2, flagY - flagSize);
            }
            this.ctx.stroke();
        }
        this.ctx.lineCap = 'butt'; // Reset
    }

    /**
     * Draw rest symbol
     */
    drawRest(duration, x, y) {
        this.ctx.fillStyle = '#000000';
        this.ctx.font = '40px "Noto Music", serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        let symbol = '𝄽'; // Quarter rest (default)
        if (duration >= 4) symbol = '𝄻'; // Whole rest
        else if (duration >= 2) symbol = '𝄼'; // Half rest
        else if (duration <= 0.5) symbol = '𝄾'; // Eighth rest
        else if (duration <= 0.25) symbol = '𝄿'; // Sixteenth rest

        // Positioning adjustment: blocks (whole/half) sit differently than shaped rests (quarter/eighth)
        // Shift quarter and shorter rests down to center them on the staff
        const verticalOffset = (duration >= 2) ? 0 : this.lineSpacing * 2;
        this.ctx.fillText(symbol, x, y + verticalOffset);
    }

    /**
     * Draw accidental (sharp, flat, natural)
     */
    drawAccidental(accidental, x, y) {
        this.ctx.font = '24px "Noto Music", serif';
        this.ctx.fillStyle = '#000000';
        this.ctx.textAlign = 'center';

        let symbol = '';
        if (accidental === '+' || accidental === '#') symbol = '#';
        else if (accidental === '-') symbol = '♭';
        else if (accidental === 'natural') symbol = '♮';

        this.ctx.fillText(symbol, x, y);
    }

    /**
     * Draw chord symbol with dual font sizes (Root is full size, Quality is 70%)
     */
    drawChord(chord, x, y) {
        const rootRegex = /^([A-G][#b♯♭♮]?)(.*)$/;
        const match = chord.match(rootRegex);

        if (match) {
            const root = match[1];
            const quality = match[2];

            // Draw Root
            this.ctx.font = `${this.chordFontSize}px "Oswald", sans-serif`;
            this.ctx.fillStyle = '#000000';
            this.ctx.textAlign = 'left';
            this.ctx.fillText(root, x, y);

            // Draw Quality at 70% size
            if (quality) {
                const rootWidth = this.ctx.measureText(root).width;
                this.ctx.font = `${Math.round(this.chordFontSize * 0.7)}px "Oswald", sans-serif`;
                // Slight vertical offset (optional) - usually baseline is fine, but can adjust if needed
                this.ctx.fillText(quality, x + rootWidth, y);
            }
        } else {
            // Fallback for non-standard chords
            this.ctx.font = `${this.chordFontSize}px "Oswald", sans-serif`;
            this.ctx.fillStyle = '#000000';
            this.ctx.textAlign = 'left';
            this.ctx.fillText(chord, x, y);
        }
    }

    /**
     * Format chord notation based on settings
     */
    formatChord(chord) {
        // Apply notation preferences
        let formatted = chord;

        // Maj -> Δ
        if (this.useDelta) {
            formatted = formatted.replace(/(Maj7|M7|maj7|Maj|maj)/g, 'Δ');
        }

        // m -> -
        if (this.useMinus) {
            formatted = formatted.replace(/m7/g, '-7');
            formatted = formatted.replace(/m(?!\d|aj|Δ)/g, '-');
        }

        // aug -> +
        if (this.usePlus) {
            formatted = formatted.replace(/aug/g, '+');
        }

        // m7b5 -> Φ
        if (this.usePhi) {
            formatted = formatted.replace(/m7-5/g, 'Φ');
            formatted = formatted.replace(/m7b5/g, 'Φ');
            formatted = formatted.replace(/-7-5/g, 'Φ');
        }

        // dim -> -
        if (this.useDimMinus) {
            formatted = formatted.replace(/dim/g, '-');
        }

        return formatted;
    }

    /**
     * Draw bar lines
     */
    drawBarLines(measure, x, y, isPieceEnd) {
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 1.5;

        if (measure.repeatEnd) {
            // Repeat end: dots + thin + thick
            // One thin line (1.5px) and one thick line (3px)
            this.ctx.lineWidth = 1.5;
            this.ctx.beginPath();
            this.ctx.moveTo(x - 4, y);
            this.ctx.lineTo(x - 4, y + this.lineSpacing * 4);
            this.ctx.stroke();

            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.moveTo(x, y);
            this.ctx.lineTo(x, y + this.lineSpacing * 4);
            this.ctx.stroke();

            // Dots
            this.ctx.fillStyle = '#000000';
            this.ctx.beginPath();
            this.ctx.arc(x - 8, y + this.lineSpacing, 2, 0, Math.PI * 2);
            this.ctx.arc(x - 8, y + this.lineSpacing * 3, 2, 0, Math.PI * 2);
            this.ctx.fill();
        } else if (isPieceEnd) {
            // Final barline: thin + thick
            this.ctx.lineWidth = 1.5;
            this.ctx.beginPath();
            this.ctx.moveTo(x - 4, y);
            this.ctx.lineTo(x - 4, y + this.lineSpacing * 4);
            this.ctx.stroke();

            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.moveTo(x, y);
            this.ctx.lineTo(x, y + this.lineSpacing * 4);
            this.ctx.stroke();
        } else if (measure.isDoubleBar) {
            // Double bar: thin + thin
            this.ctx.lineWidth = 1.5;
            this.ctx.beginPath();
            this.ctx.moveTo(x - 4, y);
            this.ctx.lineTo(x - 4, y + this.lineSpacing * 4);
            this.ctx.stroke();

            this.ctx.lineWidth = 1.5;
            this.ctx.beginPath();
            this.ctx.moveTo(x, y);
            this.ctx.lineTo(x, y + this.lineSpacing * 4);
            this.ctx.stroke();
        } else {
            // Single bar line
            this.ctx.lineWidth = 1.5;
            this.ctx.beginPath();
            this.ctx.moveTo(x, y);
            this.ctx.lineTo(x, y + this.lineSpacing * 4);
            this.ctx.stroke();
        }
    }

    /**
     * Draw repeat sign at start of measure
     */
    drawRepeatSign(x, y, isStart) {
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        this.ctx.lineTo(x, y + this.lineSpacing * 4);
        this.ctx.stroke();

        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.moveTo(x + 4, y);
        this.ctx.lineTo(x + 4, y + this.lineSpacing * 4);
        this.ctx.stroke();

        // Dots
        this.ctx.fillStyle = '#000000';
        this.ctx.beginPath();
        this.ctx.arc(x + 8, y + this.lineSpacing, 2, 0, Math.PI * 2);
        this.ctx.arc(x + 8, y + this.lineSpacing * 3, 2, 0, Math.PI * 2);
        this.ctx.fill();
    }

    /**
     * Draw volta bracket (ending bracket)
     */
    drawVoltaBracket(x, y, width, number) {
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 1.5;

        // Bracket
        this.ctx.beginPath();
        this.ctx.moveTo(x, y + 10);
        this.ctx.lineTo(x, y);
        this.ctx.lineTo(x + width, y);
        this.ctx.stroke();

        // Number
        this.ctx.font = '14px sans-serif';
        this.ctx.fillStyle = '#000000';
        this.ctx.fillText(number.toString() + '.', x + 5, y + 10);
    }

    /**
     * Draw tuplet brackets
     */
    drawTupletBrackets(noteInfos, staffTopY) {
        let tupletStart = null;
        let tupletNotes = [];

        for (let i = 0; i < noteInfos.length; i++) {
            const info = noteInfos[i];

            if (info.note.tupletNumber > 0) {
                if (!tupletStart) {
                    tupletStart = info;
                    tupletNotes = [info];
                } else {
                    tupletNotes.push(info);
                }
            } else if (tupletStart) {
                // End of tuplet group
                this.drawTupletBracket(
                    tupletStart.x,
                    noteInfos[i - 1].x,
                    staffTopY - 20,
                    tupletStart.note.tupletNumber
                );
                tupletStart = null;
                tupletNotes = [];
            }
        }

        // Draw last tuplet if exists
        if (tupletStart && tupletNotes.length > 0) {
            this.drawTupletBracket(
                tupletStart.x,
                tupletNotes[tupletNotes.length - 1].x,
                staffTopY - 20,
                tupletStart.note.tupletNumber
            );
        }
    }

    /**
     * Draw single tuplet bracket
     */
    drawTupletBracket(startX, endX, y, number) {
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 1;

        // Bracket
        this.ctx.beginPath();
        this.ctx.moveTo(startX, y + 5);
        this.ctx.lineTo(startX, y);
        this.ctx.lineTo(endX, y);
        this.ctx.lineTo(endX, y + 5);
        this.ctx.stroke();

        // Number
        this.ctx.font = '12px sans-serif';
        this.ctx.fillStyle = '#000000';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(number.toString(), (startX + endX) / 2, y - 2);
    }

    /**
     * Check if duration represents a dotted note
     */
    isDottedDuration(duration) {
        // Common dotted note durations: 3, 1.5, 0.75, 0.375
        const dottedValues = [3, 1.5, 0.75, 0.375];
        for (const val of dottedValues) {
            if (Math.abs(duration - val) < 0.001) {
                return true;
            }
        }
        return false;
    }

    /**
     * Detect groups of consecutive eighth/sixteenth notes for beaming
     */
    detectBeamGroups(noteInfos) {
        const beamGroups = [];
        let currentGroup = [];

        for (let i = 0; i < noteInfos.length; i++) {
            const info = noteInfos[i];

            if (info.isRest) {
                // Rest breaks the beam
                if (currentGroup.length >= 2) {
                    beamGroups.push([...currentGroup]);
                }
                currentGroup = [];
            } else if (info.note.duration <= 0.5 && !info.isDotted) {
                // Eighth note or shorter (not dotted) can be beamed
                currentGroup.push(i);
            } else {
                // Other durations break the beam
                if (currentGroup.length >= 2) {
                    beamGroups.push([...currentGroup]);
                }
                currentGroup = [];
            }
        }

        // Don't forget the last group
        if (currentGroup.length >= 2) {
            beamGroups.push([...currentGroup]);
        }

        return beamGroups;
    }

    /**
     * Draw beam connecting multiple eighth/sixteenth notes
     */
    drawBeam(noteInfos, beamGroup, staffTopY) {
        if (beamGroup.length < 2) return;

        const firstNote = noteInfos[beamGroup[0]];
        const lastNote = noteInfos[beamGroup[beamGroup.length - 1]];

        // Determine stem direction (use the first note's direction)
        const stemUp = firstNote.stemUp;
        const stemHeight = this.lineSpacing * 3.5;

        // Calculate beam positions
        const beamY1 = stemUp ? firstNote.y - stemHeight : firstNote.y + stemHeight;
        const beamY2 = stemUp ? lastNote.y - stemHeight : lastNote.y + stemHeight;

        // Draw primary beam (for eighth notes)
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 3;
        this.ctx.lineCap = 'butt';

        this.ctx.beginPath();
        this.ctx.moveTo(firstNote.x + (stemUp ? 4 : -4), beamY1);
        this.ctx.lineTo(lastNote.x + (stemUp ? 4 : -4), beamY2);
        this.ctx.stroke();

        // Check if we need secondary beams for sixteenth notes
        const hasSixteenth = beamGroup.some(idx => noteInfos[idx].note.duration <= 0.25);

        if (hasSixteenth) {
            // Calculate beam angle from primary beam for alignment
            const beamAngle = (beamY2 - beamY1) / (lastNote.x - firstNote.x);
            const beamOffset = stemUp ? 4 : -4;

            for (let i = 0; i < beamGroup.length; i++) {
                const idx = beamGroup[i];
                const note = noteInfos[idx];

                if (note.note.duration <= 0.25) {
                    const currentX = note.x + (stemUp ? 4 : -4);
                    // Use beam angle to calculate secondary beam Y position
                    const relativeX = note.x - firstNote.x;
                    const primaryBeamY = beamY1 + beamAngle * relativeX;
                    const secondaryBeamY = primaryBeamY + beamOffset;

                    // Determine if we should connect to next or previous note
                    if (i < beamGroup.length - 1 && noteInfos[beamGroup[i + 1]].note.duration <= 0.25) {
                        // Connect to next sixteenth note
                        const nextIdx = beamGroup[i + 1];
                        const nextNote = noteInfos[nextIdx];
                        const nextX = nextNote.x + (stemUp ? 4 : -4);
                        const nextRelativeX = nextNote.x - firstNote.x;
                        const nextPrimaryBeamY = beamY1 + beamAngle * nextRelativeX;
                        const nextSecondaryBeamY = nextPrimaryBeamY + beamOffset;

                        this.ctx.beginPath();
                        this.ctx.moveTo(currentX, secondaryBeamY);
                        this.ctx.lineTo(nextX, nextSecondaryBeamY);
                        this.ctx.stroke();
                    } else if (i > 0 && noteInfos[beamGroup[i - 1]].note.duration <= 0.25) {
                        // Already drawn in previous iteration
                    } else {
                        // Isolated sixteenth - draw short beam stub extending RIGHT
                        const stubLength = 10;
                        const stubEndX = currentX + stubLength; // Always extend to the right
                        const stubRelativeX = (note.x + stubLength) - firstNote.x;
                        const stubPrimaryBeamY = beamY1 + beamAngle * stubRelativeX;
                        const stubSecondaryBeamY = stubPrimaryBeamY + beamOffset;

                        this.ctx.beginPath();
                        this.ctx.moveTo(currentX, secondaryBeamY);
                        this.ctx.lineTo(stubEndX, stubSecondaryBeamY);
                        this.ctx.stroke();
                    }
                }
            }
        }
    }

    /**
     * Get note width based on duration
     */
    getNoteWidth(duration) {
        if (duration >= 2) return 40;
        if (duration >= 1) return 30;
        if (duration >= 0.5) return 20;
        return 15;
    }

    /**
     * Get current key signature (sharps/flats count)
     */
    getCurrentKeySharpsFlats() {
        if (!this.sheetMusic || !this.sheetMusic.key) return 0;

        // Get transposed key name
        const key = MusicUtils.transposeKeyName(this.sheetMusic.key, this.transposeOffset);

        const keyMap = {
            'C': 0, 'Am': 0,
            'G': 1, 'Em': 1,
            'D': 2, 'Bm': 2,
            'A': 3, 'F#m': 3,
            'E': 4, 'C#m': 4,
            'B': 5, 'G#m': 5,
            'F#': 6, 'D#m': 6,
            'F': -1, 'Dm': -1,
            'Bb': -2, 'Gm': -2,
            'Eb': -3, 'Cm': -3,
            'Ab': -4, 'Fm': -4,
            'Db': -5, 'Bbm': -5,
            'Gb': -6, 'Ebm': -6
        };
        return keyMap[key] || 0;
    }

    /**
     * Transpose chord based on current transpose offset
     */
    getTransposedChord(chord, keySF) {
        return MusicUtils.transposeChord(chord, this.transposeOffset);
    }

    /**
     * Get transposed pitch information for a note
     */
    getTransposedPitch(note, keySF) {
        if (note.isRest) {
            return { octave: 0, step: 'r', accidental: 0, displayAcc: '' };
        }

        // Apply transpose
        const pitchStr = note.pitch + (note.accidental === '#' ? '+' : note.accidental === '-' ? '-' : '');
        const octavePrefix = note.octave === 2 ? 'll' : note.octave === 3 ? 'l' : note.octave === 5 ? 'h' : note.octave === 6 ? 'hh' : '';
        const fullPitch = octavePrefix + pitchStr;

        const transposed = MusicUtils.transposePitch(fullPitch, this.transposeOffset);

        // Parse transposed result
        let step = 'c';
        let octave = 4;
        let accidental = '';

        // Parse octave prefix
        let idx = 0;
        if (transposed.startsWith('ll')) {
            octave = 2; idx = 2;
        } else if (transposed.startsWith('hh')) {
            octave = 6; idx = 2;
        } else if (transposed.startsWith('l')) {
            octave = 3; idx = 1;
        } else if (transposed.startsWith('h')) {
            octave = 5; idx = 1;
        }

        step = transposed[idx];

        if (transposed.length > idx + 1 && (transposed[idx + 1] === '+' || transposed[idx + 1] === '-')) {
            accidental = transposed[idx + 1] === '+' ? '#' : '-';
        }

        // Compare with key signature to decide if we need to display it
        const expectedAcc = MusicUtils.getAccidentalInKey(step, keySF);
        const actualAccValue = (accidental === '#' ? 1 : accidental === '-' ? -1 : 0);

        let displayAcc = '';
        if (actualAccValue !== expectedAcc) {
            if (accidental === '#') displayAcc = '#';
            else if (accidental === '-') displayAcc = '-';
            else displayAcc = 'natural';
        }

        return {
            octave,
            step,
            accidental: actualAccValue,
            displayAcc: displayAcc
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LeadSheetRenderer;
}
