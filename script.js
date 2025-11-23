// Game State
const state = {
    mode: 'english', // 'english' or 'japanese'
    difficulty: 1, // 1, 2, or 3
    currentWords: [],
    targetWord: null,
    bubbles: [],
    isPlaying: false,
    animationFrameId: null,
    speechRate: 0.8,
    colors: ['#FFB7B2', '#B5EAD7', '#C7CEEA', '#FFDAC1', '#E2F0CB', '#FF9AA2']
};

// DOM Elements
const screens = {
    start: document.getElementById('start-screen'),
    game: document.getElementById('game-screen'),
    clear: document.getElementById('clear-screen')
};

const gameArea = document.getElementById('game-area');
const remainingCount = document.getElementById('remaining-count');
const startBtn = document.getElementById('start-btn');
const exitBtn = document.getElementById('exit-btn');
const listenBtn = document.getElementById('listen-btn');
const restartBtn = document.getElementById('restart-btn');
const modeInputs = document.querySelectorAll('input[name="mode"]');

// Audio Context (for sound effects)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'correct') {
        // Ping-pong! (High C -> High E)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
        osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.1); // E5
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
    } else if (type === 'wrong') {
        // Boo-boo... (Low G -> Low F)
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(196.00, audioCtx.currentTime); // G3
        osc.frequency.linearRampToValueAtTime(174.61, audioCtx.currentTime + 0.2); // F3
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
    }
}

// Speech Synthesis
function speak(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel(); // Stop previous
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = state.speechRate;
    window.speechSynthesis.speak(utterance);
}

// Bubble Class
class Bubble {
    constructor(wordObj) {
        this.wordObj = wordObj;
        this.element = document.createElement('div');
        this.element.className = 'bubble';
        this.updateText();

        // Random size between 80px and 120px
        this.size = Math.random() * 40 + 80;
        this.element.style.width = `${this.size}px`;
        this.element.style.height = `${this.size}px`;
        this.element.style.backgroundColor = state.colors[Math.floor(Math.random() * state.colors.length)];

        // Random position
        this.x = Math.random() * (window.innerWidth - this.size);
        this.y = Math.random() * (window.innerHeight - this.size - 60); // -60 for UI header

        // Random velocity
        this.vx = (Math.random() - 0.5) * 2; // -1 to 1
        this.vy = (Math.random() - 0.5) * 2;

        this.element.addEventListener('click', () => this.handleClick());
        // Touch support
        this.element.addEventListener('touchstart', (e) => {
            e.preventDefault(); // Prevent mouse emulation
            this.handleClick();
        });

        gameArea.appendChild(this.element);
        this.updatePosition();
    }

    updateText() {
        if (state.mode === 'english') {
            this.element.textContent = this.wordObj.en;
            this.element.style.fontFamily = 'var(--font-en)';
        } else {
            this.element.textContent = this.wordObj.ja;
            this.element.style.fontFamily = 'var(--font-ja)';
        }
    }

    updatePosition() {
        this.element.style.transform = `translate(${this.x}px, ${this.y}px)`;
    }

    move() {
        this.x += this.vx;
        this.y += this.vy;

        // Wall collision
        if (this.x <= 0 || this.x + this.size >= window.innerWidth) {
            this.vx *= -1;
            this.x = Math.max(0, Math.min(this.x, window.innerWidth - this.size));
        }
        if (this.y <= 60 || this.y + this.size >= window.innerHeight) { // 60px top buffer
            this.vy *= -1;
            this.y = Math.max(60, Math.min(this.y, window.innerHeight - this.size));
        }

        this.updatePosition();
    }

    handleClick() {
        if (!state.isPlaying || !state.targetWord) return;

        if (this.wordObj.en === state.targetWord.en) {
            // Correct
            playSound('correct');
            this.element.classList.add('pop');

            // Remove from array
            state.bubbles = state.bubbles.filter(b => b !== this);
            state.currentWords = state.currentWords.filter(w => w.en !== this.wordObj.en);

            setTimeout(() => {
                if (this.element.parentNode) {
                    this.element.parentNode.removeChild(this.element);
                }
                checkWinCondition();
            }, 300);
        } else {
            // Incorrect
            playSound('wrong');
            this.element.classList.add('shake');
            setTimeout(() => {
                this.element.classList.remove('shake');
            }, 500);
        }
    }
}

