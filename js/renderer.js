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
        this.marginLeft = 30;
        this.marginTop = 60;
        this.marginRight = 20;
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

    getVisualDuration(note) {
        if (!note.tupletNumber || note.tupletNumber <= 1) {
            return note.duration;
        }
        const n = note.tupletNumber;
        let temp = n - 1;
        temp |= temp >> 1;
        temp |= temp >> 2;
        temp |= temp >> 4;
        temp |= temp >> 8;
        temp |= temp >> 16;
        let m = (temp + 1) >> 1;
        if (m === 0) m = 1;
        return note.duration * n / m;
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

        // Clear canvas and draw background
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

        // Draw title
        if (this.sheetMusic.title) {
            this.ctx.font = 'bold 36px "Caveat", cursive';
            this.ctx.fillStyle = '#000000';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(this.sheetMusic.title, logicalWidth / 2, 45);
        }

        // Draw Composer (Top Right)
        if (this.sheetMusic.composer) {
            this.ctx.font = '14px sans-serif';
            this.ctx.fillStyle = '#000000';
            this.ctx.textAlign = 'right';
            this.ctx.fillText(this.sheetMusic.composer, logicalWidth - this.marginRight, 55);
        }

        // Draw Tempo / Meter / Rhythm (Top Left)
        const metaText = [this.sheetMusic.tempo, this.sheetMusic.meter, this.sheetMusic.rhythm].filter(Boolean).join(' ');
        if (metaText) {
            this.ctx.font = '14px sans-serif';
            this.ctx.fillStyle = '#000000';
            this.ctx.textAlign = 'left';
            this.ctx.fillText(metaText, this.marginLeft, 55);
        }

        for (let i = 0; i < this.sheetMusic.measures.length; i++) {
            const measure = this.sheetMusic.measures[i];

            const autoLineBreak = !measure.isNewLine && measureCounter >= 4;

            if (measure.isNewLine || isFirstMeasureInLine || autoLineBreak) {
                if (!isFirstMeasureInLine) {
                    this.currentY += lineHeight;
                }

                // Reset for new line
                currentX = this.marginLeft;
                isFirstMeasureInLine = false;
                measureCounter = 0;

                // Draw Clef and Key Signature at start of line
                if (!this.chordOnlyMode) {
                    this.drawStaff(currentX, this.currentY, 40);
                    this.drawClef(currentX, this.currentY);
                    currentX += 40;

                    const keySigWidth = this.drawKeySignature(keySF, currentX, this.currentY);
                    this.drawStaff(currentX, this.currentY, keySigWidth + 10);
                    currentX += keySigWidth + 10;
                } else {
                    currentX += 20;
                }
            }

            const isPieceEnd = (i === this.sheetMusic.measures.length - 1);

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

        const symbol = sf > 0 ? '♯' : '♭';
        const count = Math.abs(sf);

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
    drawMeasure(measure, x, y, width, index, isPieceEnd, keySF) {
        const staffTopY = y;

        if (!this.chordOnlyMode) {
            this.drawStaff(x, y, width);
        }

        let totalDuration = 0;
        for (const note of measure.notes) {
            totalDuration += note.duration;
        }
        if (totalDuration === 0) totalDuration = 4;

        let contentStartX = x + 10;
        let contentWidth = width - 20;

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
            const chordX = contentStartX + (chord.position / totalDuration) * contentWidth;
            const transposedChord = this.getTransposedChord(chord.chord, keySF);
            const formattedChord = this.formatChord(transposedChord);
            this.drawChord(formattedChord, chordX, staffTopY - 30);
        }

        // Draw notes
        if (!this.chordOnlyMode) {
            const noteInfos = [];
            let currentDurationPos = 0;

            // Accidental state management within measure
            const measureAccidentalState = new Map();
            const keyAccidentals = this.getKeyAccidentals(keySF);

            for (const note of measure.notes) {
                const noteX = contentStartX + (currentDurationPos / totalDuration) * contentWidth;

                if (!note.isRest) {
                    const transposed = this.getTransposedPitch(note, keySF);
                    const { y: noteY, staffPosition } = this.calculateNoteY(transposed.step, transposed.octave, staffTopY);
                    
                    const visualDur = this.getVisualDuration(note);
                    const isDotted = this.isDottedDuration(visualDur);
                    const stemUp = noteY > staffTopY + this.lineSpacing * 2;

                    // Accidental display decision
                    const stepIdx = { 'c': 0, 'd': 1, 'e': 2, 'f': 3, 'g': 4, 'a': 5, 'b': 6 }[transposed.step.toLowerCase()] || 0;
                    const pitchKey = transposed.octave * 7 + stepIdx;

                    let currentState;
                    if (measureAccidentalState.has(pitchKey)) {
                        currentState = measureAccidentalState.get(pitchKey);
                    } else {
                        currentState = keyAccidentals[stepIdx];
                    }

                    let displayAcc = '';
                    if (transposed.accidental !== currentState) {
                        if (transposed.accidental === 1) displayAcc = '#';
                        else if (transposed.accidental === -1) displayAcc = '-';
                        else displayAcc = 'natural';
                        measureAccidentalState.set(pitchKey, transposed.accidental);
                    }

                    noteInfos.push({
                        note,
                        x: noteX,
                        y: noteY,
                        staffPosition,
                        transposed,
                        isDotted,
                        stemUp,
                        displayAcc,
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

            // Unify stem directions for notes in beam groups
            const centerY = staffTopY + this.lineSpacing * 2;
            for (const beamGroup of beamGroups) {
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
                    const commonStemUp = avgY > centerY;

                    for (const idx of beamGroup) {
                        noteInfos[idx].stemUp = commonStemUp;
                    }
                }
            }

            // Third pass: draw notes
            for (let i = 0; i < noteInfos.length; i++) {
                const info = noteInfos[i];
                const note = info.note;
                const visualDur = this.getVisualDuration(note);

                if (info.isRest) {
                    this.drawRest(visualDur, info.x, staffTopY);
                } else {
                    if (info.displayAcc) {
                        this.drawAccidental(info.displayAcc, info.x - 9, info.y);
                    }

                    this.drawNoteHead(visualDur, info.x, info.y, info.isDotted);

                    if (info.staffPosition <= -2) {
                        for (let pos = -2; pos >= info.staffPosition; pos -= 2) {
                            const ledgerY = staffTopY + this.lineSpacing * 4 - (pos * this.lineSpacing / 2);
                            this.drawLedgerLine(info.x, ledgerY);
                        }
                    } else if (info.staffPosition >= 10) {
                        for (let pos = 10; pos <= info.staffPosition; pos += 2) {
                            const ledgerY = staffTopY + this.lineSpacing * 4 - (pos * this.lineSpacing / 2);
                            this.drawLedgerLine(info.x, ledgerY);
                        }
                    }

                    if (visualDur < 3.99) {
                        const stemHeight = this.lineSpacing * 3.5;
                        this.drawStem(info.x, info.y, stemHeight, info.stemUp);

                        const beamGroup = beamGroups.find(g => g.includes(i));

                        if (beamGroup && visualDur <= 0.5) {
                            // Beam draws it
                        } else if (visualDur <= 0.5) {
                            this.drawFlag(info.x, info.y, stemHeight, info.stemUp, visualDur);
                        }
                    }
                }
            }

            // Draw beams
            for (const beamGroup of beamGroups) {
                this.drawBeam(noteInfos, beamGroup, staffTopY);
            }

            // Draw tuplet brackets
            this.drawTupletBrackets(noteInfos, staffTopY);
        }

        this.drawBarLines(measure, x + width - 2, staffTopY, isPieceEnd);
    }

    getKeyAccidentals(keySF) {
        const accs = Array(7).fill(0);
        if (keySF > 0) {
            const order = [3, 0, 4, 1, 5, 2, 6];
            for (let i = 0; i < keySF && i < 7; i++)
                accs[order[i]] = 1;
        } else if (keySF < 0) {
            const order = [6, 2, 5, 1, 4, 0, 3];
            for (let i = 0; i < Math.abs(keySF) && i < 7; i++)
                accs[order[i]] = -1;
        }
        return accs;
    }

    /**
     * Calculate Y position for a note based on pitch
     */
    calculateNoteY(step, octave, staffTopY) {
        const pitchMap = { 'c': 0, 'd': 1, 'e': 2, 'f': 3, 'g': 4, 'a': 5, 'b': 6 };
        const stepNum = pitchMap[step.toLowerCase()] || 0;
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

        if (duration > 2) {
            this.ctx.beginPath();
            this.ctx.ellipse(x, y, width / 2, height / 2, 0, 0, Math.PI * 2);
            this.ctx.stroke();
        } else if (duration >= 1.99) {
            this.ctx.beginPath();
            this.ctx.ellipse(x, y, width / 2, height / 2, 0, 0, Math.PI * 2);
            this.ctx.stroke();
        } else {
            this.ctx.beginPath();
            this.ctx.ellipse(x, y, width / 2, height / 2, 0, 0, Math.PI * 2);
            this.ctx.fill();
        }

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
     * Draw flag for eighth/sixteenth notes
     */
    drawFlag(x, y, stemHeight, up, duration) {
        const flagCount = duration <= 0.26 ? 2 : 1;

        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 2.5;
        this.ctx.lineCap = 'round';

        const flagSize = 15;

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
        this.ctx.lineCap = 'butt';
    }

    /**
     * Draw rest symbol
     */
    drawRest(duration, x, y) {
        this.ctx.fillStyle = '#000000';
        this.ctx.font = '40px "Noto Music", serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        let symbol = '𝄽';
        if (duration >= 3.99) symbol = '𝄻';
        else if (duration >= 1.99) symbol = '𝄼';
        else if (duration <= 0.26) symbol = '𝄿';
        else if (duration <= 0.51) symbol = '𝄾';

        const verticalOffset = (duration >= 1.99) ? 0 : this.lineSpacing * 2;
        this.ctx.fillText(symbol, x, y + verticalOffset);
    }

    /**
     * Draw accidental
     */
    drawAccidental(accidental, x, y) {
        this.ctx.font = '24px "Noto Music", serif';
        this.ctx.fillStyle = '#000000';
        this.ctx.textAlign = 'center';

        let symbol = '';
        if (accidental === '+' || accidental === '#') symbol = '♯';
        else if (accidental === '-') symbol = '♭';
        else if (accidental === 'natural') symbol = '♮';

        this.ctx.fillText(symbol, x, y);
    }

    /**
     * Draw chord symbol
     */
    drawChord(chord, x, y) {
        const rootRegex = /^([A-G][#b♯♭♮]?)(.*)$/;
        const match = chord.match(rootRegex);

        if (match) {
            const root = match[1];
            const quality = match[2];

            this.ctx.font = `${this.chordFontSize}px "Oswald", sans-serif`;
            this.ctx.fillStyle = '#000000';
            this.ctx.textAlign = 'left';
            this.ctx.fillText(root, x, y);

            if (quality) {
                const rootWidth = this.ctx.measureText(root).width;
                this.ctx.font = `${Math.round(this.chordFontSize * 0.7)}px "Oswald", sans-serif`;
                this.ctx.fillText(quality, x + rootWidth, y);
            }
        } else {
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
        let formatted = chord;

        if (this.useDelta) {
            formatted = formatted.replace(/(Maj7|M7|maj7|Maj|maj)/g, 'Δ');
        }

        if (this.useMinus) {
            formatted = formatted.replace(/m7/g, '-7');
            formatted = formatted.replace(/m(?!\d|aj|Δ)/g, '-');
        }

        if (this.usePlus) {
            formatted = formatted.replace(/aug/g, '+');
        }

        if (this.usePhi) {
            formatted = formatted.replace(/m7-5/g, 'Φ');
            formatted = formatted.replace(/m7b5/g, 'Φ');
            formatted = formatted.replace(/-7-5/g, 'Φ');
        }

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

            this.ctx.fillStyle = '#000000';
            this.ctx.beginPath();
            this.ctx.arc(x - 8, y + this.lineSpacing, 2, 0, Math.PI * 2);
            this.ctx.arc(x - 8, y + this.lineSpacing * 3, 2, 0, Math.PI * 2);
            this.ctx.fill();
        } else if (isPieceEnd) {
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

        this.ctx.fillStyle = '#000000';
        this.ctx.beginPath();
        this.ctx.arc(x + 8, y + this.lineSpacing, 2, 0, Math.PI * 2);
        this.ctx.arc(x + 8, y + this.lineSpacing * 3, 2, 0, Math.PI * 2);
        this.ctx.fill();
    }

    /**
     * Draw volta bracket
     */
    drawVoltaBracket(x, y, width, number) {
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 1.5;

        this.ctx.beginPath();
        this.ctx.moveTo(x, y + 10);
        this.ctx.lineTo(x, y);
        this.ctx.lineTo(x + width, y);
        this.ctx.stroke();

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

        this.ctx.beginPath();
        this.ctx.moveTo(startX, y + 5);
        this.ctx.lineTo(startX, y);
        this.ctx.lineTo(endX, y);
        this.ctx.lineTo(endX, y + 5);
        this.ctx.stroke();

        this.ctx.font = '12px sans-serif';
        this.ctx.fillStyle = '#000000';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(number.toString(), (startX + endX) / 2, y - 2);
    }

    isDottedDuration(duration) {
        const dottedValues = [3, 1.5, 0.75, 0.375, 6.0];
        for (const val of dottedValues) {
            if (Math.abs(duration - val) < 0.05) {
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
        let i = 0;
        while (i < noteInfos.length) {
            const info = noteInfos[i];
            const visualDur = this.getVisualDuration(info.note);
            if (info.isRest || visualDur >= 0.99) {
                i++;
                continue;
            }

            let beamEnd = i;
            let beamDur = 0;
            const firstTuplet = info.note.tupletNumber || 0;

            let notePos = 0;
            for (let k = 0; k < i; k++) {
                notePos += noteInfos[k].note.duration;
            }

            for (let j = i + 1; j < noteInfos.length; j++) {
                const n = noteInfos[j];
                const nVisualDur = this.getVisualDuration(n.note);
                if (n.isRest || nVisualDur >= 0.99) {
                    break;
                }

                beamDur += noteInfos[j - 1].note.duration;

                if (firstTuplet > 0) {
                    if ((n.note.tupletNumber || 0) !== firstTuplet) {
                        break;
                    }
                    if (beamDur >= 0.99) {
                        break;
                    }
                } else {
                    const posMod = (notePos + beamDur) % 1.0;
                    if (beamDur >= 1.0 || posMod < 0.05 || posMod > 0.95) {
                        break;
                    }
                }
                beamEnd = j;
            }

            if (beamEnd > i) {
                const group = [];
                for (let k = i; k <= beamEnd; k++) {
                    group.push(k);
                }
                beamGroups.push(group);
                i = beamEnd + 1;
            } else {
                i++;
            }
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

        const stemUp = firstNote.stemUp;
        const stemHeight = this.lineSpacing * 3.5;

        const beamY1 = stemUp ? firstNote.y - stemHeight : firstNote.y + stemHeight;
        const beamY2 = stemUp ? lastNote.y - stemHeight : lastNote.y + stemHeight;

        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 3;
        this.ctx.lineCap = 'butt';

        this.ctx.beginPath();
        this.ctx.moveTo(firstNote.x + (stemUp ? 4 : -4), beamY1);
        this.ctx.lineTo(lastNote.x + (stemUp ? 4 : -4), beamY2);
        this.ctx.stroke();

        const hasSixteenth = beamGroup.some(idx => this.getVisualDuration(noteInfos[idx].note) <= 0.26);

        if (hasSixteenth) {
            const beamAngle = (beamY2 - beamY1) / (lastNote.x - firstNote.x);
            const beamOffset = stemUp ? 4 : -4;

            for (let i = 0; i < beamGroup.length; i++) {
                const idx = beamGroup[i];
                const note = noteInfos[idx];
                const visualDur = this.getVisualDuration(note.note);

                if (visualDur <= 0.26) {
                    const currentX = note.x + (stemUp ? 4 : -4);
                    const relativeX = note.x - firstNote.x;
                    const primaryBeamY = beamY1 + beamAngle * relativeX;
                    const secondaryBeamY = primaryBeamY + beamOffset;

                    if (i < beamGroup.length - 1 && this.getVisualDuration(noteInfos[beamGroup[i + 1]].note) <= 0.26) {
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
                    } else if (i > 0 && this.getVisualDuration(noteInfos[beamGroup[i - 1]].note) <= 0.26) {
                        // Drawn in previous iteration
                    } else {
                        const stubLength = 10;
                        const stubEndX = currentX + stubLength;
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

    getNoteWidth(duration) {
        if (duration >= 2) return 40;
        if (duration >= 1) return 30;
        if (duration >= 0.5) return 20;
        return 15;
    }

    getCurrentKeySharpsFlats() {
        if (!this.sheetMusic || !this.sheetMusic.key) return 0;

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

    getTransposedChord(chord, keySF) {
        return MusicUtils.transposeChord(chord, this.transposeOffset);
    }

    getTransposedPitch(note, keySF) {
        if (note.isRest) {
            return { octave: 0, step: 'r', accidental: 0, displayAcc: '' };
        }

        const pitchStr = note.pitch + (note.accidental === '#' ? '+' : note.accidental === '-' ? '-' : '');
        const octavePrefix = note.octave === 2 ? 'll' : note.octave === 3 ? 'l' : note.octave === 5 ? 'h' : note.octave === 6 ? 'hh' : '';
        const fullPitch = octavePrefix + pitchStr;

        const transposed = MusicUtils.transposePitch(fullPitch, this.transposeOffset);

        let step = 'c';
        let octave = 4;
        let accidental = '';

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

if (typeof module !== 'undefined' && module.exports) {
    module.exports = LeadSheetRenderer;
}
