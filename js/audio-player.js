/**
 * Lead Sheet Audio Player & Synthesizer
 * Direct, zero-asset port of AudioPlayer.java
 * High-fidelity additive synthesis (Fundamental + 2nd & 3rd harmonics + exponential decay + peak limiter)
 * Realtime Swing/Shuffle transformation, repeat unrolling, and lossless WAV export.
 */

class AudioPlayer {
    static SAMPLE_RATE = 44100;
    static RHYTHM_EVEN = 0;
    static RHYTHM_SWING = 1;
    static RHYTHM_SHUFFLE = 2;

    constructor() {
        this.ctx = null;
        this.currentSource = null;
        this.isPlaying = false;
        this.isLooping = false;

        this.bpm = 120;
        this.rhythmFeel = AudioPlayer.RHYTHM_EVEN;

        this.volumeMelody = 1.0;
        this.volumeChords = 0.8;
        this.volumeBass = 0.4;

        this.onPlaybackStateChanged = null;
        this.onMeasurePlayback = null;
        this.onElementPlayback = null;
        this.onPlaybackStopped = null;

        this.animFrameId = null;
        this.playbackStartTime = 0;
        this.loopDuration = 0;
        this.measureTimings = [];
        this.elementTimings = [];
        this.lastNotifiedMeasureIdx = -1;
        this.lastNotifiedElementIdx = -1;
    }

    initAudioContext() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext({ sampleRate: AudioPlayer.SAMPLE_RATE });
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    setBpm(bpm) {
        this.bpm = Math.max(20, Math.min(320, bpm));
    }

    setRhythmFeel(feel) {
        this.rhythmFeel = feel;
    }

    setLooping(looping) {
        this.isLooping = looping;
        if (this.currentSource) {
            this.currentSource.loop = looping;
        }
    }

    setVolumes(melody, chords, bass) {
        this.volumeMelody = Math.max(0, Math.min(1.0, melody));
        this.volumeChords = Math.max(0, Math.min(1.0, chords));
        this.volumeBass = Math.max(0, Math.min(1.0, bass));
    }

    play(sheetMusic) {
        if (this.isPlaying) this.stop();
        if (!sheetMusic || !sheetMusic.measures || sheetMusic.measures.length === 0) return;

        this.initAudioContext();

        let sequence = this.unrollRepeats(sheetMusic.measures);
        if (this.rhythmFeel === AudioPlayer.RHYTHM_SWING) {
            sequence = this.applyJazzTransform(sequence);
        } else if (this.rhythmFeel === AudioPlayer.RHYTHM_SHUFFLE) {
            sequence = this.applyShuffleTransform(sequence);
        }

        this.measureTimings = [];
        this.elementTimings = [];
        const prep = this.prepareEvents(sequence, this.measureTimings, this.elementTimings);
        if (prep.events.length === 0 || prep.totalDuration <= 0) return;

        this.loopDuration = prep.totalDuration;
        const pcmData = this.synthesizePCM(prep.events, prep.totalDuration);

        const audioBuffer = this.ctx.createBuffer(1, pcmData.length, AudioPlayer.SAMPLE_RATE);
        audioBuffer.copyToChannel(pcmData, 0);

        const source = this.ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.loop = this.isLooping;

        source.connect(this.ctx.destination);
        source.start();

        this.currentSource = source;
        this.isPlaying = true;
        this.playbackStartTime = this.ctx.currentTime;
        this.lastNotifiedMeasureIdx = -1;
        this.lastNotifiedElementIdx = -1;

        if (this.onPlaybackStateChanged) this.onPlaybackStateChanged(true);

        source.onended = () => {
            if (this.isPlaying && !this.isLooping) {
                this.stop();
            }
        };

        this.startTrackingLoop();
    }

    stop() {
        if (this.animFrameId) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = null;
        }

        if (this.currentSource) {
            try {
                this.currentSource.onended = null;
                this.currentSource.stop();
                this.currentSource.disconnect();
            } catch (e) {}
            this.currentSource = null;
        }

