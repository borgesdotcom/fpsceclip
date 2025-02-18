// main.js
import * as THREE from 'three';
import { state } from './state.js';
import { createEnvironment, checkPlayerCollisions } from './environment.js';
import { initAudio, initBackgroundAudio, playSound } from './audio.js';
import { createLocalPlayer, updateReloadAnimation, sendPlayerUpdate } from './player.js';
import { initSocket } from './network.js';
import { spawnPowerUps, updatePowerUps, checkPowerUpCollisions, updateHUD } from './powerups.js';
import { initControls } from './controls.js';
import { initMenu } from './menu.js';
import { updateKillFeed, spawnHitEffect } from './utils.js';

init();
animate();

function init() {
    // Seleciona elementos da UI
    state.hitMarkerEl = document.getElementById('hitMarker');
    state.blocker = document.getElementById('blocker');
    state.instructions = document.getElementById('instructions');
    state.killFeedEl = document.getElementById('killFeed');
    state.respawnOverlayEl = document.getElementById('respawnOverlay');

    // Cena + render
    state.scene = new THREE.Scene();
    state.renderer = new THREE.WebGLRenderer({ antialias: true });
    state.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(state.renderer.domElement);
    state.renderer.domElement.style.visibility = 'hidden';

    // Cria ambiente
    const { floor, platform, highPlatform, floatingPlatform } = createEnvironment();

    // Surfaces para spawn de powerups
    const spawnableSurfaces = [
        { mesh: floor, width: 200, depth: 200, offsetY: 0.5 },
        { mesh: platform, width: 40, depth: 40, offsetY: 1 },
        { mesh: highPlatform, width: 15, depth: 15, offsetY: 1 },
        { mesh: floatingPlatform, width: 10, depth: 10, offsetY: 1 }
    ];
    spawnPowerUps(spawnableSurfaces, 6);

    // Audio
    initAudio();
    initBackgroundAudio();

    // Menu e Controles
    initMenu();
    initControls();

    // Cria player local
    createLocalPlayer();

    // Inicia socket
    initSocket();
}

/**
 * Loop principal de animação.
 */
