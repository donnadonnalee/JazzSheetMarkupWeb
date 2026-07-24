package jp.example.readsheetreader;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * ABC記譜法を本アプリのマークアップ形式に変換するクラス。
 * ボイス管理と豊富なメタデータ収集に対応したハイブリッド仕様。
 */
public class ABCConverter {

    /**
     * 与えられたテキストがABC記譜法である可能性が高いかどうかを判定します。
     * 標準的なヘッダーフィールド（X:, T:, K:, M:, L: など）の存在を確認します。
     */
    public static boolean isABCNotation(String text) {
        if (text == null || text.trim().isEmpty()) return false;

        String[] lines = text.split("\n");
        for (String line : lines) {
            line = line.trim();
            if (line.isEmpty() || line.startsWith("%")) continue;

            // アプリ独自のメタデータ行（行頭が title:, key: 等）があればABCではないと判断
            String lowerLine = line.toLowerCase();
            if (lowerLine.startsWith("title:") || lowerLine.startsWith("key:") ||
                lowerLine.startsWith("composer:") || lowerLine.startsWith("meter:")) {
                return false;
            }

            // ABCヘッダー行があればABC形式と判断
            if (line.matches("^[XTKMLVQR]:.*")) {
                return true;
            }
        }
        return false;
    }



    public static String convert(String abc) {
        if (abc == null || abc.isEmpty()) return "";

        String title = "Converted Song";
        String key = "C";
        String composer = "";
        String meter = "";
        String tempo = "";
        String rhythm = "";
        double unit = 0.5; // L:1/8 default

        String currentVoice = null;
        String targetVoice = null;

        String[] lines = abc.split("\n");
        StringBuilder body = new StringBuilder();

        for (String line : lines) {
            line = line.trim();
            if (line.isEmpty() || line.startsWith("%")) continue;

            // Handle [V:1] style or V:1 style
            String voiceLine = null;
            if (line.startsWith("V:")) {
                voiceLine = line.substring(2).trim();
            } else if (line.startsWith("[V:") && line.contains("]")) {
                int end = line.indexOf("]");
                voiceLine = line.substring(3, end).trim();
                // If it's [V:1] music..., the rest should be music
                String rest = line.substring(end + 1).trim();
                line = rest; // Process rest of line as music content later if voice matches
            }

            if (voiceLine != null) {
                String voiceName = voiceLine.split("\\s+|[\\],]")[0];
                if (targetVoice == null) targetVoice = voiceName;
                currentVoice = voiceName;
                if (line.startsWith("V:")) continue; // Line was just voice def
            }

            // Header fields
            if (line.matches("^[A-Z]:.*")) {
                char header = line.charAt(0);
                String val = line.substring(2).trim();
                switch (header) {
                    case 'T': title = val; break;
                    case 'K': key = val; break;
                    case 'C': composer = val; break;
                    case 'M': meter = val; break;
                    case 'Q': tempo = val; break;
                    case 'R': rhythm = val; break;
                    case 'L':
                        if (val.contains("/")) {
                            String[] parts = val.split("/");
                            try {
                                unit = Double.parseDouble(parts[0]) / Double.parseDouble(parts[1]) * 4.0;
                            } catch (Exception e) { unit = 0.5; }
                        }
                        break;
                }
                continue;
            }

            // Music content
            if (currentVoice == null || currentVoice.equals(targetVoice)) {
                body.append(line).append(" ");
            }
        }

        StringBuilder sb = new StringBuilder();
        sb.append("title: ").append(title).append("\n");
        sb.append("key: ").append(key).append("\n");
        if (!composer.isEmpty()) sb.append("composer: ").append(composer).append("\n");
        if (!meter.isEmpty()) sb.append("meter: ").append(meter).append("\n");
        if (!tempo.isEmpty()) sb.append("tempo: ").append(tempo).append("\n");
        if (!rhythm.isEmpty()) sb.append("rhythm: ").append(rhythm).append("\n");
        sb.append("\n");

        // Parse body into measures
        String content = preprocessVolta(body.toString());
        // Segment into bar lines / repeats and music content
        Pattern segPattern = Pattern.compile("[:\\|]+|[^:\\|]+");
        Matcher matcher = segPattern.matcher(content);
        StringBuilder currentM = new StringBuilder();

        while (matcher.find()) {
            String part = matcher.group();
            String trimmed = part.trim();
            if (trimmed.isEmpty()) continue;

            // Bar line or repeat markers
            if (trimmed.matches("[:|\\|\\[\\]]+")) {
                String mStr = currentM.toString().trim();
                String processed = mStr.isEmpty() ? "" : processMeasure(mStr, unit);

                if (trimmed.equals("|")) {
                    if (!processed.isEmpty()) {
                        sb.append(processed).append("\n");
                    } else if (sb.length() > 0 && sb.charAt(sb.length() - 1) != '\n') {
                        sb.append("\n");
                    }
                } else if (trimmed.equals("||") || trimmed.equals("|]")) {
                    sb.append(processed).append(" |\n");
                } else if (trimmed.equals(":|") || trimmed.equals("::") || trimmed.equals(":|:")) {
                    sb.append(processed).append(" :|\n");
                    if (trimmed.equals("::") || trimmed.equals(":|:")) sb.append("|: ");
                } else if (trimmed.equals("|:")) {
                    if (!processed.isEmpty()) sb.append(processed).append("\n");
                    sb.append("|: ");
                } else if (trimmed.startsWith("[") && trimmed.length() > 1) {
                    // Possible marker like [1, [1], [A]
                    if (!processed.isEmpty()) sb.append(processed).append(" ");
                    String marker = trimmed.replaceAll("[\\[\\]]", "").trim();
                    if (marker.matches("\\d+")) sb.append("(").append(marker).append(") ");
                    else sb.append("[").append(marker).append("] ");
                } else {
                    if (!processed.isEmpty()) sb.append(processed).append(" ");
                }
                currentM = new StringBuilder();
            } else {
                currentM.append(part);
            }
        }
        // Final trailing measure if any
        if (currentM.length() > 0) {
            String finalM = processMeasure(currentM.toString().trim(), unit);
            if (!finalM.isEmpty()) sb.append(finalM).append("\n");
        }

        return sb.toString().trim();
    }

