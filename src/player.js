// player.js
import * as THREE from 'three';
import { state } from './state.js';
import { playSound } from './audio.js';
import { updateHUD } from './powerups.js';

/**
 * Cria o “group” do jogador local, com uma esfera “corpo”, câmera e armas.
 */
export function createLocalPlayer() {
    const { scene } = state;
    state.playerGroup = new THREE.Group();
    scene.add(state.playerGroup);

    const bodyGeo = new THREE.SphereGeometry(0.5, 16, 16);
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0x5555ff, opacity: 0, transparent: true });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.set(0, 0.5, 0);
    state.playerGroup.add(bodyMesh);

    state.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    state.camera.position.set(0, 0.5, 0);
    state.playerGroup.add(state.camera);

    // Cria as duas armas
    const leftGun = createGunMesh();
    leftGun.position.set(-0.50, 0.6, -0.5);
    state.playerGroup.add(leftGun);
    state.guns.leftGun.mesh = leftGun;

    const rightGun = createGunMesh();
    rightGun.position.set(0.50, 0.6, -0.5);
    state.playerGroup.add(rightGun);
    state.guns.rightGun.mesh = rightGun;
}

export function createGunMesh() {
    const gunGroup = new THREE.Group();

    // Corpo da arma
    const bodyGeo = new THREE.BoxGeometry(0.1, 0.15, 0.4);
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0x444444, shininess: 30 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0, 0, -0.2);
    gunGroup.add(body);

    // Pivot do cano
    const barrelPivot = new THREE.Group();
    barrelPivot.position.set(0, 0, -0.2);
    gunGroup.add(barrelPivot);

    // Cano
    const barrelGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.6, 10);
    const barrelMat = new THREE.MeshPhongMaterial({ color: 0x555555, shininess: 50 });
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0, -0.3);
    barrelPivot.add(barrel);

    // Muzzle flash
    const muzzleMount = new THREE.Object3D();
    muzzleMount.position.set(0, -0.4, 0);
    barrel.add(muzzleMount);
    const muzzleFlash = createMuzzleFlash();
    muzzleFlash.visible = false;
    muzzleMount.add(muzzleFlash);

    gunGroup.userData.barrelPivot = barrelPivot;
    gunGroup.userData.muzzleFlash = muzzleFlash;

    // Coronha
    const stockGeo = new THREE.BoxGeometry(0.08, 0.12, 0.2);
    const stockMat = new THREE.MeshPhongMaterial({ color: 0x2b2b2b, shininess: 10 });
    const stock = new THREE.Mesh(stockGeo, stockMat);
    stock.position.set(0, 0, 0.1);
    stock.rotation.x = 0.15;
    gunGroup.add(stock);

    return gunGroup;
}

function createMuzzleFlash() {
    const flashGeo = new THREE.SphereGeometry(0.06, 8, 8);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    return new THREE.Mesh(flashGeo, flashMat);
}

/**
 * Cria uma malha de player remoto (esfera + duas armas).
 */
export function createRemotePlayer(id, playerData) {
    const group = new THREE.Group();
    const sphereGeo = new THREE.SphereGeometry(0.5, 16, 16);
    const sphereMat = new THREE.MeshPhongMaterial({ color: 0xff0000 });
    const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
    sphereMesh.position.set(0, 0.5, 0);
    group.add(sphereMesh);

    // Armas
    const leftGun = createGunMesh();
    leftGun.position.set(-0.75, 0.3, 0);
    group.add(leftGun);

    const rightGun = createGunMesh();
    rightGun.position.set(0.75, 0.3, 0);
    group.add(rightGun);

    group.userData.leftGun = leftGun;
    group.userData.rightGun = rightGun;

    // Posição/rotação inicial
    group.position.set(...playerData.position);
    group.rotation.set(...playerData.rotation);

    group.userData.hp = playerData.hp || 100;
    group.userData.ammoLeft = playerData.ammoLeft || state.MAX_AMMO;
    group.userData.ammoRight = playerData.ammoRight || state.MAX_AMMO;

    state.scene.add(group);
    state.otherPlayers[id] = group;
}

/**
 * Lida com respawn do jogador local.
 */
export function resuscitate() {
    state.isDead = false;
    state.respawnOverlayEl.style.display = 'none';
    state.playerHP = 100;
    state.playerGroup.position.set(0, 0, 0);

    // Restaura visibilidade
    state.playerGroup.traverse(obj => {
        if (obj.material) obj.material.opacity = 1;
    });

    sendPlayerUpdate();
}

/**
 * Função de recarga
 */
export function startReload() {
    const { isReloading, reloadTimer } = state;
    if (!state.isReloading) {
        state.isReloading = true;
        state.reloadTimer = 0;
        playSound(state.sounds.reload, 0.5);
    }
}

/**
 * Animação da recarga
 */
export function updateReloadAnimation(delta) {
    const { reloadTimer, RELOAD_TIME, guns, isReloading, MAX_AMMO } = state;

    state.reloadTimer += delta;
    let progress = state.reloadTimer / RELOAD_TIME;
    if (progress > 1) progress = 1;

    const leftGun = guns.leftGun.mesh;
    const rightGun = guns.rightGun.mesh;
    if (!leftGun || !rightGun) return;

    let reloadPhase = progress < 0.5 ? (progress * 2) : (2 - progress * 2);
    const pullBackDistance = reloadPhase * -0.3;
    const tiltAngle = reloadPhase * Math.PI / 3;

    leftGun.position.z = -0.5 - pullBackDistance;
    leftGun.rotation.x = tiltAngle;
    rightGun.position.z = -0.5 - pullBackDistance;
    rightGun.rotation.x = tiltAngle;

    if (progress >= 1) {
        guns.leftGun.ammo = MAX_AMMO;
        guns.rightGun.ammo = MAX_AMMO;

        leftGun.position.z = -0.5;
        leftGun.rotation.x = 0;
        rightGun.position.z = -0.5;
        rightGun.rotation.x = 0;

        state.isReloading = false;
        updateHUD();
    }
}

/**
 * Envia update do player local para o servidor (posição, rotação, HP, etc.).
 */
export function sendPlayerUpdate() {
    const { socket, currentRoomId, playerGroup, camera, playerHP, guns } = state;
    if (!socket || !currentRoomId) return;

    const pos = [
        playerGroup.position.x,
        playerGroup.position.y,
        playerGroup.position.z
    ];
    const rot = [
        camera.rotation.x,
        playerGroup.rotation.y,
        camera.rotation.z
    ];
    const stateData = {
        position: pos,
        rotation: rot,
        hp: playerHP,
        ammoLeft: guns.leftGun.ammo,
        ammoRight: guns.rightGun.ammo
    };
    socket.emit('playerUpdate', stateData);
}
