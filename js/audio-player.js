/**
 * Audio Player using Web Audio API
 * Synthesizes sounds for melody and chords without external assets.
 */

class AudioPlayer {
    constructor() {
        this.ctx = null;
        this.isPlaying = false;
        this.bpm = 120;
        this.lookahead = 0.1; // Seconds to look ahead
        this.scheduleAheadTime = 0.1; // Seconds to schedule
        this.nextNoteTime = 0;
        this.notesQueue = [];
        this.timerID = null;

        // Music data
        this.playbackSequence = []; // Flattened list of measures
        this.playCursor = 0;

        // Settings
        this.muteMelody = false;
        this.muteChords = false;
        this.jazzMode = false;

        // Master gain
        this.masterGain = null;
    }

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.5;
            this.masterGain.connect(this.ctx.destination);
        }
    }

    /**
     * Start playback
     * @param {SheetMusic} sheetMusic 
     */
    play(sheetMusic) {
        this.init();
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        // Generate flattened sequence based on repeats
        let sequence = this.unrollRepeats(sheetMusic.measures);

        // Apply Jazz Transformation if enabled
        if (this.jazzMode) {
            sequence = this.applyJazzTransform(sequence);
        }

        this.playbackSequence = sequence;

        this.isPlaying = true;
        this.playCursor = 0;
        this.nextNoteTime = this.ctx.currentTime + 0.1;
        this.notesQueue = [];

        this.scheduler();
    }

    stop() {
        this.isPlaying = false;
        if (this.timerID) {
            clearTimeout(this.timerID);
            this.timerID = null;
        }

        // We do NOT close the AudioContext, as we want to reuse it.
        // But we should probably cancel scheduled events if possible.
        // For simple oscillation, letting them ring out (few ms) is fine.

        // Reset cursor
        this.playCursor = 0;
    }

    setBpm(bpm) {
        this.bpm = bpm;
    }

    setMute(melody, chords) {
        this.muteMelody = melody;
        this.muteChords = chords;
    }

    setJazzMode(enabled) {
        this.jazzMode = enabled;
    }

    // Deep clone helper to avoid mutating original sheet music during transform
    cloneMeasure(m) {
        const newM = new Measure();
        Object.assign(newM, m);
        newM.notes = m.notes.map(n => {
            const newN = new Note(n.pitch, n.octave, n.duration, n.isRest, n.accidental, n.tupletNumber);
            return newN;
        });
        // Chords don't need deep clone for this transform usually, but let's be safe
        newM.chords = m.chords.map(c => new ChordChange(c.chord, c.position));
        return newM;
    }

    applyJazzTransform(originalSequence) {
        // Clone sequence first
        const sequence = originalSequence.map(m => this.cloneMeasure(m));

        // Constants for precision checks
        const EPSILON = 0.01;
        const ONE_THIRD = 1 / 3;
        const TWO_THIRDS = 2 / 3;

        // Pass 1: Swing Rhythm
        // Convert 0.5 notes: On-beat -> 2/3, Off-beat -> 1/3
        sequence.forEach(m => {
            let currentBeat = 0;
            for (let i = 0; i < m.notes.length; i++) {
                const note = m.notes[i];
                const originalDuration = note.duration;

                if (Math.abs(originalDuration - 0.5) < EPSILON) {
                    const beatPos = currentBeat % 1.0;
                    if (beatPos < EPSILON) {
                        // On-beat 0.5 -> 2/3
                        note.duration = TWO_THIRDS;
                        note.isSwingStart = true;
                    } else if (Math.abs(beatPos - 0.5) < EPSILON) {
                        // Off-beat 0.5 -> 1/3
                        note.duration = ONE_THIRD;
                        note.isSwingEnd = true;
                    }
                }
                currentBeat += originalDuration;
            }
        });

        // Pass 2: Anticipation
        // Iterate through all measures to find anticipation opportunities.
        for (let i = 0; i < sequence.length; i++) {
            const currMeasure = sequence[i];
            const prevMeasure = i > 0 ? sequence[i - 1] : null;

            // Identify Target Beats: Positions where chords change OR Beat 0
            // We want to anticipate these events.
            const targetBeats = new Set();
            // Always candidate for beat 0 (anticipating the measure start)
            targetBeats.add(0);

            if (currMeasure.chords) {
                currMeasure.chords.forEach(c => {
                    if (c.position !== undefined) targetBeats.add(c.position);
                });
            }

            // Process beats in descending order to avoid index shifting issues when splicing
            const sortedBeats = Array.from(targetBeats).sort((a, b) => b - a);

            sortedBeats.forEach(beat => {
                // 1. Find the Target Note at this beat
                let currentPos = 0;
                let targetNote = null;
                let targetNoteIdx = -1;

                for (let k = 0; k < currMeasure.notes.length; k++) {
                    const n = currMeasure.notes[k];
                    // Check if note starts at beat (closely)
                    if (Math.abs(currentPos - beat) < EPSILON) {
                        targetNote = n;
                        targetNoteIdx = k;
                        break;
                    }
                    currentPos += n.duration;
                }

                // If no note starts here, or it's already a rest, skip
                if (!targetNote || targetNote.isRest) return;

                // 2. Identify the Preceding Context (Where to insert/shorten)
                // We need to check the 'previous beat' content for the Triplet Rule.
                // Or just the 'previous note' for the Standard Rule.

                let insertionContainer = null;
                let insertionIndex = -1;
                let prevNotesInBeat = []; // For Triplet check
                let noteToShorten = null; // For Standard check

                if (beat >= 1.0 - EPSILON) {
                    // Internal anticipation (Beat >= 1)
                    // Check local measure content
                    // Previous beat window: [beat - 1.0, beat)
                    // Let's find notes in that window.

                    // Re-scan for notes in range
                    let pos = 0;
                    for (let k = 0; k < currMeasure.notes.length; k++) {
                        const n = currMeasure.notes[k];
                        if (pos >= beat - 1.0 - EPSILON && pos < beat - EPSILON) {
                            prevNotesInBeat.push({ note: n, index: k, container: currMeasure.notes });
                        }
                        pos += n.duration;
                    }

                    // Ensure we have a valid insertion point (at targetNoteIdx)
                    if (targetNoteIdx > 0) {
                        insertionContainer = currMeasure.notes;
                        insertionIndex = targetNoteIdx;
                        noteToShorten = currMeasure.notes[targetNoteIdx - 1]; // Candidate for standard
                    }

                } else {
                    // Start of measure anticipation (Beat 0)
                    // Check previous measure content (last beat)
                    if (prevMeasure && prevMeasure.notes.length > 0) {
                        const prevEnd = prevMeasure.totalDuration || 4.0;
                        // Window: [prevEnd - 1.0, prevEnd)

                        let pos = 0;
                        for (let k = 0; k < prevMeasure.notes.length; k++) {
                            const n = prevMeasure.notes[k];
                            // Careful with float comparison. Note must START within the window.
                            // If note starts at 3.0, duration 1.0. start >= 3.0 && start < 4.0.
                            if (pos >= prevEnd - 1.0 - EPSILON && pos < prevEnd - EPSILON) {
                                prevNotesInBeat.push({ note: n, index: k, container: prevMeasure.notes });
                            }
                            pos += n.duration;
                        }

                        insertionContainer = prevMeasure.notes;
                        insertionIndex = prevMeasure.notes.length;
                        noteToShorten = prevMeasure.notes[prevMeasure.notes.length - 1];
                    }
                }

                if (!insertionContainer) return;

                // 3. Apply Anticipation Logic

                // Rule A: Triplet Anticipation
                // Condition: Preceding beat has exactly 2 notes.
                // And they match the Swing pattern: One is approx 2/3, Next is approx 1/3?
                // User said: "If preceding beat duration was 0.5, 0.5" -> which we converted to 2/3, 1/3.
                // So we check if prevNotesInBeat contains exactly two notes, summing to ~1.0.

                let appliedTriplet = false;

                if (prevNotesInBeat.length === 2) {
                    const n1 = prevNotesInBeat[0].note;
                    const n2 = prevNotesInBeat[1].note;
                    const sumDur = n1.duration + n2.duration;

                    // Check if it looks like a swung pair (approx 1.0 total)
                    // And specifically 2/3 + 1/3 or similar.
                    if (Math.abs(sumDur - 1.0) < EPSILON && !n1.isRest && !n2.isRest) {
                        // Apply Triplet Transform: 1/3, 1/3, 1/3

                        // Note 1 -> 1/3
                        n1.duration = ONE_THIRD;
                        // Note 2 -> 1/3
                        n2.duration = ONE_THIRD;
                        // Note 3 (Anticipation) will be 1/3. Total 1.0.

                        // Insert Anticipation Note (1/3) after Note 2
                        const antNote = new Note(targetNote.pitch, targetNote.octave, ONE_THIRD, false, targetNote.accidental);
                        antNote.isAnticipation = true;

                        // Insert location: 
                        // If same container, it's after n2.
                        // n2 index is prevNotesInBeat[1].index. BUT be careful if splice shifts indices.
                        // We are iterating sortedBeats desc, but splicing in insertContainer which might be prevMeasure.
                        // If insertionContainer is currMeasure (and we are iterating currMeasure reverse), is it safe?
                        // sortedBeats are fixed. `currMeasure.notes` changes.
                        // We calculate insertionIndex dynamically above.

                        // If internal: prevNotesInBeat are notes [target-2, target-1].
                        // targetNoteIdx is current Target.
                        // We want to insert AT targetNoteIdx.
                        // [N1, N2, Target] -> [N1, N2, Ant, Target]

                        // If external: prevNotesInBeat in prevMeasure.
                        // insertionIndex is prevMeasure.length.
                        // [N1, N2] -> [N1, N2, Ant]

                        let safeInsertIndex = -1;
                        if (beat >= 1.0 - EPSILON) {
                            safeInsertIndex = targetNoteIdx;
                        } else {
                            safeInsertIndex = prevNotesInBeat[1].index + 1; // End of list usually
                        }

                        // Just use insertionIndex calculated before?
                        // If internal, insertionIndex was targetNoteIdx.
                        // If external, insertionIndex was length.
                        insertionContainer.splice(insertionIndex, 0, antNote);

                        appliedTriplet = true;
                    }
                }

                // Rule B: Standard Anticipation
                // If Rule A didn't apply, check if we can just shorten the last note.
                if (!appliedTriplet && noteToShorten && !noteToShorten.isRest && noteToShorten.duration > ONE_THIRD + EPSILON) {
                    // Shorten by 1/3
                    noteToShorten.duration -= ONE_THIRD;

                    // Insert Anticipation Note (1/3)
                    const antNote = new Note(targetNote.pitch, targetNote.octave, ONE_THIRD, false, targetNote.accidental);
                    antNote.isAnticipation = true;

                    insertionContainer.splice(insertionIndex, 0, antNote);

                    appliedTriplet = true; // Mark as done (reusing flag name for logic flow)
                }

                // 4. Finalize Target Note
                // If we successfully anticipated (inserted the extra note), 
                // we must convert the original Target Note to a REST to maintain timing.
                // IMPORTANT: Do NOT change its duration. It stays as a placeholder 
                // for the time that was "stolen" by the anticipation but is now "silence" (or sustain).
                if (appliedTriplet) { // effective 'appliedAnticipation'
                    targetNote.isRest = true;
                    // Duration remains untouched.
                    // This ensures: 
                    // [PrevBeat - 1/3] + [Anticipation 1/3] + [TargetRest (Original)] = Original Total
                    // Wait.
                    // Case B: [Prev (D - 1/3)] + [Ant (1/3)] = [Prev D]. 
                    // Then [TargetRest (T)] = [Target T].
                    // Total time = D + T. Correct.

                    // Case A: [N1(1/3) + N2(1/3)] + [Ant(1/3)] = 1.0.
                    // Original was [N1(0.5)+N2(0.5)] = 1.0.
                    // Then [TargetRest (T)] = [Target T].
                    // Total time = 1.0 + T. Correct.
                }
            });
        }

        return sequence;
    }

    /**
     * Unroll measures based on repeats and voltas
     */
    unrollRepeats(measures) {
        const sequence = [];
        let i = 0;

        // Simple 1-level repeat handling for now. 
        // Complex nested repeats might need a stack, but 1-level is standard for lead sheets.

        // Start position of the current repeat section
        let repeatStart = 0;

        while (i < measures.length) {
            const m = measures[i];

            // Mark start of repeat
            if (m.repeatStart) {
                repeatStart = i;
            }

            // Check if this measure is a Volta (Ending)
            // (1) -> 1st ending. (2) -> 2nd ending.
            // Simplified logic: We need to track "pass" count for the current repeat block?
            // Actually, flat expansion is easier:
            // Iterate linearly. When we hit RepeatEnd (:|), if we haven't looped yet, jump back.
            // BUT, we need to handle "Skip 1. on 2nd pass".

            // Re-approach: Simulation
            // We can't easily simulate without a statefull walker. 
            // Let's assume standard form: |: A 1. :| 2. |

            sequence.push(m);

            if (m.repeatEnd) {
                // If this is a repeat end, we duplicate the section from repeatStart to here (exclusive of this measure? No, inclusive)
                // BUT, inside that section, we must exclude "2." and include "1." on first pass.
                // On second pass (the one we are building now?), we skip "1." and do "2."?

                // Let's do a robust expansion:
                // We just added the measure ending with :|. 
                // Now we append the block from repeatStart AGAIN.
                // But we filter the appended block:
                // - Remove measures with voltaNumber === 1 (or other first endings) IF we are now doing 2nd pass.
                // - Wait, Lead sheet notation:
                // [Start] ... [1.] ... :| [2.] ...
                // Playback: Start -> 1. -> Start -> 2.

                // So when we hit :|, we go back to repeatStart.
                // But we've already pushed Start..1.(:|) to sequence.
                // Now we need to push Start..AGAIN..
                // AND we need to be careful about what comes AFTER :| in the source array.
                // Usually "2." follows immediately.

                // So simply appending the body (excluding 1.) is enough?
                // Let's try:
                // 1. We just pushed the :| measure (which is usually the end of 1.).
                // 2. We extract measures[repeatStart ... i].
                // 3. We filter out any measures that are explicitly "1st ending" (volta 1) from this extracted chunk? 
                //    - Actually, usually the 1st ending IS the end of the loop.
                //    - If we just replay the body, we replay 1. again. That's wrong.

                // Correct logic:
                // Loop body is `repeatStart` to `i`.
                // Second pass should consist of `repeatStart` to `start of 1.`.
                // Then we continue from `i+1` (which is 2.).

                // So we need to find if there is a Volta 1 inside the loop block.
                let loopBody = measures.slice(repeatStart, i + 1);
                let secondPass = [];
                let hasVolta1 = false;

                for (let k = 0; k < loopBody.length; k++) {
                    const bm = loopBody[k];
                    if (bm.voltaNumber === 1) {
                        hasVolta1 = true;
                        // Stop adding to second pass when we hit volta 1
                        break;
                    }
                    if (bm.repeatEnd) {
                        // Don't include the repeat end measure itself if it's potentially part of 1st ending?
                        // Usually :| is at the end of 1.
                        // But if 1. is multiple measures, we stop at the start of 1.
                    }
                    secondPass.push(bm);
                }

                // If there was no Volta 1, then we repeat the WHOLE body.
                if (!hasVolta1) {
                    secondPass = loopBody;
                }

                // Append second pass
                sequence.push(...secondPass);

                // Reset repeat start for future sections
                repeatStart = i + 1;
            }

            i++;
        }

        return sequence;
    }

    scheduler() {
        if (!this.isPlaying) return;

        // While there are notes that will need to play before the next interval, 
        // schedule them and advance the pointer.
        while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
            this.scheduleMeasure();
        }

        this.timerID = setTimeout(() => this.scheduler(), 25);
    }

    scheduleMeasure() {
        if (this.playCursor >= this.playbackSequence.length) {
            this.stop();
            window.dispatchEvent(new CustomEvent('playback-ended'));
            return;
        }

        const measure = this.playbackSequence[this.playCursor];
        const secondsPerBeat = 60.0 / this.bpm;
        const measureDuration = (measure.totalDuration || 4) * secondsPerBeat;

        // 1. Schedule Chords (if not muted)
        if (!this.muteChords && measure.chords.length > 0) {
            // Sort chords by position just in case
            const sortedChords = [...measure.chords].sort((a, b) => a.position - b.position);

            sortedChords.forEach((chordChange, index) => {
                const time = this.nextNoteTime + (chordChange.position * secondsPerBeat);

                // Calculate duration until next chord or end of measure
                let nextPos = measure.totalDuration || 4;
                if (index < sortedChords.length - 1) {
                    nextPos = sortedChords[index + 1].position;
                }

                // Duration in beats
                let durationBeats = nextPos - chordChange.position;

                // Safety clamp
                if (durationBeats <= 0) durationBeats = 1;

                const duration = durationBeats * secondsPerBeat;
                this.playChord(chordChange.chord, time, duration);
            });
        }

        // 2. Schedule Melody Notes (if not muted)
        let currentBeat = 0;
        if (!this.muteMelody) {
            measure.notes.forEach((note, index) => {
                const time = this.nextNoteTime + (currentBeat * secondsPerBeat);

                if (!note.isRest) {
                    // Calculate extended duration (Sustain over following rests)
                    let extensionBeats = 0;

                    // 1. Check remaining notes in current measure
                    let foundNextNote = false;
                    for (let k = index + 1; k < measure.notes.length; k++) {
                        const nextNote = measure.notes[k];
                        if (nextNote.isRest) {
                            extensionBeats += nextNote.duration;
                        } else {
                            foundNextNote = true;
                            break;
                        }
                    }

                    // 2. Look ahead to next measures if we haven't hit a note yet
                    if (!foundNextNote) {
                        let cursor = this.playCursor + 1;
                        // Limit lookahead
                        const maxLookaheadMeasures = 2;
                        let lookedAhead = 0;

                        while (cursor < this.playbackSequence.length && lookedAhead < maxLookaheadMeasures) {
                            const nextM = this.playbackSequence[cursor];
                            let noteFoundInNext = false;

                            for (const n of nextM.notes) {
                                if (n.isRest) {
                                    extensionBeats += n.duration;
                                } else {
                                    noteFoundInNext = true;
                                    break;
                                }
                            }

                            if (noteFoundInNext) break;

                            cursor++;
                            lookedAhead++;
                        }
                    }

                    const effectiveDuration = (note.duration + extensionBeats) * secondsPerBeat;
                    this.playMelodyNote(note, time, effectiveDuration);
                }
                currentBeat += note.duration;
            });
        }

        this.nextNoteTime += measureDuration;
        this.playCursor++;
    }

    playMelodyNote(note, time, duration) {
        // if (note.isRest) return; 

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        const freq = this.getFrequency(note);
        osc.frequency.value = freq;

        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.4, time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, time + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(time);
        osc.stop(time + duration + 0.1);
    }

    playChord(chordName, time, duration) {
        const tones = this.parseChord(chordName);

        // Slight strum effect (arpeggiation) to make it feel less robotic?
        // User said "simultaneously is fine", but a tiny delay (20ms) helps separation.
        // Let's stick to simultaneous for now to ensure strict cutoff as requested.

        tones.forEach((freq, index) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.value = freq;

            const baseVolume = 0.15 * Math.pow(0.8, index);

            // Envelope: Piano-like decay
            // Attack: Instant/Fast
            // Decay: Decays naturally over time. If duration is long, it gets quiet.
            // Release: When duration ends, cut off quickly.

            const attackTime = 0.02;
            const releaseTime = 0.05;

            // Start at silence
            gain.gain.setValueAtTime(0, time);

            // Attack to full volume
            gain.gain.linearRampToValueAtTime(baseVolume, time + attackTime);

            // Exponential decay to a lower sustain level (or silence) over the duration
            // We want it to be audible throughout but fading.
            // Let's aim for it to drop to 30% of max volume by the end of the note if held long.
            // But we must strictly cut it at `time + duration`.

            // Using setTargetAtTime implies continuous approach.
            // Let's use exponentialRamp.
            // We target a low value at the *end* of the scheduled duration (minus release).
            const sustainLevel = baseVolume * 0.1;

            // Decay phase
            // We decay from Peak (at time+Attack) down to SustainLevel (at time+Duration-Release)
            if (duration > attackTime + releaseTime) {
                gain.gain.exponentialRampToValueAtTime(sustainLevel, time + duration - releaseTime);
            }

            // Final Release to 0
            gain.gain.linearRampToValueAtTime(0, time + duration);

            osc.connect(gain);
            gain.connect(this.masterGain);

            osc.start(time);
            osc.stop(time + duration + 0.1); // Stop osc shortly after gain is 0
        });
    }

    getFrequency(note) {
        // Calculate semitone distance from A4 (440Hz)
        // Middle C (c4) is our reference in PITCH_TO_SEMITONE? 
        // Let's use MusicUtils logic if available or reimplement simple version.
        // It's safer to reuse MusicUtils.PITCH_TO_SEMITONE if possible, 
        // but note object has `pitch`, `octave`, `accidental`.

        // Construct pitch string for MusicUtils lookup: e.g. 'c' or 'hc' or 'lc'
        // Logic: 
        // octave 4 = 'c', 'd'...
        // octave 5 = 'hc'...
        // octave 3 = 'lc'...
        // octave 6 = 'hhc'...
        // octave 2 = 'llc'...

        let prefix = '';
        if (note.octave === 5) prefix = 'h';
        else if (note.octave === 6) prefix = 'hh';
        else if (note.octave === 3) prefix = 'l';
        else if (note.octave === 2) prefix = 'll';

        let pitchKey = prefix + note.pitch; // e.g. 'hc'

        // Accidental
        // MusicUtils keys: 'c', 'c+', 'c-'
        if (note.accidental === '#') pitchKey += '+';
        else if (note.accidental === '-') pitchKey += '-';

        let semitoneFromMiddleC = MusicUtils.PITCH_TO_SEMITONE[pitchKey];

        if (semitoneFromMiddleC === undefined) {
            // Fallback calculation
            // console.warn("Freq lookup failed for", pitchKey); // Removed console.warn
            semitoneFromMiddleC = 0;
        }

        // Formula: f = 440 * 2^((n - 9)/12) where n is semitones from Middle C (C4 is -9 from A4)
        // Wait, standard: A4 = 440. C4 is 9 semitones BELOW A4.
        // So semitoneFromA4 = semitoneFromMiddleC - 9;

        const semitoneFromA4 = semitoneFromMiddleC - 9;
        return 440 * Math.pow(2, semitoneFromA4 / 12);
    }

    parseChord(chordName) {
        // Basic Chord Parsing to Frequencies
        // Root detection
        const match = chordName.match(/^([A-G](?:#|b)?)(.*)$/);
        if (!match) return []; // Unknown

        const rootStr = match[1];
        const qualityStr = match[2];

        // Root Frequency
        // Let's put root in octave 3 (Low) for chords
        // const rootSemitone = MusicUtils.ROOT_TO_SEMITONE[rootStr]; // 0-11 // Removed
        // C3 is -21 semitones from A4?
        // C4 = -9 from A4. C3 = -21.
        const rootMap = {
            'C': -21, 'C#': -20, 'Db': -20,
            'D': -19, 'D#': -18, 'Eb': -18,
            'E': -17, 'F': -16, 'F#': -15, 'Gb': -15,
            'G': -14, 'G#': -13, 'Ab': -13,
            'A': -12, 'A#': -11, 'Bb': -11, 'B': -10
        };

        let rootOffset = rootMap[rootStr];
        if (rootOffset === undefined) rootOffset = -21; // Default C3

        const intervals = [0]; // Always have root

        // Quality Parsing
        // Major: 0, 4, 7
        // Minor: 0, 3, 7
        // 7: 0, 4, 7, 10
        // Maj7: 0, 4, 7, 11
        // m7: 0, 3, 7, 10
        // m7b5: 0, 3, 6, 10
        // dim: 0, 3, 6, 9
        // sus4: 0, 5, 7
        // 6: 0, 4, 7, 9
        // m6: 0, 3, 7, 9

        if (qualityStr === 'm' || qualityStr === '-') { // Minor
            intervals.push(3, 7);
        } else if (qualityStr === '7') { // Dominant 7
            intervals.push(4, 7, 10);
        } else if (qualityStr === 'maj7' || qualityStr === 'M7' || qualityStr.includes('maj') || qualityStr.includes('Maj')) {
            intervals.push(4, 7, 11);
        } else if (qualityStr === 'm7' || qualityStr === '-7') {
            intervals.push(3, 7, 10);
        } else if (qualityStr === 'm7b5' || qualityStr === 'ø') {
            intervals.push(3, 6, 10);
        } else if (qualityStr === 'dim' || qualityStr === 'dim7' || qualityStr === 'o') {
            intervals.push(3, 6, 9);
        } else if (qualityStr === 'aug' || qualityStr === '+') {
            intervals.push(4, 8);
        } else if (qualityStr === 'sus4') {
            intervals.push(5, 7);
        } else if (qualityStr === '6') {
            intervals.push(4, 7, 9);
        } else if (qualityStr === 'm6') {
            intervals.push(3, 7, 9);
        } else {
            // Default Major
            intervals.push(4, 7);
        }

        // Convert intervals to frequencies based on root
        return intervals.map(semitone => {
            const totalSemitoneFromA4 = rootOffset + semitone;
            return 440 * Math.pow(2, totalSemitoneFromA4 / 12);
        });
    }
}
