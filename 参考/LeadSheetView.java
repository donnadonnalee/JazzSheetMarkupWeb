package jp.example.readsheetreader;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.util.AttributeSet;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;

import androidx.annotation.Nullable;
import androidx.core.content.res.ResourcesCompat;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class LeadSheetView extends View {
    protected SheetMusic sheetMusic;
    private Paint linePaint;
    private Paint thickLinePaint;
    private Paint textPaint;
    private Paint notePaint;
    private Paint noteFillPaint;
    private Paint titlePaint;
    private Paint accidentalPaint;
    private Paint voltaPaint;
    private Paint chordPaint;
    private Paint tupletPaint;
    private Paint sectionPaint;
    private Paint beamPaint;

    // For interactive editing
    private List<ElementBounds> elementBoundsList = new ArrayList<>();
    private OnElementEditListener editListener;

    // For scroll detection
    private float touchDownX, touchDownY;
    private boolean isScrolling = false;
    private static final float SCROLL_THRESHOLD = 20f; // pixels

    public interface OnElementEditListener {
        void onElementTapped(ElementBounds element);
    }

    public void setOnElementEditListener(OnElementEditListener listener) {
        this.editListener = listener;
    }

    private static final float MARGIN = 30f;
    private static final float LINE_SPACING = 24f;
    private static final float STAFF_HEIGHT = LINE_SPACING * 4;

    private int chordSizeLevel = 3;
    private boolean chordOnlyMode = false;
    private float lineSpacingScale = 1.0f;
    private int transposeOffset = 0;

    private boolean useHalfDimSymbol = false;
    private boolean useMinusForMinor = false;
    private int majorNotationMode = 0;
    private boolean useCircleForDim = false;
    private boolean usePlusForAug = false;
    private ScaleGestureDetector scaleGestureDetector;
    private float scaleFactor = 1.0f;
    // LeadSheetView クラス内
    private float pivotX = 0f;
    private float pivotY = 0f;

    private final String[] notesFlat = { "c", "db", "d", "eb", "e", "f", "gb", "g", "ab", "a", "bb", "b" };
    private final String[] notesSharp = { "c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b" };

    private static final Map<String, Integer> KEY_MAP = new HashMap<>();
    static {
        KEY_MAP.put("C", 0);
        KEY_MAP.put("G", 1);
        KEY_MAP.put("D", 2);
        KEY_MAP.put("A", 3);
        KEY_MAP.put("E", 4);
        KEY_MAP.put("B", 5);
        KEY_MAP.put("F#", 6);
        KEY_MAP.put("Gb", -6);
        KEY_MAP.put("Db", -5);
        KEY_MAP.put("Ab", -4);
        KEY_MAP.put("Eb", -3);
        KEY_MAP.put("Bb", -2);
        KEY_MAP.put("F", -1);
        KEY_MAP.put("Am", 0);
        KEY_MAP.put("Em", 1);
        KEY_MAP.put("Bm", 2);
        KEY_MAP.put("F#m", 3);
        KEY_MAP.put("C#m", 4);
        KEY_MAP.put("G#m", 5);
        KEY_MAP.put("D#m", 6);
        KEY_MAP.put("Ebm", -6);
        KEY_MAP.put("Bbm", -5);
        KEY_MAP.put("Fm", -4);
        KEY_MAP.put("Cm", -3);
        KEY_MAP.put("Gm", -2);
        KEY_MAP.put("Dm", -1);
    }

    private static class TransposedPitch {
        int octave;
        int step;
        int accidental; // -1 for flat, 0 for natural, 1 for sharp
    }

    public LeadSheetView(Context context, @Nullable AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    private void init() {
        linePaint = new Paint();
        linePaint.setColor(Color.BLACK);
        linePaint.setStrokeWidth(2f);
        thickLinePaint = new Paint();
        thickLinePaint.setColor(Color.BLACK);
        thickLinePaint.setStrokeWidth(10f);
        textPaint = new Paint();
        textPaint.setColor(Color.BLACK);
        textPaint.setTextSize(32f);
        textPaint.setAntiAlias(true);
        chordPaint = new Paint();
        chordPaint.setColor(Color.BLACK);
        chordPaint.setFakeBoldText(true);
        chordPaint.setAntiAlias(true);
        try {
            Typeface oswald = ResourcesCompat.getFont(getContext(), R.font.oswald);
            chordPaint.setTypeface(oswald);
            chordPaint.setTextScaleX(0.85f);
        } catch (Exception e) {
            chordPaint.setTypeface(Typeface.create("sans-serif-condensed", Typeface.BOLD));
            chordPaint.setTextScaleX(0.9f);
        }
        updateChordPaintSize();

        titlePaint = new Paint();
        titlePaint.setColor(Color.BLACK);
        titlePaint.setTextAlign(Paint.Align.CENTER);
        titlePaint.setAntiAlias(true);
        // Apply caveat_regular font to Title
        try {
            Typeface caveat = ResourcesCompat.getFont(getContext(), R.font.caveat_regular);
            titlePaint.setTypeface(caveat);
            titlePaint.setTextSize(80f); // Larger for better Caveat style appearance
        } catch (Exception e) {
            titlePaint.setTextSize(64f);
            titlePaint.setFakeBoldText(true);
        }

        notePaint = new Paint();
        notePaint.setColor(Color.BLACK);
        notePaint.setStyle(Paint.Style.STROKE);
        notePaint.setStrokeWidth(3f);
        notePaint.setAntiAlias(true);
        noteFillPaint = new Paint();
        noteFillPaint.setColor(Color.BLACK);
        noteFillPaint.setStyle(Paint.Style.FILL);
        noteFillPaint.setAntiAlias(true);
        accidentalPaint = new Paint();
        accidentalPaint.setColor(Color.BLACK);
        accidentalPaint.setTextSize(40f);
        accidentalPaint.setAntiAlias(true);
        voltaPaint = new Paint();
        voltaPaint.setColor(Color.BLACK);
        voltaPaint.setStrokeWidth(2f);
        voltaPaint.setTextSize(30f);
        voltaPaint.setFakeBoldText(true);
        voltaPaint.setAntiAlias(true);
        tupletPaint = new Paint();
        tupletPaint.setColor(Color.BLACK);
        tupletPaint.setTextSize(26f);
        tupletPaint.setTextAlign(Paint.Align.CENTER);
        tupletPaint.setAntiAlias(true);
        sectionPaint = new Paint();
        sectionPaint.setColor(Color.BLACK);
        sectionPaint.setTextSize(36f);
        sectionPaint.setFakeBoldText(true);
        sectionPaint.setTextAlign(Paint.Align.CENTER);
        sectionPaint.setAntiAlias(true);
        beamPaint = new Paint();
        beamPaint.setColor(Color.BLACK);
        beamPaint.setStrokeWidth(8f);
        beamPaint.setAntiAlias(true);
        // init() 内の ScaleGestureDetector 部分
        scaleGestureDetector = new ScaleGestureDetector(getContext(),
                new ScaleGestureDetector.SimpleOnScaleGestureListener() {
                    @Override
                    public boolean onScale(ScaleGestureDetector detector) {
                        float prevScale = scaleFactor;
                        scaleFactor *= detector.getScaleFactor();
                        // 0.5倍から4.0倍程度に制限
                        scaleFactor = Math.max(1f, Math.min(4.0f, scaleFactor));

                        if (prevScale != scaleFactor) {
                            // 二本指の真ん中の座標（フォーカスポイント）を保存
                            pivotX = detector.getFocusX();
                            pivotY = detector.getFocusY();
                            invalidate();
                        }
                        return true;
                    }
                });
    }

    private void updateChordPaintSize() {
        chordPaint.setTextSize(25f + chordSizeLevel * 12f);
    }

    public void setChordSizeLevel(int level) {
        this.chordSizeLevel = Math.max(1, Math.min(5, level));
        updateChordPaintSize();
        invalidate();
    }

    public void setLineSpacingScale(float scale) {
        this.lineSpacingScale = scale;
        invalidate();
    }

    public void setTransposeOffset(int offset) {
        this.transposeOffset = offset;
        invalidate();
    }

    public void setChordOnlyMode(boolean enabled) {
        this.chordOnlyMode = enabled;
        invalidate();
    }

    public void setChordNotation(boolean halfDim, boolean minor, int majorMode, boolean dim, boolean aug) {
        this.useHalfDimSymbol = halfDim;
        this.useMinusForMinor = minor;
        this.majorNotationMode = majorMode;
        this.useCircleForDim = dim;
        this.usePlusForAug = aug;
        invalidate();
    }

    private String getTransposedChord(String originalChord, int keySF) {
        if (originalChord == null || originalChord.isEmpty())
            return "";
        // N.C. は移調しない
        if (originalChord.startsWith("N.C"))
            return formatChord(originalChord);
        // 移調オフセットが0でも、フォーマット処理は通す
        if (transposeOffset == 0)
            return formatChord(originalChord);

        // 「/」で分割して各パーツを移調する
        String[] parts = originalChord.split("/", -1);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < parts.length; i++) {
            if (i > 0) sb.append("/");
            String part = parts[i];
            if (part.isEmpty()) continue;

            String root;
            String suffix;
            // ルート音の抽出（2文字目が#かbなら2文字、そうでなければ1文字）
            if (part.length() >= 2 && (part.charAt(1) == '#' || part.charAt(1) == 'b')) {
                root = part.substring(0, 2);
                suffix = part.substring(2);
            } else {
                root = part.substring(0, 1);
                suffix = part.substring(1);
            }

            int semi = getSemitones(root);
            if (semi == -1) {
                // ルートとして認識できない場合はそのまま追加
                sb.append(part);
            } else {
                // 移調計算
                int newSemi = (semi + transposeOffset + 12) % 12;
                String newRootRaw = (keySF >= 0) ? notesSharp[newSemi] : notesFlat[newSemi];
                String newRoot = newRootRaw.substring(0, 1).toUpperCase();
                if (newRootRaw.length() > 1)
                    newRoot += newRootRaw.substring(1);
                sb.append(newRoot).append(suffix);
            }
        }
        // 最後に全体の表記フォーマットを整える
        return formatChord(sb.toString());
    }

    private int getSemitones(String root) {
        String r = root.toLowerCase().replace("-", "b").replace("+", "#").replace("n", "");
        for (int i = 0; i < 12; i++)
            if (notesFlat[i].equals(r) || notesSharp[i].equals(r))
                return i;
        return -1;
    }

    private String formatChord(String chord) {
        String result = chord;
        String dimPlaceholder = "___DIM___";
        String majPlaceholder = "___MAJ___";
        if (useHalfDimSymbol)
            result = result.replace("m7-5", "ø").replace("m7b5", "ø");
        if (usePlusForAug)
            result = result.replace("aug", "+");
        if (result.contains("dim"))
            result = result.replace("dim", dimPlaceholder);
        result = result.replace("Maj7", majPlaceholder + "7").replace("maj7", majPlaceholder + "7")
                .replace("M7", majPlaceholder + "7").replace("Maj", majPlaceholder).replace("maj", majPlaceholder);
        if (useMinusForMinor) {
            result = result.replace("m7", "-7").replace("m9", "-9").replace("m11", "-11");
            if (result.endsWith("m"))
                result = result.substring(0, result.length() - 1) + "-";
            else
                result = result.replace("m ", "- ");
        }
        if (majorNotationMode == 1)
            result = result.replace(majPlaceholder, "△");
        else if (majorNotationMode == 2)
            result = result.replace(majPlaceholder, "M");
        else
            result = result.replace(majPlaceholder, "Maj");
        if (useCircleForDim)
            result = result.replace(dimPlaceholder + "7", "o7").replace(dimPlaceholder, "o");
        else
            result = result.replace(dimPlaceholder, "dim");
        return result;
    }

    private void drawComplexChord(Canvas canvas, String chord, float x, float y) {
        if (chord == null || chord.isEmpty())
            return;
        String root;
        String suffix;
        if (chord.length() >= 2 && (chord.charAt(1) == '#' || chord.charAt(1) == 'b')) {
            root = chord.substring(0, 2);
            suffix = chord.substring(2);
        } else if (chord.startsWith("N.C")) {
            root = "N.C";
            suffix = "";
        } else {
            root = chord.substring(0, 1);
            suffix = chord.substring(1);
        }
        canvas.drawText(root, x, y, chordPaint);
        if (!suffix.isEmpty()) {
            float rootWidth = chordPaint.measureText(root);
            float originalSize = chordPaint.getTextSize();
            chordPaint.setTextSize(originalSize * 0.65f);
            float yOffset = originalSize * 0.15f;
            canvas.drawText(suffix, x + rootWidth + 2f, y - yOffset, chordPaint);
            chordPaint.setTextSize(originalSize);
        }
    }

    public void setSheetMusic(SheetMusic sheetMusic) {
        this.sheetMusic = sheetMusic;
        invalidate();
    }

    private int getCurrentKeySharpsFlats() {
        if (sheetMusic == null || sheetMusic.key == null || sheetMusic.key.trim().isEmpty())
            return 0;
        String key = sheetMusic.key.trim();
        boolean isMinor = key.toLowerCase().endsWith("m");
        String baseKey = isMinor ? key.substring(0, key.length() - 1) : key;
        baseKey = baseKey.substring(0, 1).toUpperCase()
                + (baseKey.length() > 1 ? baseKey.substring(1).toLowerCase() : "");
        String lookupKey = baseKey + (isMinor ? "m" : "");
        Integer base = KEY_MAP.get(lookupKey);
        if (base == null)
            return 0;
        int transposedKeyVal = (base + transposeOffset * 7);
        while (transposedKeyVal > 6)
            transposedKeyVal -= 12;
        while (transposedKeyVal < -6)
            transposedKeyVal += 12;
        return transposedKeyVal;
    }

    private double getVisualDuration(Note note) {
        if (note.tupletNumber <= 1) {
            return note.duration;
        }
        int n = note.tupletNumber;
        // Find m in "n in the space of m"
        // e.g., 3 in 2, 5/6/7 in 4, 9-15 in 8.
        int m = Integer.highestOneBit(n - 1);
        if (m == 0) m = 1;
        return note.duration * n / (double) m;
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (sheetMusic == null)
            return;

        // キャンバス全体をスケーリング
        canvas.save();
        canvas.scale(scaleFactor, scaleFactor, pivotX, pivotY);

        // Clear previous bounds for new render
        elementBoundsList.clear();

        float titleX = getWidth() / 2f;
        float titleY = 100f;
        canvas.drawText(sheetMusic.title, titleX, titleY, titlePaint);

        // Draw Composer (Top Right)
        if (!sheetMusic.composer.isEmpty()) {
            textPaint.setTextAlign(Paint.Align.RIGHT);
            canvas.drawText(sheetMusic.composer, getWidth() - MARGIN, 145f, textPaint);
            textPaint.setTextAlign(Paint.Align.LEFT);
        }

        // Draw Tempo / Meter / Rhythm (Top Left)
        String metaText = (sheetMusic.tempo + " " + sheetMusic.meter + " " + sheetMusic.rhythm).trim();
        if (!metaText.isEmpty()) {
            canvas.drawText(metaText, MARGIN, 145f, textPaint);
        }

        // Record title bounds for tap detection (Metadata) - include sub-metadata area
        RectF titleBounds = new RectF(MARGIN, 20f, getWidth() - MARGIN, 170f);
        elementBoundsList.add(new ElementBounds(titleBounds, ElementBounds.ElementType.METADATA, null, sheetMusic));

        float currentX = MARGIN;
        int measureInLine = 0;
        float availableWidth = getWidth() - (2 * MARGIN);
        List<Measure> measures = sheetMusic.measures;
        float currentY = 250;
        float baseStepY = chordOnlyMode ? 180f : (STAFF_HEIGHT + 180f);
        float stepY = baseStepY * lineSpacingScale;
        int currentKeySF = getCurrentKeySharpsFlats();

        for (int i = 0; i < measures.size(); i++) {
            Measure m = measures.get(i);
            if (m.isNewLine || measureInLine >= 4 || i == 0) {
                if (i != 0)
                    currentY += stepY;
                currentX = MARGIN;
                if (!chordOnlyMode)
                    drawKeySignature(canvas, currentKeySF, currentX, currentY);
                currentX += (Math.abs(currentKeySF) * 18f) + 15f;
                measureInLine = 0;
            }
            float measureWidth = (getWidth() - currentX - MARGIN) / (4 - measureInLine);
            drawMeasure(canvas, m, currentX, currentY, measureWidth, i, (i == measures.size() - 1), currentKeySF);
            currentX += measureWidth;
            measureInLine++;
        }
        canvas.restore();
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        // スケールジェスチャにイベントを渡す
        scaleGestureDetector.onTouchEvent(event);

        // 2本以上の指が触れている場合は、ScrollViewにイベントを奪わせない
        if (event.getPointerCount() > 1) {
            getParent().requestDisallowInterceptTouchEvent(true);
        }

        // ピンチ操作（スケーリング）進行中は、他のタップ処理などを行わない
        if (scaleGestureDetector.isInProgress()) {
            return true;
        }

        switch (event.getAction()) {
            case MotionEvent.ACTION_DOWN:
                touchDownX = event.getX();
                touchDownY = event.getY();
                isScrolling = false;
                // ScrollView内でも確実にイベントを拾うためtrueを返す
                return true;

            case MotionEvent.ACTION_MOVE:
                float deltaX = Math.abs(event.getX() - touchDownX);
                float deltaY = Math.abs(event.getY() - touchDownY);
                if (deltaX > SCROLL_THRESHOLD || deltaY > SCROLL_THRESHOLD) {
                    isScrolling = true;
                }
                break;

            case MotionEvent.ACTION_UP:
                if (!isScrolling && editListener != null) {
                    // 座標をスケールで補正
                    float x = (event.getX() - pivotX) / scaleFactor + pivotX;
                    float y = (event.getY() - pivotY) / scaleFactor + pivotY;

                    for (ElementBounds bounds : elementBoundsList) {
                        if (bounds.type == ElementBounds.ElementType.METADATA && bounds.contains(x, y)) {
                            editListener.onElementTapped(bounds);
                            return true;
                        }
                    }
                    // ...（中略：他の要素の判定）
                    for (ElementBounds bounds : elementBoundsList) {
                        if (bounds.type == ElementBounds.ElementType.NOTE && bounds.contains(x, y)) {
                            editListener.onElementTapped(bounds);
                            return true;
                        }
                    }
                    for (ElementBounds bounds : elementBoundsList) {
                        if (bounds.type == ElementBounds.ElementType.CHORD && bounds.contains(x, y)) {
                            editListener.onElementTapped(bounds);
                            return true;
                        }
                    }
                    for (ElementBounds bounds : elementBoundsList) {
                        if (bounds.type == ElementBounds.ElementType.MEASURE && bounds.contains(x, y)) {
                            editListener.onElementTapped(bounds);
                            return true;
                        }
                    }
                }
                break;
        }
        return super.onTouchEvent(event);
    }

    private void drawKeySignature(Canvas canvas, int sf, float x, float y) {
        String symbol = sf > 0 ? "♯" : "♭";
        int count = Math.abs(sf);
        float[] sharpYOffsets = { 0, 1.5f, -0.5f, 1.0f, 2.5f, 0.5f, 2.0f };
        float[] flatYOffsets = { 2.0f, 0.5f, 2.5f, 1.0f, 3.0f, 1.5f, 3.5f };
        float[] offsets = sf > 0 ? sharpYOffsets : flatYOffsets;
        for (int i = 0; i < count; i++) {
            float ly = y + offsets[i] * LINE_SPACING;
            canvas.drawText(symbol, x + i * 18f, ly + 12f, accidentalPaint);
        }
    }

    private static class NoteDrawingInfo {
        float x, y, stemTopY;
        boolean isRest;
        String displayAcc;
        Note note;
    }

    private void drawMeasure(Canvas canvas, Measure measure, float x, float y, float width, int index, boolean isLast,
            int keySF) {
        // Record measure bounds for tap detection
        float barHeight = chordOnlyMode ? 60f : STAFF_HEIGHT;
        float topY = chordOnlyMode ? (y - 30f) : y;
        RectF measureBounds = new RectF(x, topY - 80f, x + width, topY + barHeight + 60f);
        elementBoundsList.add(
                new ElementBounds(measureBounds, ElementBounds.ElementType.MEASURE, measure.sourcePosition, measure));

        if (measure.voltaNumber > 0) {
            float voltaY = chordOnlyMode ? (y - 50f) : (y - 65f);
            canvas.drawLine(x - 25, voltaY, x + width, voltaY, linePaint);
            if (index == 0 || sheetMusic.measures.get(index - 1).voltaNumber != measure.voltaNumber) {
                canvas.drawLine(x - 25, voltaY, x - 25, voltaY + 25f, linePaint);
                canvas.drawText(measure.voltaNumber + ".", x - 25 + 8f, voltaY + 30f, voltaPaint);
            }
        }
        if (!measure.sectionLabel.isEmpty()) {
            float sx = x - 5f;
            float sy = chordOnlyMode ? (y - 45f) : (y - 55f);
            if (measure.voltaNumber > 0)
                sy -= 30f;
            float textWidth = sectionPaint.measureText(measure.sectionLabel);
            RectF rect = new RectF(sx - 12f, sy - 35f, sx + textWidth + 12f, sy + 15f);
            canvas.drawRect(rect, notePaint);
            canvas.drawText(measure.sectionLabel, sx + textWidth / 2f, sy, sectionPaint);
        }
        if (!chordOnlyMode) {
            for (int i = 0; i < 5; i++) {
                float ly = y + i * LINE_SPACING;
                canvas.drawLine(x, ly, x + width, ly, linePaint);
            }
        }
        drawBarLines(canvas, measure, x, y, width, isLast);
        for (int i = 0; i < measure.chords.size(); i++) {
            ChordChange cc = measure.chords.get(i);
            float relativePos = (float) i / measure.chords.size();
            float cx = x + (relativePos * width) + 15f;
            if (measure.repeatStart)
                cx += chordOnlyMode ? 40f : 30f;
            if (measure.voltaNumber > 0)
                cx += chordOnlyMode ? 20f : 10f;
            if (!measure.sectionLabel.isEmpty())
                cx += chordOnlyMode ? 40f : 30f;
            float cy = chordOnlyMode ? (y + 15f) : (y - 30f);

            // Record chord bounds - expanded for easier tapping
            String transposedChord = getTransposedChord(cc.chord, keySF);
            float chordWidth = chordPaint.measureText(transposedChord);
            RectF chordBounds = new RectF(cx - 10, cy - 50, cx + chordWidth + 10, cy + 20);
            elementBoundsList
                    .add(new ElementBounds(chordBounds, ElementBounds.ElementType.CHORD, cc.sourcePosition, cc));

            drawComplexChord(canvas, transposedChord, cx, cy);
        }
        if (!chordOnlyMode) {
            float usableWidth = width - (measure.repeatStart ? 60f : 35f) - (measure.repeatEnd ? 35f : 15f);
            float currentNoteX = x + (measure.repeatStart ? 55f : 35f);

            // 小節内での臨時記号の状態管理
            // key: octave * 7 + stepIdx, value: accidentalValue (-1: b, 0: natural, 1: #)
            Map<Integer, Integer> measureAccidentalState = new HashMap<>();
            int[] keyAccidentals = getKeyAccidentals(keySF);
            
            List<NoteDrawingInfo> infoList = new ArrayList<>();
            for (Note note : measure.notes) {
                if(note.duration==0)continue;
                NoteDrawingInfo info = new NoteDrawingInfo();
                info.note = note;
                info.x = currentNoteX;
                info.isRest = note.isRest;
                if (!note.isRest) {
                    TransposedPitch pitchInfo = getTransposedPitch(note, keySF);
                    info.y = calculateTransposedNoteY(pitchInfo, y);
                    
                    int pitchKey = pitchInfo.octave * 7 + pitchInfo.step;
                    int currentState;
                    if (measureAccidentalState.containsKey(pitchKey)) {
                        currentState = measureAccidentalState.get(pitchKey);
                    } else {
                        currentState = keyAccidentals[pitchInfo.step];
                    }

                    if (pitchInfo.accidental != currentState) {
                        if (pitchInfo.accidental == -1) info.displayAcc = "-";
                        else if (pitchInfo.accidental == 1) info.displayAcc = "#";
                        else info.displayAcc = "n";
                        measureAccidentalState.put(pitchKey, pitchInfo.accidental);
                    } else {
                        info.displayAcc = "";
                    }

                    boolean stemUp = info.y > (y + 2 * LINE_SPACING);
                    float stemHeight = LINE_SPACING * 3.3f;
                    info.stemTopY = stemUp ? info.y - stemHeight : info.y + stemHeight;

                    // Record note bounds
                    RectF noteBounds = new RectF(info.x - 15, Math.min(info.y, info.stemTopY) - 15,
                            info.x + 15, Math.max(info.y, info.stemTopY) + 15);
                    elementBoundsList.add(
                            new ElementBounds(noteBounds, ElementBounds.ElementType.NOTE, note.sourcePosition, note));
                } else {
                    // Record rest bounds
                    RectF restBounds = new RectF(info.x - 20, y, info.x + 20, y + STAFF_HEIGHT);
                    elementBoundsList.add(
                            new ElementBounds(restBounds, ElementBounds.ElementType.NOTE, note.sourcePosition, note));
                }
                infoList.add(info);
                currentNoteX += (float) ((note.duration / measure.totalDuration) * usableWidth);
            }

            boolean[] isBeamed = new boolean[infoList.size()];
            for (int i = 0; i < infoList.size(); i++) {
                if (isBeamed[i])
                    continue;
                NoteDrawingInfo info = infoList.get(i);
                boolean wasBeamed = false;

                // 休符でなく、かつ連桁が必要な視覚的な音価を持つ音符のみ連桁の対象とする
                if (!info.isRest && getVisualDuration(info.note) < 0.99) {
                    double notePos = 0;
                    for (int k = 0; k < i; k++)
                        notePos += measure.notes.get(k).duration;

                    int beamEnd = i;
                    double beamDur = 0;
                    boolean firstStemUp = info.stemTopY < info.y;
                    int firstTuplet = info.note.tupletNumber;

                    for (int j = i + 1; j < infoList.size(); j++) {
                        NoteDrawingInfo n = infoList.get(j);
                        if (n.isRest || getVisualDuration(n.note) >= 0.99)
                            break;

                        beamDur += measure.notes.get(j - 1).duration;

                        if (firstTuplet > 0) {
                            if (n.note.tupletNumber != firstTuplet)
                                break;
                            if (beamDur >= 0.99) // Limit triplet beam to 1 beat (3 notes)
                                break;
                        } else {
                            double posMod = (notePos + beamDur) % 1.0;
                            if (beamDur >= 1.0 || posMod < 0.05 || posMod > 0.95) {
                                break;
                            }
                        }
                        beamEnd = j;
                    }

                    if (beamEnd > i) {
                        float off = firstStemUp ? 7f : -7f;
                        float stemHeight = LINE_SPACING * 3.3f;
                        float beamSpacing = 12f;
                        float beamEndY = firstStemUp ? infoList.get(beamEnd).y - stemHeight : infoList.get(beamEnd).y + stemHeight;

                        canvas.drawLine(info.x + off, info.stemTopY, infoList.get(beamEnd).x + off, beamEndY, beamPaint);

                        float beam1StartX = info.x + off;
                        float beam1StartY = info.stemTopY;
                        float beam1EndX = infoList.get(beamEnd).x + off;
                        float beam1EndY = beamEndY;
                        float slope = (beam1EndY - beam1StartY) / (beam1EndX - beam1StartX);

                        float beamGap = LINE_SPACING * 0.9f;
                        float beam2StartY = beam1StartY + (firstStemUp ? beamGap : -beamGap);

                        for (int k = i; k <= beamEnd; k++) {
                            NoteDrawingInfo b = infoList.get(k);
                            if (getVisualDuration(b.note) <= 0.26) {
                                float bX = b.x + off;
                                float beam2Y = beam2StartY + slope * (bX - beam1StartX);
                                boolean nextIs16th = (k < beamEnd && getVisualDuration(infoList.get(k + 1).note) <= 0.26);
                                boolean prevIs16th = (k > i && getVisualDuration(infoList.get(k - 1).note) <= 0.26);

                                if (nextIs16th) {
                                    NoteDrawingInfo nextB = infoList.get(k + 1);
                                    float nextBX = nextB.x + off;
                                    float nextBeam2Y = beam2StartY + slope * (nextBX - beam1StartX);
                                    canvas.drawLine(bX, beam2Y, nextBX, nextBeam2Y, beamPaint);
                                } else if (!prevIs16th) {
                                    float stubLen = 15f;
                                    float direction = (k == beamEnd) ? -1f : 1f;
                                    canvas.drawLine(bX, beam2Y, bX + stubLen * direction, beam2Y, beamPaint);
                                }
                            }
                        }

                        for (int k = i; k <= beamEnd; k++) {
                            NoteDrawingInfo b = infoList.get(k);
                            float bStemTopY = firstStemUp ? b.y - stemHeight : b.y + stemHeight;
                            canvas.drawLine(b.x + off, b.y, b.x + off, bStemTopY, linePaint);
                            drawSingleNoteHead(canvas, b.note, b.x, b.y, y, b.displayAcc);
                            isBeamed[k] = true;
                        }
                        i = beamEnd;
                        wasBeamed = true;
                    }
                }

                if (!wasBeamed) {
                    if (info.isRest)
                        drawRest(canvas, info.note, info.x, y);
                    else
                        drawNoteWithAccidental(canvas, info.note, info.x, info.y, y, info.displayAcc);
                }
            }

            // Tuplet Brackets
            currentNoteX = x + (measure.repeatStart ? 55f : 35f);
            int currentTupletNum = 0;
            float tupletStartX = 0;
            double tupletAccumulator = 0;
            for (Note note : measure.notes) {
                if (note.tupletNumber > 0 && currentTupletNum == 0) {
                    currentTupletNum = note.tupletNumber;
                    tupletStartX = currentNoteX;
                    tupletAccumulator = 0;
                }
                if (currentTupletNum > 0) {
                    tupletAccumulator += note.duration;
                    boolean isBoundary = Math.abs(tupletAccumulator - Math.round(tupletAccumulator * 2) / 2.0) < 0.01;
                    if (tupletAccumulator >= 0.49 && isBoundary) {
                        drawTupletBracket(canvas, tupletStartX, currentNoteX, y, currentTupletNum);
                        currentTupletNum = 0;
                    }
                }
                currentNoteX += (float) ((note.duration / measure.totalDuration) * usableWidth);
            }
        }
    }

    private void drawSingleNoteHead(Canvas canvas, Note note, float nx, float ny, float staffTopY, String acc) {
        double visualDur = getVisualDuration(note);
        float radius = 10f;
        if (acc.equals("-"))
            canvas.drawText("♭", nx - 38f, ny + 12f, accidentalPaint);
        else if (acc.equals("#"))
            canvas.drawText("♯", nx - 38f, ny + 12f, accidentalPaint);
        else if (acc.equals("n"))
            canvas.drawText("♮", nx - 38f, ny + 12f, accidentalPaint);
        if (ny < staffTopY - 2) {
            for (float ly = staffTopY - LINE_SPACING; ly >= ny - 2; ly -= LINE_SPACING)
                canvas.drawLine(nx - 22, ly, nx + 22, ly, linePaint);
        } else if (ny > staffTopY + STAFF_HEIGHT + 2) {
            for (float ly = staffTopY + STAFF_HEIGHT + LINE_SPACING; ly <= ny + 2; ly += LINE_SPACING)
                canvas.drawLine(nx - 22, ly, nx + 22, ly, linePaint);
        }
        if (visualDur >= 1.99)
            canvas.drawCircle(nx, ny, radius, notePaint);
        else
            canvas.drawCircle(nx, ny, radius, noteFillPaint);

        if (Math.abs(visualDur - 1.5) < 0.05 || Math.abs(visualDur - 3.0) < 0.05
                || Math.abs(visualDur - 0.75) < 0.05 || Math.abs(visualDur - 6.0) < 0.05) {
            canvas.drawCircle(nx + radius + 12, ny, 3.5f, noteFillPaint);
        }
    }

    private TransposedPitch getTransposedPitch(Note note, int keySF) {
        TransposedPitch result = new TransposedPitch();
        if (note.isRest)
            return result;
        int semi = getSemitones(note.pitch + note.accidental) + (note.octave - 4) * 12;
        int transposedSemi = (semi + transposeOffset + 120) % 12;
        int octave = 4 + (semi + transposeOffset) / 12;
        if (semi + transposeOffset < 0 && (semi + transposeOffset) % 12 != 0)
            octave--;
        int[] scaleSemi = { 0, 2, 4, 5, 7, 9, 11 };
        for (int i = 0; i < 7; i++) {
            if (scaleSemi[i] == transposedSemi) {
                result.step = i;
                result.octave = octave;
                result.accidental = 0;
                return result;
            }
        }
        
        boolean preferFlat;
        if (keySF > 0) {
            preferFlat = false;
        } else if (keySF < 0) {
            preferFlat = true;
        } else {
            preferFlat = (transposeOffset != 0) || "-".equals(note.accidental);
        }
        
        if (preferFlat) {
            for (int i = 0; i < 7; i++) {
                if (scaleSemi[i] == (transposedSemi + 1) % 12) {
                    result.step = i;
                    result.octave = octave;
                    result.accidental = -1;
                    return result;
                }
            }
        } else {
            for (int i = 0; i < 7; i++) {
                if (scaleSemi[i] == (transposedSemi - 1 + 12) % 12) {
                    result.step = i;
                    result.octave = octave;
                    result.accidental = 1;
                    return result;
                }
            }
        }
        return result;
    }

    private int[] getKeyAccidentals(int keySF) {
        int[] accs = new int[7];
        if (keySF > 0) {
            int[] order = { 3, 0, 4, 1, 5, 2, 6 };
            for (int i = 0; i < keySF; i++)
                accs[order[i]] = 1;
        } else if (keySF < 0) {
            int[] order = { 6, 2, 5, 1, 4, 0, 3 };
            for (int i = 0; i < Math.abs(keySF); i++)
                accs[order[i]] = -1;
        }
        return accs;
    }

    private float calculateTransposedNoteY(TransposedPitch p, float staffTopY) {
        int staffStepsFromC4 = p.step + (p.octave - 4) * 7;
        int stepsFromB4 = staffStepsFromC4 - 6;
        return (staffTopY + 2 * LINE_SPACING) - (stepsFromB4 * (LINE_SPACING / 2f));
    }

    private void drawNoteWithAccidental(Canvas canvas, Note note, float nx, float ny, float staffTopY, String acc) {
        drawSingleNoteHead(canvas, note, nx, ny, staffTopY, acc);
        double visualDur = getVisualDuration(note);
        if (visualDur < 3.99) {
            boolean stemUp = ny > (staffTopY + 2 * LINE_SPACING);
            float off = stemUp ? 7f : -7f;
            float stemHeight = LINE_SPACING * 3.3f;
            float endY = stemUp ? ny - stemHeight : ny + stemHeight;
            canvas.drawLine(nx + off, ny, nx + off, endY, linePaint);
            if (visualDur < 0.99) {
                drawFlag(canvas, nx + off, endY, stemUp);
                if (visualDur <= 0.26)
                    drawFlag(canvas, nx + off, stemUp ? endY + 12 : endY - 12, stemUp);
            }
        }
    }

    private void drawRest(Canvas canvas, Note note, float rx, float staffTopY) {
        double visualDur = getVisualDuration(note);
        float midY = staffTopY + 2 * LINE_SPACING;
        if (visualDur >= 3.99)
            canvas.drawRect(rx - 15, staffTopY + LINE_SPACING, rx + 15, staffTopY + LINE_SPACING + 12, noteFillPaint);
        else if (visualDur >= 1.99)
            canvas.drawRect(rx - 15, midY - 12, rx + 15, midY, noteFillPaint);
        else if (visualDur >= 0.99) {
            float originalSize = accidentalPaint.getTextSize();
            accidentalPaint.setTextSize(originalSize * 2);
            canvas.drawText("𝄽", rx - 14, midY + 30f, accidentalPaint);
            accidentalPaint.setTextSize(originalSize);
            if (Math.abs(visualDur - 1.5) < 0.05)
                canvas.drawCircle(rx + 25, midY, 3.5f, noteFillPaint);
        } else {
            float originalSize = accidentalPaint.getTextSize();
            accidentalPaint.setTextSize(originalSize * 2);
            canvas.drawText("𝄾", rx - 10, midY + 30f, accidentalPaint);
            accidentalPaint.setTextSize(originalSize);
            if (Math.abs(visualDur - 0.75) < 0.05)
                canvas.drawCircle(rx + 25, midY, 3.5f, noteFillPaint);
        }
    }

    private void drawTupletBracket(Canvas canvas, float startX, float endX, float staffTopY, int number) {
        float bracketY = staffTopY + STAFF_HEIGHT + 40f;
        canvas.drawLine(startX, bracketY, startX, bracketY - 10f, linePaint);
        canvas.drawLine(endX, bracketY, endX, bracketY - 10f, linePaint);
        float midX = (startX + endX) / 2f;
        canvas.drawLine(startX, bracketY, midX - 15f, bracketY, linePaint);
        canvas.drawLine(midX + 15f, bracketY, endX, bracketY, linePaint);
        canvas.drawText(String.valueOf(number), midX, bracketY + 8f, tupletPaint);
    }

    private void drawBarLines(Canvas canvas, Measure measure, float x, float y, float width, boolean isLast) {
        float barHeight = chordOnlyMode ? 60f : STAFF_HEIGHT;
        float topY = chordOnlyMode ? (y - 30f) : y;
        float botY = topY + barHeight;
        if (measure.repeatStart) {
            canvas.drawLine(x + 2, topY, x + 2, botY, thickLinePaint);
            canvas.drawLine(x + 14, topY, x + 14, botY, linePaint);
            float dot1Y = chordOnlyMode ? (y - 15f) : (y + LINE_SPACING * 1.5f);
            float dot2Y = chordOnlyMode ? (y + 15f) : (y + LINE_SPACING * 2.5f);
            canvas.drawCircle(x + 24, dot1Y, 5f, noteFillPaint);
            canvas.drawCircle(x + 24, dot2Y, 5f, noteFillPaint);
        } else if (x == MARGIN) {
            canvas.drawLine(x, topY, x, botY, linePaint);
        }

        if (measure.repeatEnd) {
            canvas.drawLine(x + width - 5, topY, x + width - 5, botY, thickLinePaint);
            canvas.drawLine(x + width - 18, topY, x + width - 18, botY, linePaint);
            float dot1Y = chordOnlyMode ? (y - 15f) : (y + LINE_SPACING * 1.5f);
            float dot2Y = chordOnlyMode ? (y + 15f) : (y + LINE_SPACING * 2.5f);
            canvas.drawCircle(x + width - 30, dot1Y, 5f, noteFillPaint);
            canvas.drawCircle(x + width - 30, dot2Y, 5f, noteFillPaint);
        } else if (isLast) {
            canvas.drawLine(x + width - 15, topY, x + width - 15, botY, linePaint);
            canvas.drawLine(x + width - 5, topY, x + width - 5, botY, thickLinePaint);
        } else if (measure.isDoubleBar) {
            canvas.drawLine(x + width - 10, topY, x + width - 10, botY, linePaint);
            canvas.drawLine(x + width, topY, x + width, botY, linePaint);
        } else {
            canvas.drawLine(x + width, topY, x + width, botY, linePaint);
        }
    }

    private void drawFlag(Canvas canvas, float sx, float sy, boolean up) {
        Path path = new Path();
        path.moveTo(sx, sy);
        if (up)
            path.cubicTo(sx + 15, sy + 10, sx + 15, sy + 30, sx + 10, sy + 45);
        else
            path.cubicTo(sx + 15, sy - 10, sx + 15, sy - 30, sx + 10, sy - 45);
        canvas.drawPath(path, notePaint);
    }
}
