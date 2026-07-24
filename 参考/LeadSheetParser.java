package jp.example.readsheetreader;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class LeadSheetParser {

    public static SheetMusic parse(String input) {
        // セクション記号 [A]、反復開始記号 |:、volta (1) の直後の改行を削除して
        // 次の行と結合することで、マーカーだけの行が空小節になるのを防ぎます。
        input = input.replaceAll("(?i)(\\[[^\\]]*\\]|\\|:|\\(\\d+\\))\\s*\\n", "$1 ");

        SheetMusic sheet = new SheetMusic();
        java.util.Map<String, String> keyAccidentals = new java.util.HashMap<>();
        String[] lines = input.split("\\n");
        boolean nextMeasureIsNewLine = false;

        for (int i = 0; i < lines.length; i++) {
            String line = lines[i].trim();
            if (line.isEmpty())
                continue;

            String lowerLine = line.toLowerCase();

            // 1. Metadata
            if (lowerLine.startsWith("title:")) {
                sheet.title = line.substring(6).trim();
                continue;
            }
            if (lowerLine.startsWith("key:")) {
                sheet.key = line.substring(4).trim();
                keyAccidentals = getKeyAccidentals(sheet.key);
                continue;
            }
            if (lowerLine.startsWith("composer:")) {
                sheet.composer = line.substring(9).trim();
                continue;
            }
            if (lowerLine.startsWith("tempo:")) {
                sheet.tempo = line.substring(6).trim();
                continue;
            }
            if (lowerLine.startsWith("meter:")) {
                sheet.meter = line.substring(6).trim();
                continue;
            }
            if (lowerLine.startsWith("rhythm:")) {
                sheet.rhythm = line.substring(7).trim();
                continue;
            }

            Measure measure = new Measure();
            String originalLine = lines[i].trim(); // Keep original for source position

            // Store measure line number
            measure.sourcePosition = new SourcePosition(i, 0, originalLine.length(), originalLine);

            // New line handling
            if (nextMeasureIsNewLine) {
                measure.isNewLine = true;
                nextMeasureIsNewLine = false;
            }
            if (lowerLine.contains("nl")) {
                nextMeasureIsNewLine = true;
                line = line.replace("nl", "").replace("NL", "").trim();
            }

            // 2. Extract markers from the START of the line one by one
            boolean searching = true;
            while (searching) {
                searching = false;

                // Section Label: [A]
                if (line.startsWith("[")) {
                    int end = line.indexOf("]");
                    if (end != -1) {
                        measure.sectionLabel = line.substring(1, end);
                        line = line.substring(end + 1).trim();
                        searching = true;
                    }
                }

                // Repeat Start: |:
                if (line.startsWith("|:")) {
                    measure.repeatStart = true;
                    line = line.substring(2).trim();
                    searching = true;
                }

                // Ending Bracket: (1)
                if (line.startsWith("(")) {
                    int end = line.indexOf(")");
                    if (end != -1) {
                        try {
                            measure.voltaNumber = Integer.parseInt(line.substring(1, end));
                            line = line.substring(end + 1).trim();
                            searching = true;
                        } catch (NumberFormatException e) {
                        }
                    }
                }
            }

            // 3. Markers at the END of the line
            if (line.endsWith(":|")) {
                measure.repeatEnd = true;
                line = line.substring(0, line.length() - 2).trim();
            } else if (line.endsWith("|")) {
                measure.isDoubleBar = true;
                line = line.substring(0, line.length() - 1).trim();
            } else if (line.endsWith(";")) {
                line = line.substring(0, line.length() - 1).trim();
            }

            parseMeasureContent(line, measure, i, originalLine, keyAccidentals);
            sheet.measures.add(measure);
        }

        return sheet;
    }

    private static void parseMeasureContent(String content, Measure measure, int lineNumber, String originalLine, java.util.Map<String, String> keyAccidentals) {
        String[] segments = content.split(",(?![^\"]*\"[^\"]*\")");
        double currentPos = 0;

        for (String segment : segments) {
            segment = segment.trim();
            if (segment.isEmpty())
                continue;

            Pattern pattern = Pattern.compile("\\\"([^\\\"]+)\\\"|([_\\^=]?[a-gA-G][,']*|[lh]{0,2}?[a-gr][+-]?|r)\\s*([0-9./]*)");
            Matcher matcher = pattern.matcher(segment);

            while (matcher.find()) {
                if (matcher.group(1) != null) {
                    // Chord found
                    String chordName = matcher.group(1);
                    ChordChange chord = new ChordChange(chordName, currentPos);

                    // Calculate source position in original line
                    int chordStart = originalLine.indexOf("\"" + chordName + "\"");
                    if (chordStart >= 0) {
                        chord.sourcePosition = new SourcePosition(
                                lineNumber,
                                chordStart,
                                chordStart + chordName.length() + 2, // +2 for quotes
                                "\"" + chordName + "\"");
                    }
                    measure.chords.add(chord);
                } else if (matcher.group(2) != null) {
                    // Note found
                    String pitchStr = matcher.group(2);
                    String durationStr = matcher.group(3);
                    DurationResult dr = parseDuration(durationStr);
                    Note note = createNote(pitchStr, dr.value, dr.tuplet, keyAccidentals);

                    // Calculate source position
                    String noteText = pitchStr + durationStr;
                    int noteStart = originalLine.indexOf(noteText);
                    if (noteStart >= 0) {
                        note.sourcePosition = new SourcePosition(
                                lineNumber,
                                noteStart,
                                noteStart + noteText.length(),
                                noteText);
                    }

                    measure.notes.add(note);
                    currentPos += dr.value;
                }
            }
        }
        measure.totalDuration = Math.max(currentPos, 1.0);
    }

    private static class DurationResult {
        double value;
        int tuplet;

        DurationResult(double v, int t) {
            value = v;
            tuplet = t;
        }
    }

    private static DurationResult parseDuration(String s) {
        if (s == null || s.trim().isEmpty())
            return new DurationResult(1.0, 0);
        try {
            s = s.trim();
            if (s.contains("/")) {
                String[] parts = s.split("/");
                double val = Double.parseDouble(parts[0]);
                int tuplet = 0;
                for (int i = 1; i < parts.length; i++) {
                    double div = Double.parseDouble(parts[i]);
                    if (div != 0) {
                        val /= div;
                        long idiv = (long) div;
                        if (idiv > 1 && (idiv & (idiv - 1)) != 0)
                            tuplet = (int) idiv;
                    }
                }
                return new DurationResult(val, tuplet);
            }
            return new DurationResult(Double.parseDouble(s), 0);
        } catch (NumberFormatException e) {
            return new DurationResult(1.0, 0);
        }
    }

    private static Note createNote(String pitchStr, double duration, int tuplet, java.util.Map<String, String> keyAccidentals) {
        if (pitchStr.equals("r")) {
            Note n = new Note("r", 0, duration, true);
            n.tupletNumber = tuplet;
            return n;
        }

        // ABC notation check: contains ^, _, =, , or ' or starts with uppercase/lowercase
        boolean isABC = pitchStr.matches("[_\\^=]?[a-gA-G][,']*");

        if (isABC) {
            String accidental = "";
            int idx = 0;
            char first = pitchStr.charAt(0);
            if (first == '^') { accidental = "#"; idx++; }
            else if (first == '_') { accidental = "-"; idx++; }
            else if (first == '=') { accidental = ""; idx++; }

            char baseChar = pitchStr.charAt(idx);
            int octave = Character.isUpperCase(baseChar) ? 4 : 5;
            String pitch = String.valueOf(Character.toLowerCase(baseChar));
            idx++;

            // Octave markers
            while (idx < pitchStr.length()) {
                char c = pitchStr.charAt(idx);
                if (c == ',') octave--;
                else if (c == '\'') octave++;
                idx++;
            }

            // Key signature adjustment
            if (first != '^' && first != '_' && first != '=') {
                if (keyAccidentals.containsKey(pitch)) {
                    accidental = keyAccidentals.get(pitch);
                }
            }

            return new Note(pitch, octave, duration, false, accidental, tuplet);
        } else {
            // Original Notation (lc, c, hc)
            String pitch;
            String accidental = "";
            int octave = 4;
            int idx = 0;
            if (pitchStr.startsWith("ll")) {
                octave = 2;
                idx = 2;
            } else if (pitchStr.startsWith("hh")) {
                octave = 6;
                idx = 2;
            } else if (pitchStr.startsWith("l")) {
                octave = 3;
                idx = 1;
            } else if (pitchStr.startsWith("h")) {
                octave = 5;
                idx = 1;
            }
            pitch = pitchStr.substring(idx, idx + 1);
            if (pitchStr.length() > idx + 1) {
                String acc = pitchStr.substring(idx + 1);
                if (acc.equals("+"))
                    accidental = "#";
                else if (acc.equals("-"))
                    accidental = "-";
            }
            return new Note(pitch, octave, duration, false, accidental, tuplet);
        }
    }

    private static java.util.Map<String, String> getKeyAccidentals(String keyName) {
        java.util.Map<String, String> map = new java.util.HashMap<>();
        if (keyName == null || keyName.isEmpty())
            return map;

        String key = keyName.trim().replace("Maj", "").replace("maj", "");
        boolean isMinor = key.contains("m") || key.contains("min") || key.endsWith("m");
        String root = key.replace("m", "").replace("in", "");

        String majorRoot = root;
        if (isMinor) {
            java.util.Map<String, String> minorToMajor = new java.util.HashMap<>();
            minorToMajor.put("A", "C"); minorToMajor.put("E", "G"); minorToMajor.put("B", "D");
            minorToMajor.put("F#", "A"); minorToMajor.put("C#", "E"); minorToMajor.put("G#", "B");
            minorToMajor.put("D#", "F#"); minorToMajor.put("A#", "C#");
            minorToMajor.put("D", "F"); minorToMajor.put("G", "Bb"); minorToMajor.put("C", "Eb");
            minorToMajor.put("F", "Ab"); minorToMajor.put("Bb", "Db"); minorToMajor.put("Eb", "Gb");
            minorToMajor.put("Ab", "Cb");
            majorRoot = minorToMajor.getOrDefault(root, root);
        }

        java.util.Map<String, Integer> majorToSharps = new java.util.HashMap<>();
        majorToSharps.put("C", 0); majorToSharps.put("G", 1); majorToSharps.put("D", 2);
        majorToSharps.put("A", 3); majorToSharps.put("E", 4); majorToSharps.put("B", 5);
        majorToSharps.put("F#", 6); majorToSharps.put("C#", 7);

        java.util.Map<String, Integer> majorToFlats = new java.util.HashMap<>();
        majorToFlats.put("F", 1); majorToFlats.put("Bb", 2); majorToFlats.put("Eb", 3);
        majorToFlats.put("Ab", 4); majorToFlats.put("Db", 5); majorToFlats.put("Gb", 6);
        majorToFlats.put("Cb", 7);

        if (majorToSharps.containsKey(majorRoot)) {
            int count = majorToSharps.get(majorRoot);
            String[] order = { "f", "c", "g", "d", "a", "e", "b" };
            for (int i = 0; i < count; i++)
                map.put(order[i], "#");
        } else if (majorToFlats.containsKey(majorRoot)) {
            int count = majorToFlats.get(majorRoot);
            String[] order = { "b", "e", "a", "d", "g", "c", "f" };
            for (int i = 0; i < count; i++)
                map.put(order[i], "-");
        }

        return map;
    }
}
