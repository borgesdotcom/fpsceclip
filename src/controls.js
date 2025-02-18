// controls.js
import { state } from './state.js';
import { startReload } from './player.js';
import { playSound } from './audio.js';

/**
 * Inicializa os eventos de mouse e teclado.
 */
export function initControls() {
    document.addEventListener('pointerlockchange', onPointerLockChange, false);
    document.addEventListener('pointerlockerror', onPointerLockError, false);

    document.addEventListener('keydown', onKeyDown, false);
    document.addEventListener('keyup', onKeyUp, false);
    document.addEventListener('mousedown', onMouseDown, false);
    document.addEventListener('mousemove', onMouseMove, false);

    window.addEventListener('resize', onWindowResize, false);

    window.addEventListener('blur', () => {
        if (document.pointerLockElement === document.body) {
            document.exitPointerLock();
        }
        blocker.style.display = 'flex';
    });

    window.addEventListener('focus', () => {
        if (document.pointerLockElement !== document.body) {
            blocker.style.display = 'flex';
        }
    });

    state.blocker.addEventListener('click', function () {
        document.body.requestPointerLock();
    });

    // Respawn ao apertar qualquer tecla se estiver morto
    document.addEventListener('keydown', () => {
        if (state.isDead) {
            resuscitate();
        }
    });
}

function onPointerLockChange() {
    if (document.pointerLockElement !== document.body) {
        state.blocker.style.display = 'flex';
    } else {
        state.blocker.style.display = 'none';
    }
}

function onPointerLockError() {
    state.instructions.style.display = '';
}

function onKeyDown(event) {
    if (state.isDead) return;

    switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
            state.moveForward = true;
            break;
        case 'KeyS':
        case 'ArrowDown':
            state.moveBackward = true;
            break;
        case 'KeyA':
        case 'ArrowLeft':
            state.moveLeft = true;
            break;
        case 'KeyD':
        case 'ArrowRight':
            state.moveRight = true;
            break;
        case 'Space':
            if (state.canJump) {
                state.velocity.y = 10.0;
                playSound(state.sounds.jump, 0.5);
                state.canJump = false;
            } else if (performance.now() - state.lastWallTime < state.wallJumpGracePeriod) {
                // Wall jump
                state.velocity.y = state.wallJumpVerticalSpeed;
                state.velocity.addScaledVector(state.lastWallNormal, state.wallJumpHorizontalSpeed);
                state.lastWallTime = 0;
                playSound(state.sounds.jump, 0.5);
                state.canJump = false;
            }
            break;
        case 'KeyR':
            if (!state.isReloading) {
                startReload();
            }
            break;
        case 'ShiftLeft':
        case 'ShiftRight':
            state.isRunning = true;
            break;
        case 'KeyQ':
            if (state.canDash && !state.isDashing) {
                startDash();
            }
            break;
        default:
            break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
            state.moveForward = false;
            break;
        case 'KeyS':
        case 'ArrowDown':
            state.moveBackward = false;
            break;
        case 'KeyA':
        case 'ArrowLeft':
            state.moveLeft = false;
            break;
        case 'KeyD':
        case 'ArrowRight':
            state.moveRight = false;
            break;
        case 'ShiftLeft':
        case 'ShiftRight':
            state.isRunning = false;
            break;
        default:
            break;
    }
}

function onMouseDown(event) {
    if (state.isDead) return;
    if (event.button === 0) {
        shootGun(state.guns.leftGun, 'left');
    } else if (event.button === 2) {
        shootGun(state.guns.rightGun, 'right');
    }
}

function onMouseMove(event) {
    if (document.pointerLockElement === document.body) {
        state.yaw -= event.movementX * state.mouseSensitivity;
        state.pitch -= event.movementY * state.mouseSensitivity;

        const maxPitch = Math.PI / 2 - 0.01;
        if (state.pitch > maxPitch) state.pitch = maxPitch;
        if (state.pitch < -maxPitch) state.pitch = -maxPitch;
    }
}

function onWindowResize() {
    state.camera.aspect = window.innerWidth / window.innerHeight;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(window.innerWidth, window.innerHeight);
}

function startDash() {
    state.isDashing = true;
    state.dashTimer = 0;
    state.canDash = false;
    state.dashCooldownTimer = 0;

    // Direção do dash
    const dashDirection = new THREE.Vector3();
    state.camera.getWorldDirection(dashDirection);
    dashDirection.y = 0;
    dashDirection.normalize();

    // Aplica velocidade no dash
    state.velocity.addScaledVector(dashDirection, state.DASH_SPEED);
    playSound(state.sounds.dash, 0.6);
}

/**
 * Lógica de disparo das armas
 */
function shootGun(gun, gunSide) {
    const { isDead, isReloading, isRunning } = state;
    if (isDead || isReloading || gun.ammo <= 0 || isRunning) return;

    gun.ammo--;
    updateHUD();

    // Recuo
    state.recoilTimer = 0;

    // Flash
    const muzzleFlash = gun.mesh.userData.muzzleFlash;
    if (muzzleFlash) {
        muzzleFlash.visible = true;
        gun.muzzleFlashTimer = 0;
    }

    // Ejetar cartucho
    ejectShell(gun.mesh);

    // Spawn do projétil local
    spawnProjectile(gun.mesh);

    // Avisar servidor
    if (state.socket) {
        state.socket.emit('shoot', gunSide);
    }

    playSound(state.sounds.gunshot, 0.4);
}

function ejectShell(gunMesh) {
    const shellGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.06, 8);
    const shellMat = new THREE.MeshPhongMaterial({ color: 0xb08d57 });
    const shell = new THREE.Mesh(shellGeo, shellMat);

    const worldPos = new THREE.Vector3();
    gunMesh.getWorldPosition(worldPos);
    shell.position.copy(worldPos);
    state.scene.add(shell);

    const shellVel = new THREE.Vector3(
        (Math.random() - 0.5) * 1.0,
        1 + Math.random() * 0.3,
        (Math.random() - 0.5) * 1.0
    );

    state.shellCasings.push({
        mesh: shell,
        velocity: shellVel,
        life: 1.5
    });
}

function spawnProjectile(gunMesh) {
    const projGeo = new THREE.SphereGeometry(0.05, 8, 8);
    const projMat = new THREE.MeshPhongMaterial({ color: 0xff0000 });
    const projectile = new THREE.Mesh(projGeo, projMat);

    const muzzlePos = new THREE.Vector3();
    gunMesh.userData.muzzleFlash.getWorldPosition(muzzlePos);
    projectile.position.copy(muzzlePos);

    state.scene.add(projectile);

    const dir = new THREE.Vector3();
    state.camera.getWorldDirection(dir);
    dir.normalize();
    const projVel = dir.multiplyScalar(state.projectileSpeed);

    state.projectiles.push({
        mesh: projectile,
        velocity: projVel,
        life: 0,
        shooterId: state.socket.id
    });
}

import * as THREE from 'three';
import { updateHUD } from './powerups.js';
import { resuscitate } from './player.js';
