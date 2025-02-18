// audio.js
import * as THREE from 'three';
import { state } from './state.js';

export function initAudio() {
    const { scene, sounds } = state;
    state.listener = new THREE.AudioListener();
    scene.add(state.listener);

    const audioLoader = new THREE.AudioLoader();

    // Carrega os sons
    audioLoader.load('/sounds/gunshot.wav', (buf) => sounds.gunshot = buf);
    audioLoader.load('/sounds/reload.mp3', (buf) => sounds.reload = buf);
    audioLoader.load('sounds/dash.wav', (buf) => sounds.dash = buf);
    audioLoader.load('sounds/jump.wav', (buf) => sounds.jump = buf);
    audioLoader.load('sounds/hit.wav', (buf) => sounds.hit = buf);
    audioLoader.load('sounds/hurt.wav', (buf) => sounds.hurt = buf);
    audioLoader.load('sounds/death.mp3', (buf) => sounds.death = buf);
    audioLoader.load('sounds/enemyhit.mp3', (buf) => sounds.enemyhit = buf);
    audioLoader.load('sounds/powerup.mp3', (buf) => sounds.powerup = buf);
}

export function initBackgroundAudio() {
    const audioLoader = new THREE.AudioLoader();
    audioLoader.load('/sounds/background.mp3', (buffer) => {
        const bgSound = new THREE.Audio(state.listener);
        bgSound.setBuffer(buffer);
        bgSound.setLoop(true);
        bgSound.setVolume(0.1);

        // Tocar apenas após interação do usuário
        document.addEventListener('click', () => {
            if (state.audioContextSuspended) {
                bgSound.play();
                state.audioContextSuspended = false;
            }
        }, { once: true });
    });
}

export function playSound(buffer, volume = 1) {
    if (!buffer || state.audioContextSuspended) return;
    const sound = new THREE.Audio(state.listener);
    sound.setBuffer(buffer);
    sound.setVolume(volume);
    sound.play();
    setTimeout(() => sound.disconnect(), 3000);
}
