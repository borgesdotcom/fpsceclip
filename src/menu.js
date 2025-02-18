// menu.js
import { state } from './state.js';

export function initMenu() {
    document.getElementById('findMatchBtn').addEventListener('click', () => {
        state.socket.emit('findMatch');
        document.getElementById('matchStatus').style.display = 'block';
    });

    document.getElementById('controlsBtn').addEventListener('click', () => {
        document.getElementById('instructions').style.display = 'flex';
        document.getElementById('menuButtons').style.display = 'none';
    });

    document.getElementById('controlsBackBtn').addEventListener('click', () => {
        document.getElementById('instructions').style.display = 'none';
        document.getElementById('menuButtons').style.display = 'flex';
    });
}
