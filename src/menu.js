// menu.js
import { state } from './state.js';

export function initMenu() {
    const instructionsEl = document.getElementById('instructions');
    const menuButtonsEl = document.getElementById('menuButtons');
    const matchStatusEl = document.getElementById('matchStatus');

    document.getElementById('findMatchBtn').addEventListener('click', () => {
        state.socket.emit('findMatch');
        matchStatusEl.style.display = 'block';
        matchStatusEl.classList.add('searching');
    });

    document.getElementById('controlsBtn').addEventListener('click', () => {
        instructionsEl.style.display = 'flex';
        instructionsEl.style.animation = 'none';
        void instructionsEl.offsetHeight;
        instructionsEl.style.animation = 'fadeInScale 0.3s forwards';

        menuButtonsEl.style.display = 'none';
    });

    document.getElementById('controlsBackBtn').addEventListener('click', () => {
        instructionsEl.style.display = 'none';
        menuButtonsEl.style.display = 'flex';
    });
}
