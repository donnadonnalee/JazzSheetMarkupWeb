/**
 * MultiTuneHelper - Handles ABC multi-tune (X:1, X:2...) version management
 * Mirrors the architecture of Android reference's MultiTuneHelper.java
 */

class Tune {
    constructor(x = 1, title = "", subTitle = "", content = "", sourceStart = -1, sourceEnd = -1) {
        this.x = x;
        this.title = (title || "").trim();
        this.subTitle = (subTitle || "").trim();
        this.content = content || "";
        this.sourceStart = sourceStart;
        this.sourceEnd = sourceEnd;
    }

    getDisplayName(index = 0) {
        if (this.subTitle) {
            return this.subTitle;
        }
        if (this.title) {
            // Extract from "Danny Boy (Trad)" parenthesized form
            const m = this.title.match(/\((.+?)\)/);
            if (m) {
                return m[1].trim();
            }
            if (index === 0) {
                return this.title;
            }
        }
        return `Ver.${index + 1}`;
    }
}

class MultiTuneHelper {
    /**
     * Splits full ABC markup into individual Tune objects by X: tags.
     */
    static splitTunes(fullText) {
        const tunes = [];
        if (!fullText) fullText = "";

        const xRegex = /^[\t ]*X[\t ]*[:：][\t ]*(\d*)/gim;
        const xIndices = [];
        const xNumbers = [];
        let autoX = 1;
        let match;

        while ((match = xRegex.exec(fullText)) !== null) {
            xIndices.push(match.index);
            const numStr = match[1];
            let xNum = autoX;
            if (numStr && numStr.trim()) {
                const parsed = parseInt(numStr.trim(), 10);
                if (!isNaN(parsed)) xNum = parsed;
            }
            xNumbers.push(xNum);
            autoX = Math.max(autoX + 1, xNum + 1);
        }

        let hasLeadingBlock = false;
        let leadingHeader = null;
        if (xIndices.length > 0 && xIndices[0] > 0) {
            const leading = fullText.substring(0, xIndices[0]).trim();
            if (leading) {
                if (MultiTuneHelper.isMeaningfulTune(leading)) {
                    hasLeadingBlock = true;
                } else {
                    leadingHeader = leading;
                }
            }
        }

        if (xIndices.length >= 2 || hasLeadingBlock) {
            // Multiple tunes present
            if (hasLeadingBlock) {
                const block = fullText.substring(0, xIndices[0]).trim();
                const titles = MultiTuneHelper.extractTitles(block);
                tunes.push(new Tune(1, titles.title, titles.subTitle, block, 0, xIndices[0]));
            }
            for (let i = 0; i < xIndices.length; i++) {
                const start = xIndices[i];
                const end = (i + 1 < xIndices.length) ? xIndices[i + 1] : fullText.length;
                let block = fullText.substring(start, end).trim();
                if (i === 0 && leadingHeader) {
                    block = MultiTuneHelper.attachLeadingHeaderToFirstTune(block, leadingHeader);
                }
                const xNum = xNumbers[i];
                const titles = MultiTuneHelper.extractTitles(block);
                tunes.push(new Tune(xNum, titles.title, titles.subTitle, block, start, end));
            }
        } else {
            // Single tune
            const xNum = xNumbers.length === 0 ? 1 : xNumbers[0];
            let content = fullText;
            if (xIndices.length > 0 && leadingHeader) {
                const block = fullText.substring(xIndices[0]).trim();
                content = MultiTuneHelper.attachLeadingHeaderToFirstTune(block, leadingHeader);
            }
            const titles = MultiTuneHelper.extractTitles(content);
            tunes.push(new Tune(xNum, titles.title, titles.subTitle, content, 0, fullText.length));
        }

        return tunes;
    }

    static isMeaningfulTune(text) {
        if (!text || !text.trim()) return false;
        const lines = text.split(/\r?\n/);
        for (const line of lines) {
            const tr = line.trim();
            if (!tr || tr.startsWith("%")) continue;
            const lower = tr.toLowerCase();
            if (lower.startsWith("k:") || lower.startsWith("m:") || lower.startsWith("l:") || lower.startsWith("q:")) {
                return true;
            }
            if (tr.includes("|") || tr.includes("\"")) {
                return true;
            }
        }
        return false;
    }

