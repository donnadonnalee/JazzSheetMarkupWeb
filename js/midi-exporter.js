/**
 * Standard MIDI File (SMF Format 1) Exporter & Auto-Accompaniment Engine
 * Multi-track accompaniment with extensible musical styles:
 * - Swing / Medium Swing (Walking Bass + Anticipated Comping + Jazz Drums)
 * - Medium 2-Beat / Dixie (Trad Jazz Tuba/Bass + 2&4 Chop Piano + Snare Brush)
 * - Bossa Nova (Nylon Guitar Clave + Tan-ta-Tan-ta Bass + Cross-stick)
 * - Choro (7-String Baixaria Descending Runs + Guitar Syncopation + Pandeiro)
 * - Bluegrass Reel (Banjo Roll Arpeggios + Mandolin Chop + Boom-Chick Bass)
 * - Straight / Even 8th
 * - Lead Melody Only
 *
 * Full support for Count-In, Multi-Chorus with Solo Middle section, and accurate Swing anticipation.
 */

// ==========================================
// 1. Pure JavaScript SMF Binary Writer
// ==========================================
class MidiWriter {
    constructor(ppq = 480) {
        this.ppq = ppq; // Pulses Per Quarter Note (Ticks)
        this.tracks = [];
    }

    addTrack(name = '') {
        const track = new MidiTrack(this.ppq, name);
        this.tracks.push(track);
        return track;
    }

    build() {
        const headerChunk = this.buildHeaderChunk();
        const trackChunks = this.tracks.map(t => t.build());

        let totalLength = headerChunk.length;
        for (const tc of trackChunks) {
            totalLength += tc.length;
        }

        const out = new Uint8Array(totalLength);
        let offset = 0;

        out.set(headerChunk, offset);
        offset += headerChunk.length;

        for (const tc of trackChunks) {
            out.set(tc, offset);
            offset += tc.length;
        }

        return out;
    }

    buildHeaderChunk() {
        // MThd (4) + length 6 (4) + format 1 (2) + ntrks (2) + division (2) = 14 bytes
        const buf = new Uint8Array(14);
        const view = new DataView(buf.buffer);

        // 'MThd'
        buf[0] = 0x4D; buf[1] = 0x54; buf[2] = 0x68; buf[3] = 0x64;
        view.setUint32(4, 6, false); // Length = 6
        view.setUint16(8, 1, false); // Format = 1 (Multi-track)
        view.setUint16(10, this.tracks.length, false); // Num tracks
        view.setUint16(12, this.ppq, false); // Division (PPQ)

        return buf;
    }