        this.isPlaying = false;
        if (this.onPlaybackStateChanged) this.onPlaybackStateChanged(false);
        if (this.onPlaybackStopped) this.onPlaybackStopped();
    }

    startTrackingLoop() {
        const track = () => {
            if (!this.isPlaying || !this.ctx) return;

            const elapsed = this.ctx.currentTime - this.playbackStartTime;
            const currentSec = this.loopDuration > 0 ? (elapsed % this.loopDuration) : 0;

            // Measure highlight tracking
            let matchedMeasure = null;
            let matchedMeasureIdx = -1;
            for (let i = 0; i < this.measureTimings.length; i++) {
                const mt = this.measureTimings[i];
                if (currentSec >= mt.startTime && currentSec < mt.endTime) {
                    matchedMeasureIdx = mt.sequenceIndex;
                    matchedMeasure = mt.measure;
                    break;
                }
            }

            if (matchedMeasureIdx !== -1 && matchedMeasureIdx !== this.lastNotifiedMeasureIdx) {
                this.lastNotifiedMeasureIdx = matchedMeasureIdx;
                if (this.onMeasurePlayback) {
                    this.onMeasurePlayback(matchedMeasureIdx, matchedMeasure);
                }
            }

            // Element (note / chord) highlight tracking
            let matchedElem = null;
            let matchedElemIdx = -1;
            for (let i = 0; i < this.elementTimings.length; i++) {
                const et = this.elementTimings[i];
                if (currentSec >= et.startTime && currentSec < et.endTime) {
                    matchedElemIdx = i;
                    matchedElem = et;
                    break;
                }
            }

            if (matchedElemIdx !== this.lastNotifiedElementIdx) {
                this.lastNotifiedElementIdx = matchedElemIdx;
                if (this.onElementPlayback) {
                    if (matchedElem) {
                        this.onElementPlayback(matchedElem.sequenceIndex, matchedElem.measure, matchedElem.element, matchedElem.sourcePosition);
                    } else {
                        this.onElementPlayback(-1, null, null, null);
                    }
                }
            }

            this.animFrameId = requestAnimationFrame(track);
        };
        this.animFrameId = requestAnimationFrame(track);
    }

    prepareEvents(sequence, measureTimings, elementTimings) {
        const events = [];
        const secondsPerBeat = 60.0 / Math.max(20, this.bpm);
        let currentTime = 0;

        for (let i = 0; i < sequence.length; i++) {
            const m = sequence[i];
            const mStart = currentTime;
            const mEnd = currentTime + m.totalDuration * secondsPerBeat;
            if (measureTimings) {
                measureTimings.push({ measure: m, sequenceIndex: i, startTime: mStart, endTime: mEnd });
            }

            // 1. Chords
            for (let cIdx = 0; cIdx < m.chords.length; cIdx++) {
                const cc = m.chords[cIdx];
                const eventStart = currentTime + cc.position * secondsPerBeat;
                let eventDuration = (m.totalDuration - cc.position) * secondsPerBeat;
                for (let nextIdx = cIdx + 1; nextIdx < m.chords.length; nextIdx++) {
                    const nextCc = m.chords[nextIdx];
                    if (nextCc.position > cc.position) {
                        eventDuration = (nextCc.position - cc.position) * secondsPerBeat;
                        break;
                    }
                }

                const freqs = this.parseChord(cc.chord);
                for (let j = 0; j < freqs.length; j++) {
                    const e = {
                        startTime: eventStart + (j * 0.007), // 7ms strum offset
                        endTime: eventStart + eventDuration,
                        freq: freqs[j],
                        isChord: true,
                        isBass: (j === 0),
                        volume: (j === 0) ? 0.15 : 0.08,
                        h2: (j === 0) ? 0.20 : 0.08,
                        h3: 0.0
                    };
                    events.push(e);
                }
            }

            // 2. Melody Notes
            let notePos = 0;
            for (let j = 0; j < m.notes.length; j++) {
                const n = m.notes[j];
                if (!n.isRest) {
                    if (!n.isTieEnd) {
                        const eventStart = currentTime + notePos * secondsPerBeat;
                        let sustainBeats = n.duration;

                        if (n.isTieStart) {
                            let inTieChain = true;
                            let scanM = i;
                            let scanN = j + 1;
                            while (inTieChain && scanM < sequence.length) {
                                const sm = sequence[scanM];
                                while (scanN < sm.notes.length) {
                                    const nextNote = sm.notes[scanN];
                                    if (nextNote.isRest) {
                                        inTieChain = false;
                                        break;
                                    }
                                    if (nextNote.isTieEnd && nextNote.pitch.toLowerCase() === n.pitch.toLowerCase() && nextNote.octave === n.octave) {
                                        sustainBeats += nextNote.duration;
                                        if (!nextNote.isTieStart) {
                                            inTieChain = false;
                                            break;
                                        }
                                    } else {
                                        inTieChain = false;
                                        break;
                                    }
                                    scanN++;
                                }
                                scanM++;
                                scanN = 0;
                            }
                        }

                        const freq = this.getFrequency(n);
                        const baseFreq = 261.63; // C4
                        let freqScale = 1.0;
                        if (freq > baseFreq) {
                            freqScale = 1.0 / (1.0 + 0.35 * (Math.log(freq / baseFreq) / Math.LN2));
                        } else if (freq < baseFreq) {
                            freqScale = Math.min(1.10, 1.0 + 0.08 * (Math.log(baseFreq / Math.max(65.0, freq)) / Math.LN2));
                        }

                        let h2 = 0.0;
                        let h3 = 0.0;
                        if (freq < 550.0) {
                            h2 = Math.max(0.0, 0.12 * (1.0 - (freq - 260.0) / 290.0));
                            h3 = (freq < 400.0) ? Math.max(0.0, 0.03 * (1.0 - (freq - 260.0) / 140.0)) : 0.0;
                        }

                        const noteDurationSeconds = sustainBeats * secondsPerBeat;
                        const e = {
                            startTime: eventStart,
                            endTime: eventStart + Math.max(0.03, noteDurationSeconds * 0.95),
                            freq: freq,
                            isChord: false,
                            isBass: false,
                            volume: 0.22 * freqScale,
                            h2: h2,
                            h3: h3
                        };
                        events.push(e);
                    }
                }
                notePos += n.duration;
            }

            // 3. Element Timings for visual tracking
            if (elementTimings) {
                if (m.notes.length > 0) {
                    let nPos = 0;
                    for (let j = 0; j < m.notes.length; j++) {
                        const n = m.notes[j];
                        const nStart = currentTime + nPos * secondsPerBeat;
                        const nDuration = n.duration * secondsPerBeat;
                        const nEnd = nStart + nDuration;
                        nPos += n.duration;

                        if (!n.isRest) {
                            elementTimings.push({ element: n, sourcePosition: n.sourcePosition, measure: m, sequenceIndex: i, startTime: nStart, endTime: nEnd });
                        } else {
                            let activeChord = null;
                            for (const cc of m.chords) {
                                if (cc.position <= (nPos - n.duration + 1e-4)) {
                                    activeChord = cc;
                                }
                            }
                            if (activeChord) {
                                elementTimings.push({ element: activeChord, sourcePosition: activeChord.sourcePosition, measure: m, sequenceIndex: i, startTime: nStart, endTime: nEnd });
                            }
                        }
                    }
                } else if (m.chords.length > 0) {
                    for (let cIdx = 0; cIdx < m.chords.length; cIdx++) {
                        const cc = m.chords[cIdx];
                        const cStart = currentTime + cc.position * secondsPerBeat;
                        let cEnd = mEnd;
                        if (cIdx + 1 < m.chords.length) {
                            cEnd = currentTime + m.chords[cIdx + 1].position * secondsPerBeat;
                        }
                        elementTimings.push({ element: cc, sourcePosition: cc.sourcePosition, measure: m, sequenceIndex: i, startTime: cStart, endTime: cEnd });
                    }
                } else {
                    elementTimings.push({ element: m, sourcePosition: m.sourcePosition, measure: m, sequenceIndex: i, startTime: mStart, endTime: mEnd });
                }
            }

            currentTime += m.totalDuration * secondsPerBeat;
        }

        events.sort((a, b) => a.startTime - b.startTime);
        return { events, totalDuration: currentTime };
    }

    synthesizePCM(events, totalDuration) {
        const sampleRate = AudioPlayer.SAMPLE_RATE;
        const totalSamples = Math.round((totalDuration + 0.8) * sampleRate);
        const mixBuffer = new Float32Array(totalSamples);

        const curVolMel = this.volumeMelody;
        const curVolChd = this.volumeChords;
        const curVolBas = this.volumeBass;

        for (const e of events) {
            const startSample = Math.max(0, Math.floor(e.startTime * sampleRate));
            const endSample = Math.min(totalSamples, Math.ceil(e.endTime * sampleRate));
            const duration = e.endTime - e.startTime;
            const attackTime = e.isChord ? 0.015 : 0.008;
            const releaseTime = Math.min(0.008, duration * 0.15);
            const twoPiFreq = 2.0 * Math.PI * e.freq;

            const vol = e.isChord ? (e.isBass ? curVolBas : curVolChd) : curVolMel;
            if (vol <= 0.001) continue;

            for (let i = startSample; i < endSample; i++) {
                const localTime = (i / sampleRate) - e.startTime;
                let env = 1.0;
                if (localTime < 0) {
                    env = 0.0;
                } else if (localTime < attackTime && attackTime > 0) {
                    env = 0.5 * (1.0 - Math.cos(Math.PI * (localTime / attackTime)));
                } else if (localTime > duration - releaseTime && releaseTime > 0) {
                    if (localTime >= duration) env = 0.0;
                    else env = 0.5 * (1.0 - Math.cos(Math.PI * ((duration - localTime) / releaseTime)));
                }

                const phase = twoPiFreq * localTime;
                const tone = (Math.sin(phase) + e.h2 * Math.sin(phase * 2.0) + e.h3 * Math.sin(phase * 3.0)) / (1.0 + e.h2 + e.h3);

                if (e.isChord) {
                    const decay = Math.exp(-localTime * 2.2);
                    mixBuffer[i] += (tone * e.volume * vol * env * decay);
                } else {
                    const melodyDecay = 0.75 + 0.25 * Math.exp(-localTime * 3.0);
                    mixBuffer[i] += (tone * e.volume * vol * env * melodyDecay);
                }
            }
        }

        // Peak Limiter & Auto Gain
        let maxPeak = 0.0;
        for (let i = 0; i < totalSamples; i++) {
            const absVal = Math.abs(mixBuffer[i]);
            if (absVal > maxPeak) maxPeak = absVal;
        }

        const maxSafeGain = (maxPeak > 0.0001) ? (0.88 / maxPeak) : 1.65;
        const gain = Math.min(1.65, maxSafeGain);

        for (let i = 0; i < totalSamples; i++) {
            let val = mixBuffer[i] * gain;
            if (val > 0.92) val = 0.92;
            else if (val < -0.92) val = -0.92;
            mixBuffer[i] = val;
        }

        return mixBuffer;
    }

    getFrequency(n) {
        const octave = n.octave;
        let p = n.pitch.toLowerCase();
        if (n.accidental === "#" || n.accidental === "+") p += "+";
        else if (n.accidental === "-" || n.accidental === "_") p += "-";
        const prefix = (octave === 5) ? "h" : (octave === 6) ? "hh" : (octave === 3) ? "l" : (octave === 2) ? "ll" : "";
        const semi = this.PITCH_TO_SEMITONE[prefix + p] || 0;
        return 440.0 * Math.pow(2.0, (semi - 9) / 12.0);
    }

    parseChord(chordName) {
        const freqs = [];
        if (!chordName || !chordName.trim()) return freqs;

        let mainChord = chordName.trim();
        let slashBass = null;
        const slashIdx = mainChord.indexOf('/');
        if (slashIdx >= 0) {
            slashBass = mainChord.substring(slashIdx + 1).trim();
            mainChord = mainChord.substring(0, slashIdx).trim();
        }

        const m = mainChord.match(/^([A-G](?:#|b)?)(.*)$/);
        if (!m) return freqs;

        const root = m[1];
        const quality = m[2];

        const rootSemi = this.getRootSemitone(root);
        const bassSemi = (slashBass) ? this.getRootSemitone(slashBass) : rootSemi;

        // Bass frequency (C2..B2)
        freqs.push(440.0 * Math.pow(2.0, bassSemi / 12.0));

        const intervals = [];
        if (quality.includes("m7-5") || quality.includes("m7b5") || quality.includes("ø")) intervals.push(3, 6, 10);
        else if (quality.includes("m7") || quality.includes("-7")) intervals.push(3, 7, 10);
        else if (quality.includes("△") || quality.includes("Maj7") || quality.includes("maj7") || quality.includes("M7") || quality.includes("Maj") || quality.includes("maj")) intervals.push(4, 7, 11);
        else if (quality.includes("7")) intervals.push(4, 7, 10);
        else if (quality.includes("m6") || quality.includes("-6")) intervals.push(3, 7, 9);
        else if (quality.includes("6")) intervals.push(4, 7, 9);
        else if (quality.includes("m") || quality.includes("-")) intervals.push(3, 7);
        else if (quality.includes("dim") || quality.includes("o")) intervals.push(3, 6, 9);
        else if (quality.includes("aug") || quality.includes("+")) intervals.push(4, 8);
        else if (quality.includes("sus4")) intervals.push(5, 7);
        else intervals.push(4, 7);

        const chordSemis = [];
        for (const interval of intervals) {
            let semi = rootSemi + interval;
            while (semi < -21) semi += 12; // C3
            while (semi > -7) semi -= 12;  // D4
            if (!chordSemis.includes(semi)) chordSemis.push(semi);
        }
        chordSemis.sort((a, b) => a - b);

        for (const s of chordSemis) {
            freqs.push(440.0 * Math.pow(2.0, s / 12.0));
        }

        return freqs;
    }

    getRootSemitone(root) {
        const map = {
            "C": -33, "C#": -32, "Db": -32, "D": -31, "D#": -30, "Eb": -30,
            "E": -29, "F": -28, "F#": -27, "Gb": -27, "G": -26, "G#": -25,
            "Ab": -25, "A": -24, "A#": -23, "Bb": -23, "B": -22
        };
        return map[root] !== undefined ? map[root] : -33;
    }

    unrollRepeats(measures) {
        const sequence = [];
        let repeatStart = 0;
        for (let i = 0; i < measures.length; i++) {
            const m = measures[i];
            if (m.repeatStart) repeatStart = i;
            sequence.push(m);
            if (m.repeatEnd) {
                const loopBody = measures.slice(repeatStart, i + 1);
                const secondPass = [];
                let hasVolta1 = false;
                for (const bm of loopBody) {
                    if (bm.voltaNumber === 1) {
                        hasVolta1 = true;
                        break;
                    }
                    secondPass.push(bm);
                }
                sequence.push(...(hasVolta1 ? secondPass : loopBody));
                repeatStart = i + 1;
            }
        }
        return sequence;
    }

    cloneMeasure(m) {
        const cloned = new Measure();
        cloned.totalDuration = m.totalDuration;
        cloned.isNewLine = m.isNewLine;
        cloned.repeatStart = m.repeatStart;
        cloned.repeatEnd = m.repeatEnd;
        cloned.isDoubleBar = m.isDoubleBar;
        cloned.voltaNumber = m.voltaNumber;
        cloned.sectionLabel = m.sectionLabel;
        cloned.originalMeasure = m.originalMeasure || m;

        for (const n of m.notes) {
            const cn = new Note(n.pitch, n.octave, n.duration, n.isRest, n.accidental, n.tupletNumber);
            cn.isTieStart = n.isTieStart;
            cn.isTieEnd = n.isTieEnd;
            cn.sourcePosition = n.sourcePosition;
            cn.originalNote = n.originalNote || n;
            cloned.notes.push(cn);
        }
        for (const c of m.chords) {
            const cc = new ChordChange(c.chord, c.position);
            cc.sourcePosition = c.sourcePosition;
            cc.originalChord = c.originalChord || c;
            cloned.chords.push(cc);
        }
        return cloned;
    }

    applySwingRhythmPass(sequence) {
        for (const m of sequence) {
            let currentBeat = 0;
            for (const n of m.notes) {
                const originalDuration = n.duration;
                if (Math.abs(originalDuration - 0.5) < 0.01) {
                    const beatPos = currentBeat % 1.0;
                    if (beatPos < 0.02 || beatPos > 0.98) {
                        n.duration = 2.0 / 3.0;
                    } else if (Math.abs(beatPos - 0.5) < 0.05) {
                        n.duration = 1.0 / 3.0;
                    }
                } else if (Math.abs(originalDuration - 1.5) < 0.01) {
                    const beatPos = currentBeat % 1.0;
                    if (beatPos < 0.02 || beatPos > 0.98) {
                        n.duration = 5.0 / 3.0;
                    }
                }
                currentBeat += originalDuration;
            }
        }
    }

    applyShuffleTransform(original) {
        const sequence = original.map(m => this.cloneMeasure(m));
        this.applySwingRhythmPass(sequence);
        return sequence;
    }

    applyJazzTransform(original) {
        const sequence = original.map(m => this.cloneMeasure(m));
        const origPositions = new Map();
        for (const m of sequence) {
            let p = 0;
            for (const n of m.notes) {
                origPositions.set(n, p);
                p += n.duration;
            }
        }

        // Pass 1: Swing Rhythm
        this.applySwingRhythmPass(sequence);

        // Pass 2: Anticipation
        for (let i = 0; i < sequence.length; i++) {
            const currMeasure = sequence[i];
            const prevMeasure = i > 0 ? sequence[i - 1] : null;

            // Identify Target Beats
            const targetBeats = new Set([0.0]);
            if (currMeasure.chords) {
                for (const cc of currMeasure.chords) targetBeats.add(cc.position);
            }
            const sortedBeats = Array.from(targetBeats).sort((a, b) => b - a); // Descending

            for (const beat of sortedBeats) {
                // 1. Find Target Note at this beat using original score position
                let targetNote = null;
                let targetNoteIdx = -1;
                for (let k = 0; k < currMeasure.notes.length; k++) {
                    const n = currMeasure.notes[k];
                    const origPos = origPositions.get(n);
                    if (origPos !== undefined && Math.abs(origPos - beat) < 0.01) {
                        targetNote = n;
                        targetNoteIdx = k;
                        break;
                    }
                }

                // タイで繋がれた受け手音（isTieEnd）は、前からの持続音なので喰い（アンティシペーション）の対象外とする
                if (!targetNote || targetNote.isRest || targetNote.isTieEnd) continue;

                // 2. Identify Preceding Context
                let insertionContainer = null;
                let insertionIndex = -1;
                const prevNotesInBeat = [];
                let noteToShorten = null;

                if (beat >= 1.0 - 0.01) {
                    // Internal anticipation
                    let pos = 0;
                    for (let k = 0; k < targetNoteIdx; k++) {
                        const n = currMeasure.notes[k];
                        // Window: [beat - 1.0, beat)
                        if (pos >= beat - 1.0 - 0.01 && pos < beat - 0.01) {
                            prevNotesInBeat.push(n);
                        }
                        pos += n.duration;
                    }
                    if (targetNoteIdx > 0) {
                        insertionContainer = currMeasure.notes;
                        insertionIndex = targetNoteIdx;
                        noteToShorten = currMeasure.notes[targetNoteIdx - 1];
                    }
                } else {
                    // Start of measure anticipation
                    if (prevMeasure && prevMeasure.notes.length > 0) {
                        const prevEnd = prevMeasure.totalDuration;
                        let pos = 0;
                        for (let k = 0; k < prevMeasure.notes.length; k++) {
                            const n = prevMeasure.notes[k];
                            // Window: [prevEnd - 1.0, prevEnd)
                            if (pos >= prevEnd - 1.0 - 0.01 && pos < prevEnd - 0.01) {
                                prevNotesInBeat.push(n);
                            }
                            pos += n.duration;
                        }
                        insertionContainer = prevMeasure.notes;
                        insertionIndex = prevMeasure.notes.length;
                        noteToShorten = prevMeasure.notes[prevMeasure.notes.length - 1];
                    }
                }

                if (!insertionContainer) continue;

                let applied = false;

                // Rule D: Tied Shift-back Anticipation
                if (prevNotesInBeat.length === 2) {
                    const n1 = prevNotesInBeat[0];
                    const n2 = prevNotesInBeat[1];
                    if (n1.isTieEnd && !n1.isRest && !n2.isRest && !n2.isTieStart) {
                        const n1Idx = insertionContainer.indexOf(n1);
                        let tiedSource = null;
                        if (n1Idx > 0) {
                            tiedSource = insertionContainer[n1Idx - 1];
                        } else if (i > 0) {
                            const prevM = sequence[i - 1];
                            if (prevM.notes.length > 0) {
                                tiedSource = prevM.notes[prevM.notes.length - 1];
                            }
                        }

                        if (tiedSource && !tiedSource.isRest && (tiedSource.isTieStart || n1.isTieEnd)
                            && tiedSource.pitch.toLowerCase() === n1.pitch.toLowerCase() && tiedSource.octave === n1.octave
                            && tiedSource.duration >= 0.8) {
                            tiedSource.isTieStart = false;
                            insertionContainer.splice(n1Idx, 1);
                            n2.duration = 2.0 / 3.0;

                            const antNote = new Note(targetNote.pitch, targetNote.octave, 1.0 / 3.0, false,
                                targetNote.accidental, targetNote.tupletNumber);
                            antNote.isTieStart = true;
                            const targetIdx = insertionContainer.indexOf(targetNote);
                            const insPos = (targetIdx >= 0) ? targetIdx : insertionContainer.length;
                            insertionContainer.splice(insPos, 0, antNote);
                            applied = true;
                        }
                    }
                }

                // Rule A: Triplet Anticipation
                if (!applied && prevNotesInBeat.length === 2) {
                    const n1 = prevNotesInBeat[0];
                    const n2 = prevNotesInBeat[1];
                    if (!n1.isTieEnd && Math.abs(n1.duration + n2.duration - 1.0) < 0.01 && !n1.isRest && !n2.isRest && !n2.isTieStart) {
                        n1.duration = 1.0 / 3.0;
                        n2.duration = 1.0 / 3.0;
                        const antNote = new Note(targetNote.pitch, targetNote.octave, 1.0 / 3.0, false,
                            targetNote.accidental, targetNote.tupletNumber);
                        antNote.isTieStart = true;
                        insertionContainer.splice(insertionIndex, 0, antNote);
                        applied = true;
                    }
                }

                // Rule C: Shift-back Anticipation
                if (!applied && noteToShorten && !noteToShorten.isRest && !noteToShorten.isTieStart
                    && Math.abs(noteToShorten.duration - 1.0 / 3.0) < 0.05) {
                    const noteToShortenIdx = insertionContainer.indexOf(noteToShorten);
                    if (noteToShortenIdx > 0) {
                        const precedingNote = insertionContainer[noteToShortenIdx - 1];
                        if (!precedingNote.isRest && !precedingNote.isTieStart && precedingNote.duration >= 1.4) {
                            precedingNote.duration = 1.0;
                            noteToShorten.duration = 2.0 / 3.0;

                            const antNote = new Note(targetNote.pitch, targetNote.octave, 1.0 / 3.0, false,
                                targetNote.accidental, targetNote.tupletNumber);
                            antNote.isTieStart = true;
                            insertionContainer.splice(insertionIndex, 0, antNote);
                            applied = true;
                        }
                    }
                }

                // Rule B: Standard Anticipation
                if (!applied && noteToShorten && !noteToShorten.isRest && !noteToShorten.isTieStart && noteToShorten.duration >= 0.65) {
                    const origPos = origPositions.get(noteToShorten);
                    const startsOnOffbeat = (origPos !== undefined && Math.abs((origPos % 1.0) - 0.5) < 0.05);
                    if (startsOnOffbeat && Math.abs(noteToShorten.duration - 1.5) < 0.1) {
                        noteToShorten.duration = 1.0;
                    } else {
                        noteToShorten.duration -= 1.0 / 3.0;
                    }
                    const antNote = new Note(targetNote.pitch, targetNote.octave, 1.0 / 3.0, false,
                        targetNote.accidental, targetNote.tupletNumber);
                    antNote.isTieStart = true;
                    insertionContainer.splice(insertionIndex, 0, antNote);
                    applied = true;
                }

                if (applied) {
                    // 表拍を休符にするのではなく、裏拍の喰い音からタイで繋ぐ
                    targetNote.isTieEnd = true;
                    targetNote.isRest = false;
                }
            }
        }

        return sequence;
    }

    exportToWav(sheetMusic, filename = "leadsheet.wav") {
        if (!sheetMusic || !sheetMusic.measures || sheetMusic.measures.length === 0) return;

        let sequence = this.unrollRepeats(sheetMusic.measures);
        if (this.rhythmFeel === AudioPlayer.RHYTHM_SWING) {
            sequence = this.applyJazzTransform(sequence);
        } else if (this.rhythmFeel === AudioPlayer.RHYTHM_SHUFFLE) {
            sequence = this.applyShuffleTransform(sequence);
        }

        const prep = this.prepareEvents(sequence, null, null);
        const pcmData = this.synthesizePCM(prep.events, prep.totalDuration);

        const wavBytes = this.createWavFile(pcmData, AudioPlayer.SAMPLE_RATE);
        const blob = new Blob([wavBytes], { type: "audio/wav" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    createWavFile(pcmData, sampleRate) {
        const numChannels = 1;
        const bitsPerSample = 16;
        const bytesPerSample = bitsPerSample / 8;
        const blockAlign = numChannels * bytesPerSample;
        const byteRate = sampleRate * blockAlign;
        const dataLength = pcmData.length * bytesPerSample;
        const buffer = new ArrayBuffer(44 + dataLength);
        const view = new DataView(buffer);

        // RIFF chunk descriptor
        this.writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + dataLength, true);
        this.writeString(view, 8, 'WAVE');

        // fmt sub-chunk
        this.writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // Linear PCM
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);

        // data sub-chunk
        this.writeString(view, 36, 'data');
        view.setUint32(40, dataLength, true);

        let offset = 44;
        for (let i = 0; i < pcmData.length; i++) {
            let s = Math.max(-1, Math.min(1, pcmData[i]));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
            offset += 2;
        }

        return new Uint8Array(buffer);
    }

    writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    PITCH_TO_SEMITONE = {
        "llc": -24, "llc+": -23, "llc-": -25, "lld": -22, "lld+": -21, "lld-": -23,
        "lle": -20, "lle+": -19, "lle-": -21, "llf": -19, "llf+": -18, "llf-": -20,
        "llg": -17, "llg+": -16, "llg-": -18, "lla": -15, "lla+": -14, "lla-": -16,
        "llb": -13, "llb+": -12, "llb-": -14,
        "lc": -12, "lc+": -11, "lc-": -13, "ld": -10, "ld+": -9, "ld-": -11,
        "le": -8, "le+": -7, "le-": -9, "lf": -7, "lf+": -6, "lf-": -8,
        "lg": -5, "lg+": -4, "lg-": -6, "la": -3, "la+": -2, "la-": -4,
        "lb": -1, "lb+": 0, "lb-": -2,
        "c": 0, "c+": 1, "c-": -1, "d": 2, "d+": 3, "d-": 1,
        "e": 4, "e+": 5, "e-": 3, "f": 5, "f+": 6, "f-": 4,
        "g": 7, "g+": 8, "g-": 6, "a": 9, "a+": 10, "a-": 8,
        "b": 11, "b+": 12, "b-": 10,
        "hc": 12, "hc+": 13, "hc-": 11, "hd": 14, "hd+": 15, "hd-": 13,
        "he": 16, "he+": 17, "he-": 15, "hf": 17, "hf+": 18, "hf-": 16,
        "hg": 19, "hg+": 20, "hg-": 18, "ha": 21, "ha+": 22, "ha-": 20,
        "hb": 23, "hb+": 24, "hb-": 22,
        "hhc": 24, "hhc+": 25, "hhc-": 23, "hhd": 26, "hhd+": 27, "hhd-": 25,
        "hhe": 28, "hhe+": 29, "hhe-": 27, "hhf": 29, "hhf+": 30, "hhf-": 28,
        "hhg": 31, "hhg+": 32, "hhg-": 30, "hha": 33, "hha+": 34, "hha-": 32,
        "hhb": 35, "hhb+": 36, "hhb-": 34
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AudioPlayer };
}
