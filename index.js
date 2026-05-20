    let weezerSongs = [];
    let secretSong = null;
    let attempts = 0;
    const maxAttempts = 6;

    // Mode Engine State Machines
    let currentPeriod = 'menu'; // 'menu' | 'daily' | 'endless'
    let currentModifier = 'both'; // 'both' | 'audio' | 'text'
    let endlessStreaks = { both: 0, audio: 0, text: 0 };

    const menuScreen = document.getElementById('menu-screen');
    const gameScreen = document.getElementById('game-screen');
    const badgeEl = document.getElementById('mode-badge-el');
    const streakEl = document.getElementById('streak-display');

    const inputEl = document.getElementById('song-input');
    const datalistEl = document.getElementById('weezer-options');
    const messageEl = document.getElementById('message');
    const hintBoxEl = document.getElementById('hint-box');
    const guessButton = document.querySelector('.guess-btn');
    const skipButton = document.querySelector('.skip-btn');

    // progressive limits used strictly by "Both Hints" mode
    const bothModeClipsConfig = {
        1: { seconds: 3, label: "3-Second Teaser Preview" },
        2: { seconds: 3, label: "3-Second Teaser Preview" },
        3: { seconds: 3, label: "3-Second Teaser Preview" },
        4: { seconds: 12, label: "12-Second Extended Preview" },
        5: { seconds: 20, label: "20-Second Deep Dive Preview" },
        6: { seconds: 20, label: "20-Second Deep Dive Preview" }
    };

    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const targetTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', targetTheme);
        document.getElementById('theme-btn').textContent = targetTheme === 'light' ? '🌙 Dark Mode' : '☀️ Light Mode';
    }

    // Read asset profile configuration safely asynchronously from disk 
    fetch('songs.json')
        .then(response => {
            if (!response.ok) throw new Error("Could not find songs.json profile file.");
            return response.json();
        })
        .then(data => {
            weezerSongs = data;
            weezerSongs.sort((a,b) => a.title.localeCompare(b.title));
            updateDatalist("");
        })
        .catch(err => {
            messageEl.style.color = "var(--weezer-red)";
            messageEl.textContent = "Error loading songs.json. Ensure your local server is running.";
            console.error(err);
        });

    function launchGame(period, modifier) {
        currentPeriod = period;
        currentModifier = modifier;

        menuScreen.style.display = 'none';
        gameScreen.style.display = 'block';

        // Update Context Labels visually
        badgeEl.textContent = `${period} — ${modifier} mode`;
        if (period === 'endless') {
            streakEl.style.display = 'block';
            streakEl.textContent = `🔥 Win Streak: ${endlessStreaks[modifier]}`;
        } else {
            streakEl.style.display = 'none';
        }

        initGame();
    }

    function returnToMenu() {
        currentPeriod = 'menu';
        menuScreen.style.display = 'block';
        gameScreen.style.display = 'none';
        // Clear background ambient processes if left running
        const player = document.getElementById('preview-player');
        if (player) player.pause();
    }

    // Pseudorandom custom seeded map generator to ensure identical tracks for standard global dates
    function getDailySeededIndex(moduloMax) {
        const d = new Date();
        const pseudoSeed = (d.getFullYear() * 365) + ((d.getMonth() + 1) * 31) + d.getDate();
        
        let val = (pseudoSeed * 1664525 + 1013904223) % 4294967296;
        
        if (currentModifier === 'audio') val += 41;
        if (currentModifier === 'text') val += 87;

        return Math.abs(val) % moduloMax;
    }

    function initGame() {
        attempts = 0;
        inputEl.disabled = false;
        guessButton.disabled = false;
        skipButton.disabled = false;
        inputEl.value = "";
        messageEl.innerHTML = "";
        hintBoxEl.style.display = "none";
        hintBoxEl.innerHTML = "";
        document.getElementById('guesses-container').innerHTML = "";
        
        if (weezerSongs.length === 0) return;

        updateDatalist("");

        if (currentPeriod === 'daily') {
            const index = getDailySeededIndex(weezerSongs.length);
            secretSong = weezerSongs[index];
        } else {
            const randomIndex = Math.floor(Math.random() * weezerSongs.length);
            secretSong = weezerSongs[randomIndex];
        }

        // AUDIO ONLY MODE: Fire audio immediately on attempt 0 before any guesses are typed
        if (currentModifier === 'audio') {
            revealAudioPreview(secretSong, 0); 
        }
    }

    function updateDatalist(query) {
        datalistEl.innerHTML = "";
        const cleanQuery = query.toLowerCase().trim();

        weezerSongs.forEach(song => {
            const titleMatch = song.title.toLowerCase().includes(cleanQuery);
            const albumMatch = song.album.toLowerCase().includes(cleanQuery);

            if (cleanQuery === "" || titleMatch || albumMatch) {
                let opt = document.createElement('option');
                opt.value = song.title;
                opt.textContent = `${song.title} — (${song.album})`; 
                datalistEl.appendChild(opt);
            }
        });
    }

    inputEl.addEventListener("input", function(e) {
        updateDatalist(e.target.value);
    });

    function toSeconds(timeStr) {
        if (!timeStr) return 0;
        const parts = timeStr.split(':');
        return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    }

    function skipTurn() {
        if (attempts >= maxAttempts || !secretSong) return;
        processGuessFeedback({
            title: "---",
            album: "---",
            year: "",
            track: "",
            length: ""
        }, false);
    }

    function makeGuess() {
        if (attempts >= maxAttempts || !secretSong) return;

        const rawGuess = inputEl.value.trim();
        const guessedSong = weezerSongs.find(s => s.title.toLowerCase() === rawGuess.toLowerCase());

        if (!guessedSong) {
            messageEl.style.color = "var(--weezer-red)";
            messageEl.textContent = "❌ Not in the Weezer database! Check spelling.";
            return;
        }
        
        processGuessFeedback(guessedSong, true);
    }

    function injectAudioElement(url, allowedSeconds, labelText) {
        const existingAudioContainer = document.getElementById('preview-audio-container');
        if (existingAudioContainer) existingAudioContainer.remove();

        const audioWrapper = document.createElement('div');
        audioWrapper.id = 'preview-audio-container';
        audioWrapper.style.cssText = "margin-top:12px; border-top:1px dashed var(--border-color); padding-top:12px;";
        
        audioWrapper.innerHTML = `
            <p style="margin:0 0 8px 0; color:var(--weezer-blue);">🎵 ${labelText}:</p>
            <audio id="preview-player" controls autoplay style="width:100%; max-width:280px; height:32px;">
                <source src="${url}" type="audio/x-m4a">
                <source src="${url}" type="audio/mpeg">
                Your browser does not support playing this preview.
            </audio>
        `;

        // If hintBox is currently displaying clean text text rules, append alongside them
        if(currentModifier === 'both' && hintBoxEl.innerHTML !== "") {
             // Avoid wiping text characters if they already exist inside the block
             const textCheck = hintBoxEl.querySelector('#preview-audio-container');
             if(!textCheck) hintBoxEl.appendChild(audioWrapper);
        } else {
             hintBoxEl.appendChild(audioWrapper);
        }
        hintBoxEl.style.display = "block";

        const player = document.getElementById('preview-player');
        player.addEventListener('timeupdate', function() {
            if (allowedSeconds && player.currentTime >= allowedSeconds) {
                player.pause();
                player.currentTime = 0;
            }
        });
    }

    function injectYoutubeFallback(song) {
        const existingAudioContainer = document.getElementById('preview-audio-container');
        if (existingAudioContainer) existingAudioContainer.remove();

        // Strip parentheticals from title for cleaner keyword matching
        const cleanTitle = song.title.split('(')[0].trim();
        
        // Build a strict search term targeting official music releases
        const strictQuery = `Weezer "${cleanTitle}" ${song.album} official audio`;
        const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(strictQuery)}`;

        const fallbackWrapper = document.createElement('div');
        fallbackWrapper.id = 'preview-audio-container';
        fallbackWrapper.style.cssText = "margin-top:12px; border-top:1px dashed var(--border-color); padding-top:12px;";
        fallbackWrapper.innerHTML = `
            <p style="margin:0 0 4px 0; color:var(--weezer-yellow);">⚠️ Audio snippet missing from iTunes preview server.</p>
            <a href="${ytUrl}" target="_blank" class="fallback-btn">🔍 Listen to Weezer on YouTube ↗</a>
        `;
        
        hintBoxEl.appendChild(fallbackWrapper);
        hintBoxEl.style.display = "block";
    }

    function revealAudioPreview(song, currentAttempt) {
        let allowedSeconds = null;
        let labelText = "Full 30-Second Preview Stream";

        if (currentModifier === 'both') {
            const config = bothModeClipsConfig[currentAttempt];
            if (!config) return;
            allowedSeconds = config.seconds;
            labelText = config.label;
        }

        if (song.previewUrl && song.previewUrl.trim() !== "") {
            injectAudioElement(song.previewUrl, allowedSeconds, labelText);
        } else {
            const cleanTitle = song.title.split('(')[0].trim();
            const searchUrl = `https://itunes.apple.com/search?term=weezer+${encodeURIComponent(cleanTitle)}&entity=musicTrack&limit=5`;

            fetch(searchUrl)
                .then(res => res.json())
                .then(data => {
                    if (data.results && data.results.length > 0) {
                        const match = data.results.find(t => 
                            t.collectionName.toLowerCase().includes(song.album.split(' ')[0].toLowerCase())
                        ) || data.results[0];

                        if (match.previewUrl) {
                            injectAudioElement(match.previewUrl, allowedSeconds, labelText);
                        } else {
                            injectYoutubeFallback(song);
                        }
                    } else {
                        injectYoutubeFallback(song);
                    }
                })
                .catch(err => {
                    console.error("Could not fetch clip dynamically:", err);
                    injectYoutubeFallback(song);
                });
        }
    }

    function generateDynamicHint(song) {
        const cleanTitle = song.title.split('(')[0].trim();
        const totalCharacters = cleanTitle.replace(/\s+/g, '').length;
        const totalWords = cleanTitle.split(/\s+/).length;
        return `💡 <strong>HINT:</strong> The base song title contains <strong>${totalWords} word(s)</strong> (${totalCharacters} total letters).`;
    }

    function processGuessFeedback(guessedSong, isActualGuess) {
        messageEl.textContent = ""; 
        inputEl.value = ""; 
        updateDatalist("");
        attempts++;

        const container = document.getElementById('guesses-container');
        const row = document.createElement('div');
        row.className = 'row';

        const createTile = (text, matchState, directionalMode = null) => {
            const tile = document.createElement('div');
            tile.className = `tile ${matchState}`;
            tile.innerHTML = `<span>${text || '---'}</span>`;
            if (matchState === 'wrong' && directionalMode) {
                const badge = document.createElement('div');
                badge.className = 'arrow-indicator';
                badge.textContent = directionalMode === 'higher' ? '▲ HIGHER' : '▼ LOWER';
                tile.appendChild(badge);
            }
            return tile;
        };

        const getBaseName = (str) => str.split('(')[0].trim().toLowerCase();

        const guessedYear = parseInt(guessedSong.year, 10);
        const secretYear = parseInt(secretSong.year, 10);
        const guessedTrack = parseInt(guessedSong.track, 10);
        const secretTrack = parseInt(secretSong.track, 10);

        let titleState = 'wrong';
        if (isActualGuess && guessedSong.title.toLowerCase() === secretSong.title.toLowerCase()) {
            titleState = 'correct';
        } else if (isActualGuess && getBaseName(guessedSong.title) === getBaseName(secretSong.title)) {
            titleState = 'partial';
        }
        row.appendChild(createTile(guessedSong.title, titleState));

        let albumState = 'wrong';
        if (isActualGuess && guessedSong.album.toLowerCase() === secretSong.album.toLowerCase()) {
            albumState = 'correct';
        } else if (isActualGuess && getBaseName(guessedSong.album) === getBaseName(secretSong.album)) {
            albumState = 'partial';
        }
        row.appendChild(createTile(guessedSong.album, albumState));

        let yearState = 'wrong';
        let yearMode = null;
        if (isActualGuess && guessedYear === secretYear) {
            yearState = 'correct';
        } else if (!isNaN(guessedYear)) {
            yearMode = guessedYear < secretYear ? 'higher' : 'lower';
        }
        row.appendChild(createTile(guessedSong.year, yearState, yearMode));

        let trackState = 'wrong';
        let trackMode = null;
        if (isActualGuess && guessedTrack === secretTrack) {
            trackState = 'correct';
        } else if (!isNaN(guessedTrack)) {
            trackMode = guessedTrack < secretTrack ? 'higher' : 'lower';
        }
        row.appendChild(createTile(guessedSong.track, trackState, trackMode));

        let lengthState = 'wrong';
        let lengthMode = null;
        if (isActualGuess && guessedSong.length === secretSong.length) {
            lengthState = 'correct';
        } else if (guessedSong.length) {
            lengthMode = toSeconds(guessedSong.length) < toSeconds(secretSong.length) ? 'higher' : 'lower';
        }
        row.appendChild(createTile(guessedSong.length, lengthState, lengthMode));

        container.insertBefore(row, container.firstChild); 

        // Live mode layout adjustments 
        if (guessedSong.title !== secretSong.title) {
            // 1. Audio Only Mode -> Keep audio container refreshed and alive
            if (currentModifier === 'audio') {
                revealAudioPreview(secretSong, attempts);
            }
            
            // 2. Text Only Mode -> Unlocks text data starting at Try 3
            if (currentModifier === 'text' && attempts >= 3) {
                hintBoxEl.innerHTML = generateDynamicHint(secretSong);
                hintBoxEl.style.display = "block";
            }

            // 3. Both Hints Mode -> Starts teasing step-by-step at Try 3
            if (currentModifier === 'both' && attempts >= 3) {
                hintBoxEl.innerHTML = generateDynamicHint(secretSong);
                hintBoxEl.style.display = "block";
                revealAudioPreview(secretSong, attempts);
            }
        }

        // Win/Loss State Processing Blocks
        if (isActualGuess && guessedSong.title.toLowerCase() === secretSong.title.toLowerCase()) {
            messageEl.style.color = "var(--weezer-green)";
            
            let actionMarkup = `<button class="action-btn" onclick="returnToMenu()">Menu Screen</button>`;
            if (currentPeriod === 'endless') {
                endlessStreaks[currentModifier]++;
                actionMarkup += `<button class="action-btn retry" onclick="launchGame('endless', currentModifier)">Next Endless Track</button>`;
            }
            
            messageEl.innerHTML = `🎉 Perfect Situation! You got it in ${attempts}/${maxAttempts} guesses!<br>${actionMarkup}`;
            disableGame();
        } else if (attempts === maxAttempts) {
            messageEl.style.color = "var(--weezer-red)";
            
            if (currentPeriod === 'endless') {
                endlessStreaks[currentModifier] = 0; 
            }
            
            messageEl.innerHTML = `😞 Say It Ain't So! The answer was <br><strong style="color: var(--weezer-red); font-size: 1.4rem;">${secretSong.title}</strong>.<br>
            <button class="action-btn" onclick="returnToMenu()">Back to Menu</button>
            <button class="action-btn retry" onclick="launchGame(currentPeriod, currentModifier)">Try Again</button>`;
            disableGame();
        }
    }

    function disableGame() {
        inputEl.disabled = true;
        guessButton.disabled = true;
        skipButton.disabled = true;
    }

    inputEl.addEventListener("keyup", function(event) {
        if (event.key === "Enter") {
            event.preventDefault();
            makeGuess();
        }
    });