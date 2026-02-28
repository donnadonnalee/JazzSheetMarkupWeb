/**
 * Main Application Logic
 * Wires together parser, renderer, and UI
 */

class LeadSheetApp {
    constructor() {
        this.canvas = document.getElementById('sheetCanvas');
        this.markupInput = document.getElementById('markupInput');
        this.renderer = new LeadSheetRenderer(this.canvas);

        // Initialize canvas size with HiDPI support
        const dpr = window.devicePixelRatio || 1;
        const logicalWidth = 2000;
        const logicalHeight = 800;

        this.canvas.width = logicalWidth * dpr;
        this.canvas.height = logicalHeight * dpr;
        this.canvas.style.width = logicalWidth + 'px';
        this.canvas.style.height = logicalHeight + 'px';

        this.renderer.ctx.scale(dpr, dpr);

        if (window.db && window.userUuid) {
            this.forum = new Forum(window.db, window.userUuid);
        }

        this.player = new AudioPlayer();
        this.initializeUI();
        this.loadSampleMarkup();

        // Ensure first render after fonts are ready
        document.fonts.ready.then(() => {
            console.log('Fonts ready, triggering initial render');
            this.parseAndRender();
        });
    }

    initializeUI() {
        // Markup input - real-time rendering
        this.markupInput.addEventListener('input', () => {
            this.parseAndRender();
        });

        // Sample button
        document.getElementById('btnSample').addEventListener('click', () => {
            this.loadSampleMarkup();
        });

        // Help button
        document.getElementById('btnHelp').addEventListener('click', () => {
            this.showHelpModal();
        });

        // Clear button
        document.getElementById('btnClear').addEventListener('click', () => {
            this.markupInput.value = '';
            this.parseAndRender();
        });

        // Settings button
        document.getElementById('btnSettings').addEventListener('click', () => {
            const modal = document.getElementById('settingsModal');
            modal.classList.remove('hidden');
        });

        // AI Composer button
        document.getElementById('btnAI').addEventListener('click', () => {
            this.showAIComposerDialog();
        });

        // Forum button
        document.getElementById('btnForum').addEventListener('click', () => {
            this.showForumModal();
        });

        // Share to Forum button
        document.getElementById('btnShareForum').addEventListener('click', () => {
            this.shareToForum();
        });

        // Modal close buttons
        document.getElementById('btnCloseForum').addEventListener('click', () => {
            document.getElementById('forumModal').classList.add('hidden');
        });

        document.getElementById('btnCloseVideo').addEventListener('click', () => {
            document.getElementById('videoModal').classList.add('hidden');
        });

        document.getElementById('btnCloseSettings').addEventListener('click', () => {
            document.getElementById('settingsModal').classList.add('hidden');
        });

        document.getElementById('btnCloseAI').addEventListener('click', () => {
            document.getElementById('aiModal').classList.add('hidden');
        });

        document.getElementById('btnCloseHelp').addEventListener('click', () => {
            document.getElementById('helpModal').classList.add('hidden');
        });

        // Forum controls
        document.getElementById('forumSearch').addEventListener('input', (e) => {
            this.renderForumList(e.target.value);
        });

        document.getElementById('btnSortPopular').addEventListener('click', () => {
            this.currentForumSort = 'likes';
            document.getElementById('btnSortPopular').classList.add('btn-active');
            document.getElementById('btnSortLatest').classList.remove('btn-active');
            this.loadAndRenderForum();
        });

        document.getElementById('btnSortLatest').addEventListener('click', () => {
            this.currentForumSort = 'timestamp';
            document.getElementById('btnSortLatest').classList.add('btn-active');
            document.getElementById('btnSortPopular').classList.remove('btn-active');
            this.loadAndRenderForum();
        });

        // Transpose control
        document.getElementById('transposeSelect').addEventListener('change', (e) => {
            this.renderer.setTransposeOffset(parseInt(e.target.value));
            this.renderer.render();
        });

        // Chord-only mode
        document.getElementById('chordOnlyCheck').addEventListener('change', (e) => {
            this.renderer.setChordOnlyMode(e.target.checked);
            this.renderer.render();
        });

        // Line spacing
        const lineSpacingSlider = document.getElementById('lineSpacingSlider');
        const lineSpacingValue = document.getElementById('lineSpacingValue');
        lineSpacingSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            lineSpacingValue.textContent = value.toFixed(1);
            this.renderer.setLineSpacingScale(value);
            this.renderer.render();
        });

        // Chord font size
        const chordSizeSlider = document.getElementById('chordSizeSlider');
        const chordSizeValue = document.getElementById('chordSizeValue');

        // Sync initial value from slider to label and renderer
        chordSizeValue.textContent = chordSizeSlider.value;
        this.renderer.chordFontSize = parseInt(chordSizeSlider.value);

        chordSizeSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            chordSizeValue.textContent = value;
            this.renderer.chordFontSize = value;
            this.renderer.render();
        });

        // Chord Notation Toggles
        document.getElementById('checkUseDelta').addEventListener('change', (e) => {
            this.renderer.useDelta = e.target.checked;
            this.renderer.render();
        });
        document.getElementById('checkUseMinus').addEventListener('change', (e) => {
            this.renderer.useMinus = e.target.checked;
            this.renderer.render();
        });
        document.getElementById('checkUsePlus').addEventListener('change', (e) => {
            this.renderer.usePlus = e.target.checked;
            this.renderer.render();
        });
        document.getElementById('checkUsePhi').addEventListener('change', (e) => {
            this.renderer.usePhi = e.target.checked;
            this.renderer.render();
        });
        document.getElementById('checkUseDimMinus').addEventListener('change', (e) => {
            this.renderer.useDimMinus = e.target.checked;
            this.renderer.render();
        });

        // --- Playback Controls ---
        document.getElementById('btnPlay').addEventListener('click', () => {
            if (this.player.isPlaying) {
                this.player.stop();
                document.getElementById('btnPlay').textContent = '▶';
            } else {
                if (!this.renderer.sheetMusic) return;
                this.player.play(this.renderer.sheetMusic);
                document.getElementById('btnPlay').textContent = '⏸';
            }
        });

        document.getElementById('btnStop').addEventListener('click', () => {
            this.player.stop();
            document.getElementById('btnPlay').textContent = '▶';
        });

        const bpmSlider = document.getElementById('bpmSlider');
        const bpmValue = document.getElementById('bpmValue');
        bpmSlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            bpmValue.textContent = val;
            this.player.setBpm(val);
        });

        // Listen for playback end
        window.addEventListener('playback-ended', () => {
            document.getElementById('btnPlay').textContent = '▶';
        });

        // Mute Controls
        const updateMuteState = () => {
            const muteMel = document.getElementById('checkMuteMelody').checked;
            const muteAcc = document.getElementById('checkMuteChords').checked;
            this.player.setMute(muteMel, muteAcc);
        };

        document.getElementById('checkMuteMelody').addEventListener('change', updateMuteState);
        document.getElementById('checkMuteChords').addEventListener('change', updateMuteState);

        document.getElementById('checkJazzMode').addEventListener('change', (e) => {
            this.player.setJazzMode(e.target.checked);
        });
    }

    parseAndRender() {
        const markup = this.markupInput.value;

        if (!markup.trim()) {
            // Clear canvas if empty
            this.renderer.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.renderer.ctx.fillStyle = '#ffffff';
            this.renderer.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            return;
        }

        try {
            const sheetMusic = LeadSheetParser.parse(markup);
            this.renderer.setSheetMusic(sheetMusic);
            this.renderer.render();
        } catch (error) {
            console.error('Parsing error:', error);
            // Show error in canvas
            this.renderer.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.renderer.ctx.fillStyle = '#ffffff';
            this.renderer.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.renderer.ctx.font = '16px sans-serif';
            this.renderer.ctx.fillStyle = '#ff0000';
            this.renderer.ctx.fillText('Parsing Error: ' + error.message, 20, 40);
        }
    }

    loadSampleMarkup() {
        const sample = `title:Beautiful Love
key:Dm
"N.C"defnl
[A]|:"Em7-5"a3g
"A7"fede
"Dm7"f4
"Dm7"rfga
"Gm7"hc3b-
"C7"agfg
"Fmaj"a4
"Em7-5"ra"A7"bhc+|

[B](1)"Dm7"hehd3
"G7"hcb-2d
"Bb7"e4
"A7"refg
"Dm7"a3d
"B7"c+3d
"Em7-5"e4
"A7"rdef:|

[C](2)"Dm7"hehd3
"G7"hcb-2d
"Bb7"e4
"Bb7"refg
"Dm7"a2"B7"d2
"Bb7"f2"A7"e2
"Dm7"d4
"Dm7"r4`;

        this.markupInput.value = sample;
        this.parseAndRender();
    }

    async showHelpModal() {
        const modal = document.getElementById('helpModal');
        const contentDiv = document.getElementById('helpContent');

        modal.classList.remove('hidden');

        if (this.helpLoaded) return;

        // Embedding help content directly to support file:// protocol usage
        const helpMarkdown = `## 1. メタデータ
- \`title: 曲名\` : タイトルを設定します。
- \`key: Dm\` : 曲のキーを設定します（移調に連動）。

## 2. 構造・記号
- \`[A]\` : セクションラベルを表示します。
- \`|:\` : リピート開始
- \`:|\` : リピート終了
- \`|\` : 複縦線（行の末尾にある場合）
- \`(1)\`, \`(2)\` : 1番カッコ、2番カッコ

## 3. コードネーム
- \`"Cm7"\` : コード名はダブルクォーテーションで囲みます。
- \`"A(-9,-13)"\` : テンションはカッコ内に記述します。

## 4. 音符と休符
- **音高**: \`c\`, \`d\`, \`e\`, \`f\`, \`g\`, \`a\`, \`b\`
- **オクターブ**:
  - \`llc\` : 非常に低い (Oct 2)
  - \`lc\` : 低い (Oct 3)
  - \`c\` : 普通 (Oct 4)
  - \`hc\` : 高い (Oct 5)
  - \`hhc\` : 非常に高い (Oct 6)
  - ※ オクターブの切り替わり基準は \`c\` です。
- **臨時記号**: \`+\` (シャープ), \`-\` (フラット)
- **休符**: \`r\`
- **音価**: \`c4\`, \`c2\`, \`c1\`, \`c0.5\`, \`c1/3\` (三連符)
  - 音名と数字の間にスペースは不要です。音価を省略すると四分音符となります。

## 5. レイアウト
- \`nl\` : 次の小節から改行します。
- \`,\` : 小節内の区切り（任意）。`;

        try {
            contentDiv.innerHTML = marked.parse(helpMarkdown);
            this.helpLoaded = true;
        } catch (error) {
            console.error(error);
            contentDiv.innerHTML = `<p style="color:red">Error parsing help: ${error.message}</p>`;
        }
    }

    showAIComposerDialog() {
        const modal = document.getElementById('aiModal');
        const styleBtns = modal.querySelectorAll('.style-btn');
        const customInput = document.getElementById('customPrompt');
        const copyBtn = document.getElementById('btnCopyPrompt');
        const densityControl = document.getElementById('densityControl');
        const densitySlider = document.getElementById('noteDensitySlider');
        const densityValue = document.getElementById('noteDensityValue');

        modal.classList.remove('hidden');

        // Density slider label update
        const updateDensityLabel = (val) => {
            const labels = ['Very Low', 'Low', 'Medium', 'High', 'Very High'];
            densityValue.textContent = labels[val - 1];
        };

        densitySlider.oninput = (e) => updateDensityLabel(e.target.value);
        updateDensityLabel(densitySlider.value);


        // Reset state
        let selectedStyle = 'standard';
        styleBtns.forEach(btn => {
            btn.classList.remove('selected');
            if (btn.dataset.style === 'standard') btn.classList.add('selected');
        });

        // Style selection
        const updateVisibility = (style) => {
            if (style === 'bebop' || style === 'modal') {
                densityControl.classList.add('hidden');
            } else {
                densityControl.classList.remove('hidden');
            }
        };

        styleBtns.forEach(btn => {
            btn.replaceWith(btn.cloneNode(true)); // Clear old listeners
        });

        const newStyleBtns = modal.querySelectorAll('.style-btn');
        newStyleBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                newStyleBtns.forEach(b => b.classList.remove('selected'));
                e.target.classList.add('selected');
                selectedStyle = e.target.dataset.style;
                updateVisibility(selectedStyle);
            });
        });

        // Initial visibility check
        updateVisibility(selectedStyle);

        // Copy prompt button
        copyBtn.replaceWith(copyBtn.cloneNode(true)); // Clear old listeners
        const newCopyBtn = document.getElementById('btnCopyPrompt');
        newCopyBtn.addEventListener('click', () => {
            const customPrompt = modal.querySelector('#customPrompt').value.trim();
            const selectedKey = modal.querySelector('#keySelect').value;
            const density = parseInt(densitySlider.value);

            const styleToUse = customPrompt ? 'CUSTOM:' + customPrompt : selectedStyle;
            const prompt = this.buildGeminiPrompt(styleToUse, selectedKey, density);

            navigator.clipboard.writeText(prompt).then(() => {
                this.showToast('Prompt copied to clipboard!');
                modal.classList.add('hidden');
            }).catch(err => {
                console.error('Failed to copy:', err);
                this.showToast('Failed to copy. See console.');
                console.log(prompt);
            });
        });

        // Modal overlay click to close
        modal.onclick = (e) => {
            if (e.target === modal) modal.classList.add('hidden');
        };
    }

    // --- Forum UI Logic ---

    async shareToForum() {
        if (!this.forum) {
            this.showToast("Firebase not initialized");
            return;
        }

        const markup = this.markupInput.value;
        if (!markup.trim()) {
            this.showToast("Please enter some markup first");
            return;
        }

        const title = this.renderer.sheetMusic?.title || "Untitled";
        try {
            await this.forum.uploadSong(title, markup);
            this.showToast("Uploaded successfully!");
        } catch (error) {
            console.error(error);
            this.showToast("Upload failed: " + error.message);
        }
    }

    async showForumModal() {
        document.getElementById('forumModal').classList.remove('hidden');
        this.currentForumSort = this.currentForumSort || 'likes';
        this.loadAndRenderForum();
    }

    async loadAndRenderForum() {
        const loading = document.getElementById('forumLoading');
        const listContainer = document.getElementById('forumList');

        loading.classList.remove('hidden');
        listContainer.innerHTML = '';

        try {
            this.forumSongs = await this.forum.fetchSongs(this.currentForumSort, 'desc');
            this.renderForumList();
        } catch (error) {
            console.error(error);
            listContainer.innerHTML = `<p style="color:red; padding:20px;">Error loading forum: ${error.message}</p>`;
        } finally {
            loading.classList.add('hidden');
        }
    }

    renderForumList(searchQuery = '') {
        const listContainer = document.getElementById('forumList');
        const query = searchQuery.toLowerCase();

        const filtered = this.forumSongs.filter(song =>
            song.title.toLowerCase().includes(query) ||
            song.author.toLowerCase().includes(query)
        );

        if (filtered.length === 0) {
            listContainer.innerHTML = '<p style="padding:20px; text-align:center; color:#999;">No songs found</p>';
            return;
        }

        listContainer.innerHTML = filtered.map(song => `
            <div class="forum-item">
                <div class="song-info">
                    <h4>${song.title}</h4>
                    <p>by ${song.author} • ${song.likes} likes • ${song.videoCount} videos</p>
                </div>
                <div class="forum-actions">
                    <button class="action-btn" onclick="app.loadSongFromForum('${song.id}')">📂 Open</button>
                    <button class="action-btn" onclick="app.likeSong('${song.id}')">❤️ ${song.likes}</button>
                    <button class="action-btn" onclick="app.showVideos('${song.id}', '${song.title.replace(/'/g, "\\'")}')">🎥 ${song.videoCount}</button>
                    ${song.uuid === window.userUuid ? `<button class="action-btn" onclick="app.deleteSong('${song.id}', '${song.uuid}')">🗑️</button>` : ''}
                </div>
            </div>
        `).join('');
    }

    async loadSongFromForum(songId) {
        const song = this.forumSongs.find(s => s.id === songId);
        if (song) {
            this.markupInput.value = song.markup;
            this.parseAndRender();
            document.getElementById('forumModal').classList.add('hidden');
            this.showToast(`Loaded: ${song.title}`);
        }
    }

    async likeSong(songId) {
        try {
            await this.forum.likeSong(songId);
            this.showToast("Liked!");
            this.loadAndRenderForum(); // Refresh list
        } catch (error) {
            this.showToast(error.message);
        }
    }

    async deleteSong(songId, uuid) {
        if (!confirm("Delete this post from the forum?")) return;
        try {
            await this.forum.deleteSong(songId, uuid);
            this.showToast("Deleted");
            this.loadAndRenderForum();
        } catch (error) {
            this.showToast(error.message);
        }
    }

    async showVideos(songId, title) {
        const modal = document.getElementById('videoModal');
        const titleEl = document.getElementById('videoModalTitle');
        const listContainer = document.getElementById('videoList');
        const addBtn = document.getElementById('btnAddVideo');

        titleEl.textContent = `Videos for ${title}`;
        modal.classList.remove('hidden');
        listContainer.innerHTML = 'Loading videos...';

        addBtn.onclick = () => this.addVideoDialog(songId, title);

        try {
            const videos = await this.forum.fetchVideos(songId);
            if (videos.length === 0) {
                listContainer.innerHTML = '<p style="padding:10px; color:#999;">No videos added yet.</p>';
            } else {
                listContainer.innerHTML = videos.map(vid => `
                    <div class="video-item">
                        <span>${vid.title}</span>
                        <a href="${vid.youtubeUrl}" target="_blank" class="btn btn-small btn-secondary">▶ Watch</a>
                    </div>
                `).join('');
            }
        } catch (error) {
            listContainer.innerHTML = `<p style="color:red;">Error: ${error.message}</p>`;
        }
    }

    addVideoDialog(songId, songTitle) {
        const title = prompt("Video Title (e.g., My Cover):");
        if (!title) return;
        const url = prompt("YouTube URL:");
        if (!url) return;

        this.forum.addVideo(songId, title, url)
            .then(() => {
                this.showToast("Video added!");
                this.showVideos(songId, songTitle); // Refresh
            })
            .catch(err => this.showToast(err.message));
    }

    showToast(message) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 3000);
    }

    buildGeminiPrompt(style, key, density) {
        // This is a simplified version of AIComposer.java's buildPrompt
        const basePrompt = `You are a jazz auto-composition engine.

Follow the rules strictly and output only the lead sheet data.
This is about creation and composition. Avoid safe choices like using only long tones and only the root note—absolutely avoid that.

${this.getStyleBlock(style)}

${this.getDensityInstruction(style, density)}

FORMAT RULES:
- 1 line = 1 measure. Always break the line after each measure.
- Never insert extra line breaks inside a measure.
- Chords are written inside quotes, like "G7" or "Cm7".
- A single measure MAY contain multiple chord symbols if harmonically appropriate.
  (example:"Dm7"f0.5 g0.5 a0.5 b-0.5 "G7" b0.5 g0.5 f0.5 e-0.5)
- When multiple chords appear in one measure, they share the same 4-beat duration.
- Section labels are [A], [B], [C].
- Do NOT use barlines, nl, or any symbols other than those defined.

PITCH RULES:
- Allowed pitch names: lc, ld, le, lf, lg, la, lb, c, d, e, f, g, a, b, hc, hd, he, hf, hg, ha, hb
- Rest = r
- Sharp = +, Flat = -
- These are absolute pitch names. Always write accidentals explicitly.

IMPORTANT:
- Always compose the song in the specified key.
- Key = ${key}
- Do NOT use any accidentals unless they are chromatic approach tones or appropriate for the key.

DURATION RULES:
- After each pitch name (or rest "r"), write a numeric duration.
- Example: c0.5 g1 e-0.5 e1/3 g1/3 b-1/3 hd0.5 c+0.5
- Allowed durations: 0.5, 1, 2, 1/3
- IMPORTANT: The sum of durations in ONE measure MUST be exactly 4.

STRUCTURE RULES:
- Total length ≤ 48 measures.
- Form = AABA or ABAC.
- Each section normally 8 measures (max 12).

METADATA:
- title: (Generate a creative and evocative jazz song title)
- key: ${key}

OUTPUT:
- Output only the music data in the defined format.
- No explanations or comments.`;

        return basePrompt;
    }

    getStyleBlock(style) {
        if (style.startsWith('CUSTOM:')) {
            return 'STYLE: ' + style.substring(7);
        }

        const styles = {
            'bebop': `STYLE: BEBOP
- Texture: Rapid, flowing eighth-note and triplet runs interspersed with unexpected syncopated rests.
- Anticipation: Frequently target the chord tones (3, 5, 7) of the NEXT chord on the final upbeat before the change.
- Rhythmic Variety: Do NOT start every measure with a rest. Start phrases on varied beats (e.g., the 'and' of 1, beat 2, or beat 4) to break the 4/4 grid.
- Surprise: Use asymmetrical phrase lengths. A mix of short motifs and long, driving lines is essential for a true bebop feel.`,

            'hardbop': `STYLE: HARD BOP
- Use blues vocabulary, blue notes, and minor pentatonic ideas.
- Choose chords based on melody tones, not diatonic function.
- Allow chromaticism but keep the phrasing soulful and strong.`,

            'contemporary': `STYLE: CONTEMPORARY
- Use slash chords and modern harmonic colors.
- Melody may use wide intervals.
- Allow modal interchange and non-functional harmony.
- Avoid constant motion; silence and sustain are part of the melody.`,

            'modal': `STYLE: MODAL JAZZ
- Melody should be built primarily from the diatonic scale of the current mode.
- Do not emphasize functional harmony.
- Stay in one mode for multiple bars.
- Use long, flowing melodic lines with minimal chromaticism.`,

            'standard': `STYLE: STANDARD
- Use typical jazz standard phrasing.
- Rhythm is mainly quarter and eighth notes.
- Use thirds and sevenths frequently in the melody.
- Use II-V-I progressions frequently.`
        };

        return styles[style] || styles['standard'];
    }

    getDensityInstruction(style, density) {
        // Bebop and Modal have fixed densities
        if (style === 'bebop' || style.includes('BEBOP')) return "";
        if (style === 'modal' || style.includes('MODAL')) return "";
        if (style.startsWith('CUSTOM:')) return ""; // Custom prompts might define their own

        // Density 1-5
        /*
         1: Very Low (Long tones, spacious)
         2: Low
         3: Medium
         4: High
         5: Very High (Fine notes)
        */

        if (density <= 1) {
            return `DENSITY: VERY LOW (Long Tones & Space)
- Use primarily half notes and whole notes.
- CRITICAL: Do NOT be monotonic. Avoid a string of just whole notes.
- Make the melody lyrical and "singable".
- Use rhythmic displacement (tying over bar lines) to make long notes interesting.
- Think of a slow ballad or a spacious Miles Davis approach (but not modal).`;
        } else if (density === 2) {
            return `DENSITY: LOW (Spacious)
- Favor longer durations.
- Use space (rests) effectively to let the melody breathe.
- Avoid fast runs.
- Focus on emotional weight of each note.`;
        } else if (density === 4) {
            return `DENSITY: HIGH (Active)
- Use fine rhythmic values (eighths, triplet 8ths).
- Create movement and energy.
- Avoid long sustains unless at the end of a phrase.`;
        } else if (density >= 5) {
            return `DENSITY: VERY HIGH (Virtuosic)
- Very active melody with 16th notes and complex runs.
- High energy and technical.
- Minimal rests.`;
        }

        // Density 3 (Medium) is default, no special instruction needed or just standard
        return `DENSITY: MEDIUM
- Balance between active lines and resting points.`;
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new LeadSheetApp();
});