// Game Logic
function initGame() {
    // Filter words based on difficulty
    const filteredWords = wordList.filter(word => word.level === state.difficulty);

    // Select 10-15 random words from the filtered list
    // If fewer than 10 words, use all of them
    const count = Math.min(filteredWords.length, Math.floor(Math.random() * 6) + 10);
    const shuffled = [...filteredWords].sort(() => 0.5 - Math.random());
    state.currentWords = shuffled.slice(0, count);

    // Clear previous bubbles
    gameArea.innerHTML = '';
    state.bubbles = [];

    // Create bubbles
    state.currentWords.forEach(word => {
        state.bubbles.push(new Bubble(word));
    });

    state.isPlaying = true;
    updateRemaining();
    nextQuestion();
    gameLoop();
}

function nextQuestion() {
    if (state.currentWords.length === 0) return;

    // Pick a random word from remaining words
    const randomIndex = Math.floor(Math.random() * state.currentWords.length);
    state.targetWord = state.currentWords[randomIndex];

    // Speak
    setTimeout(() => {
        speak(state.targetWord.en);
    }, 500);
}

function checkWinCondition() {
    updateRemaining();
    if (state.currentWords.length === 0) {
        gameClear();
    } else {
        nextQuestion();
    }
}

function updateRemaining() {
    remainingCount.textContent = state.currentWords.length;
}

function gameLoop() {
    if (!state.isPlaying) return;

    state.bubbles.forEach(bubble => bubble.move());
    state.animationFrameId = requestAnimationFrame(gameLoop);
}

function gameClear() {
    state.isPlaying = false;
    cancelAnimationFrame(state.animationFrameId);
    switchScreen('clear');
    createConfetti();
}

function switchScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenName].classList.add('active');
}

// Confetti Effect
function createConfetti() {
    const container = document.getElementById('confetti-container');
    container.innerHTML = '';

    const colors = ['#FFB7B2', '#B5EAD7', '#C7CEEA', '#FFDAC1'];

    for (let i = 0; i < 50; i++) {
        const confetti = document.createElement('div');
        confetti.style.position = 'absolute';
        confetti.style.width = '10px';
        confetti.style.height = '10px';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.top = -10 + 'px';
        confetti.style.opacity = Math.random();
        confetti.style.transform = `rotate(${Math.random() * 360}deg)`;

        // Simple CSS animation for falling
        confetti.style.transition = `top ${Math.random() * 2 + 2}s ease-out, transform 2s linear`;

        container.appendChild(confetti);

        setTimeout(() => {
            confetti.style.top = '110%';
            confetti.style.transform = `rotate(${Math.random() * 360 + 360}deg)`;
        }, 100);
    }
}

// Event Listeners
startBtn.addEventListener('click', () => {
    // Get selected mode
    const selectedMode = document.querySelector('input[name="mode"]:checked').value;
    state.mode = selectedMode;

    // Get selected difficulty
    const selectedDifficulty = parseInt(document.querySelector('input[name="difficulty"]:checked').value, 10);
    state.difficulty = selectedDifficulty;

    switchScreen('game');
    initGame();
});

exitBtn.addEventListener('click', () => {
    state.isPlaying = false;
    cancelAnimationFrame(state.animationFrameId);
    window.speechSynthesis.cancel();
    switchScreen('start');
});

listenBtn.addEventListener('click', () => {
    if (state.targetWord) {
        speak(state.targetWord.en);
    }
});

restartBtn.addEventListener('click', () => {
    switchScreen('start');
});

// Resize handler
window.addEventListener('resize', () => {
    // Ensure bubbles stay within bounds on resize
    state.bubbles.forEach(b => {
        b.x = Math.min(b.x, window.innerWidth - b.size);
        b.y = Math.min(b.y, window.innerHeight - b.size);
    });
});
