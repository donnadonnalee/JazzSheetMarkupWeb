/**
 * Main Application Controller
 * Connects LeadSheetParser, LeadSheetRenderer, and AudioPlayer.
 */

// Default lead sheet: Danny Boy with 3 variations (Trad, Jazz Ballad, Jazz Swing)
const DEFAULT_ABC = `X:1
T: Danny Boy
T: Trad
G: sample, traditional, ballad, swing
L:1/4
Q: 1/4=116
K: G
"N.C" FGA |
|:"G" B3A |"G" BedB | "CM" A G E2 |"CM" zGBc |
"G"d3e |"Em" dBGB | "Am"A4 |"D7" z FGA |
"G"B3 A |"G"Be dB | "CM"AG E2 |"Cm" z F G A |
"G"B3c |"CM" BA "D7"GA |"G"G4 |"D7"z d e f |
"G"g3 f |"C" fe de |"G"d B G2 |"G" zdef | 
"G"g3  f |"C" fe dB | "Am"A4 |"D7"zded |
"G" b3 a |"C" ag eg |"G"dB G2 |"C" z FGA | 
"G"Be dB |"C"AG EF | "G"G4 |"G"z4 :|]

X:2
T: Danny Boy
T: Jazz Ballad
L:1/4
Q: 1/4=116
K: G
"N.C" FGA |
|:"G" B3A |"G7/F" BedB | "CM" A G E2 |"Cm" zGBc |
"G"d2- "F#m7b5" de |"Em7" dB "A7"GB | "Am7"A4 |"D7" z FGA |
"G"B3 A |"G7/F"Be dB | "CM"AG E2 |"Cm" z F G A |
"G"B2- "Em" Bc |"Am7" BA "D7"GA |"G"G2- "CM"G2 |"Am7"z d "D7"e f |
"G"g3 f |"CM" fe de |"G"d B "CM" G2 | "F#m7b5"zd"B7"ef | 
"Em"g3  f |"A7" fe dB | "Am7"A4 |"D7"zded |
"G7" b2- "F7"ba |"C" ag "C#o"eg |"D7"dB "B7/D#"G2 |"Em" z FGA | 
"G"Be "Em7"dB |"Am7"AG "D7" EF | "G"G2- "CM"G2 |"G"z4 :|]

X:3
T: Danny Boy
T: Jazz Swing
L: 1/8
Q: 1/4=90
K: G
"N.C." FGA |
|: "Gmaj7" B3A BedB | "Cmaj7" A G E2 "Cm6" zGBc | "G/B" d3e "Bbdim7" dBGB | "Am7" A4 "D7" z FGA |
"Gmaj7" B3 A "G7/F" Be dB | "Cmaj7/E" AG E2 "Cm6/Eb" z F G A | "G/D" B3c "D7" BAGA | "G6" G4 "D7" z d e f |
"G" g3 f "CM"fe de | "G" d B G2 "CM"zdef | "Bm7" g3 f "E7" fe dB | "Am7" A4 "D7" zded |
"G" b3 a "CM"ag eg | "Bm7" dB G2 "Bb7" z FGA | "Am7" Be dB "Ab7" AGEF | "G6" G4 "D7" z4 :|]`;

class AppController {
    constructor() {
        this.parser = LeadSheetParser;
        this.renderer = null;
        this.player = new AudioPlayer();
        this.forum = null;

        this.currentSheet = null;
        this.semitoneShift = 0;
        this.originalAbc = "";
        this.debounceTimer = null;
        this.forumSongs = [];
        this.currentForumSort = "likes";

        // Multi-Tune / Version state
        this.currentTunes = [];
        this.currentTuneIndex = 0;
        this.isSwitchingTune = false;

        // Forum tracking state
        this.loadedForumSongId = null;
        this.loadedForumSongTitle = "";

        this.initDOMElements();
        this.initRenderer();
        this.initPlayerCallbacks();
        this.initForum();
        this.bindEvents();
        this.bindResizerEvents();

        // Default rhythm feel: Swing
        this.player.setRhythmFeel(AudioPlayer.RHYTHM_SWING);

        // Load Danny Boy with all 3 versions as default
        this.loadDefaultSong();
    }

    initForum() {
        if (typeof Forum !== 'undefined' && window.db && window.userUuid) {
            this.forum = new Forum(window.db, window.userUuid);
        } else {
            console.warn("Forum or Firebase not ready yet.");
        }
    }

    initDOMElements() {
        this.el = {
            abcInput: document.getElementById("abcInput"),
            canvas: document.getElementById("sheetCanvas"),
            canvasContainer: document.getElementById("canvasContainer"),
            editorPane: document.querySelector(".editor-pane"),
            dragResizer: document.getElementById("dragResizer"),
            btnTransposeDown: document.getElementById("btnTransposeDown"),
            btnTransposeUp: document.getElementById("btnTransposeUp"),
            transposeDisplay: document.getElementById("transposeDisplay"),
            btnToggleL: document.getElementById("btnToggleL"),
            btnThemeToggle: document.getElementById("btnThemeToggle"),
            btnCopy: document.getElementById("btnCopy"),
            btnClear: document.getElementById("btnClear"),
            viewBalanceSelect: document.getElementById("viewBalanceSelect"),
            btnPlay: document.getElementById("btnPlay"),
            btnStop: document.getElementById("btnStop"),
            btnLoop: document.getElementById("btnLoop"),
            bpmSlider: document.getElementById("bpmSlider"),
            bpmInput: document.getElementById("bpmInput"),
            rhythmFeelGroup: document.getElementById("rhythmFeelGroup"),
            volMelody: document.getElementById("volMelody"),
            volChords: document.getElementById("volChords"),
            volBass: document.getElementById("volBass"),
            workspace: document.querySelector(".workspace"),
            btnToggleEditor: document.getElementById("btnToggleEditor"),
            btnZenMode: document.getElementById("btnZenMode"),
            zenToolbar: document.getElementById("zenToolbar"),
            zenBtnPlay: document.getElementById("zenBtnPlay"),
            zenBtnStop: document.getElementById("zenBtnStop"),
            zenBtnTransposeDown: document.getElementById("zenBtnTransposeDown"),
            zenBtnTransposeUp: document.getElementById("zenBtnTransposeUp"),
            zenTransposeDisplay: document.getElementById("zenTransposeDisplay"),
            zenViewBalanceSelect: document.getElementById("zenViewBalanceSelect"),
            zenBtnExit: document.getElementById("zenBtnExit"),
            btnExportWav: document.getElementById("btnExportWav"),
            // Forum Elements
            btnForum: document.getElementById("btnForum"),
            btnShareForum: document.getElementById("btnShareForum"),
            zenBtnForum: document.getElementById("zenBtnForum"),
            forumModal: document.getElementById("forumModal"),
            btnCloseForum: document.getElementById("btnCloseForum"),
            forumSearch: document.getElementById("forumSearch"),
            btnSortPopular: document.getElementById("btnSortPopular"),
            btnSortLatest: document.getElementById("btnSortLatest"),
            btnOpenPostModal: document.getElementById("btnOpenPostModal"),
            forumLoading: document.getElementById("forumLoading"),
            forumList: document.getElementById("forumList"),
            postModal: document.getElementById("postModal"),
            btnClosePost: document.getElementById("btnClosePost"),
            btnCancelPost: document.getElementById("btnCancelPost"),
            btnSubmitPost: document.getElementById("btnSubmitPost"),
            btnOverwritePost: document.getElementById("btnOverwritePost"),
            postTitle: document.getElementById("postTitle"),
            postAuthor: document.getElementById("postAuthor"),
            postAllVersionsGroup: document.getElementById("postAllVersionsGroup"),
            postAllVersions: document.getElementById("postAllVersions"),
            videoModal: document.getElementById("videoModal"),
            btnCloseVideo: document.getElementById("btnCloseVideo"),
            videoModalTitle: document.getElementById("videoModalTitle"),
            btnAddVideo: document.getElementById("btnAddVideo"),
            videoList: document.getElementById("videoList"),
            toast: document.getElementById("toast"),
            // Version Tabs Elements
            versionTabBar: document.getElementById("versionTabBar"),
            versionTabsContainer: document.getElementById("versionTabsContainer"),
            btnAddVersion: document.getElementById("btnAddVersion")
        };
    }