function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    const delta = (time - state.prevTime) / 1000;
    state.prevTime = time;

    const currentYaw = state.yaw;
    const turnSpeed = currentYaw - state.lastYaw;
    state.lastYaw = currentYaw;
    state.rollAngle += turnSpeed * state.turnRollFactor;
    state.rollAngle -= state.rollAngle * state.rollDamp * delta;

    // Input -> movimento
    const inputVector = new THREE.Vector3();
    if (!state.isDead) {
        if (state.moveForward) inputVector.z -= 5;
        if (state.moveBackward) inputVector.z += 5;
        if (state.moveLeft) inputVector.x -= 5;
        if (state.moveRight) inputVector.x += 5;
    }

    const yawRotation = new THREE.Euler(0, state.yaw, 0, 'YXZ');
    const movementDir = inputVector.clone().applyEuler(yawRotation);

    // Fricção + gravidade
    const friction = 8.0;
    const moveSpeed = 10.0;
    const gravity = 9.8 * 3.0;

    state.velocity.x -= state.velocity.x * friction * delta;
    state.velocity.z -= state.velocity.z * friction * delta;
    state.velocity.y -= gravity * delta;

    state.velocity.x += movementDir.x * moveSpeed * delta;
    state.velocity.z += movementDir.z * moveSpeed * delta;

    // Atualiza posição
    state.playerGroup.position.x += state.velocity.x * delta;
    state.playerGroup.position.y += state.velocity.y * delta;
    state.playerGroup.position.z += state.velocity.z * delta;

    // Checa colisão com ambiente
    const onGround = checkPlayerCollisions();
    if (onGround) {
        state.canJump = true;
    }
    if (state.isTouchingWall && !onGround) {
        state.velocity.y = Math.max(state.velocity.y, -state.wallSlideSpeed);
    }

    // Head-bob
    const speedXZ = Math.sqrt(state.velocity.x * state.velocity.x + state.velocity.z * state.velocity.z);
    const isMoving = speedXZ > 0.1 && onGround;
    if (isMoving) {
        state.walkTime += delta * (speedXZ * 0.3);
        const bobOffset = Math.sin(state.walkTime * state.bobFrequency) * state.bobAmplitude;
        state.camera.position.y = 1.0 + bobOffset;
    } else {
        state.walkTime = 0;
        state.camera.position.y = 1.0;
    }

    // Recoil
    if (state.recoilTimer < state.RECOIL_DURATION) {
        state.recoilTimer += delta;
        const progress = state.recoilTimer / state.RECOIL_DURATION;
        state.currentRecoil = (1 - progress) * state.RECOIL_STRENGTH;
    } else {
        state.currentRecoil = 0;
    }
    const finalPitch = state.pitch - state.currentRecoil;

    // Aplica rotações
    state.playerGroup.rotation.y = state.yaw;
    state.camera.rotation.x = finalPitch;
    state.camera.rotation.z = state.rollAngle;

    // Armas seguem rotação da câmera
    state.guns.leftGun.mesh.rotation.x = state.camera.rotation.x;
    state.guns.leftGun.mesh.rotation.z = state.camera.rotation.z;
    state.guns.rightGun.mesh.rotation.x = state.camera.rotation.x;
    state.guns.rightGun.mesh.rotation.z = state.camera.rotation.z;

    // Reload
    if (state.isReloading) {
        updateReloadAnimation(delta);
    }

    // Sprint / Run
    const currentMoveSpeed = state.isRunning ? state.BASE_MOVE_SPEED * state.RUN_SPEED_MULTIPLIER : state.BASE_MOVE_SPEED;
    state.velocity.x += movementDir.x * currentMoveSpeed * delta;
    state.velocity.z += movementDir.z * currentMoveSpeed * delta;

    // Tilt das armas ao correr
    const targetTilt = state.isRunning ? state.GUN_TILT_ANGLE : 0;
    state.currentGunTilt = THREE.MathUtils.lerp(state.currentGunTilt, targetTilt, delta * 10);
    state.guns.leftGun.mesh.rotation.x = state.camera.rotation.x + state.currentGunTilt;
    state.guns.rightGun.mesh.rotation.x = state.camera.rotation.x + state.currentGunTilt;

    // Dash
    if (state.isDashing) {
        state.dashTimer += delta;
        const progress = Math.min(state.dashTimer / state.DASH_DURATION, 1.0);
        const roll = Math.sin(progress * Math.PI) * state.DASH_ROLL_ANGLE;
        state.camera.rotation.z = roll;

        if (state.dashTimer >= state.DASH_DURATION) {
            state.isDashing = false;
            state.camera.rotation.z = 0;
        }
    }

    if (!state.canDash) {
        state.dashCooldownTimer += delta;
        if (state.dashCooldownTimer >= state.DASH_COOLDOWN) {
            state.canDash = true;
            state.dashCooldownTimer = 0;
        }
        updateHUD();
    }

    // Hit marker
    if (state.hitMarkerEl.style.display === 'block') {
        state.hitMarkerTimer += delta;
        if (state.hitMarkerTimer > state.hitMarkerDuration) {
            state.hitMarkerEl.style.display = 'none';
        }
    }

    // Atualiza muzzle flash local
    updateMuzzleFlashes(delta);

    // Atualiza projéteis
    updateProjectiles(delta);

    // Atualiza cartuchos
    updateShellCasings(delta);

    // Atualiza efeitos de hit
    updateHitEffects(delta);

    // Envia update do player local
    sendPlayerUpdate();

    // Kill feed
    updateKillFeed(delta);

    // Power-ups
    updatePowerUps(delta);
    checkPowerUpCollisions();

    state.renderer.render(state.scene, state.camera);
}

/**
 * Muzzle flashes locais
 */
function updateMuzzleFlashes(delta) {
    [state.guns.leftGun, state.guns.rightGun].forEach((gun) => {
        const muzzleFlash = gun.mesh.userData.muzzleFlash;
        if (!muzzleFlash || !muzzleFlash.visible) return;
        gun.muzzleFlashTimer += delta;
        if (gun.muzzleFlashTimer > 0.05) {
            muzzleFlash.visible = false;
            gun.muzzleFlashTimer = 0;
        }
    });
}