    download(filename = 'leadsheet.mid') {
        const data = this.build();
        const blob = new Blob([data], { type: 'audio/midi' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}

class MidiTrack {
    constructor(ppq, name = '') {
        this.ppq = ppq;
        this.name = name;
        this.events = [];
    }

    addEvent(event) {
        this.events.push(event);
    }

    setTempo(tick, bpm) {
        const mpq = Math.round(60000000 / Math.max(20, bpm));
        this.addEvent({
            tick,
            type: 'meta',
            metaType: 0x51,
            data: [(mpq >> 16) & 0xFF, (mpq >> 8) & 0xFF, mpq & 0xFF]
        });
    }

    setTimeSignature(tick, numerator = 4, denominator = 4) {
        let dd = 2;
        if (denominator === 2) dd = 1;
        else if (denominator === 4) dd = 2;
        else if (denominator === 8) dd = 3;
        else if (denominator === 16) dd = 4;

        this.addEvent({
            tick,
            type: 'meta',
            metaType: 0x58,
            data: [numerator, dd, 24, 8]
        });
    }

    setTrackName(tick, name) {
        const bytes = [];
        for (let i = 0; i < name.length; i++) {
            bytes.push(name.charCodeAt(i) & 0xFF);
        }
        this.addEvent({
            tick,
            type: 'meta',
            metaType: 0x03,
            data: bytes
        });
    }

    setProgram(tick, channel, program) {
        this.addEvent({
            tick,
            type: 'program',
            channel: channel & 0x0F,
            program: Math.max(0, Math.min(127, program))
        });
    }

    setControlChange(tick, channel, controller, value) {
        this.addEvent({
            tick,
            type: 'controlChange',
            channel: channel & 0x0F,
            controller: Math.max(0, Math.min(127, Math.round(controller))),
            value: Math.max(0, Math.min(127, Math.round(value)))
        });
    }

    addNote(channel, pitch, startTick, durationTicks, velocity = 90) {
        if (pitch < 0 || pitch > 127 || durationTicks <= 0) return;
        const noteOnVel = Math.max(1, Math.min(127, Math.round(velocity)));
        this.addEvent({
            tick: startTick,
            type: 'noteOn',
            channel: channel & 0x0F,
            pitch: Math.round(pitch),
            velocity: noteOnVel
        });
        this.addEvent({
            tick: startTick + durationTicks,
            type: 'noteOff',
            channel: channel & 0x0F,
            pitch: Math.round(pitch),
            velocity: 0
        });
    }

    build() {
        this.events.sort((a, b) => {
            if (a.tick !== b.tick) return a.tick - b.tick;
            const orderA = a.type === 'noteOff' ? 0 : a.type === 'meta' ? 1 : 2;
            const orderB = b.type === 'noteOff' ? 0 : b.type === 'meta' ? 1 : 2;
            return orderA - orderB;
        });

        const byteStream = [];

        if (this.name) {
            byteStream.push(...this.encodeVarLen(0));
            byteStream.push(0xFF, 0x03);
            const nameBytes = [];
            for (let i = 0; i < this.name.length; i++) nameBytes.push(this.name.charCodeAt(i) & 0xFF);
            byteStream.push(...this.encodeVarLen(nameBytes.length));
            byteStream.push(...nameBytes);
        }

        let lastTick = 0;
        for (const ev of this.events) {
            const delta = Math.max(0, Math.round(ev.tick - lastTick));
            lastTick = ev.tick;

            byteStream.push(...this.encodeVarLen(delta));

            if (ev.type === 'noteOn') {
                byteStream.push(0x90 | (ev.channel & 0x0F), ev.pitch & 0x7F, ev.velocity & 0x7F);
            } else if (ev.type === 'noteOff') {
                byteStream.push(0x80 | (ev.channel & 0x0F), ev.pitch & 0x7F, 0x00);
            } else if (ev.type === 'program') {
                byteStream.push(0xC0 | (ev.channel & 0x0F), ev.program & 0x7F);
            } else if (ev.type === 'controlChange') {
                byteStream.push(0xB0 | (ev.channel & 0x0F), ev.controller & 0x7F, ev.value & 0x7F);
            } else if (ev.type === 'meta') {
                byteStream.push(0xFF, ev.metaType & 0x7F);
                byteStream.push(...this.encodeVarLen(ev.data.length));
                byteStream.push(...ev.data);
            }
        }

        byteStream.push(...this.encodeVarLen(0));
        byteStream.push(0xFF, 0x2F, 0x00);

        const chunk = new Uint8Array(8 + byteStream.length);
        chunk[0] = 0x4D; chunk[1] = 0x54; chunk[2] = 0x72; chunk[3] = 0x6B;
        const view = new DataView(chunk.buffer);
        view.setUint32(4, byteStream.length, false);
        chunk.set(byteStream, 8);

        return chunk;
    }

    encodeVarLen(val) {
        let v = Math.max(0, Math.floor(val));
        const bytes = [v & 0x7F];
        while (v > 0x7F) {
            v >>= 7;
            bytes.unshift((v & 0x7F) | 0x80);
        }
        return bytes;
    }
}

// ==========================================
// 2. Harmony & Chord Helper for MIDI
// ==========================================
const MidiChordHelper = {
    ROOT_SEMITONES: {
        'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
        'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
        'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
    },

    getDefaultChord(rootName = 'C') {
        const rootSemi = this.ROOT_SEMITONES[rootName] ?? 0;
        return {
            raw: rootName,
            rootName,
            rootSemi,
            bassSemi: rootSemi,
            quality: '',
            intervals: [4, 7],
            isMinor: false,
            isDominant: false
        };
    },

    parseChord(chordName, defaultRoot = 'C') {
        if (!chordName || typeof chordName !== 'string') return this.getDefaultChord(defaultRoot);
        let main = chordName.trim();
        if (main.toUpperCase() === 'N.C.' || main.toUpperCase() === 'NC') {
            return this.getDefaultChord(defaultRoot);
        }
        let slashBass = null;
        const slashIdx = main.indexOf('/');
        if (slashIdx >= 0) {
            slashBass = main.substring(slashIdx + 1).trim();
            main = main.substring(0, slashIdx).trim();
        }

        const match = main.match(/^([A-G](?:#|b)?)(.*)$/);
        if (!match) return this.getDefaultChord(defaultRoot);

        const rootName = match[1];
        const quality = match[2];
        const rootSemi = this.ROOT_SEMITONES[rootName] ?? 0;
        const bassSemi = slashBass ? (this.ROOT_SEMITONES[slashBass] ?? rootSemi) : rootSemi;

        let intervals = [4, 7]; // default major triad
        let isMinor = false;
        let isDominant = false;

        if (quality.includes('m7-5') || quality.includes('m7b5') || quality.includes('ø')) {
            intervals = [3, 6, 10];
            isMinor = true;
        } else if (quality.includes('m7') || quality.includes('-7')) {
            intervals = [3, 7, 10];
            isMinor = true;
        } else if (quality.includes('△') || quality.includes('Maj7') || quality.includes('maj7') || quality.includes('M7')) {
            intervals = [4, 7, 11];
        } else if (quality.includes('7')) {
            intervals = [4, 7, 10];
            isDominant = true;
        } else if (quality.includes('m6') || quality.includes('-6')) {
            intervals = [3, 7, 9];
            isMinor = true;
        } else if (quality.includes('6')) {
            intervals = [4, 7, 9];
        } else if (quality.includes('dim') || quality.includes('o')) {
            intervals = [3, 6, 9];
            isMinor = true;
        } else if (quality.includes('aug') || quality.includes('+')) {
            intervals = [4, 8];
        } else if (quality.includes('m') || quality.includes('-')) {
            intervals = [3, 7];
            isMinor = true;
        } else if (quality.includes('sus4')) {
            intervals = [5, 7];
        }

        return {
            raw: chordName,
            rootName,
            rootSemi,
            bassSemi,
            quality,
            intervals,
            isMinor,
            isDominant
        };
    },

    getBassRootMidi(parsed) {
        if (!parsed) return 36;
        return 36 + parsed.bassSemi;
    },

    getPianoVoicing(parsed, rootless = true, lowBound = 53, highBound = 76) {
        if (!parsed) return [60, 64, 67];
        const notes = [];
        if (!rootless) {
            notes.push(parsed.rootSemi);
        }
        for (const intv of parsed.intervals) {
            notes.push((parsed.rootSemi + intv) % 12);
        }

        const voicings = notes.map(semi => {
            let midi = 60 + semi;
            while (midi > highBound) midi -= 12;
            while (midi < lowBound) midi += 12;
            return midi;
        });

        return Array.from(new Set(voicings)).sort((a, b) => a - b);
    },

    getApproachNote(lastPitch, nextRoot) {
        const cDown = nextRoot - 1;
        const cUp = nextRoot + 1;
        const cDom = nextRoot + 7 <= 55 ? nextRoot + 7 : nextRoot - 5;

        const candidates = [cDown, cUp];
        if (cDom >= 36 && cDom <= 55) candidates.push(cDom);

        let best = candidates[0];
        let minDiff = 999;
        for (const cand of candidates) {
            const diff = Math.abs(cand - lastPitch);
            if (diff === 0) continue;
            if (diff < minDiff) {
                minDiff = diff;
                best = cand;
            }
        }
        return best;
    },

    // Choro 7-string Baixaria 4-note descending run seamlessly leading into nextRoot
    getChoroBaixariaRun4(currentRoot, nextRoot, parsedChord) {
        let target = nextRoot;
        while (target > 48) target -= 12;
        while (target < 36) target += 12;

        const isMinor = parsedChord?.isMinor || false;
        const thirdOffset = isMinor ? 3 : 4;

        // 4 continuous 16th-notes leading right up to nextRoot:
        const n1 = target + 5;
        const n2 = target + thirdOffset;
        const n3 = target + 2;
        const n4 = target + 1;

        return [n1, n2, n3, n4];
    },

    // Choro 7-string Baixaria 3-note run (preceded by a 16th rest: ・タタタ)
    getChoroBaixariaRun3(currentRoot, nextRoot, parsedChord) {
        let target = nextRoot;
        while (target > 48) target -= 12;
        while (target < 36) target += 12;

        const isMinor = parsedChord?.isMinor || false;
        const thirdOffset = isMinor ? 3 : 4;

        // 3 continuous 16th-notes leading right up to nextRoot:
        const n1 = target + thirdOffset;
        const n2 = target + 2;
        const n3 = target + 1;

        return [n1, n2, n3];
    }
};

// ==========================================
// 3. Extensible Style Registry
// ==========================================
const MidiStyles = {
    // ----------------------------------------------------
    // STYLE 1: Swing / Medium Swing
    // ----------------------------------------------------
    'swing': {
        id: 'swing',
        name: 'Swing / Medium Swing (Walking Bass & Anticipated Comping)',
        description: '4つ打ちウォーキングベース ＋ 2拍裏/4拍裏アンティシペイト・ピアノコンピング ＋ ライド＆ハイハット',
        defaultBpm: 120,
        generate(sheet, options, writer) {
            const ppq = writer.ppq;
            const singlePassSequence = MidiExporter.getPlaybackSequence(sheet, options);
            if (singlePassSequence.length === 0) return;

            const choruses = options.choruses || 1;
            const soloMiddle = options.soloMiddleChoruses && choruses > 1;

            // Apply preview-identical Jazz transformation (Swing + Anticipation) to melody
            let melodySinglePass = singlePassSequence;
            try {
                if (typeof AudioPlayer !== 'undefined') {
                    const ap = options.player || new AudioPlayer();
                    melodySinglePass = ap.applyJazzTransform(singlePassSequence);
                }
            } catch (e) {
                melodySinglePass = singlePassSequence;
            }

            // Tracks
            const timeSig = MidiExporter.getTimeSignature(sheet);
            const conductor = writer.addTrack('Tempo Track');
            conductor.setTempo(0, options.bpm || 120);
            conductor.setTimeSignature(0, timeSig.num, timeSig.den);

            let leadTrack = null;
            if (options.leadProgram !== undefined && options.leadProgram >= 0) {
                leadTrack = writer.addTrack(options.leadName || 'Lead Melody');
                leadTrack.setProgram(0, 0, options.leadProgram);
            }

            const pianoTrack = writer.addTrack('Piano Comping');
            pianoTrack.setProgram(0, 1, 0); // Acoustic Grand Piano

            const bassTrack = writer.addTrack('Acoustic Bass');
            bassTrack.setProgram(0, 2, 32); // Acoustic Bass

            let drumTrack = null;
            if (options.includeDrums) {
                drumTrack = writer.addTrack('Jazz Drums');
            }

            const meterBeats = MidiExporter.getMeterBeats(sheet);
            const hasPickup = MidiExporter.isPickupMeasure(singlePassSequence[0], meterBeats);
            const pickupDuration = hasPickup ? (singlePassSequence[0].totalDuration || 1.0) : 0;
            const pickupTicks = Math.round(pickupDuration * ppq);

            // 1. Count-In
            let currentTick = 0;
            if (options.includeCountIn) {
                const countInTicks = MidiExporter.addCountIn(drumTrack, ppq, meterBeats);
                if (hasPickup) {
                    currentTick = countInTicks - pickupTicks;
                } else {
                    currentTick = countInTicks;
                }
            }

            let lastBassPitch = 40;

            // 2. Multi-Chorus Loop
            for (let c = 0; c < choruses; c++) {
                const isMelodyChorus = !soloMiddle || (c === 0 || c === choruses - 1);

                for (let i = 0; i < singlePassSequence.length; i++) {
                    const m = singlePassSequence[i];
                    if (c > 0 && i === 0 && hasPickup) {
                        continue;
                    }

                    const isThisPickup = (c === 0 && i === 0 && hasPickup);
                    const nextM = i + 1 < singlePassSequence.length ? singlePassSequence[i + 1] : singlePassSequence[0];
                    const beatsInMeasure = MidiExporter.getMeasureBeats(m, meterBeats, isThisPickup, pickupDuration);
                    const measureTicks = Math.round(beatsInMeasure * ppq);

                    // --- Lead Melody ---
                    if (isMelodyChorus && leadTrack) {
                        MidiExporter.addMelodyMeasure(leadTrack, melodySinglePass, i, currentTick, ppq, 92, 15);
                    }

                    // --- Chords Analysis ---
                    const parsedChords = [];
                    if (m.chords && m.chords.length > 0) {
                        for (const cc of m.chords) {
                            const p = MidiChordHelper.parseChord(cc.chord);
                            if (p) parsedChords.push({ chord: p, position: cc.position });
                        }
                    }
                    if (parsedChords.length === 0) parsedChords.push({ chord: MidiChordHelper.parseChord('C'), position: 0 });

                    let nextChord = null;
                    if (nextM && nextM.chords && nextM.chords.length > 0) {
                        nextChord = MidiChordHelper.parseChord(nextM.chords[0].chord);
                    }
                    if (!nextChord) nextChord = parsedChords[0].chord;

                    // Accompaniment: Rests (tacet) during pickup measure!
                    if (!isThisPickup) {
                        // --- Walking Bass ---
                        if (beatsInMeasure === 4) {
                            if (parsedChords.length >= 2) {
                                const c1 = parsedChords[0].chord;
                                const c2 = parsedChords[1].chord;
                                const root1 = MidiChordHelper.getBassRootMidi(c1);
                                const root2 = MidiChordHelper.getBassRootMidi(c2);
                                const nextRoot = MidiChordHelper.getBassRootMidi(nextChord);

                                bassTrack.addNote(2, root1, currentTick, Math.round(ppq * 0.92), 88);
                                const app1 = MidiChordHelper.getApproachNote(root1, root2);
                                bassTrack.addNote(2, app1, currentTick + ppq, Math.round(ppq * 0.92), 85);
                                bassTrack.addNote(2, root2, currentTick + ppq * 2, Math.round(ppq * 0.92), 90);
                                const app2 = MidiChordHelper.getApproachNote(root2, nextRoot);
                                bassTrack.addNote(2, app2, currentTick + ppq * 3, Math.round(ppq * 0.92), 86);
                                lastBassPitch = app2;
                            } else {
                                const c1 = parsedChords[0].chord;
                                const root1 = MidiChordHelper.getBassRootMidi(c1);
                                const nextRoot = MidiChordHelper.getBassRootMidi(nextChord);

                                bassTrack.addNote(2, root1, currentTick, Math.round(ppq * 0.92), 88);
                                const tone2 = root1 + (c1.intervals[0] || 4);
                                bassTrack.addNote(2, tone2 <= 55 ? tone2 : tone2 - 12, currentTick + ppq, Math.round(ppq * 0.92), 84);
                                const tone3 = root1 + (c1.intervals[1] || 7);
                                bassTrack.addNote(2, tone3 <= 55 ? tone3 : tone3 - 12, currentTick + ppq * 2, Math.round(ppq * 0.92), 84);
                                const app = MidiChordHelper.getApproachNote(tone3, nextRoot);
                                bassTrack.addNote(2, app, currentTick + ppq * 3, Math.round(ppq * 0.92), 87);
                                lastBassPitch = app;
                            }
                        } else {
                            const c1 = parsedChords[0].chord;
                            const root1 = MidiChordHelper.getBassRootMidi(c1);
                            for (let b = 0; b < beatsInMeasure; b++) {
                                const pitch = (b === 0) ? root1 : (root1 + (c1.intervals[b % c1.intervals.length] || 7));
                                bassTrack.addNote(2, pitch <= 55 ? pitch : pitch - 12, currentTick + b * ppq, Math.round(ppq * 0.9), 85);
                            }
                        }

                        // --- Piano Comping (2-and & 4-and Anticipation) ---
                        const swingOffset = Math.round(ppq * (2 / 3));
                        const compingDur = Math.round(ppq * 0.28);

                        if (beatsInMeasure === 4) {
                            const chordForBeat2And = (parsedChords.length >= 2) ? parsedChords[1].chord : parsedChords[0].chord;
                            const voicing1 = MidiChordHelper.getPianoVoicing(chordForBeat2And, true);
                            const tick2And = currentTick + ppq * 1 + swingOffset;
                            for (const pitch of voicing1) {
                                pianoTrack.addNote(1, pitch, tick2And, compingDur, 84);
                            }

                            const voicing2 = MidiChordHelper.getPianoVoicing(nextChord, true);
                            const tick4And = currentTick + ppq * 3 + swingOffset;
                            for (const pitch of voicing2) {
                                pianoTrack.addNote(1, pitch, tick4And, compingDur, 88);
                            }
                        }

                        // --- Drums ---
                        if (drumTrack && beatsInMeasure === 4) {
                            const RIDE = 51;
                            const HIHAT_FOOT = 44;
                            drumTrack.addNote(9, RIDE, currentTick + ppq * 0, 100, 78);
                            drumTrack.addNote(9, RIDE, currentTick + ppq * 1, 100, 70);
                            drumTrack.addNote(9, RIDE, currentTick + ppq * 1 + swingOffset, 80, 84);
                            drumTrack.addNote(9, RIDE, currentTick + ppq * 2, 100, 78);
                            drumTrack.addNote(9, RIDE, currentTick + ppq * 3, 100, 70);
                            drumTrack.addNote(9, RIDE, currentTick + ppq * 3 + swingOffset, 80, 84);

                            drumTrack.addNote(9, HIHAT_FOOT, currentTick + ppq * 1, 60, 86);
                            drumTrack.addNote(9, HIHAT_FOOT, currentTick + ppq * 3, 60, 88);
                        }
                    }

                    currentTick += measureTicks;
                }
            }
        }
    },

    // ----------------------------------------------------
    // STYLE 2: Medium 2-Beat / Dixie (Trad Jazz)
    // ----------------------------------------------------
    'two-beat': {
        id: 'two-beat',
        name: 'Medium 2-Beat (Dixie / Trad Jazz)',
        description: '1・3拍ルート/5度ベース ＋ 2・4拍裏打ちピアノ ＋ スネアブラシ＆ハイハット',
        defaultBpm: 120,
        generate(sheet, options, writer) {
            const ppq = writer.ppq;
            const singlePass = MidiExporter.getPlaybackSequence(sheet, options);
            if (singlePass.length === 0) return;

            const choruses = options.choruses || 1;
            const soloMiddle = options.soloMiddleChoruses && choruses > 1;

            const timeSig = MidiExporter.getTimeSignature(sheet);
            const meterBeats = MidiExporter.getMeterBeats(sheet);
            const conductor = writer.addTrack('Tempo Track');
            conductor.setTempo(0, options.bpm || 120);
            conductor.setTimeSignature(0, timeSig.num, timeSig.den);

            let leadTrack = null;
            if (options.leadProgram !== undefined && options.leadProgram >= 0) {
                leadTrack = writer.addTrack(options.leadName || 'Lead Melody');
                leadTrack.setProgram(0, 0, options.leadProgram);
            }

            const pianoTrack = writer.addTrack('Ragtime/Trad Piano');
            pianoTrack.setProgram(0, 1, 0);

            const bassTrack = writer.addTrack('Tuba / Upright Bass');
            bassTrack.setProgram(0, 2, 58); // Tuba (GM 58) for classic Dixieland feel

            let drumTrack = null;
            if (options.includeDrums) {
                drumTrack = writer.addTrack('Trad Drums');
            }

            let currentTick = 0;
            if (options.includeCountIn) {
                currentTick = MidiExporter.addCountIn(drumTrack, ppq, meterBeats);
            }

            for (let c = 0; c < choruses; c++) {
                const isMelodyChorus = !soloMiddle || (c === 0 || c === choruses - 1);

                for (let i = 0; i < singlePass.length; i++) {
                    const m = singlePass[i];
                    const beatsInMeasure = MidiExporter.getMeasureBeats(m, meterBeats);
                    const measureTicks = Math.round(beatsInMeasure * ppq);

                    // Lead
                    if (isMelodyChorus && leadTrack) {
                        MidiExporter.addMelodyMeasure(leadTrack, singlePass, i, currentTick, ppq, 92, 12);
                    }

                    // Chords
                    const parsed = (m.chords && m.chords.length > 0) ? MidiChordHelper.parseChord(m.chords[0].chord) : MidiChordHelper.parseChord('C');
                    const root = MidiChordHelper.getBassRootMidi(parsed);
                    const fifth = root + 7;

                    // 2-Beat Bass (Beat 1: Root, Beat 3: 5th)
                    bassTrack.addNote(2, root, currentTick, Math.round(ppq * 1.6), 92);
                    bassTrack.addNote(2, fifth <= 50 ? fifth : fifth - 12, currentTick + ppq * 2, Math.round(ppq * 1.6), 88);

                    // Piano Chop on 2 and 4 (Oom-Pah Pah!)
                    const voicing = MidiChordHelper.getPianoVoicing(parsed, true);
                    const chopDur = Math.round(ppq * 0.35);
                    for (const p of voicing) {
                        pianoTrack.addNote(1, p, currentTick + ppq * 1, chopDur, 86);
                        pianoTrack.addNote(1, p, currentTick + ppq * 3, chopDur, 90);
                    }

                    // Drums
                    if (drumTrack) {
                        const SNARE = 38;
                        const HIHAT_FOOT = 44;
                        const WOODBLOCK = 76;
                        // Woodblock / Snare on 2 & 4
                        drumTrack.addNote(9, WOODBLOCK, currentTick + ppq * 1, 60, 85);
                        drumTrack.addNote(9, WOODBLOCK, currentTick + ppq * 3, 60, 90);
                        drumTrack.addNote(9, HIHAT_FOOT, currentTick + ppq * 1, 60, 85);
                        drumTrack.addNote(9, HIHAT_FOOT, currentTick + ppq * 3, 60, 85);
                    }

                    currentTick += measureTicks;
                }
            }
        }
    },

    // ----------------------------------------------------
    // STYLE 3: Swing (2-Beat & 4-Beat Switch)
    // ----------------------------------------------------
    'swing-24': {
        id: 'swing-24',
        name: 'Swing (2-Beat & 4-Beat Switch)',
        description: 'テーマAは2ビート＆ハイハット、サビBとソロ中はウォーキングベース＆ライド4ビートに自動切替',
        defaultBpm: 140,
        generate(sheet, options, writer) {
            const ppq = writer.ppq;
            const singlePassSequence = MidiExporter.getPlaybackSequence(sheet, options);
            if (singlePassSequence.length === 0) return;

            const choruses = options.choruses || 1;
            const soloMiddle = options.soloMiddleChoruses && choruses > 1;

            // Apply preview-identical Jazz transformation (Swing + Anticipation) to melody
            let melodySinglePass = singlePassSequence;
            try {
                if (typeof AudioPlayer !== 'undefined') {
                    const ap = options.player || new AudioPlayer();
                    melodySinglePass = ap.applyJazzTransform(singlePassSequence);
                }
            } catch (e) {
                melodySinglePass = singlePassSequence;
            }

            const timeSig = MidiExporter.getTimeSignature(sheet);
            const conductor = writer.addTrack('Tempo Track');
            conductor.setTempo(0, options.bpm || 140);
            conductor.setTimeSignature(0, timeSig.num, timeSig.den);

            let leadTrack = null;
            if (options.leadProgram !== undefined && options.leadProgram >= 0) {
                leadTrack = writer.addTrack(options.leadName || 'Lead Melody');
                leadTrack.setProgram(0, 0, options.leadProgram);
            }

            const pianoTrack = writer.addTrack('Acoustic Piano');
            pianoTrack.setProgram(0, 1, 0);

            const bassTrack = writer.addTrack('Acoustic Bass');
            bassTrack.setProgram(0, 2, 32);

            let drumTrack = null;
            if (options.includeDrums) {
                drumTrack = writer.addTrack('Jazz Drums');
            }

            const meterBeats = MidiExporter.getMeterBeats(sheet);
            const hasPickup = MidiExporter.isPickupMeasure(singlePassSequence[0], meterBeats);
            const pickupDuration = hasPickup ? (singlePassSequence[0].totalDuration || 1.0) : 0;
            const pickupTicks = Math.round(pickupDuration * ppq);

            let currentTick = 0;
            if (options.includeCountIn) {
                const countInTicks = MidiExporter.addCountIn(drumTrack, ppq, meterBeats);
                if (hasPickup) {
                    currentTick = countInTicks - pickupTicks;
                } else {
                    currentTick = countInTicks;
                }
            }

            let lastBassPitch = 40;

            const hasExplicitSectionLabels = singlePassSequence.some(sm => sm.sectionLabel);

            for (let c = 0; c < choruses; c++) {
                const isMelodyChorus = !soloMiddle || (c === 0 || c === choruses - 1);
                const isSoloChorus = soloMiddle && (c > 0 && c < choruses - 1);

                let currentSection = 'A';
                let nominalMeasureCount = 0;

                for (let i = 0; i < singlePassSequence.length; i++) {
                    const m = singlePassSequence[i];
                    if (c > 0 && i === 0 && hasPickup) {
                        continue;
                    }

                    const isThisPickup = (c === 0 && i === 0 && hasPickup);
                    if (!isThisPickup && m.sectionLabel) {
                        currentSection = m.sectionLabel.trim().toUpperCase();
                    }

                    const nextM = i + 1 < singlePassSequence.length ? singlePassSequence[i + 1] : singlePassSequence[0];
                    const beatsInMeasure = MidiExporter.getMeasureBeats(m, meterBeats, isThisPickup, pickupDuration);
                    const measureTicks = Math.round(beatsInMeasure * ppq);

                    // 1. Lead Melody: Full Swing Anticipation & Triplet transformation (identical to swing style)
                    if (isMelodyChorus && leadTrack) {
                        MidiExporter.addMelodyMeasure(leadTrack, melodySinglePass, i, currentTick, ppq, 92, 12);
                    }

                    // 2. Accompaniment (Tacet during pickup)
                    if (!isThisPickup) {
                        // Section 2-Feel vs 4-Feel check:
                        // Rule: "Aセクションじゃなかったら4にする（B, C, D, Bridgeなど全て4ビート）"
                        let is4Beat = false;
                        if (isSoloChorus) {
                            is4Beat = true; // Solos are always 100% 4-beat driving swing!
                        } else if (hasExplicitSectionLabels) {
                            const isASection = currentSection.startsWith('A') || currentSection.includes('INTRO') || currentSection.includes('VERSE');
                            is4Beat = !isASection; // Anything not A (B, C, D, Chorus, Bridge, etc.) is 4-beat!
                        } else {
                            // Fallback by measure position if no section labels exist in sheet:
                            const totalNominal = hasPickup ? (singlePassSequence.length - 1) : singlePassSequence.length;
                            if (totalNominal >= 28 && totalNominal <= 36) {
                                // 32-bar form: measures 17-24 (bridge) and 29-32 (shout ending) are 4-beat
                                if (nominalMeasureCount >= 16 && nominalMeasureCount < 24) is4Beat = true;
                                else if (nominalMeasureCount >= 28) is4Beat = true;
                                else is4Beat = false;
                            } else {
                                is4Beat = (nominalMeasureCount >= Math.floor(totalNominal / 2));
                            }
                        }

                        // Parse Chords
                        let parsedChords = [];
                        if (m.chords && m.chords.length > 0) {
                            parsedChords = m.chords.map(c => ({ chord: MidiChordHelper.parseChord(c.chord) }));
                        } else {
                            parsedChords = [{ chord: MidiChordHelper.parseChord('C') }];
                        }
                        let nextChord = null;
                        if (nextM && nextM.chords && nextM.chords.length > 0) {
                            nextChord = MidiChordHelper.parseChord(nextM.chords[0].chord);
                        }
                        if (!nextChord) nextChord = parsedChords[0].chord;

                        const RIDE = 51;
                        const CLOSED_HH = 42;
                        const HIHAT_FOOT = 44;
                        const KICK = 36;
                        const swingOffset = Math.round(ppq * (2 / 3));

                        if (is4Beat && beatsInMeasure === 4) {
                            // --- 4-Beat Walking Bass ---
                            if (parsedChords.length >= 2) {
                                const c1 = parsedChords[0].chord;
                                const c2 = parsedChords[1].chord;
                                const root1 = MidiChordHelper.getBassRootMidi(c1);
                                const root2 = MidiChordHelper.getBassRootMidi(c2);
                                const nextRoot = MidiChordHelper.getBassRootMidi(nextChord);

                                bassTrack.addNote(2, root1, currentTick, Math.round(ppq * 0.92), 90);
                                const app1 = MidiChordHelper.getApproachNote(root1, root2);
                                bassTrack.addNote(2, app1, currentTick + ppq, Math.round(ppq * 0.92), 86);
                                bassTrack.addNote(2, root2, currentTick + ppq * 2, Math.round(ppq * 0.92), 92);
                                const app2 = MidiChordHelper.getApproachNote(root2, nextRoot);
                                bassTrack.addNote(2, app2, currentTick + ppq * 3, Math.round(ppq * 0.92), 88);
                                lastBassPitch = app2;
                            } else {
                                const c1 = parsedChords[0].chord;
                                const root1 = MidiChordHelper.getBassRootMidi(c1);
                                const nextRoot = MidiChordHelper.getBassRootMidi(nextChord);

                                bassTrack.addNote(2, root1, currentTick, Math.round(ppq * 0.92), 90);
                                const tone2 = root1 + (c1.intervals[0] || 4);
                                bassTrack.addNote(2, tone2 <= 55 ? tone2 : tone2 - 12, currentTick + ppq, Math.round(ppq * 0.92), 86);
                                const tone3 = root1 + (c1.intervals[1] || 7);
                                bassTrack.addNote(2, tone3 <= 55 ? tone3 : tone3 - 12, currentTick + ppq * 2, Math.round(ppq * 0.92), 86);
                                const app = MidiChordHelper.getApproachNote(tone3, nextRoot);
                                bassTrack.addNote(2, app, currentTick + ppq * 3, Math.round(ppq * 0.92), 88);
                                lastBassPitch = app;
                            }

                            // --- 4-Beat Drums (Ride Legato + Foot Hi-Hat) ---
                            if (drumTrack) {
                                drumTrack.addNote(9, RIDE, currentTick + ppq * 0, 100, 80);
                                drumTrack.addNote(9, RIDE, currentTick + ppq * 1, 100, 72);
                                drumTrack.addNote(9, RIDE, currentTick + ppq * 1 + swingOffset, 80, 86);
                                drumTrack.addNote(9, RIDE, currentTick + ppq * 2, 100, 80);
                                drumTrack.addNote(9, RIDE, currentTick + ppq * 3, 100, 72);
                                drumTrack.addNote(9, RIDE, currentTick + ppq * 3 + swingOffset, 80, 86);

                                drumTrack.addNote(9, HIHAT_FOOT, currentTick + ppq * 1, 60, 88);
                                drumTrack.addNote(9, HIHAT_FOOT, currentTick + ppq * 3, 60, 90);
                            }
                        } else {
                            // --- 2-Beat Bass (Beat 1: Root, Beat 3: 5th) ---
                            const c1 = parsedChords[0].chord;
                            const root1 = MidiChordHelper.getBassRootMidi(c1);
                            const fifth1 = root1 + 7;
                            if (beatsInMeasure === 4) {
                                bassTrack.addNote(2, root1, currentTick, Math.round(ppq * 1.6), 90);
                                bassTrack.addNote(2, fifth1 <= 55 ? fifth1 : fifth1 - 12, currentTick + ppq * 2, Math.round(ppq * 1.6), 86);
                            } else {
                                bassTrack.addNote(2, root1, currentTick, Math.round(ppq * 1.6), 90);
                                bassTrack.addNote(2, fifth1 <= 55 ? fifth1 : fifth1 - 12, currentTick + ppq * 2, Math.round(ppq * 0.9), 84);
                            }

                            // --- 2-Beat Drums (Closed Hi-Hat Swing + Foot Hi-Hat + Soft Feathering Kick) ---
                            if (drumTrack && beatsInMeasure === 4) {
                                drumTrack.addNote(9, CLOSED_HH, currentTick + ppq * 0, 80, 72);
                                drumTrack.addNote(9, CLOSED_HH, currentTick + ppq * 1, 80, 70);
                                drumTrack.addNote(9, CLOSED_HH, currentTick + ppq * 1 + swingOffset, 60, 82);
                                drumTrack.addNote(9, CLOSED_HH, currentTick + ppq * 2, 80, 72);
                                drumTrack.addNote(9, CLOSED_HH, currentTick + ppq * 3, 80, 70);
                                drumTrack.addNote(9, CLOSED_HH, currentTick + ppq * 3 + swingOffset, 60, 84);

                                drumTrack.addNote(9, HIHAT_FOOT, currentTick + ppq * 1, 60, 86);
                                drumTrack.addNote(9, HIHAT_FOOT, currentTick + ppq * 3, 60, 88);

                                drumTrack.addNote(9, KICK, currentTick, 60, 50);
                                drumTrack.addNote(9, KICK, currentTick + ppq * 2, 60, 48);
                            }
                        }

                        // --- Piano Comping (Applies to both 2-Beat & 4-Beat for authentic jazz feel) ---
                        const compingDur = Math.round(ppq * 0.28);
                        if (beatsInMeasure === 4) {
                            const chordForBeat2And = (parsedChords.length >= 2) ? parsedChords[1].chord : parsedChords[0].chord;
                            const voicing1 = MidiChordHelper.getPianoVoicing(chordForBeat2And, true);
                            const tick2And = currentTick + ppq * 1 + swingOffset;
                            for (const pitch of voicing1) {
                                pianoTrack.addNote(1, pitch, tick2And, compingDur, 82);
                            }

                            const voicing2 = MidiChordHelper.getPianoVoicing(nextChord, true);
                            const tick4And = currentTick + ppq * 3 + swingOffset;
                            for (const pitch of voicing2) {
                                pianoTrack.addNote(1, pitch, tick4And, compingDur, 86);
                            }
                        }

                        nominalMeasureCount++;
                    }

                    currentTick += measureTicks;
                }
            }
        }
    },

    // ----------------------------------------------------
    // STYLE 3: Bossa Nova (Nylon Guitar + Clave + Tan-ta-Tan-ta Bass)
    // ----------------------------------------------------
    'bossa': {
        id: 'bossa',
        name: 'Bossa Nova (Nylon Guitar Clave & Syncopated Bass)',
        description: 'ナイロン弦ギターのボサノバ刻み ＋ 「タン・タ・タン・タ」ベース ＋ クロススティック',
        defaultBpm: 130,
        generate(sheet, options, writer) {
            const ppq = writer.ppq;
            const singlePass = MidiExporter.getPlaybackSequence(sheet, options);
            if (singlePass.length === 0) return;

            const choruses = options.choruses || 1;
            const soloMiddle = options.soloMiddleChoruses && choruses > 1;

            const timeSig = MidiExporter.getTimeSignature(sheet);
            const conductor = writer.addTrack('Tempo Track');
            conductor.setTempo(0, options.bpm || 130);
            conductor.setTimeSignature(0, timeSig.num, timeSig.den);

            let leadTrack = null;
            if (options.leadProgram !== undefined && options.leadProgram >= 0) {
                leadTrack = writer.addTrack(options.leadName || 'Lead Melody');
                leadTrack.setProgram(0, 0, options.leadProgram);
            }

            // Nylon String Acoustic Guitar (GM 24)
            const guitarTrack = writer.addTrack('Nylon Guitar');
            guitarTrack.setProgram(0, 1, 24);

            const bassTrack = writer.addTrack('Acoustic Bass');
            bassTrack.setProgram(0, 2, 32);

            let drumTrack = null;
            if (options.includeDrums) {
                drumTrack = writer.addTrack('Bossa Percussion');
            }

            const meterBeats = MidiExporter.getMeterBeats(sheet);
            const hasPickup = MidiExporter.isPickupMeasure(singlePass[0], meterBeats);
            const pickupDuration = hasPickup ? (singlePass[0].totalDuration || 1.0) : 0;
            const pickupTicks = Math.round(pickupDuration * ppq);

            let currentTick = 0;
            if (options.includeCountIn) {
                const countInTicks = MidiExporter.addCountIn(drumTrack, ppq, meterBeats);
                if (hasPickup) {
                    // Lead-in melody begins before downbeat so it ends precisely when count-in finishes!
                    currentTick = countInTicks - pickupTicks;
                } else {
                    currentTick = countInTicks;
                }
            }

            // Bossa Nova 2-Bar Clave Pattern (Classic João Gilberto style):
            // Bar 1: Quarter Rest, Quarter Note (Beat 1), Eighth Rest, Eighth Note (Beat 2.5), Quarter Rest
            // Bar 2: Eighth Note (Beat 0), Quarter Rest, Eighth Note (Beat 1.5), Eighth Rest, Dotted Quarter Note (Beat 2.5)
            const guitarEventsM1 = [
                { beat: 1.0, dur: 1.0, vel: 84 }, // 4分音符 (Beat 1.0 - 2.0)
                { beat: 2.5, dur: 0.5, vel: 80 }  // 8分音符 (Beat 2.5 - 3.0)
            ];
            const guitarEventsM2 = [
                { beat: 0.0, dur: 0.5, vel: 84 }, // 8分音符 (Beat 0.0 - 0.5)
                { beat: 1.5, dur: 0.5, vel: 80 }, // 8分音符 (Beat 1.5 - 2.0)
                { beat: 2.5, dur: 1.5, vel: 86 }  // 付点4分音符 (Beat 2.5 - 4.0, sustained!)
            ];

            let accompanimentBarIdx = 0;

            for (let c = 0; c < choruses; c++) {
                const isMelodyChorus = !soloMiddle || (c === 0 || c === choruses - 1);

                for (let i = 0; i < singlePass.length; i++) {
                    const m = singlePass[i];
                    // Skip pickup measure in subsequent choruses so the chorus cycle stays in meter
                    if (c > 0 && i === 0 && hasPickup) {
                        continue;
                    }

                    const isThisPickup = (c === 0 && i === 0 && hasPickup);
                    const beatsInMeasure = MidiExporter.getMeasureBeats(m, meterBeats, isThisPickup, pickupDuration);
                    const measureTicks = Math.round(beatsInMeasure * ppq);

                    // Lead (Straight 8th feel)
                    if (isMelodyChorus && leadTrack) {
                        MidiExporter.addMelodyMeasure(leadTrack, singlePass, i, currentTick, ppq, 90, 12);
                    }

                    // Accompaniment: Rests (tacet) during pickup measure!
                    if (!isThisPickup) {
                        // Chords
                        const parsed = (m.chords && m.chords.length > 0) ? MidiChordHelper.parseChord(m.chords[0].chord) : MidiChordHelper.parseChord('C');
                        const root = MidiChordHelper.getBassRootMidi(parsed);
                        const fifth = root + 7;

                        // Bossa Bass: "Tan - ta - Tan - ta"
                        // Beat 1 (dotted quarter), Beat 2-and (eighth), Beat 3 (dotted quarter), Beat 4-and (eighth)
                        const bassDottedDur = Math.round(ppq * 1.35);
                        const bass8thDur = Math.round(ppq * 0.45);
                        bassTrack.addNote(2, root, currentTick, bassDottedDur, 88);
                        bassTrack.addNote(2, root, currentTick + Math.round(ppq * 1.5), bass8thDur, 80);
                        bassTrack.addNote(2, fifth <= 55 ? fifth : fifth - 12, currentTick + ppq * 2, bassDottedDur, 86);
                        bassTrack.addNote(2, fifth <= 55 ? fifth : fifth - 12, currentTick + Math.round(ppq * 3.5), bass8thDur, 80);

                        // Nylon Guitar Clave Pattern: Synchronized to accompanimentBarIdx starting at first complete measure!
                        const voicing = MidiChordHelper.getPianoVoicing(parsed, true);
                        const rawEvents = (accompanimentBarIdx % 2 === 0) ? guitarEventsM1 : guitarEventsM2;
                        const patternEvents = rawEvents.filter(e => e.beat < beatsInMeasure);

                        for (const ev of patternEvents) {
                            const tick = currentTick + Math.round(ev.beat * ppq);
                            const usableDurBeats = Math.min(ev.dur, beatsInMeasure - ev.beat);
                            const gtrDur = Math.max(10, Math.round(usableDurBeats * ppq * 0.95));

                            // Gentle nylon string spread (3ms between strings)
                            for (let sIdx = 0; sIdx < voicing.length; sIdx++) {
                                guitarTrack.addNote(1, voicing[sIdx], tick + sIdx * 4, gtrDur, ev.vel);
                            }
                        }

                        // Percussion: Side Stick (37) + Closed Hi-Hat (42) + Feathering Kick (36)
                        if (drumTrack) {
                            const SIDE_STICK = 37;
                            const CLOSED_HH = 42;
                            const KICK = 36;
                            // Continuous 8th-note Hi-Hat
                            for (let h = 0; h < beatsInMeasure * 2; h++) {
                                drumTrack.addNote(9, CLOSED_HH, currentTick + Math.round(h * 0.5 * ppq), 40, h % 2 === 0 ? 75 : 60);
                            }
                            // Clave rim shot / side stick matching the guitar rhythm
                            for (const ev of patternEvents) {
                                drumTrack.addNote(9, SIDE_STICK, currentTick + Math.round(ev.beat * ppq), 60, 84);
                            }
                            // Soft 2-beat kick
                            drumTrack.addNote(9, KICK, currentTick, 60, 68);
                            if (beatsInMeasure >= 4) {
                                drumTrack.addNote(9, KICK, currentTick + ppq * 2, 60, 68);
                            }
                        }

                        accompanimentBarIdx++;
                    }

                    currentTick += measureTicks;
                }
            }
        }
    },

    // ----------------------------------------------------
    // STYLE 4: Choro (Brazilian 7-String Baixaria & Guitar Syncopation)
    // ----------------------------------------------------
    'choro': {
        id: 'choro',
        name: 'Choro (7-String Baixaria Runs & Syncopated Guitar)',
        description: '7弦ギターの下降ラン（Baixaria） ＋ ギターの「・タータ・タータ」裏打ち ＋ パンデイロ風刻み',
        defaultBpm: 125,
        generate(sheet, options, writer) {
            const ppq = writer.ppq;
            const singlePass = MidiExporter.getPlaybackSequence(sheet, options);
            if (singlePass.length === 0) return;

            const choruses = options.choruses || 1;
            const soloMiddle = options.soloMiddleChoruses && choruses > 1;

            const timeSig = MidiExporter.getTimeSignature(sheet);
            const conductor = writer.addTrack('Tempo Track');
            conductor.setTempo(0, options.bpm || 125);
            conductor.setTimeSignature(0, timeSig.num, timeSig.den);

            let leadTrack = null;
            if (options.leadProgram !== undefined && options.leadProgram >= 0) {
                leadTrack = writer.addTrack(options.leadName || 'Lead Melody');
                leadTrack.setProgram(0, 0, options.leadProgram);
            }

            // Nylon Guitar for rhythm syncopation (GM 24)
            const guitarTrack = writer.addTrack('Choro Rhythm Guitar');
            guitarTrack.setProgram(0, 1, 24);

            // 7-String Classical Guitar / Acoustic Bass (GM 32 or Nylon GM 24 deep)
            const bassTrack = writer.addTrack('7-String Baixaria Guitar');
            bassTrack.setProgram(0, 2, 32);

            let drumTrack = null;
            if (options.includeDrums) {
                drumTrack = writer.addTrack('Pandeiro Percussion');
            }

            const meterBeats = MidiExporter.getMeterBeats(sheet);
            const hasPickup = MidiExporter.isPickupMeasure(singlePass[0], meterBeats);
            const pickupDuration = hasPickup ? (singlePass[0].totalDuration || 1.0) : 0;
            const pickupTicks = Math.round(pickupDuration * ppq);

            let currentTick = 0;
            if (options.includeCountIn) {
                const countInTicks = MidiExporter.addCountIn(drumTrack, ppq, meterBeats);
                if (hasPickup) {
                    currentTick = countInTicks - pickupTicks;
                } else {
                    currentTick = countInTicks;
                }
            }

            for (let c = 0; c < choruses; c++) {
                const isMelodyChorus = !soloMiddle || (c === 0 || c === choruses - 1);

                for (let i = 0; i < singlePass.length; i++) {
                    const m = singlePass[i];
                    if (c > 0 && i === 0 && hasPickup) {
                        continue;
                    }

                    const isThisPickup = (c === 0 && i === 0 && hasPickup);
                    const nextM = i + 1 < singlePass.length ? singlePass[i + 1] : singlePass[0];
                    const beatsInMeasure = MidiExporter.getMeasureBeats(m, meterBeats, isThisPickup, pickupDuration);
                    const measureTicks = Math.round(beatsInMeasure * ppq);

                    // Lead
                    if (isMelodyChorus && leadTrack) {
                        MidiExporter.addMelodyMeasure(leadTrack, singlePass, i, currentTick, ppq, 92, 12);
                    }

                    // Accompaniment: Rests (tacet) during pickup measure!
                    if (!isThisPickup) {
                        // Chords
                        const parsed = (m.chords && m.chords.length > 0) ? MidiChordHelper.parseChord(m.chords[0].chord) : MidiChordHelper.parseChord('C');
                        const nextParsed = (nextM && nextM.chords && nextM.chords.length > 0) ? MidiChordHelper.parseChord(nextM.chords[0].chord) : parsed;
                    const root = MidiChordHelper.getBassRootMidi(parsed);
                    const nextRoot = MidiChordHelper.getBassRootMidi(nextParsed);

                    // 1. Guitar Rhythm: User's specification ->
                    // 16th rest -> 8th note -> 16th note (anticipated to next chord)
                    // Repeating on each beat!
                    const curVoicing = MidiChordHelper.getPianoVoicing(parsed, true);
                    const nextVoicing = MidiChordHelper.getPianoVoicing(nextParsed, true);
                    const sixteenth = Math.round(ppq / 4);

                    for (let b = 0; b < beatsInMeasure; b++) {
                        const beatTick = currentTick + b * ppq;

                        // [1] 16th rest (0..sixteenth) - Silence

                        // [2] 8th note at beatTick + sixteenth
                        const t8th = beatTick + sixteenth;
                        const dur8th = Math.round(sixteenth * 2 * 0.9);
                        for (const p of curVoicing) {
                            guitarTrack.addNote(1, p, t8th, dur8th, 80);
                        }

                        // [3] 16th note at beatTick + sixteenth * 3 (Anticipated!)
                        const t16th = beatTick + sixteenth * 3;
                        const dur16th = Math.round(sixteenth * 0.85);
                        const isLastBeat = (b === beatsInMeasure - 1);
                        const antVoicing = isLastBeat ? nextVoicing : curVoicing;

                        for (const p of antVoicing) {
                            guitarTrack.addNote(1, p, t16th, dur16th, 86);
                        }
                    }

                    // 2. 7-String Baixaria (Bass line):
                    // Normal chords: Solid bass supporting root/fifth on downbeats ("Tone, Tone").
                    // Dominant 7th chords: Dynamic 7-string Baixaria with crisp syncopation (16th-rest -> 8th -> 16th)
                    // and melodic 16th-note runs driving resolution into the next chord!
                    const isDom = parsed.isDominant === true;
                    const fifth = root + 7 <= 55 ? root + 7 : root - 5;
                    const third = root + (parsed.intervals[0] || 4);

                    if (beatsInMeasure === 4) {
                        if (isDom) {
                            // --- Dominant 7th Measure: Active Baixaria Groove ---
                            // Beat 0: 16th rest + 8th root + 16th fifth (・タータ on root/fifth)
                            bassTrack.addNote(2, root, currentTick + sixteenth, Math.round(sixteenth * 2 * 0.9), 94);
                            bassTrack.addNote(2, fifth, currentTick + sixteenth * 3, Math.round(sixteenth * 0.85), 88);

                            // Beat 1: Steady 5th
                            bassTrack.addNote(2, fifth, currentTick + ppq, Math.round(ppq * 0.85), 90);

                            // Beat 2: 16th rest + 8th root + 16th note (・タータ)
                            bassTrack.addNote(2, root, currentTick + ppq * 2 + sixteenth, Math.round(sixteenth * 2 * 0.9), 92);
                            bassTrack.addNote(2, third <= 55 ? third : third - 12, currentTick + ppq * 2 + sixteenth * 3, Math.round(sixteenth * 0.85), 88);

                            // Beat 3: Baixaria resolution run into nextRoot on downbeat!
                            // Alternate between Pattern B (・タタタ: 16th rest + 3 16ths) and Pattern A (タタタタ: 4 16ths)
                            const useRestFirst = (i % 2 === 0);
                            if (useRestFirst) {
                                // Pattern B: 16th rest on downbeat, then 3 descending 16ths right into nextRoot
                                const run = MidiChordHelper.getChoroBaixariaRun3(root, nextRoot, parsed);
                                for (let rIdx = 0; rIdx < 3; rIdx++) {
                                    const runTick = currentTick + ppq * 3 + (rIdx + 1) * sixteenth;
                                    bassTrack.addNote(2, run[rIdx], runTick, sixteenth - 5, 88 + rIdx * 3);
                                }
                            } else {
                                // Pattern A: 4 continuous 16th-notes right into nextRoot
                                const run = MidiChordHelper.getChoroBaixariaRun4(root, nextRoot, parsed);
                                for (let rIdx = 0; rIdx < 4; rIdx++) {
                                    const runTick = currentTick + ppq * 3 + rIdx * sixteenth;
                                    bassTrack.addNote(2, run[rIdx], runTick, sixteenth - 5, 88 + rIdx * 3);
                                }
                            }
                        } else {
                            // --- Normal Chords (Tonic, Minor, Subdominant): Solid "Tone, Tone" ---
                            // Beat 0: Root on downbeat (トーン)
                            bassTrack.addNote(2, root, currentTick, Math.round(ppq * 0.85), 92);
                            // Beat 1: Fifth on downbeat (トーン)
                            bassTrack.addNote(2, fifth, currentTick + ppq, Math.round(ppq * 0.85), 88);
                            // Beat 2: Root on downbeat (トーン)
                            bassTrack.addNote(2, root, currentTick + ppq * 2, Math.round(ppq * 0.85), 90);
                            // Beat 3: Fifth or subtle half-step approach on downbeat (トーン)
                            const approach = (nextRoot > root) ? nextRoot - 1 : nextRoot + 1;
                            const beat3Note = (i % 2 === 1) ? approach : fifth;
                            bassTrack.addNote(2, beat3Note, currentTick + ppq * 3, Math.round(ppq * 0.85), 88);
                        }
                    } else {
                        // 2/4 or 3/4 meter fallback
                        if (isDom) {
                            // Beat 0: 16th rest + 8th root + 16th note (・タータ)
                            bassTrack.addNote(2, root, currentTick + sixteenth, Math.round(sixteenth * 2 * 0.9), 92);
                            bassTrack.addNote(2, fifth, currentTick + sixteenth * 3, Math.round(sixteenth * 0.85), 88);
                            // Beat 1: Baixaria run into nextRoot
                            const run = MidiChordHelper.getChoroBaixariaRun3(root, nextRoot, parsed);
                            for (let rIdx = 0; rIdx < 3; rIdx++) {
                                const runTick = currentTick + ppq + (rIdx + 1) * sixteenth;
                                bassTrack.addNote(2, run[rIdx], runTick, sixteenth - 5, 88 + rIdx * 3);
                            }
                        } else {
                            // Normal "Tone, Tone"
                            bassTrack.addNote(2, root, currentTick, Math.round(ppq * 0.85), 92);
                            bassTrack.addNote(2, fifth, currentTick + ppq, Math.round(ppq * 0.85), 88);
                        }
                    }

                    // 3. Pandeiro Percussion:
                    // Tambourine (54) for jingles/slap + Low Floor Tom (41) with restrained velocity for warm Pandeiro thumb sub-bass
                    if (drumTrack) {
                        const TAMBOURINE = 54;
                        const LOW_TOM = 41; // Low Floor Tom (GM 41) for soft Pandeiro thumb bass resonance

                        // Continuous 16th-note Pandeiro jingle/slap
                        for (let s = 0; s < beatsInMeasure * 4; s++) {
                            const sTick = currentTick + s * sixteenth;
                            const isDownbeat = (s % 4 === 0);
                            drumTrack.addNote(9, TAMBOURINE, sTick, 35, isDownbeat ? 78 : (s % 2 === 0 ? 70 : 54));
                        }

                        // Warm Low Tom thump on Beat 1 & 2 (and 3 & 4 in 4/4) with restrained velocity (58~62)
                        drumTrack.addNote(9, LOW_TOM, currentTick, 80, 62);
                        drumTrack.addNote(9, LOW_TOM, currentTick + ppq, 80, 58);
                        if (beatsInMeasure === 4) {
                            drumTrack.addNote(9, LOW_TOM, currentTick + ppq * 2, 80, 62);
                            drumTrack.addNote(9, LOW_TOM, currentTick + ppq * 3, 80, 58);
                        }
                    }
                    }

                    currentTick += measureTicks;
                }
            }
        }
    },

    // ----------------------------------------------------
    // STYLE 5: Bluegrass Reel (Banjo Roll Arpeggios & Mandolin Chop)
    // ----------------------------------------------------
    'bluegrass': {
        id: 'bluegrass',
        name: 'Bluegrass Reel (Banjo Rolls & Mandolin Chop)',
        description: 'バンジョーの16分ロールアルペジオ ＋ マンドリンの裏打ちチョップ ＋ ブーム・チックベース',
        defaultBpm: 210,
        generate(sheet, options, writer) {
            const ppq = writer.ppq;
            const singlePass = MidiExporter.getPlaybackSequence(sheet, options);
            if (singlePass.length === 0) return;

            const choruses = options.choruses || 1;
            const soloMiddle = options.soloMiddleChoruses && choruses > 1;

            const timeSig = MidiExporter.getTimeSignature(sheet);
            const meterBeats = MidiExporter.getMeterBeats(sheet);
            const conductor = writer.addTrack('Tempo Track');
            conductor.setTempo(0, options.bpm || 210);
            conductor.setTimeSignature(0, timeSig.num, timeSig.den);

            let leadTrack = null;
            if (options.leadProgram !== undefined && options.leadProgram >= 0) {
                leadTrack = writer.addTrack(options.leadName || 'Lead Fiddle/Melody');
                leadTrack.setProgram(0, 0, options.leadProgram);
            }

            // 5-String Banjo (GM 105)
            const banjoTrack = writer.addTrack('5-String Banjo');
            banjoTrack.setProgram(0, 1, 105);

            // Mandolin / Acoustic Guitar Chop (Steel Guitar GM 25)
            const mandolinTrack = writer.addTrack('Mandolin Chop');
            mandolinTrack.setProgram(0, 2, 25);

            // Upright Bass (GM 32)
            const bassTrack = writer.addTrack('Upright Bass');
            bassTrack.setProgram(0, 3, 32);

            let currentTick = 0;
            if (options.includeCountIn) {
                currentTick = MidiExporter.addCountIn(banjoTrack, ppq, meterBeats, 105, 76);
            }

            for (let c = 0; c < choruses; c++) {
                const isMelodyChorus = !soloMiddle || (c === 0 || c === choruses - 1);

                for (let i = 0; i < singlePass.length; i++) {
                    const m = singlePass[i];
                    const beatsInMeasure = MidiExporter.getMeasureBeats(m, meterBeats);
                    const measureTicks = Math.round(beatsInMeasure * ppq);

                    // Lead
                    if (isMelodyChorus && leadTrack) {
                        MidiExporter.addMelodyMeasure(leadTrack, singlePass, i, currentTick, ppq, 95, 10);
                    }

                    // Chords
                    const parsed = (m.chords && m.chords.length > 0) ? MidiChordHelper.parseChord(m.chords[0].chord) : MidiChordHelper.parseChord('G');
                    const root = MidiChordHelper.getBassRootMidi(parsed);
                    const fifth = root + 7;

                    // 1. "Boom-Chick" Bass (Beat 1: Root, Beat 3: 5th)
                    bassTrack.addNote(3, root, currentTick, Math.round(ppq * 0.9), 94);
                    bassTrack.addNote(3, fifth <= 55 ? fifth : fifth - 12, currentTick + ppq * 2, Math.round(ppq * 0.9), 90);

                    // 2. Mandolin Chop on 2 and 4 (Sharp, percussive cut)
                    const chopVoicing = MidiChordHelper.getPianoVoicing(parsed, true, 60, 84);
                    const chopDur = Math.round(ppq * 0.2); // sharp chop
                    for (const p of chopVoicing) {
                        mandolinTrack.addNote(2, p, currentTick + ppq * 1, chopDur, 95);
                        mandolinTrack.addNote(2, p, currentTick + ppq * 3, chopDur, 98);
                    }

                    // 3. Banjo Roll Arpeggio (16th notes forward/reverse roll)
                    // High 5th string drone (G4=67) + Root + 3rd + 5th
                    const rMidi = 60 + parsed.rootSemi;
                    const thirdMidi = rMidi + (parsed.intervals[0] || 4);
                    const fifthMidi = rMidi + (parsed.intervals[1] || 7);
                    const droneMidi = 67; // Banjo thumb high drone G
                    const rollPitches = [rMidi, thirdMidi, droneMidi, fifthMidi, thirdMidi, droneMidi, rMidi, fifthMidi];

                    const sixteenth = Math.round(ppq / 4);
                    for (let s = 0; s < beatsInMeasure * 4; s++) {
                        const rollPitch = rollPitches[s % rollPitches.length];
                        const sTick = currentTick + s * sixteenth;
                        banjoTrack.addNote(1, rollPitch, sTick, sixteenth - 10, s % 4 === 0 ? 92 : 80);
                    }

                    currentTick += measureTicks;
                }
            }
        }
    },

    // ----------------------------------------------------
    // STYLE 6: Jazz Ballad (Piano, Bass & Subtle Hi-Hat)
    // ----------------------------------------------------
    'ballad': {
        id: 'ballad',
        name: 'Jazz Ballad (Piano, Bass & Subtle Hi-Hat)',
        description: '微かな2・4拍ハイハット ＋ リッチなピアノロングトーン ＋ 2ビートウッドベース',
        defaultBpm: 65,
        generate(sheet, options, writer) {
            const ppq = writer.ppq;
            const singlePass = MidiExporter.getPlaybackSequence(sheet, options);
            if (singlePass.length === 0) return;

            const choruses = options.choruses || 1;
            const soloMiddle = options.soloMiddleChoruses && choruses > 1;

            const timeSig = MidiExporter.getTimeSignature(sheet);
            const conductor = writer.addTrack('Tempo Track');
            conductor.setTempo(0, options.bpm || 65);
            conductor.setTimeSignature(0, timeSig.num, timeSig.den);

            let leadTrack = null;
            if (options.leadProgram !== undefined && options.leadProgram >= 0) {
                leadTrack = writer.addTrack(options.leadName || 'Lead Melody');
                leadTrack.setProgram(0, 0, options.leadProgram);
            }

            // Acoustic Grand Piano (GM 0) with rich Reverb (CC 91 = 95)
            const pianoTrack = writer.addTrack('Ballad Acoustic Piano');
            pianoTrack.setProgram(0, 1, 0);
            pianoTrack.setControlChange(0, 1, 91, 95); // Deep Reverb for acoustic warmth & spatial aura
            pianoTrack.setControlChange(0, 1, 10, 58); // Subtle natural stereo panning

            // Warm Acoustic Bass (GM 32)
            const bassTrack = writer.addTrack('Acoustic Bass');
            bassTrack.setProgram(0, 2, 32);
            bassTrack.setControlChange(0, 2, 91, 40); // Natural bass room reverb

            let drumTrack = null;
            if (options.includeDrums) {
                drumTrack = writer.addTrack('Ballad Hi-Hat');
                drumTrack.setControlChange(0, 9, 91, 50);
            }

            if (leadTrack) {
                leadTrack.setControlChange(0, 0, 91, 70); // Gentle reverb for lead
            }

            const meterBeats = MidiExporter.getMeterBeats(sheet);
            const hasPickup = MidiExporter.isPickupMeasure(singlePass[0], meterBeats);
            const pickupDuration = hasPickup ? (singlePass[0].totalDuration || 1.0) : 0;
            const pickupTicks = Math.round(pickupDuration * ppq);

            let currentTick = 0;
            if (options.includeCountIn) {
                const countInTicks = MidiExporter.addCountIn(drumTrack, ppq, meterBeats);
                if (hasPickup) {
                    currentTick = countInTicks - pickupTicks;
                } else {
                    currentTick = countInTicks;
                }
            }

            for (let c = 0; c < choruses; c++) {
                const isMelodyChorus = !soloMiddle || (c === 0 || c === choruses - 1);

                for (let i = 0; i < singlePass.length; i++) {
                    const m = singlePass[i];
                    if (c > 0 && i === 0 && hasPickup) {
                        continue;
                    }

                    const isThisPickup = (c === 0 && i === 0 && hasPickup);
                    const beatsInMeasure = MidiExporter.getMeasureBeats(m, meterBeats, isThisPickup, pickupDuration);
                    const measureTicks = Math.round(beatsInMeasure * ppq);

                    // 1. Lead Melody: Lyrical and sustained
                    if (isMelodyChorus && leadTrack) {
                        MidiExporter.addMelodyMeasure(leadTrack, singlePass, i, currentTick, ppq, 92, 8);
                    }

                    // 2. Accompaniment (Tacet during pickup)
                    if (!isThisPickup) {
                        const parsed = (m.chords && m.chords.length > 0) ? MidiChordHelper.parseChord(m.chords[0].chord) : MidiChordHelper.parseChord('C');
                        const root = MidiChordHelper.getBassRootMidi(parsed);
                        const fifth = root + 7;
                        const isDom = parsed.isDominant === true;

                        // Acoustic Bass: Warm, sustained 2-beat feel
                        if (beatsInMeasure === 4) {
                            // Beat 0: Root (sustained for ~1.85 beats)
                            bassTrack.addNote(2, root, currentTick, Math.round(ppq * 1.85), 84);
                            // Beat 2: Fifth
                            bassTrack.addNote(2, fifth <= 55 ? fifth : fifth - 12, currentTick + ppq * 2, Math.round(ppq * 1.7), 80);
                            // Beat 3.5: Gentle walking approach
                            const nextM = i + 1 < singlePass.length ? singlePass[i + 1] : singlePass[0];
                            const nextParsed = (nextM && nextM.chords && nextM.chords.length > 0) ? MidiChordHelper.parseChord(nextM.chords[0].chord) : parsed;
                            const nextRoot = MidiChordHelper.getBassRootMidi(nextParsed);
                            const app = (nextRoot > root) ? nextRoot - 1 : nextRoot + 1;
                            bassTrack.addNote(2, app, currentTick + Math.round(ppq * 3.5), Math.round(ppq * 0.45), 72);
                        } else {
                            // 3/4 meter
                            bassTrack.addNote(2, root, currentTick, Math.round(ppq * 1.85), 84);
                            bassTrack.addNote(2, fifth <= 55 ? fifth : fifth - 12, currentTick + ppq * 2, Math.round(ppq * 0.9), 78);
                        }

                        // Piano:
                        // Natural keyboard touch with subtle micro-timing (0~4 ticks finger jitter)
                        // Mellow velocity (58~64) to eliminate harsh attacks
                        const voicing = MidiChordHelper.getPianoVoicing(parsed, false, 53, 82);

                        if (!isDom) {
                            // Sustained full measure chord struck softly together
                            const fullDur = Math.round(beatsInMeasure * ppq * 0.95);
                            for (let sIdx = 0; sIdx < voicing.length; sIdx++) {
                                const jitter = Math.floor(Math.random() * 5); // 0 ~ 4 ticks micro-jitter
                                const noteTick = currentTick + jitter;
                                const noteVel = 58 + Math.min(6, sIdx * 2) + Math.floor(Math.random() * 3); // 58 -> 64
                                pianoTrack.addNote(1, voicing[sIdx], noteTick, fullDur, noteVel);
                            }
                        } else {
                            // Dominant 7th: Downbeat (~1.8 beats) + gentle comping response on Beat 2.5
                            const downbeatDur = Math.round(ppq * 1.8);
                            for (let sIdx = 0; sIdx < voicing.length; sIdx++) {
                                const jitter = Math.floor(Math.random() * 5);
                                const noteTick = currentTick + jitter;
                                const noteVel = 58 + Math.min(6, sIdx * 2) + Math.floor(Math.random() * 3);
                                pianoTrack.addNote(1, voicing[sIdx], noteTick, downbeatDur, noteVel);
                            }

                            if (beatsInMeasure >= 4) {
                                const compTick = currentTick + Math.round(ppq * 2.5);
                                const compDur = Math.round(ppq * 1.35);
                                for (let sIdx = 0; sIdx < voicing.length; sIdx++) {
                                    const jitter = Math.floor(Math.random() * 4);
                                    const noteTick = compTick + jitter;
                                    const noteVel = 54 + Math.min(6, sIdx * 2) + Math.floor(Math.random() * 3);
                                    pianoTrack.addNote(1, voicing[sIdx], noteTick, compDur, noteVel);
                                }
                            }
                        }

                        // Drums: Subtle Closed Hi-Hat ONLY on beats 2 & 4 (extremely restrained)
                        if (drumTrack) {
                            const CLOSED_HH = 42; // Subtle closed hi-hat click
                            if (beatsInMeasure >= 4) {
                                drumTrack.addNote(9, CLOSED_HH, currentTick + ppq * 1, 40, 50); // Beat 2
                                drumTrack.addNote(9, CLOSED_HH, currentTick + ppq * 3, 40, 52); // Beat 4
                            } else {
                                // 3/4 meter: Beat 2 & 3
                                drumTrack.addNote(9, CLOSED_HH, currentTick + ppq * 1, 40, 48);
                                drumTrack.addNote(9, CLOSED_HH, currentTick + ppq * 2, 40, 50);
                            }
                        }
                    }

                    currentTick += measureTicks;
                }
            }
        }
    },

    // ----------------------------------------------------
    // STYLE 7: Lead Melody Only
    // ----------------------------------------------------
    'lead-only': {
        id: 'lead-only',
        name: 'Lead Melody Only (No Accompaniment)',
        description: 'メロディトラックのみ（伴奏なし）',
        defaultBpm: 120,
        generate(sheet, options, writer) {
            const ppq = writer.ppq;
            const singlePass = MidiExporter.getPlaybackSequence(sheet, options);
            if (singlePass.length === 0) return;

            const choruses = options.choruses || 1;

            const timeSig = MidiExporter.getTimeSignature(sheet);
            const meterBeats = MidiExporter.getMeterBeats(sheet);
            const conductor = writer.addTrack('Tempo Track');
            conductor.setTempo(0, options.bpm || 120);
            conductor.setTimeSignature(0, timeSig.num, timeSig.den);

            const leadTrack = writer.addTrack(options.leadName || 'Lead Melody');
            leadTrack.setProgram(0, 0, Math.max(0, options.leadProgram));

            const hasPickup = MidiExporter.isPickupMeasure(singlePass[0], meterBeats);
            const pickupDuration = hasPickup ? (singlePass[0].totalDuration || 1.0) : 0;
            const pickupTicks = Math.round(pickupDuration * ppq);

            let currentTick = 0;
            if (options.includeCountIn) {
                // Add count-in beat clicks on woodblock
                const countInTicks = MidiExporter.addCountIn(leadTrack, ppq, meterBeats, 0, 76);
                if (hasPickup) {
                    currentTick = countInTicks - pickupTicks;
                } else {
                    currentTick = countInTicks;
                }
            }

            for (let c = 0; c < choruses; c++) {
                for (let i = 0; i < singlePass.length; i++) {
                    const m = singlePass[i];
                    if (c > 0 && i === 0 && hasPickup) {
                        continue;
                    }
                    const isThisPickup = (c === 0 && i === 0 && hasPickup);
                    const beatsInMeasure = MidiExporter.getMeasureBeats(m, meterBeats, isThisPickup, pickupDuration);
                    const measureTicks = Math.round(beatsInMeasure * ppq);

                    MidiExporter.addMelodyMeasure(leadTrack, singlePass, i, currentTick, ppq, 95, 15);
                    currentTick += measureTicks;
                }
            }
        }
    }
};

// ==========================================
// 4. MIDI Exporter Engine & Dialog Controller
// ==========================================
class MidiExporter {
    static INSTRUMENTS = [
        { program: 66, name: 'Tenor Saxophone (GM 66)' },
        { program: 65, name: 'Alto Saxophone (GM 65)' },
        { program: 64, name: 'Soprano Saxophone (GM 64)' },
        { program: 56, name: 'Trumpet (GM 56)' },
        { program: 57, name: 'Trombone (GM 57)' },
        { program: 26, name: 'Jazz Guitar (GM 26)' },
        { program: 0,  name: 'Acoustic Grand Piano (GM 0)' },
        { program: 11, name: 'Vibraphone (GM 11)' },
        { program: 73, name: 'Flute (GM 73)' },
        { program: -1, name: '🔇 Mute Lead (Minus-One / Rhythm Section Only)' }
    ];

    /**
     * Adds melody notes for a single measure to leadTrack, correctly sustaining tied notes across notes & measures.
     */
    static addMelodyMeasure(leadTrack, sequence, measureIdx, currentTick, ppq, velocity = 92, gateReductionTicks = 12) {
        if (!leadTrack || !sequence || measureIdx < 0 || measureIdx >= sequence.length) return;
        const m = sequence[measureIdx];
        if (!m || !m.notes || m.notes.length === 0) return;

        let noteTickPos = currentTick;
        for (let j = 0; j < m.notes.length; j++) {
            const n = m.notes[j];
            const baseDurTicks = Math.round(n.duration * ppq);

            if (!n.isRest && !n.isTieEnd) {
                const midiPitch = MidiExporter.getMidiPitchFromNote(n);
                let totalDurTicks = baseDurTicks;

                if (n.isTieStart) {
                    let inTie = true;
                    let scanM = measureIdx;
                    let scanN = j + 1;

                    while (inTie && scanM < sequence.length) {
                        const sm = sequence[scanM];
                        if (sm && sm.notes) {
                            while (scanN < sm.notes.length) {
                                const nextN = sm.notes[scanN];
                                if (nextN.isRest) {
                                    inTie = false;
                                    break;
                                }
                                const nextPitch = MidiExporter.getMidiPitchFromNote(nextN);
                                if (nextN.isTieEnd && nextPitch === midiPitch) {
                                    totalDurTicks += Math.round(nextN.duration * ppq);
                                    if (!nextN.isTieStart) {
                                        inTie = false;
                                        break;
                                    }
                                } else {
                                    inTie = false;
                                    break;
                                }
                                scanN++;
                            }
                        }
                        scanM++;
                        scanN = 0;
                    }
                }

                leadTrack.addNote(0, midiPitch, noteTickPos, Math.max(1, totalDurTicks - gateReductionTicks), velocity);
            }

            noteTickPos += baseDurTicks;
        }
    }

    static getTimeSignature(sheet) {
        if (!sheet) return { num: 4, den: 4 };
        const meterStr = sheet.meter || sheet.timeSignature;
        if (meterStr) {
            const clean = String(meterStr).trim();
            if (clean === 'C') return { num: 4, den: 4 };
            if (clean === 'C|') return { num: 2, den: 2 };
            const parts = clean.split('/');
            if (parts.length === 2) {
                const num = parseInt(parts[0], 10);
                const den = parseInt(parts[1], 10);
                if (!isNaN(num) && !isNaN(den) && num > 0 && den > 0) {
                    return { num, den };
                }
            }
        }
        return { num: 4, den: 4 };
    }

    static getMeterBeats(sheet) {
        if (!sheet) return 4;
        const meterStr = sheet.meter || sheet.timeSignature;
        if (meterStr) {
            const clean = String(meterStr).trim();
            if (clean === 'C') return 4;
            if (clean === 'C|') return 2;
            const parts = clean.split('/');
            if (parts.length === 2) {
                const num = parseFloat(parts[0]);
                const den = parseFloat(parts[1]);
                if (!isNaN(num) && !isNaN(den) && den > 0) {
                    // Meter in terms of quarter notes (1 beat = 1 quarter note).
                    // 4/4 -> 4. 3/4 -> 3. 9/8 -> 4.5. 7/8 -> 3.5. 5/8 -> 2.5. 6/8 -> 3.0.
                    return (num / den) * 4;
                }
            }
        }
        return 4;
    }

    static getMeasureBeats(m, meterBeats = 4, isThisPickup = false, pickupDuration = 0) {
        if (isThisPickup && pickupDuration > 0) {
            return pickupDuration;
        }
        if (m && typeof m.totalDuration === 'number' && m.totalDuration > 0) {
            const dur = m.totalDuration;
            // Within epsilon of meterBeats
            if (Math.abs(dur - meterBeats) < 0.05) {
                return meterBeats;
            }
            // Within epsilon of an integer beat (e.g. 3.999 or 4.001 -> 4.0)
            const rounded = Math.round(dur);
            if (Math.abs(dur - rounded) < 0.05) {
                return rounded;
            }
            // Within epsilon of a half beat (e.g. 4.499 or 4.501 -> 4.5)
            const halfRounded = Math.round(dur * 2) / 2;
            if (Math.abs(dur - halfRounded) < 0.05) {
                return halfRounded;
            }
            return dur;
        }
        return meterBeats;
    }

    static extractBpm(tempoStr, unitNoteLength = "1/4") {
        if (!tempoStr) return 0;
        const str = String(tempoStr).trim();

        // 1. Explicit fraction tempo, e.g. "1/8=140", "1/4=120", "3/8=80", "1/2=60"
        const fracMatch = str.match(/(\d+)\/(\d+)\s*=\s*(\d+)/);
        if (fracMatch) {
            const num = parseInt(fracMatch[1], 10);
            const den = parseInt(fracMatch[2], 10);
            const rawBpm = parseInt(fracMatch[3], 10);
            if (den > 0 && rawBpm > 0) {
                // Ratio to quarter note (1/4):
                // (num / den) / (1 / 4) = (num / den) * 4
                // 1/8=140 -> 140 * 0.5 = 70 (quarter BPM)
                // 1/4=120 -> 120 * 1.0 = 120
                // 3/8=80  -> 80 * 1.5 = 120
                const quarterRatio = (num / den) * 4;
                return Math.round(rawBpm * quarterRatio);
            }
        }

        // 2. Relative to L: unit or default, e.g. "= 120"
        const eqMatch = str.match(/=\s*(\d+)/);
        if (eqMatch) {
            const rawBpm = parseInt(eqMatch[1], 10);
            if (unitNoteLength) {
                const uMatch = String(unitNoteLength).match(/(\d+)\/(\d+)/);
                if (uMatch) {
                    const uNum = parseInt(uMatch[1], 10);
                    const uDen = parseInt(uMatch[2], 10);
                    if (uDen > 0) {
                        return Math.round(rawBpm * ((uNum / uDen) * 4));
                    }
                }
            }
            return rawBpm;
        }

        // 3. Simple number e.g. "Q: 140"
        const numMatch = str.match(/\b(\d{2,3})\b/);
        if (numMatch) {
            const rawBpm = parseInt(numMatch[1], 10);
            if (unitNoteLength) {
                const uMatch = String(unitNoteLength).match(/(\d+)\/(\d+)/);
                if (uMatch) {
                    const uNum = parseInt(uMatch[1], 10);
                    const uDen = parseInt(uMatch[2], 10);
                    if (uDen > 0) {
                        return Math.round(rawBpm * ((uNum / uDen) * 4));
                    }
                }
            }
            return rawBpm;
        }
        return 0;
    }

    static isPickupMeasure(measure, meterBeats = 4) {
        if (!measure) return false;
        const dur = measure.totalDuration;
        return typeof dur === 'number' && dur > 0 && dur < (meterBeats - 0.1);
    }

    static addCountIn(track, ppq, beats = 4, channel = 9, notePitch = 37) {
        if (!track) return Math.round(beats * ppq);
        // Count-In: 1, 2, 3, 4 clicks on sticks/hihat
        for (let b = 0; b < Math.round(beats); b++) {
            const tick = b * ppq;
            track.addNote(channel, notePitch, tick, 60, b === 0 ? 100 : 85);
        }
        return Math.round(beats * ppq);
    }

    static getMidiPitchFromNote(n) {
        if (!n) return 60;
        const octave = n.octave || 4;
        let p = (n.pitch || 'C').toLowerCase();
        if (n.accidental === '#' || n.accidental === '+') p += '+';
        else if (n.accidental === '-' || n.accidental === '_') p += '-';
        const prefix = (octave === 5) ? 'h' : (octave === 6) ? 'hh' : (octave === 3) ? 'l' : (octave === 2) ? 'll' : '';
        const token = prefix + p;

        if (typeof MusicUtils !== 'undefined' && MusicUtils.PITCH_TO_SEMITONE) {
            const semi = MusicUtils.PITCH_TO_SEMITONE[token];
            if (semi !== undefined) return 60 + semi;
        }

        const semiMap = { 'c': 0, 'c+': 1, 'd-': 1, 'd': 2, 'd+': 3, 'e-': 3, 'e': 4, 'f': 5, 'f+': 6, 'g-': 6, 'g': 7, 'g+': 8, 'a-': 8, 'a': 9, 'a+': 10, 'b-': 10, 'b': 11 };
        const rawPitch = n.pitch.toLowerCase();
        let baseSemi = semiMap[rawPitch] ?? 0;
        if (n.accidental === '#' || n.accidental === '+') baseSemi += 1;
        else if (n.accidental === '-' || n.accidental === '_') baseSemi -= 1;
        return (octave + 1) * 12 + baseSemi;
    }

    static unrollRepeats(measures) {
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

    static resolveChords(measures, defaultRoot = 'C') {
        if (!measures || measures.length === 0) return [];
        let initialChord = null;
        for (const m of measures) {
            if (m.chords && m.chords.length > 0) {
                const c = m.chords[0].chord.trim();
                if (c.toUpperCase() !== 'N.C.' && c.toUpperCase() !== 'NC') {
                    initialChord = c;
                    break;
                }
            }
        }
        if (!initialChord) initialChord = defaultRoot;

        let currentChord = null;
        return measures.map(m => {
            const cloned = Object.assign({}, m);
            if (m.chords && m.chords.length > 0) {
                const hasBeatZero = m.chords.some(c => c.position <= 0.001);
                if (!hasBeatZero && currentChord && currentChord.toUpperCase() !== 'N.C.' && currentChord.toUpperCase() !== 'NC') {
                    cloned.chords = [{ chord: currentChord, position: 0, isInherited: true }, ...m.chords];
                } else {
                    cloned.chords = [...m.chords];
                }
                const last = cloned.chords[cloned.chords.length - 1].chord.trim();
                currentChord = last;
            } else {
                const chordToInherit = currentChord || initialChord;
                if (chordToInherit && chordToInherit.toUpperCase() !== 'N.C.' && chordToInherit.toUpperCase() !== 'NC') {
                    cloned.chords = [{ chord: chordToInherit, position: 0, isInherited: true }];
                    currentChord = chordToInherit;
                } else {
                    cloned.chords = [];
                }
            }
            return cloned;
        });
    }

    static getPlaybackSequence(sheet, options = {}) {
        if (!sheet || !sheet.measures) return [];
        const unroll = (options.unrollRepeats !== undefined) ? options.unrollRepeats : true;
        const rawSeq = unroll ? this.unrollRepeats(sheet.measures) : sheet.measures;
        return this.resolveChords(rawSeq, sheet.key || 'C');
    }

    static exportMidi(sheet, options = {}) {
        if (!sheet || !sheet.measures || sheet.measures.length === 0) {
            throw new Error('楽譜データが存在しません。');
        }

        const writer = new MidiWriter(480);
        const styleId = options.style || 'swing';
        const style = MidiStyles[styleId] || MidiStyles['swing'];

        style.generate(sheet, options, writer);

        const title = (sheet.title || 'leadsheet').replace(/[^a-zA-Z0-9_\-\u3000-\u30fe\u4e00-\u9fa5]/g, '_');
        const filename = `${title}_${style.id}.mid`;
        writer.download(filename);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MidiWriter, MidiTrack, MidiChordHelper, MidiStyles, MidiExporter };
}