    static extractTitles(content) {
        if (!content) return { title: "", subTitle: "" };
        const lines = content.split(/\r?\n/);
        const tTags = [];

        for (const line of lines) {
            const tr = line.trim();
            if (/^T[\t ]*[:：]/i.test(tr)) {
                const val = tr.replace(/^T[\t ]*[:：][\t ]*/i, "").trim();
                if (val) tTags.push(val);
            }
        }

        let title = tTags.length > 0 ? tTags[0] : "";
        let subTitle = "";

        if (tTags.length >= 2) {
            // Second T: is treated as subtitle (version / variation name)
            subTitle = tTags[1];
        } else if (title) {
            // Try extracting from "Danny Boy (Trad)"
            const m = title.match(/^(.*?)\s*\((.+?)\)\s*$/);
            if (m) {
                title = m[1].trim();
                subTitle = m[2].trim();
            }
        }

        return { title, subTitle };
    }

    static attachLeadingHeaderToFirstTune(tuneContent, leadingHeader) {
        if (!leadingHeader || !leadingHeader.trim()) return tuneContent;
        // Inject leading header comments/genres right after the X: line of first tune
        const m = tuneContent.match(/^[\t ]*X[\t ]*[:：][^\r\n]*\r?\n/i);
        if (m) {
            const xLine = m[0];
            const rest = tuneContent.substring(xLine.length);
            return xLine + leadingHeader.trim() + "\n" + rest;
        }
        return leadingHeader.trim() + "\n" + tuneContent;
    }

    /**
     * Combines multiple Tune objects into a single multi-tune ABC document.
     */
    static combineTunes(tunes) {
        if (!tunes || tunes.length === 0) return "";
        return tunes.map((tune, idx) => {
            let content = (tune.content || "").trim();
            const expectedX = idx + 1;
            // Ensure X: tag matches expected position if missing or needs update
            if (/^[\t ]*X[\t ]*[:：]/im.test(content)) {
                content = content.replace(/^[\t ]*X[\t ]*[:：][\t ]*\d*/im, `X:${expectedX}`);
            } else {
                content = `X:${expectedX}\n${content}`;
            }
            return content;
        }).join("\n\n");
    }

    static refreshTuneMetadata(tune) {
        if (!tune) return;
        const titles = MultiTuneHelper.extractTitles(tune.content);
        tune.title = titles.title;
        tune.subTitle = titles.subTitle;
    }

    static updateTuneSubtitle(tune, newSubTitle) {
        if (!tune) return;
        newSubTitle = (newSubTitle || "").trim();
        tune.subTitle = newSubTitle;

        const lines = tune.content.split(/\r?\n/);
        let tCount = 0;
        let secondTIndex = -1;
        let firstTIndex = -1;

        for (let i = 0; i < lines.length; i++) {
            if (/^T[\t ]*[:：]/i.test(lines[i].trim())) {
                tCount++;
                if (tCount === 1) firstTIndex = i;
                if (tCount === 2) {
                    secondTIndex = i;
                    break;
                }
            }
        }

        if (secondTIndex >= 0) {
            lines[secondTIndex] = `T: ${newSubTitle}`;
        } else if (firstTIndex >= 0) {
            lines.splice(firstTIndex + 1, 0, `T: ${newSubTitle}`);
        } else {
            lines.unshift(`T: ${newSubTitle}`);
            lines.unshift(`T: ${tune.title || "Untitled"}`);
        }

        tune.content = lines.join("\n");
    }

    static createDuplicateTune(srcTune, newSubTitle, nextX = 2) {
        const clonedContent = srcTune ? srcTune.content : "";
        const newTune = new Tune(nextX, srcTune ? srcTune.title : "", newSubTitle, clonedContent);
        MultiTuneHelper.updateTuneSubtitle(newTune, newSubTitle);
        // Ensure X: tag
        if (/^[\t ]*X[\t ]*[:：]/im.test(newTune.content)) {
            newTune.content = newTune.content.replace(/^[\t ]*X[\t ]*[:：][\t ]*\d*/im, `X:${nextX}`);
        } else {
            newTune.content = `X:${nextX}\n${newTune.content}`;
        }
        return newTune;
    }

    static createBlankTune(baseTitle, newSubTitle, nextX = 2) {
        const content = `X:${nextX}\nT: ${baseTitle || "Untitled"}\nT: ${newSubTitle || `Ver.${nextX}`}\nM: 4/4\nL: 1/4\nQ: 1/4=120\nK: C\n|: "C" c4 | "G7" B4 | "C" c4 | "C" z4 :|]`;
        return new Tune(nextX, baseTitle, newSubTitle, content);
    }
}

if (typeof window !== "undefined") {
    window.Tune = Tune;
    window.MultiTuneHelper = MultiTuneHelper;
}