    initRenderer() {
        this.renderer = new LeadSheetRenderer(this.el.canvas);
    }

    initPlayerCallbacks() {
        this.player.onPlaybackStateChanged = (isPlaying) => {
            if (isPlaying) {
                this.el.btnPlay.textContent = "⏸";
                this.el.btnPlay.classList.add("playing");
                if (this.el.zenBtnPlay) {
                    this.el.zenBtnPlay.textContent = "⏸ Pause";
                    this.el.zenBtnPlay.classList.add("playing");
                }
            } else {
                this.el.btnPlay.textContent = "▶";
                this.el.btnPlay.classList.remove("playing");
                if (this.el.zenBtnPlay) {
                    this.el.zenBtnPlay.textContent = "▶ Play";
                    this.el.zenBtnPlay.classList.remove("playing");
                }
                this.renderer.setPlaybackMeasure(null);
                this.renderer.setPlaybackHighlightedElement(null);
            }
        };

        this.player.onMeasurePlayback = (seqIdx, measure) => {
            this.renderer.setPlaybackMeasure(measure);
        };

        this.player.onElementPlayback = (seqIdx, measure, element, sourcePos) => {
            this.renderer.setPlaybackHighlightedElement(element);
        };

        this.player.onPlaybackStopped = () => {
            this.renderer.setPlaybackMeasure(null);
            this.renderer.setPlaybackHighlightedElement(null);
        };
    }

