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
        let markup = this.markupInput.value;

        if (!markup.trim()) {
            // Clear canvas if empty
            this.renderer.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.renderer.ctx.fillStyle = '#ffffff';
            this.renderer.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            return;
        }

        if (typeof ABCConverter !== 'undefined' && ABCConverter.isABCNotation(markup)) {
            const converted = ABCConverter.convert(markup);
            this.markupInput.value = converted;
            markup = converted;
            this.showToast('ABC notation converted to markup!');
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
        const styleInstruction = style.startsWith('CUSTOM:') ? style.substring(7) : this.getStyleBlock(style);
        const densityInstruction = this.getDensityInstruction(style, density);

        return `You are a jazz composition engine.
Compose a creative, authentic jazz lead sheet in standard ABC notation.

Key: ${key}
${styleInstruction}
${densityInstruction ? 'Density: ' + densityInstruction : ''}

ABC NOTATION RULES:
- Include tags: T: [Evocative Title], K: ${key}, M: 4/4, L: 1/8.
- Chords in quotes before notes (e.g., "Dm7" D2 F2 "G7" B2 G2 | "Cmaj7" E4 z4 |).
- Ensure 8 eighth notes (or equivalent) per 4/4 bar.
- Length: 16 to 32 measures (AABA or ABAC).
- Use syncopation, rests (z), triplets (3, and chromatic approach tones.
- Output ONLY raw ABC notation code (no markdown \`\`\`, no explanations).`;
    }

    getStyleBlock(style) {
        switch (style) {
            case 'bebop':
                return `Style: BEBOP
- Fast, dense eighth-note lines with chromatic enclosures, approach tones, and arpeggiated extensions.
- Rapid II-V-I harmonic changes with altered dominants (b9, #9, b5, #5).`;
            case 'hardbop':
                return `Style: HARD BOP
- Soulful blues vocabulary, minor pentatonic phrases, and catchy, energetic rhythm motifs.
- Rich chord voicings with modal and bluesy color tones.`;
            case 'contemporary':
                return `Style: CONTEMPORARY JAZZ
- Modern non-functional harmony, slash chords (e.g. C/D, F#m/B), wide melodic leaps, and asymmetrical rhythms.
- Dynamic space, silence, and expressive extended harmonies.`;
            case 'modal':
                return `Style: MODAL JAZZ
- Spacious, floating melodies focusing on scale degrees, 9ths, 11ths, and 13ths over long modal chord stays.
- Minimal chromaticism; emphasis on repetition with subtle rhythmic variation.`;
            default:
                return `Style: JAZZ STANDARD
- Classic swing phrasing with lyrical melody, clear II-V-I cadences, and elegant voice leading.`;
        }
    }

    getDensityInstruction(style, density) {
        if (style === 'bebop' || style === 'modal') return "";
        
        if (density <= 1) return "Very Low (mainly half and whole notes)";
        if (density === 2) return "Low (spacious, let melody breathe)";
        if (density === 4) return "High (active, many eighth notes)";
        if (density >= 5) return "Very High (virtuosic, fast runs, sixteenth notes)";
        return "Medium (balanced active lines and rests)";
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new LeadSheetApp();
});
