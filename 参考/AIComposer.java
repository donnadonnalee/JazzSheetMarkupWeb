package jp.example.readsheetreader;

import android.util.Log;
import com.google.ai.client.generativeai.GenerativeModel;
import com.google.ai.client.generativeai.java.GenerativeModelFutures;
import com.google.ai.client.generativeai.type.Content;
import com.google.ai.client.generativeai.type.GenerateContentResponse;
import com.google.common.util.concurrent.FutureCallback;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class AIComposer {
    private final java.util.concurrent.Executor executor;

    public interface CompositionCallback {
        void onSuccess(String markup);

        void onError(String message);
    }

    public AIComposer(java.util.concurrent.Executor executor) {
        this.executor = executor;
    }

    public void compose(String apiKey, String modelName, String style, CompositionCallback callback) {
        GenerativeModel gm = new GenerativeModel(modelName, apiKey);
        GenerativeModelFutures model = GenerativeModelFutures.from(gm);

        String prompt = buildPrompt(style);
        Content content = new Content.Builder().addText(prompt).build();
        ListenableFuture<GenerateContentResponse> response = model.generateContent(content);

        Futures.addCallback(response, new FutureCallback<GenerateContentResponse>() {
            @Override
            public void onSuccess(GenerateContentResponse result) {
                String text = result.getText();
                if (text != null && !text.isEmpty()) {
                    text = text.replaceAll("```[a-zA-Z]*", "").replace("```", "").trim();
                    String appMarkup = text;
                    if (ABCConverter.isABCNotation(text)) {
                        appMarkup = ABCConverter.convert(text);
                    } else {
                        // ABCコンバータを通して処理を試みる
                        String converted = ABCConverter.convert(text);
                        if (!converted.isEmpty()) {
                            appMarkup = converted;
                        }
                    }
                    String targetKey = chooseRandomKey();
                    int shift = MusicUtils.getSemitoneShift("C", targetKey);
                    String finalMarkup = MusicUtils.transposeMarkup(appMarkup, shift);
                    callback.onSuccess(finalMarkup);
                } else {
                    callback.onError("Empty response from AI");
                }
            }

            @Override
            public void onFailure(Throwable t) {
                callback.onError(t.getMessage());
            }
        }, executor);
    }

    public String buildPrompt(String style) {
        String styleInstruction = "";
        if (style.startsWith("CUSTOM:")) {
            styleInstruction = "STYLE & INSTRUCTIONS: " + style.substring(7) + "\n";
        } else {
            styleInstruction = getStyleBlock(style);
        }

        return "You are an expert jazz composition engine.\n" +
                "Compose a creative, authentic, highly musical jazz lead sheet in standard ABC notation.\n\n" +
                styleInstruction + "\n" +
                "ABC NOTATION REQUIREMENTS:\n" +
                "- Include standard header tags: T: [Evocative Song Title], K: C (or Am), M: 4/4, L: 1/8.\n" +
                "- Write chord symbols in double quotes right before melody notes (e.g., \"Dm7\" D2 F2 \"G7\" B2 G2 | \"Cmaj7\" E4 z4 |).\n" +
                "- Make sure measure durations are mathematically correct (8 eighth notes or equivalent per 4/4 bar).\n" +
                "- Structure into 16 to 32 measures (AABA or ABAC form).\n" +
                "- Use syncopation, rests ('z'), triplets '(3', and rich chromatic approach tones.\n" +
                "- Output ONLY valid raw ABC notation code (no markdown ticks ```, no explanations).";
    }

    private String getStyleBlock(String style) {
        switch (style) {
            case "bebop":
                return "STYLE: BEBOP\n" +
                        "- Fast, dense eighth-note lines with chromatic enclosures, approach tones, and arpeggiated extensions.\n" +
                        "- Rapid II-V-I harmonic changes with altered dominants (b9, #9, b5, #5).\n";

            case "hardbop":
                return "STYLE: HARD BOP\n" +
                        "- Soulful blues vocabulary, minor pentatonic phrases, and catchy, energetic rhythm motifs.\n" +
                        "- Rich chord voicings with modal and bluesy color tones.\n";

            case "contemporary":
                return "STYLE: CONTEMPORARY JAZZ\n" +
                        "- Modern non-functional harmony, slash chords (e.g. C/D, F#m/B), wide melodic leaps, and asymmetrical rhythms.\n" +
                        "- Dynamic space, silence, and expressive extended harmonies.\n";

            case "modal":
                return "STYLE: MODAL JAZZ\n" +
                        "- Spacious, floating melodies focusing on scale degrees, 9ths, 11ths, and 13ths over long modal chord stays.\n" +
                        "- Minimal chromaticism; emphasis on repetition with subtle rhythmic variation.\n";

            default:
                return "STYLE: JAZZ STANDARD\n" +
                        "- Classic swing phrasing with lyrical melody, clear II-V-I cadences, and elegant voice leading.\n";
        }
    }

    private String fixDurationByRest(String markup) {
        String[] lines = markup.split("\n");
        StringBuilder fixed = new StringBuilder();
        // group 1: 音名+音価全体, group 2: 音価のみ
        // [lh]? を追加して lc, hc 等のピッチ名に対応
        Pattern notePattern = Pattern.compile("((?:[lh]?[a-gr][+\\-]?|r)(\\d+(?:/\\d+|\\.\\d+)?))");

        for (String line : lines) {
            String trimmed = line.trim();
            if (trimmed.startsWith("title:") || trimmed.startsWith("key:") || trimmed.isEmpty()) {
                fixed.append(line).append("\n");
                continue;
            }
            List<int[]> ignoredRanges = new ArrayList<>();
            Matcher qm = Pattern.compile("\"[^\"]*\"").matcher(line);
            while (qm.find())
                ignoredRanges.add(new int[] { qm.start(), qm.end() });
            Matcher pm = Pattern.compile("\\([^)]*\\)").matcher(line);
            while (pm.find())
                ignoredRanges.add(new int[] { pm.start(), pm.end() });

            Matcher m = notePattern.matcher(line);
            double sum = 0.0;
            List<DurationToken> tokens = new ArrayList<>();
            while (m.find()) {
                int fullStart = m.start(1), fullEnd = m.end(1);
                int durStart = m.start(2);
                boolean ignored = false;
                for (int[] r : ignoredRanges)
                    if (durStart >= r[0] && durStart < r[1]) {
                        ignored = true;
                        break;
                    }
                if (ignored)
                    continue;
                double d = MusicUtils.parseDuration(m.group(2));
                sum += d;
                tokens.add(new DurationToken(fullStart, fullEnd, d));
            }

            char[] chars = line.toCharArray();
            boolean changed = false;

            // 1. durationが0以下のものを完全に除去
            for (DurationToken t : tokens) {
                if (t.duration <= 0.0001) {
                    for (int j = t.start; j < t.end; j++)
                        chars[j] = ' ';
                    changed = true;
                }
            }

            // 2. sum > 4.0 の場合、メロディの冒頭から順に除去（ケイデンスを維持するため）
            if (sum > 4.0001) {
                for (DurationToken t : tokens) {
                    if (sum <= 4.0001)
                        break;
                    if (t.duration <= 0.0001)
                        continue;

                    sum -= t.duration;
                    for (int j = t.start; j < t.end; j++)
                        chars[j] = ' ';
                    changed = true;
                }
            }

            if (changed) {
                line = new String(chars).replaceAll("\\s+", " ").trim();
            }

            // 3. sum < 4.0 の場合に不足分を休符で補完
            if (sum < 3.9999) {
                line = line + " r" + MusicUtils.trimDuration(4.0 - sum);
            }
            fixed.append(line).append("\n");
        }
        return fixed.toString().trim();
    }

    private static class DurationToken {
        int start, end;
        double duration;

        DurationToken(int start, int end, double duration) {
            this.start = start;
            this.end = end;
            this.duration = duration;
        }
    }

    private String normalizeFlatNotes(String text) {
        // 音符トークン + duration を対象にする
        // 例: eb0.5, db1, gb1/3 など
        return text.replaceAll(
                "\\b([lh]?[a-g])b(?=\\d)",
                "$1-");
    }

    private String chooseRandomKey() {
        String[] keys = { "C", "F", "Bb", "Eb", "Ab", "G", "D" };
        return keys[(int) (Math.random() * keys.length)];
    }
}
