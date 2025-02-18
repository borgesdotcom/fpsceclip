// utils.js
import { state } from './state.js';
import { updateHUD } from './powerups.js';

/**
 * Reseta o estado do jogo: limpa cena, volta pra lobby, etc.
 */
export function resetGameState() {
    document.getElementById('mainMenu').style.display = 'flex';
    document.getElementById('modern-hud').style.display = 'none';
    document.getElementById('matchStatus').style.display = 'none';
    state.renderer.domElement.style.visibility = 'hidden';

    // Sai do pointer lock
    document.exitPointerLock();

    // Remove players remotos
    Object.keys(state.otherPlayers).forEach(id => {
        state.scene.remove(state.otherPlayers[id]);
        delete state.otherPlayers[id];
    });

    // Reseta player local
    state.playerGroup.position.set(0, 0, 0);
    state.playerHP = 100;
    state.guns.leftGun.ammo = state.MAX_AMMO;
    state.guns.rightGun.ammo = state.MAX_AMMO;
    updateHUD();
}

/**
 * Adiciona uma mensagem de kill feed na tela.
 */
export function addKillFeedMessage(text) {
    state.killMessages.push({ text, life: state.KILL_FEED_DURATION });
}

/**
 * Lida com morte local.
 */
export function handleLocalPlayerDeath() {
    state.isDead = true;
    state.velocity.set(0, 0, 0);
    state.respawnOverlayEl.style.display = 'flex';

    // Auto reset após 5s
    setTimeout(() => {
        resuscitate();
        resetGameState();
    }, 5000);
}

import { resuscitate } from './player.js';
import * as THREE from 'three';

/**
 * Atualiza o kill feed.
 */
export function updateKillFeed(delta) {
    for (let i = state.killMessages.length - 1; i >= 0; i--) {
        state.killMessages[i].life -= delta;
        if (state.killMessages[i].life <= 0) {
            state.killMessages.splice(i, 1);
        }
    }

    state.killFeedEl.innerHTML = state.killMessages
        .map(msg => `<div>${msg.text}</div>`)
        .join('');
}

/**
 * Cria efeito de hit e som posicional.
 */
export function spawnHitEffect(position) {
    const geo = new THREE.SphereGeometry(0.1, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
    const puff = new THREE.Mesh(geo, mat);
    puff.position.copy(position);
    state.scene.add(puff);

    state.hitEffects.push({ mesh: puff, life: 0 });

    const hitSound = new THREE.PositionalAudio(state.listener);
    hitSound.setBuffer(state.sounds.hit);
    hitSound.setRefDistance(20);

    const dummy = new THREE.Object3D();
    dummy.position.copy(position);
    state.scene.add(dummy);
    dummy.add(hitSound);
    hitSound.play();

    setTimeout(() => state.scene.remove(dummy), 2000);
}