/**
 * Atualiza projéteis
 */
function updateProjectiles(delta) {
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
        const p = state.projectiles[i];
        p.life += delta;
        if (p.life > state.projectileLifetime) {
            state.scene.remove(p.mesh);
            state.projectiles.splice(i, 1);
            continue;
        }
        p.mesh.position.addScaledVector(p.velocity, delta);

        // Checa colisão com ambiente
        if (checkProjectileCollision(p.mesh)) {
            spawnHitEffect(p.mesh.position);
            state.scene.remove(p.mesh);
            state.projectiles.splice(i, 1);
            continue;
        }

        // Checa colisão com players
        if (checkPlayerCollision(p)) {
            spawnHitEffect(p.mesh.position);
            state.scene.remove(p.mesh);
            state.projectiles.splice(i, 1);
            continue;
        }
    }
}

/**
 * Verifica colisão do projétil com o ambiente
 */
function checkProjectileCollision(projMesh) {
    const radius = 0.05;
    const projPos = projMesh.position.clone();
    for (let envMesh of state.environmentMeshes) {
        const box = new THREE.Box3().setFromObject(envMesh);
        if (box.distanceToPoint(projPos) < radius) {
            return true;
        }
    }
    return false;
}

/**
 * Verifica colisão do projétil com players
 */
function checkPlayerCollision(projectile) {
    const projRadius = 0.05;
    const projPos = projectile.mesh.position;

    // Checa players remotos
    for (let id in state.otherPlayers) {
        const other = state.otherPlayers[id];
        const otherPos = other.position.clone();
        otherPos.y += 0.5;
        const distance = projPos.distanceTo(otherPos);
        if (distance < 0.5 + projRadius) {
            // Atingiu outro player
            state.socket.emit('playerHit', {
                victimId: id,
                damage: 15,
                shooterId: projectile.shooterId
            });
            if (projectile.shooterId === state.socket.id) {
                playSound(state.sounds.enemyhit, 2);
                showHitMarker();
            }
            return true;
        }
    }

    // Checa player local
    if (projectile.shooterId !== state.socket.id) {
        const localPos = state.playerGroup.position.clone();
        localPos.y += 0.5;
        if (!state.isDead && projPos.distanceTo(localPos) < 0.5 + projRadius) {
            state.socket.emit('playerHit', {
                victimId: state.socket.id,
                damage: 15,
                shooterId: projectile.shooterId
            });
            return true;
        }
    }
    return false;
}

/**
 * Mostra um hitmarker simples na tela.
 */
function showHitMarker() {
    const hitMarker = document.createElement('div');
    hitMarker.className = 'hit-marker';
    document.getElementById('modern-hud').appendChild(hitMarker);
    setTimeout(() => hitMarker.remove(), 300);
}

/**
 * Atualiza cartuchos
 */
function updateShellCasings(delta) {
    for (let i = state.shellCasings.length - 1; i >= 0; i--) {
        const shell = state.shellCasings[i];
        shell.life -= delta;
        if (shell.life < 0) {
            state.scene.remove(shell.mesh);
            state.shellCasings.splice(i, 1);
            continue;
        }
        shell.velocity.y -= 9.8 * delta;
        shell.velocity.x -= shell.velocity.x * 2.0 * delta;
        shell.velocity.z -= shell.velocity.z * 2.0 * delta;
        shell.mesh.position.addScaledVector(shell.velocity, delta);

        shell.mesh.rotation.x += Math.random() * 5 * delta;
        shell.mesh.rotation.y += Math.random() * 5 * delta;
    }
}

/**
 * Atualiza efeitos de hit
 */
function updateHitEffects(delta) {
    for (let i = state.hitEffects.length - 1; i >= 0; i--) {
        const eff = state.hitEffects[i];
        eff.life += delta;
        const scale = 1 + eff.life * 3;
        eff.mesh.scale.set(scale, scale, scale);
        eff.mesh.material.opacity = 0.8 - eff.life * 0.8;

        if (eff.life > 1) {
            state.scene.remove(eff.mesh);
            state.hitEffects.splice(i, 1);
        }
    }
}