    bindEvents() {
        // ABC Text Editor input with debouncing
        this.el.abcInput.addEventListener("input", () => {
            if (this.isSwitchingTune) return;
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                const currentText = this.el.abcInput.value;
                const detectedTunes = MultiTuneHelper.splitTunes(currentText);

                // If user pasted or typed multiple tunes, expand into tabs immediately!
                if (detectedTunes.length > 1) {
                    this.loadFullSong(currentText);
                    return;
                }

                if (this.currentTuneIndex >= 0 && this.currentTuneIndex < this.currentTunes.length) {
                    this.currentTunes[this.currentTuneIndex].content = currentText;
                    MultiTuneHelper.refreshTuneMetadata(this.currentTunes[this.currentTuneIndex]);
                    this.updateCurrentTabTitle();
                }

                this.originalAbc = currentText;
                this.semitoneShift = 0;
                this.updateTransposeDisplay();
                this.reparseAndRender();
            }, 120);
        });

        // Instant Paste handler: detects multi-tune document immediately on Ctrl+V
        this.el.abcInput.addEventListener("paste", () => {
            setTimeout(() => {
                const currentText = this.el.abcInput.value;
                const detectedTunes = MultiTuneHelper.splitTunes(currentText);
                if (detectedTunes.length > 1) {
                    this.loadFullSong(currentText);
                    this.showToast(`Separated into ${detectedTunes.length} version tabs`);
                }
            }, 40);
        });

        // Version Tabs add button
        if (this.el.btnAddVersion) {
            this.el.btnAddVersion.addEventListener("click", () => this.addNewVersionDialog());
        }

        // Transpose buttons
        this.el.btnTransposeDown.addEventListener("click", () => this.shiftKey(-1));
        this.el.btnTransposeUp.addEventListener("click", () => this.shiftKey(1));

        // Forum Modal Buttons
        if (this.el.btnForum) {
            this.el.btnForum.addEventListener("click", () => this.showForumModal());
        }
        if (this.el.zenBtnForum) {
            this.el.zenBtnForum.addEventListener("click", () => this.showForumModal());
        }
        if (this.el.btnShareForum) {
            this.el.btnShareForum.addEventListener("click", () => this.showPostModal());
        }
        if (this.el.btnCloseForum) {
            this.el.btnCloseForum.addEventListener("click", () => {
                this.el.forumModal.classList.add("hidden");
            });
        }
        if (this.el.forumSearch) {
            this.el.forumSearch.addEventListener("input", (e) => {
                this.renderForumList(e.target.value);
            });
        }
        if (this.el.btnSortPopular) {
            this.el.btnSortPopular.addEventListener("click", () => {
                this.currentForumSort = "likes";
                this.el.btnSortPopular.classList.add("btn-active");
                if (this.el.btnSortLatest) this.el.btnSortLatest.classList.remove("btn-active");
                this.loadAndRenderForum();
            });
        }
        if (this.el.btnSortLatest) {
            this.el.btnSortLatest.addEventListener("click", () => {
                this.currentForumSort = "timestamp";
                this.el.btnSortLatest.classList.add("btn-active");
                if (this.el.btnSortPopular) this.el.btnSortPopular.classList.remove("btn-active");
                this.loadAndRenderForum();
            });
        }
        if (this.el.btnOpenPostModal) {
            this.el.btnOpenPostModal.addEventListener("click", () => {
                this.showPostModal();
            });
        }

        // Post Sheet Modal Buttons
        if (this.el.btnClosePost) {
            this.el.btnClosePost.addEventListener("click", () => this.hidePostModal());
        }
        if (this.el.btnCancelPost) {
            this.el.btnCancelPost.addEventListener("click", () => this.hidePostModal());
        }
        if (this.el.btnSubmitPost) {
            this.el.btnSubmitPost.addEventListener("click", () => this.submitPost(false));
        }
        if (this.el.btnOverwritePost) {
            this.el.btnOverwritePost.addEventListener("click", () => this.submitPost(true));
        }

        // Video Modal Buttons
        if (this.el.btnCloseVideo) {
            this.el.btnCloseVideo.addEventListener("click", () => {
                this.el.videoModal.classList.add("hidden");
            });
        }

        // Toggle L: 1/8 ⇔ L: 1/4
        this.el.btnToggleL.addEventListener("click", () => {
            const currentText = this.el.abcInput.value;
            const converted = ABCConverter.toggleUnitNoteLength(currentText);
            this.el.abcInput.value = converted;
            this.originalAbc = converted;
            this.reparseAndRender();
        });

        // Dark/Light Theme
        this.el.btnThemeToggle.addEventListener("click", () => {
            const isDark = document.body.classList.toggle("dark-theme");
            this.el.btnThemeToggle.textContent = isDark ? "☀️" : "🌙";
            this.renderer.setDarkMode(isDark);
        });

        // Copy button (copies full multi-tune document if multiple versions exist)
        this.el.btnCopy.addEventListener("click", () => {
            if (this.currentTuneIndex >= 0 && this.currentTuneIndex < this.currentTunes.length) {
                this.currentTunes[this.currentTuneIndex].content = this.el.abcInput.value;
            }
            const fullText = (this.currentTunes.length > 1)
                ? MultiTuneHelper.combineTunes(this.currentTunes)
                : this.el.abcInput.value;

            navigator.clipboard.writeText(fullText).then(() => {
                const prev = this.el.btnCopy.textContent;
                this.el.btnCopy.textContent = "Copied!";
                setTimeout(() => this.el.btnCopy.textContent = prev, 1200);
            });
        });

        // Clear button
        this.el.btnClear.addEventListener("click", () => {
            if (confirm("Clear current version editor content?")) {
                this.el.abcInput.value = "";
                this.originalAbc = "";
                if (this.currentTuneIndex >= 0 && this.currentTuneIndex < this.currentTunes.length) {
                    this.currentTunes[this.currentTuneIndex].content = "";
                    MultiTuneHelper.refreshTuneMetadata(this.currentTunes[this.currentTuneIndex]);
                    this.updateCurrentTabTitle();
                }
                this.semitoneShift = 0;
                this.updateTransposeDisplay();
                this.reparseAndRender();
            }
        });

        // Editor Toggle (Session mode vs Edit mode)
        if (this.el.btnToggleEditor) {
            this.el.btnToggleEditor.addEventListener("click", () => {
                const isHidden = this.el.workspace.classList.toggle("editor-hidden");
                this.el.btnToggleEditor.textContent = isHidden ? "📝 Edit Mode" : "📄 Sheet Only";
                this.el.btnToggleEditor.classList.toggle("active", isHidden);
                setTimeout(() => {
                    this.renderer.render();
                }, 220);
            });
        }

        // Fullscreen Session (Zen Mode) Toggle
        if (this.el.btnZenMode) {
            this.el.btnZenMode.addEventListener("click", () => this.toggleZenMode());
        }
        if (this.el.zenBtnExit) {
            this.el.zenBtnExit.addEventListener("click", () => this.toggleZenMode(false));
        }
        if (this.el.zenBtnPlay) {
            this.el.zenBtnPlay.addEventListener("click", () => {
                if (this.player.isPlaying) {
                    this.player.stop();
                } else {
                    if (!this.currentSheet) this.reparseAndRender();
                    this.player.play(this.currentSheet);
                }
            });
        }
        if (this.el.zenBtnStop) {
            this.el.zenBtnStop.addEventListener("click", () => this.player.stop());
        }
        if (this.el.zenBtnTransposeDown) {
            this.el.zenBtnTransposeDown.addEventListener("click", () => this.shiftKey(-1));
        }
        if (this.el.zenBtnTransposeUp) {
            this.el.zenBtnTransposeUp.addEventListener("click", () => this.shiftKey(1));
        }

        // View Balance level synchronization
        this.el.viewBalanceSelect.addEventListener("change", (e) => {
            const val = e.target.value;
            if (this.el.zenViewBalanceSelect) this.el.zenViewBalanceSelect.value = val;
            this.renderer.setViewBalance(parseInt(val, 10));
        });
        if (this.el.zenViewBalanceSelect) {
            this.el.zenViewBalanceSelect.addEventListener("change", (e) => {
                const val = e.target.value;
                this.el.viewBalanceSelect.value = val;
                this.renderer.setViewBalance(parseInt(val, 10));
            });
        }

        // Keyboard shortcuts: Esc for Zen Mode Exit
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && document.body.classList.contains("zen-mode")) {
                this.toggleZenMode(false);
            }
        });

        // Playback controls
        this.el.btnPlay.addEventListener("click", () => {
            if (this.player.isPlaying) {
                this.player.stop();
            } else {
                if (!this.currentSheet) this.reparseAndRender();
                this.player.play(this.currentSheet);
            }
        });

        this.el.btnStop.addEventListener("click", () => {
            this.player.stop();
        });

        this.el.btnLoop.addEventListener("click", () => {
            const isLoop = !this.player.isLooping;
            this.player.setLooping(isLoop);
            this.el.btnLoop.classList.toggle("active", isLoop);
        });

        // BPM slider and input
        const syncBpm = (val) => {
            const bpm = Math.max(20, Math.min(320, parseInt(val, 10) || 120));
            this.el.bpmSlider.value = bpm;
            this.el.bpmInput.value = bpm;
            this.player.setBpm(bpm);
        };
        this.el.bpmSlider.addEventListener("input", (e) => syncBpm(e.target.value));
        this.el.bpmInput.addEventListener("change", (e) => syncBpm(e.target.value));

        // Rhythm feel (Even, Swing, Shuffle)
        const feelButtons = this.el.rhythmFeelGroup.querySelectorAll(".btn-segment");
        feelButtons.forEach((btn) => {
            btn.addEventListener("click", () => {
                feelButtons.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                const feel = parseInt(btn.getAttribute("data-feel"), 10);
                this.player.setRhythmFeel(feel);
                if (this.player.isPlaying) {
                    this.player.stop();
                    this.player.play(this.currentSheet);
                }
            });
        });

        // Volume mixing
        const updateVolumes = () => {
            this.player.setVolumes(
                parseFloat(this.el.volMelody.value),
                parseFloat(this.el.volChords.value),
                parseFloat(this.el.volBass.value)
            );
        };
        this.el.volMelody.addEventListener("input", updateVolumes);
        this.el.volChords.addEventListener("input", updateVolumes);
        this.el.volBass.addEventListener("input", updateVolumes);

        // WAV Export
        this.el.btnExportWav.addEventListener("click", () => {
            if (!this.currentSheet) this.reparseAndRender();
            const title = (this.currentSheet.title || "leadsheet").replace(/[^a-zA-Z0-9_-]/g, "_");
            this.player.exportToWav(this.currentSheet, `${title}.wav`);
        });

        // Window resize
        window.addEventListener("resize", () => {
            if (this.renderer && this.currentSheet) {
                this.renderer.render();
            }
        });
    }

    toggleZenMode(forceState) {
        const isZen = forceState !== undefined
            ? document.body.classList.toggle("zen-mode", forceState)
            : document.body.classList.toggle("zen-mode");
        if (this.el.btnZenMode) {
            this.el.btnZenMode.textContent = isZen ? "✕ Exit Zen" : "🖥️ Fullscreen";
        }
        setTimeout(() => {
            if (this.renderer && this.currentSheet) {
                this.renderer.render();
            }
        }, 120);
    }

    loadDefaultSong() {
        this.player.stop();
        this.loadedForumSongId = null;
        this.loadedForumSongTitle = "";
        this.loadFullSong(DEFAULT_ABC);
    }

    loadFullSong(fullMarkup) {
        if (!fullMarkup) fullMarkup = "";
        this.currentTunes = MultiTuneHelper.splitTunes(fullMarkup);
        if (this.currentTunes.length === 0) {
            this.currentTunes.push(new Tune(1, "", "", ""));
        }
        this.currentTuneIndex = 0;
        this.updateTuneTabsUI();
        this.loadCurrentTuneToEditor();
    }

    loadCurrentTuneToEditor() {
        if (this.currentTunes.length === 0) {
            this.currentTunes.push(new Tune(1, "", "", ""));
        }
        if (this.currentTuneIndex < 0 || this.currentTuneIndex >= this.currentTunes.length) {
            this.currentTuneIndex = 0;
        }
        this.isSwitchingTune = true;
        const tune = this.currentTunes[this.currentTuneIndex];
        this.originalAbc = tune.content || "";
        this.el.abcInput.value = tune.content || "";
        this.semitoneShift = 0;
        this.updateTransposeDisplay();
        this.reparseAndRender();
        this.isSwitchingTune = false;
    }

    updateTuneTabsUI() {
        if (!this.el.versionTabsContainer) return;
        this.el.versionTabsContainer.innerHTML = "";

        const showCloseBtn = this.currentTunes.length > 1;

        this.currentTunes.forEach((tune, idx) => {
            const tabEl = document.createElement("div");
            tabEl.className = `version-tab ${idx === this.currentTuneIndex ? "active" : ""}`;
            tabEl.setAttribute("role", "button");
            tabEl.setAttribute("tabindex", "0");
            const name = tune.getDisplayName(idx);

            tabEl.innerHTML = `
                <span class="tab-badge">X:${tune.x || (idx + 1)}</span>
                <span class="tab-title-text">${this.escapeHtml(name)}</span>
                ${showCloseBtn ? `<span class="btn-tab-close" role="button" title="Delete version" data-idx="${idx}">&times;</span>` : ''}
            `;
            tabEl.title = `Version ${tune.x || (idx + 1)}: ${name}\nClick to switch | Double-click to rename`;

            const closeBtn = tabEl.querySelector(".btn-tab-close");
            if (closeBtn) {
                closeBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    this.deleteVersion(idx);
                });
            }

            tabEl.addEventListener("click", (e) => {
                if (e.target.closest(".btn-tab-close")) return;
                if (idx === this.currentTuneIndex) return;
                // Save current editor content to current tune
                if (this.currentTuneIndex >= 0 && this.currentTuneIndex < this.currentTunes.length) {
                    this.currentTunes[this.currentTuneIndex].content = this.el.abcInput.value;
                    MultiTuneHelper.refreshTuneMetadata(this.currentTunes[this.currentTuneIndex]);
                }
                this.currentTuneIndex = idx;
                this.updateTuneTabsActiveState();
                this.loadCurrentTuneToEditor();
            });

            tabEl.addEventListener("dblclick", (e) => {
                if (e.target.closest(".btn-tab-close")) return;
                e.stopPropagation();
                this.renameVersionDialog(idx);
            });

            tabEl.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                this.showVersionContextMenu(idx, e);
            });

            this.el.versionTabsContainer.appendChild(tabEl);
        });
    }

    deleteVersion(index) {
        if (this.currentTunes.length <= 1) {
            this.showToast("Cannot delete the only version");
            return;
        }
        const tune = this.currentTunes[index];
        const name = tune ? tune.getDisplayName(index) : `Ver.${index + 1}`;

        this.showConfirmModal("Delete Version", `Are you sure you want to delete 「${name}」?`, () => {
            this.currentTunes.splice(index, 1);
            MultiTuneHelper.reindexTunes(this.currentTunes);

            if (this.currentTuneIndex >= this.currentTunes.length) {
                this.currentTuneIndex = this.currentTunes.length - 1;
            } else if (this.currentTuneIndex === index) {
                this.currentTuneIndex = Math.max(0, index - 1);
            } else if (this.currentTuneIndex > index) {
                this.currentTuneIndex--;
            }

            this.updateTuneTabsUI();
            this.loadCurrentTuneToEditor();
            this.showToast(`Deleted version: ${name}`);
        });
    }

    showConfirmModal(title, message, onConfirm) {
        let modal = document.getElementById("confirmModal");
        if (!modal) {
            modal = document.createElement("div");
            modal.id = "confirmModal";
            modal.className = "modal-overlay hidden";
            modal.innerHTML = `
                <div class="modal-card modal-card-sm" style="max-width: 380px; text-align: center; border-radius: 12px; overflow: hidden;">
                    <div class="modal-header" style="justify-content: center; background: #b91c1c;">
                        <h2 id="confirmModalTitle" style="font-size: 1.05rem; margin: 0; color: #fff;"></h2>
                    </div>
                    <div style="padding: 1.5rem; background: var(--bg-surface);">
                        <p id="confirmModalMessage" style="color: var(--text-primary); margin: 0 0 1.5rem; line-height: 1.5; font-size: 0.95rem;"></p>
                        <div style="display: flex; gap: 0.75rem; justify-content: center;">
                            <button id="btnConfirmCancel" class="btn btn-secondary" style="flex: 1; padding: 0.55rem 1rem;">Cancel</button>
                            <button id="btnConfirmOk" class="btn btn-danger" style="flex: 1; padding: 0.55rem 1rem; background: #ef4444; color: #ffffff; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">Delete</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        document.getElementById("confirmModalTitle").textContent = title;
        document.getElementById("confirmModalMessage").textContent = message;
        modal.classList.remove("hidden");

        const btnCancel = document.getElementById("btnConfirmCancel");
        const btnOk = document.getElementById("btnConfirmOk");

        const cleanup = () => {
            modal.classList.add("hidden");
            btnCancel.onclick = null;
            btnOk.onclick = null;
        };

        btnCancel.onclick = () => cleanup();
        btnOk.onclick = () => {
            cleanup();
            if (typeof onConfirm === "function") onConfirm();
        };
    }

    showVersionContextMenu(index, e) {
        const tune = this.currentTunes[index];
        const name = tune ? tune.getDisplayName(index) : `Ver.${index + 1}`;
        const canDelete = this.currentTunes.length > 1;

        const choice = prompt(
            `Version Options: "${name}"\n\n1: Rename\n2: Duplicate\n${canDelete ? '3: Delete\n' : ''}\nEnter option number (1-3):`,
            "1"
        );
        if (choice === "1") {
            this.renameVersionDialog(index);
        } else if (choice === "2") {
            const nextX = this.currentTunes.length + 1;
            const newTune = MultiTuneHelper.createDuplicateTune(tune, `${name} (Copy)`, nextX);
            this.currentTunes.push(newTune);
            this.currentTuneIndex = this.currentTunes.length - 1;
            this.updateTuneTabsUI();
            this.loadCurrentTuneToEditor();
            this.showToast(`Duplicated: ${name}`);
        } else if (choice === "3" && canDelete) {
            this.deleteVersion(index);
        }
    }

    updateTuneTabsActiveState() {
        if (!this.el.versionTabsContainer) return;
        const tabs = this.el.versionTabsContainer.querySelectorAll(".version-tab");
        tabs.forEach((tab, i) => {
            tab.classList.toggle("active", i === this.currentTuneIndex);
        });
    }

    updateCurrentTabTitle() {
        if (!this.el.versionTabsContainer || this.currentTuneIndex < 0 || this.currentTuneIndex >= this.currentTunes.length) return;
        const tabs = this.el.versionTabsContainer.querySelectorAll(".version-tab");
        const curTab = tabs[this.currentTuneIndex];
        if (curTab) {
            const tune = this.currentTunes[this.currentTuneIndex];
            const name = tune.getDisplayName(this.currentTuneIndex);
            const titleEl = curTab.querySelector(".tab-title-text");
            if (titleEl) {
                titleEl.textContent = name;
            }
            const badge = curTab.querySelector(".tab-badge");
            if (badge) {
                badge.textContent = `X:${tune.x || (this.currentTuneIndex + 1)}`;
            }
        }
    }

    addNewVersionDialog() {
        const title = prompt("New Version / Variation Name (e.g. Jazz Ballad, Swing, Solo):");
        if (title === null) return;
        const trimmed = title.trim() || `Ver.${this.currentTunes.length + 1}`;

        // Save current editor text
        if (this.currentTuneIndex >= 0 && this.currentTuneIndex < this.currentTunes.length) {
            this.currentTunes[this.currentTuneIndex].content = this.el.abcInput.value;
            MultiTuneHelper.refreshTuneMetadata(this.currentTunes[this.currentTuneIndex]);
        }

        const srcTune = this.currentTunes[this.currentTuneIndex];
        const nextX = this.currentTunes.length + 1;
        const newTune = MultiTuneHelper.createDuplicateTune(srcTune, trimmed, nextX);

        this.currentTunes.push(newTune);
        this.currentTuneIndex = this.currentTunes.length - 1;
        this.updateTuneTabsUI();
        this.loadCurrentTuneToEditor();
        this.showToast(`Created version: ${trimmed}`);
    }

    renameVersionDialog(index) {
        if (index < 0 || index >= this.currentTunes.length) return;
        const tune = this.currentTunes[index];
        const currentName = tune.getDisplayName(index);
        const newName = prompt("Rename Version Name:", currentName);
        if (newName === null) return;
        const trimmed = newName.trim();
        if (!trimmed) return;

        MultiTuneHelper.updateTuneSubtitle(tune, trimmed);
        if (index === this.currentTuneIndex) {
            this.el.abcInput.value = tune.content;
            this.originalAbc = tune.content;
            this.reparseAndRender();
        }
        this.updateTuneTabsUI();
        this.showToast(`Renamed to ${trimmed}`);
    }

    // Forum Functions
    async showForumModal() {
        if (!this.forum) this.initForum();
        if (this.el.forumModal) {
            this.el.forumModal.classList.remove("hidden");
            if (this.el.forumSearch) this.el.forumSearch.value = "";
            await this.loadAndRenderForum();
        }
    }

    async loadAndRenderForum() {
        if (!this.forum) {
            if (this.el.forumList) {
                this.el.forumList.innerHTML = `<p style="padding:20px; text-align:center; color:#ef4444;">Firebase is not initialized.</p>`;
            }
            return;
        }

        if (this.el.forumLoading) this.el.forumLoading.classList.remove("hidden");
        if (this.el.forumList) this.el.forumList.innerHTML = "";

        try {
            this.forumSongs = await this.forum.fetchSongs(this.currentForumSort, "desc");
            this.renderForumList(this.el.forumSearch ? this.el.forumSearch.value : "");
        } catch (error) {
            console.error("Forum error:", error);
            if (this.el.forumList) {
                this.el.forumList.innerHTML = `<p style="padding:20px; text-align:center; color:#ef4444;">Error loading sheets: ${error.message}</p>`;
            }
        } finally {
            if (this.el.forumLoading) this.el.forumLoading.classList.add("hidden");
        }
    }

    renderForumList(searchQuery = "") {
        if (!this.el.forumList) return;
        const query = searchQuery.trim().toLowerCase();

        const filtered = this.forumSongs.filter(s => {
            const titleMatch = (s.title || "").toLowerCase().includes(query);
            const authorMatch = (s.author || "").toLowerCase().includes(query);
            return titleMatch || authorMatch;
        });

        if (filtered.length === 0) {
            this.el.forumList.innerHTML = '<p style="padding:2rem; text-align:center; color:#94a3b8;">No lead sheets found.</p>';
            return;
        }

        const escapeHtml = (str) => {
            return String(str || "").replace(/[&<>"']/g, (m) => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            })[m]);
        };

        this.el.forumList.innerHTML = filtered.map(song => {
            const safeTitle = escapeHtml(song.title || "Untitled");
            const safeAuthor = escapeHtml(song.author || "Browser User");
            const attrTitle = (song.title || "Untitled").replace(/'/g, "\\'");

            return `
                <div class="forum-item" data-id="${song.id}">
                    <div class="song-info">
                        <h4>${safeTitle}</h4>
                        <div class="song-meta">
                            <span>by <strong>${safeAuthor}</strong></span>
                            <span>❤️ ${song.likes || 0}</span>
                            <span>🎥 ${song.videoCount || 0}</span>
                        </div>
                    </div>
                    <div class="forum-actions">
                        <button class="action-btn action-btn-load" title="Load sheet to editor" onclick="window.app.loadSongFromForum('${song.id}')">📄 Load</button>
                        <button class="action-btn action-btn-overwrite" title="Overwrite this forum sheet with current editor content" onclick="window.app.overwriteSongDirect('${song.id}', '${attrTitle}')">💾 Overwrite</button>
                        <button class="action-btn action-btn-like" onclick="window.app.likeSong('${song.id}')">❤️ ${song.likes || 0}</button>
                        <button class="action-btn" onclick="window.app.showVideos('${song.id}', '${attrTitle}')">🎥 ${song.videoCount || 0}</button>
                        <button class="action-btn action-btn-delete" title="Delete sheet" onclick="window.app.deleteSong('${song.id}', '${attrTitle}')">🗑️</button>
                    </div>
                </div>
            `;
        }).join("");
    }

    async loadSongFromForum(songId) {
        const song = this.forumSongs.find(s => s.id === songId);
        if (!song) return;

        this.player.stop();

        let tunes = MultiTuneHelper.splitTunes(song.markup || "");

        // If multiple tunes were bundled, check if different songs were mistakenly combined
        // (e.g. Danny Boy was accidentally bundled with Luminescence)
        if (tunes.length > 1 && song.title) {
            const normSongTitle = song.title.trim().toLowerCase();
            const matchedTune = tunes.find(t => {
                const tTitle = (t.title || "").trim().toLowerCase();
                const tSub = (t.subTitle || "").trim().toLowerCase();
                return tTitle.includes(normSongTitle) || normSongTitle.includes(tTitle) ||
                       tSub.includes(normSongTitle) || normSongTitle.includes(tSub);
            });

            // Check if other tunes belong to a completely different song (like Danny Boy)
            const otherTunesAreDifferent = tunes.some(t => {
                const tTitle = (t.title || "").trim().toLowerCase();
                return t !== matchedTune && tTitle && !tTitle.includes(normSongTitle) && !normSongTitle.includes(tTitle);
            });

            if (matchedTune && otherTunesAreDifferent) {
                // Isolate the matching tune and normalize to X:1
                matchedTune.x = 1;
                if (/^[\t ]*X[\t ]*[:：]/im.test(matchedTune.content)) {
                    matchedTune.content = matchedTune.content.replace(/^[\t ]*X[\t ]*[:：][\t ]*\d*/im, "X:1");
                } else {
                    matchedTune.content = `X:1\n${matchedTune.content}`;
                }
                tunes = [matchedTune];
            } else if (matchedTune) {
                // If it's legitimately multiple versions of the same song, activate the matched one
                const matchedIdx = tunes.indexOf(matchedTune);
                this.currentTunes = tunes;
                this.currentTuneIndex = matchedIdx >= 0 ? matchedIdx : 0;
                this.loadedForumSongId = song.id;
                this.loadedForumSongTitle = song.title || "Untitled";
                this.updateTuneTabsUI();
                this.loadCurrentTuneToEditor();
                if (this.el.forumModal) this.el.forumModal.classList.add("hidden");
                this.showToast(`Loaded: ${song.title}`);
                return;
            }
        }

        if (tunes.length === 0) {
            tunes.push(new Tune(1, song.title || "Untitled", "", song.markup || ""));
        }

        // Single tune title fallback
        if (tunes.length === 1 && !tunes[0].title && song.title) {
            tunes[0].title = song.title;
        }

        this.currentTunes = tunes;
        this.currentTuneIndex = 0;
        this.loadedForumSongId = song.id;
        this.loadedForumSongTitle = song.title || "Untitled";
        this.updateTuneTabsUI();
        this.loadCurrentTuneToEditor();

        if (this.el.forumModal) {
            this.el.forumModal.classList.add("hidden");
        }
        this.showToast(`Loaded: ${song.title}`);
    }

    async overwriteSongDirect(songId, songTitle) {
        if (!this.forum) return;

        // Save current editor text to current tune
        if (this.currentTuneIndex >= 0 && this.currentTuneIndex < this.currentTunes.length) {
            this.currentTunes[this.currentTuneIndex].content = this.el.abcInput.value;
        }

        let markup = (this.currentTunes.length > 1)
            ? MultiTuneHelper.combineTunes(this.currentTunes)
            : this.el.abcInput.value.trim();

        if (this.currentTunes.length <= 1) {
            if (/^[\t ]*X[\t ]*[:：]/im.test(markup)) {
                markup = markup.replace(/^[\t ]*X[\t ]*[:：][\t ]*\d*/im, "X:1");
            } else if (markup) {
                markup = `X:1\n${markup}`;
            }
        }

        if (!markup) {
            this.showToast("Editor is empty");
            return;
        }

        this.showConfirmModal(
            "Overwrite Sheet",
            `Are you sure you want to overwrite "${songTitle}" in the forum with your current editor sheet?`,
            async () => {
                try {
                    await this.forum.updateSong(songId, songTitle, markup);
                    this.loadedForumSongId = songId;
                    this.loadedForumSongTitle = songTitle;
                    this.showToast(`Updated "${songTitle}" in Forum! 💾`);
                    await this.loadAndRenderForum();
                } catch (e) {
                    console.error("Overwrite error:", e);
                    this.showToast("Update failed: " + e.message);
                }
            }
        );
    }

    async likeSong(songId) {
        if (!this.forum) return;
        try {
            await this.forum.likeSong(songId);
            this.showToast("Liked!");
            await this.loadAndRenderForum();
        } catch (error) {
            this.showToast(error.message === "Already liked" ? "You already liked this!" : error.message);
        }
    }

    async deleteSong(songId, songTitle) {
        if (!this.forum) return;
        const title = songTitle || "this sheet";
        this.showConfirmModal(
            "Delete Sheet",
            `Are you sure you want to delete "${title}" from the forum?`,
            async () => {
                try {
                    await this.forum.deleteSong(songId);
                    if (this.loadedForumSongId === songId) {
                        this.loadedForumSongId = null;
                        this.loadedForumSongTitle = "";
                    }
                    this.showToast("Sheet deleted");
                    await this.loadAndRenderForum();
                } catch (error) {
                    this.showToast(error.message);
                }
            }
        );
    }

    async showVideos(songId, songTitle) {
        if (!this.forum || !this.el.videoModal) return;

        this.el.videoModalTitle.textContent = `Videos: ${songTitle}`;
        this.el.videoModal.classList.remove("hidden");
        this.el.videoList.innerHTML = `<p style="color:#94a3b8; padding:10px;">Loading videos...</p>`;

        this.el.btnAddVideo.onclick = () => this.addVideoDialog(songId, songTitle);

        try {
            const videos = await this.forum.fetchVideos(songId);
            if (videos.length === 0) {
                this.el.videoList.innerHTML = `<p style="color:#94a3b8; padding:10px; font-size:0.85rem;">No videos linked yet. Add the first YouTube video!</p>`;
            } else {
                this.el.videoList.innerHTML = videos.map(vid => `
                    <div class="video-item">
                        <span style="font-weight:600; color:var(--text-primary);">${vid.title || "Video"}</span>
                        <a href="${vid.youtubeUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-primary">▶ Watch</a>
                    </div>
                `).join("");
            }
        } catch (error) {
            this.el.videoList.innerHTML = `<p style="color:#ef4444; padding:10px;">Error: ${error.message}</p>`;
        }
    }

    async addVideoDialog(songId, songTitle) {
        const title = prompt("Video Title (e.g. Live Performance, Backing Track):");
        if (!title || !title.trim()) return;
        const url = prompt("YouTube Video URL:");
        if (!url || !url.trim()) return;

        try {
            await this.forum.addVideo(songId, title.trim(), url.trim());
            this.showToast("Video added!");
            await this.showVideos(songId, songTitle);
            await this.loadAndRenderForum();
        } catch (error) {
            this.showToast(error.message);
        }
    }

    showPostModal() {
        if (this.el.postModal) {
            this.el.postModal.classList.remove("hidden");
            const defaultTitle = this.loadedForumSongTitle
                || (this.currentSheet && this.currentSheet.title ? this.currentSheet.title : "");
            if (this.el.postTitle) {
                this.el.postTitle.value = defaultTitle;
                this.el.postTitle.focus();
            }
            if (this.el.postAuthor && !this.el.postAuthor.value) {
                this.el.postAuthor.value = localStorage.getItem("jazz_author_name") || "";
            }
            if (this.el.postAllVersionsGroup) {
                this.el.postAllVersionsGroup.style.display = (this.currentTunes && this.currentTunes.length > 1) ? "block" : "none";
            }
            if (this.el.postAllVersions) {
                this.el.postAllVersions.checked = false;
            }

            // If loaded from forum, allow direct Overwrite
            if (this.loadedForumSongId && this.el.btnOverwritePost) {
                this.el.btnOverwritePost.style.display = "inline-block";
                this.el.btnOverwritePost.textContent = `💾 Overwrite "${this.loadedForumSongTitle || "Sheet"}"`;
                if (this.el.btnSubmitPost) {
                    this.el.btnSubmitPost.textContent = "➕ Post as New";
                }
            } else {
                if (this.el.btnOverwritePost) {
                    this.el.btnOverwritePost.style.display = "none";
                }
                if (this.el.btnSubmitPost) {
                    this.el.btnSubmitPost.textContent = "Post to Forum";
                }
            }
        }
    }

    hidePostModal() {
        if (this.el.postModal) {
            this.el.postModal.classList.add("hidden");
        }
    }

    async submitPost(isOverwrite = false) {
        if (!this.forum) {
            this.showToast("Firebase is not initialized");
            return;
        }

        const title = this.el.postTitle ? this.el.postTitle.value.trim() : "";
        const author = this.el.postAuthor ? this.el.postAuthor.value.trim() : "";
        
        // Save current editor text to current tune
        if (this.currentTuneIndex >= 0 && this.currentTuneIndex < this.currentTunes.length) {
            this.currentTunes[this.currentTuneIndex].content = this.el.abcInput.value;
        }

        const shouldIncludeAll = this.el.postAllVersions && this.el.postAllVersions.checked && this.currentTunes.length > 1;
        let markup = "";
        if (shouldIncludeAll) {
            markup = MultiTuneHelper.combineTunes(this.currentTunes);
        } else {
            // Post current active tune only, normalized to X:1
            markup = this.el.abcInput.value.trim();
            if (/^[\t ]*X[\t ]*[:：]/im.test(markup)) {
                markup = markup.replace(/^[\t ]*X[\t ]*[:：][\t ]*\d*/im, "X:1");
            } else if (markup) {
                markup = `X:1\n${markup}`;
            }
        }

        if (!title) {
            alert("Please enter a song title.");
            return;
        }
        if (!markup) {
            alert("The sheet markup editor is empty.");
            return;
        }

        if (author) {
            localStorage.setItem("jazz_author_name", author);
        }

        const activeBtn = (isOverwrite && this.el.btnOverwritePost) ? this.el.btnOverwritePost : this.el.btnSubmitPost;
        const origText = activeBtn ? activeBtn.textContent : "";

        try {
            if (activeBtn) {
                activeBtn.disabled = true;
                activeBtn.textContent = isOverwrite ? "Overwriting..." : "Posting...";
            }

            if (isOverwrite && this.loadedForumSongId) {
                await this.forum.updateSong(this.loadedForumSongId, title, markup, author);
                this.loadedForumSongTitle = title;
                this.hidePostModal();
                this.showToast(`Successfully updated "${title}"! 💾`);
            } else {
                const docRef = await this.forum.uploadSong(title, markup, author);
                if (docRef && docRef.id) {
                    this.loadedForumSongId = docRef.id;
                    this.loadedForumSongTitle = title;
                }
                this.hidePostModal();
                this.showToast("Successfully posted to forum! 🎉");
            }

            if (this.el.forumModal && !this.el.forumModal.classList.contains("hidden")) {
                await this.loadAndRenderForum();
            }
        } catch (error) {
            console.error("Post error:", error);
            this.showToast("Operation failed: " + error.message);
        } finally {
            if (activeBtn) {
                activeBtn.disabled = false;
                activeBtn.textContent = origText;
            }
        }
    }

    showToast(message) {
        if (!this.el.toast) return;
        this.el.toast.textContent = message;
        this.el.toast.classList.remove("hidden");
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => {
            this.el.toast.classList.add("hidden");
        }, 3000);
    }

    shiftKey(delta) {
        this.semitoneShift += delta;
        const transposed = AbcTransposer.transpose(this.originalAbc, this.semitoneShift);
        this.el.abcInput.value = transposed;
        this.updateTransposeDisplay();
        this.reparseAndRender();
    }

    updateTransposeDisplay() {
        const s = ((this.semitoneShift % 12) + 12) % 12;
        const text = (s === 0) ? "Orig" : `${(this.semitoneShift > 0) ? "+" : ""}${this.semitoneShift}`;
        if (this.el.transposeDisplay) this.el.transposeDisplay.textContent = text;
        if (this.el.zenTransposeDisplay) this.el.zenTransposeDisplay.textContent = text;
    }

    extractBpm(tempoStr) {
        if (!tempoStr) return 0;
        const str = String(tempoStr).trim();
        const eqMatch = str.match(/=\s*(\d+)/);
        if (eqMatch) {
            return parseInt(eqMatch[1], 10);
        }
        const numMatch = str.match(/\b(\d{2,3})\b/);
        if (numMatch) {
            return parseInt(numMatch[1], 10);
        }
        const anyDigits = str.match(/\d+/g);
        if (anyDigits && anyDigits.length > 0) {
            return parseInt(anyDigits[anyDigits.length - 1], 10);
        }
        return 0;
    }

    escapeHtml(str) {
        return String(str || "").replace(/[&<>"']/g, (m) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[m]);
    }

    reparseAndRender() {
        const abc = this.el.abcInput.value;
        this.currentSheet = this.parser.parse(abc);

        // Sync BPM with sheet Q: whenever edited (real-time trigger)
        if (this.currentSheet && this.currentSheet.tempo) {
            const bpm = this.extractBpm(this.currentSheet.tempo);
            if (bpm >= 20 && bpm <= 360) {
                this.el.bpmSlider.value = bpm;
                this.el.bpmInput.value = bpm;
                this.player.setBpm(bpm);
            }
        }

        this.renderer.setSheetMusic(this.currentSheet);
    }

    bindResizerEvents() {
        const resizer = this.el.dragResizer;
        const editorPane = this.el.editorPane;
        if (!resizer || !editorPane) return;

        // Restore saved width from localStorage (default to 400px for generous editing room)
        const savedWidth = localStorage.getItem("jazz_editor_width");
        if (savedWidth) {
            const w = parseInt(savedWidth, 10);
            if (w >= 220 && w <= window.innerWidth - 320) {
                editorPane.style.width = `${w}px`;
            }
        }

        let isDragging = false;
        let startX = 0;
        let startW = 0;

        const onMouseDown = (e) => {
            isDragging = true;
            startX = e.clientX;
            startW = editorPane.getBoundingClientRect().width;
            document.body.classList.add("resizing-active");
            resizer.classList.add("dragging");
            window.addEventListener("mousemove", onMouseMove);
            window.addEventListener("mouseup", onMouseUp);
            e.preventDefault();
        };

        const onMouseMove = (e) => {
            if (!isDragging) return;
            const delta = e.clientX - startX;
            const newW = Math.max(220, Math.min(window.innerWidth - 340, startW + delta));
            editorPane.style.width = `${newW}px`;
            if (this.renderer && this.currentSheet) {
                this.renderer.render();
            }
        };

        const onMouseUp = () => {
            if (!isDragging) return;
            isDragging = false;
            document.body.classList.remove("resizing-active");
            resizer.classList.remove("dragging");
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
            const finalW = Math.round(editorPane.getBoundingClientRect().width);
            localStorage.setItem("jazz_editor_width", finalW);
            if (this.renderer && this.currentSheet) {
                this.renderer.render();
            }
        };

        resizer.addEventListener("mousedown", onMouseDown);

        // Touch support for tablets
        resizer.addEventListener("touchstart", (e) => {
            if (e.touches.length === 1) {
                isDragging = true;
                startX = e.touches[0].clientX;
                startW = editorPane.getBoundingClientRect().width;
                document.body.classList.add("resizing-active");
                resizer.classList.add("dragging");
            }
        }, { passive: true });

        window.addEventListener("touchmove", (e) => {
            if (!isDragging || e.touches.length !== 1) return;
            const delta = e.touches[0].clientX - startX;
            const newW = Math.max(220, Math.min(window.innerWidth - 300, startW + delta));
            editorPane.style.width = `${newW}px`;
            if (this.renderer && this.currentSheet) {
                this.renderer.render();
            }
        }, { passive: true });

        window.addEventListener("touchend", () => {
            if (isDragging) {
                isDragging = false;
                document.body.classList.remove("resizing-active");
                resizer.classList.remove("dragging");
                localStorage.setItem("jazz_editor_width", Math.round(editorPane.getBoundingClientRect().width));
            }
        });
    }
}

// Initialize on DOM ready
document.addEventListener("DOMContentLoaded", () => {
    window.app = new AppController();
});
