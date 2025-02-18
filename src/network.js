// network.js
import { io } from 'socket.io-client';
import { state } from './state.js';
import { createRemotePlayer } from './player.js';
import { resetGameState, addKillFeedMessage, handleLocalPlayerDeath } from './utils.js';
import { playSound } from './audio.js';

/**
 * Inicializa a conexão socket e define listeners.
 */
export function initSocket() {
    state.socket = io();

    state.socket.on('connect', () => {
        console.log('Conectado ao servidor, ID:', state.socket.id);
    });

    state.socket.on('matchFound', ({ roomId, opponent, opponentState, yourState }) => {
        state.currentRoomId = roomId;
        document.getElementById('mainMenu').style.display = 'none';
        document.getElementById('modern-hud').style.display = 'block';
        state.renderer.domElement.style.visibility = 'visible';

        initGameState(opponent, opponentState, yourState);
    });

    state.socket.on('playerLeft', () => {
        alert('Oponente desconectou! Voltando para o lobby...');
        resetGameState();
    });

    state.socket.on('matchEnded', () => {
        resetGameState();
    });

    state.socket.on('currentPlayers', (players) => {
        for (let id in players) {
            if (id !== state.socket.id) {
                createRemotePlayer(id, players[id]);
            }
        }
    });

    state.socket.on('newPlayer', (playerData) => {
        if (playerData.id !== state.socket.id) {
            createRemotePlayer(playerData.id, playerData);
        }
    });

    state.socket.on('playerKilled', ({ shooterId, victimId }) => {
        addKillFeedMessage(`${shooterId} killed ${victimId}`);
        if (victimId === state.socket.id) {
            handleLocalPlayerDeath();
        }
    });

    state.socket.on('playerUpdated', (id, data) => {
        if (id === state.socket.id) {
            if (typeof data.hp !== 'undefined') {
                const oldHP = state.playerHP;
                state.playerHP = data.hp;
                if (data.hp < oldHP) {
                    playSound(state.sounds.hurt, 0.6);
                    if (data.hp <= 0) {
                        playSound(state.sounds.death, 0.8);
                    }
                }
            }
            if (data.position) {
                state.playerGroup.position.set(data.position[0], data.position[1], data.position[2]);
            }
        } else {
            const other = state.otherPlayers[id];
            if (!other) return;
            if (typeof data.hp !== 'undefined') {
                other.userData.hp = data.hp;
            }
            if (data.position) {
                other.position.set(data.position[0], data.position[1], data.position[2]);
            }
            if (data.rotation) {
                other.rotation.y = data.rotation[1];
                const leftGun = other.userData.leftGun;
                const rightGun = other.userData.rightGun;
                if (leftGun) {
                    leftGun.rotation.x = data.rotation[0];
                    leftGun.rotation.z = data.rotation[2];
                }
                if (rightGun) {
                    rightGun.rotation.x = data.rotation[0];
                    rightGun.rotation.z = data.rotation[2];
                }
            }
        }
    });

    state.socket.on('playerShot', (playerId, gunSide) => {
        const other = state.otherPlayers[playerId];
        if (!other) return;
        const posAudio = new THREE.PositionalAudio(state.listener);
        posAudio.setBuffer(state.sounds.gunshot);
        posAudio.setRefDistance(15);
        other.add(posAudio);
        posAudio.play();
        setTimeout(() => other.remove(posAudio), 1000);

        let gunMesh;
        if (gunSide === 'left') {
            gunMesh = other.userData.leftGun;
        } else {
            gunMesh = other.userData.rightGun;
        }
        if (gunMesh && gunMesh.userData.muzzleFlash) {
            gunMesh.userData.muzzleFlash.visible = true;
            setTimeout(() => { gunMesh.userData.muzzleFlash.visible = false; }, 50);

            // Cria projétil inimigo na cena
            spawnRemoteProjectile(playerId, gunMesh);
        }
    });

    state.socket.on('playerDisconnected', (id) => {
        if (state.otherPlayers[id]) {
            state.scene.remove(state.otherPlayers[id]);
            delete state.otherPlayers[id];
        }
    });
}

import * as THREE from 'three';

/**
 * Inicializa o estado do jogo local assim que a partida é encontrada.
 */
export function initGameState(opponentId, opponentState, yourState) {
    // Remove todos os jogadores remotos atuais
    Object.keys(state.otherPlayers).forEach(id => {
        state.scene.remove(state.otherPlayers[id]);
        delete state.otherPlayers[id];
    });

    // Seta estado do player local
    state.playerGroup.position.set(...yourState.position);
    state.playerHP = yourState.hp;
    state.guns.leftGun.ammo = yourState.ammoLeft;
    state.guns.rightGun.ammo = yourState.ammoRight;

    // Cria o oponente
    createRemotePlayer(opponentId, opponentState);

    // Força pointer lock
    document.body.requestPointerLock();
}

function spawnRemoteProjectile(playerId, gunMesh) {
    const projGeo = new THREE.SphereGeometry(0.05, 8, 8);
    const projMat = new THREE.MeshPhongMaterial({ color: 0xff0000 });
    const projectile = new THREE.Mesh(projGeo, projMat);

    const muzzleFlash = gunMesh.userData.muzzleFlash;
    const worldPos = new THREE.Vector3();
    muzzleFlash.getWorldPosition(worldPos);
    projectile.position.copy(worldPos);
    state.scene.add(projectile);

    const direction = new THREE.Vector3();
    gunMesh.getWorldDirection(direction);
    direction.negate(); // Armas apontam para -Z no mesh
    const projVel = direction.multiplyScalar(state.projectileSpeed);

    state.projectiles.push({
        mesh: projectile,
        velocity: projVel,
        life: 0,
        shooterId: playerId
    });
}