    private static String processMeasure(String m, double unit) {
        StringBuilder res = new StringBuilder();
        // 1: Chords ("G7"), 2: Tuplet ((3), 3: Potential ABC Chord or Marker ([...]), 4: Solo Note ([_^=]?[a-gA-G][,']*), 5: Solo Duration, 6: Rest
        Pattern p = Pattern.compile("(\"[^\"]*\")|(\\(\\d+)|\\[([^\\]]+)\\]([0-9./]*)|([_\\^=]?[a-gA-G][,']*)([0-9./]*)|(z|x)([0-9./]*)");
        Matcher matcher = p.matcher(m);

        int tupletNotesLeft = 0;
        double tupletMultiplier = 1.0;

        while (matcher.find()) {
            if (matcher.group(1) != null) {
                res.append(normalizeChordSymbol(matcher.group(1))).append(" ");
            } else if (matcher.group(2) != null) {
                // Tuplet (n
                try {
                    int n = Integer.parseInt(matcher.group(2).substring(1));
                    tupletNotesLeft = n;
                    if (n == 3) tupletMultiplier = 2.0 / 3.0;
                    else if (n == 2) tupletMultiplier = 3.0 / 2.0;
                    else if (n == 4) tupletMultiplier = 3.0 / 4.0;
                    else tupletMultiplier = 1.0;
                } catch (Exception e) { tupletNotesLeft = 0; }
            } else if (matcher.group(3) != null) {
                String inner = matcher.group(3);
                String durStr = matcher.group(4);
                // Check if marker [A] or [1]
                if (inner.length() <= 2 && inner.matches("[A-Z1-9]")) {
                    if (Character.isDigit(inner.charAt(0))) res.append("(").append(inner).append(") ");
                    else res.append("[").append(inner).append("] ");
                } else {
                    // ABC Chord [dfb] -> Pick last note (usually melody)
                    Pattern noteP = Pattern.compile("([_\\^=]?[a-gA-G][,']*)");
                    Matcher noteM = noteP.matcher(inner);
                    String lastNote = null;
                    while (noteM.find()) lastNote = noteM.group(1);
                    if (lastNote != null) {
                        double d = parseDuration(durStr) * unit;
                        if (tupletNotesLeft > 0) { d *= tupletMultiplier; tupletNotesLeft--; }
                        res.append(lastNote).append(MusicUtils.trimDuration(d)).append(" ");
                    }
                }
            } else if (matcher.group(5) != null) {
                String note = matcher.group(5);
                double d = parseDuration(matcher.group(6)) * unit;
                if (tupletNotesLeft > 0) { d *= tupletMultiplier; tupletNotesLeft--; }
                res.append(note).append(MusicUtils.trimDuration(d)).append(" ");
            } else if (matcher.group(7) != null) {
                double d = parseDuration(matcher.group(8)) * unit;
                if (tupletNotesLeft > 0) { d *= tupletMultiplier; tupletNotesLeft--; }
                res.append("r").append(MusicUtils.trimDuration(d)).append(" ");
            }
        }
        return res.toString().trim();
    }

    private static double parseDuration(String dur) {
        if (dur == null || dur.isEmpty()) return 1.0;
        try {
            if (dur.startsWith("/")) {
                if (dur.length() == 1) return 0.5;
                return 1.0 / Double.parseDouble(dur.substring(1));
            }
            if (dur.contains("/")) {
                String[] parts = dur.split("/");
                if (parts[1].isEmpty()) return Double.parseDouble(parts[0]) / 2.0;
                return Double.parseDouble(parts[0]) / Double.parseDouble(parts[1]);
            }
            return Double.parseDouble(dur);
        } catch (Exception e) {
            return 1.0;
        }
    }

    private static String preprocessVolta(String content) {
        if (content == null) return "";
        // :|1, :| 1, :|1., :|[1, :|[1] -> :| [1]
        content = content.replaceAll(":\\|\\s*\\[?1\\.?\\s*\\]?", " :| [1] ");
        content = content.replaceAll(":\\|\\s*\\[?2\\.?\\s*\\]?", " :| [2] ");

        // |1, | 1, |1., |[1, |[1] -> | [1] (except after :|)
        content = content.replaceAll("(?<!:)\\|\\s*\\[?1\\.?\\s*\\]?", " | [1] ");
        content = content.replaceAll("(?<!:)\\|\\s*\\[?2\\.?\\s*\\]?", " | [2] ");

        // Standalone [1] or [2]
        content = content.replaceAll("\\[1\\]", " [1] ");
        content = content.replaceAll("\\[2\\]", " [2] ");

        return content;
    }

    private static String normalizeChordSymbol(String chord) {
        if (chord == null || chord.isEmpty()) return chord;
        // Convert ABC accidental symbols in chord names: _ -> b, ^ -> #, = -> empty
        return chord.replaceAll("([A-G])_", "$1b")
                    .replaceAll("([A-G])\\^", "$1#")
                    .replaceAll("([A-G])=", "$1")
                    .replaceAll("/([A-G])_", "/$1b")
                    .replaceAll("/([A-G])\\^", "/$1#")
                    .replaceAll("/([A-G])=", "/$1");
    }
}
