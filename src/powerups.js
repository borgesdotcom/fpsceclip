// powerups.js
import * as THREE from 'three';
import { state } from './state.js';
import { playSound } from './audio.js';

/**
 * Cria um objeto de power-up no mundo.
 */
export function createPowerUp(type, position) {
    const geometry = new THREE.SphereGeometry(0.4, 16, 16);
    const material = new THREE.MeshPhongMaterial({
        color: type.color,
        emissive: type.color,
        emissiveIntensity: 0.5
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position.x, position.y, position.z);

    // Partículas decorativas
    const particles = new THREE.Group();
    const particleGeo = new THREE.SphereGeometry(0.05, 8, 8);
    const particleMat = new THREE.MeshPhongMaterial({ color: type.color });
    for (let i = 0; i < 8; i++) {
        const particle = new THREE.Mesh(particleGeo, particleMat);
        particle.uOffset = Math.random() * Math.PI * 2;
        particle.position.set(
            Math.random() - 0.5,
            Math.random() - 0.5,
            Math.random() - 0.5
        ).normalize().multiplyScalar(0.6);
        particles.add(particle);
    }
    mesh.add(particles);

    return {
        mesh: mesh,
        type: type,
        particles: particles,
        active: true,
        respawnTimer: 0
    };
}

/**
 * Spawna os power-ups em superfícies seguras (por exemplo, plataforma, chão, etc.).
 */
export function spawnPowerUps(surfaces, numberOfPowerUps) {
    const { POWERUP_TYPES, powerUps, scene } = state;

    for (let i = 0; i < numberOfPowerUps; i++) {
        const surface = surfaces[Math.floor(Math.random() * surfaces.length)];
        const halfWidth = surface.width / 2;
        const halfDepth = surface.depth / 2;
        const randomX = Math.random() * surface.width - halfWidth;
        const randomZ = Math.random() * surface.depth - halfDepth;
        const pos = new THREE.Vector3(
            surface.mesh.position.x + randomX,
            surface.mesh.position.y + surface.offsetY,
            surface.mesh.position.z + randomZ
        );

        const typeKeys = Object.keys(POWERUP_TYPES);
        const randomKey = typeKeys[Math.floor(Math.random() * typeKeys.length)];
        const randomType = POWERUP_TYPES[randomKey];

        const powerUp = createPowerUp(randomType, pos);
        powerUps.push(powerUp);
        scene.add(powerUp.mesh);
    }
}

/**
 * Checa colisões do player com power-ups e aplica o efeito quando colidido.
 */
export function checkPowerUpCollisions() {
    const {
        powerUps,
        playerGroup,
        scene,
        POWERUP_TYPES,
        audioContextSuspended
    } = state;

    const playerPos = playerGroup.position;

    powerUps.forEach(powerUp => {
        if (!powerUp.active) return;
        const distance = playerPos.distanceTo(powerUp.mesh.position);
        if (distance < 1.2) {
            applyPowerUp(powerUp.type);
            powerUp.active = false;
            scene.remove(powerUp.mesh);
            playSound(state.sounds.powerup, 0.7);
        }
    });
}

/**
 * Aplica o efeito de um determinado power-up.
 */
export function applyPowerUp(type) {
    const icon = document.createElement('div');
    icon.className = 'powerup-icon';
    icon.style.backgroundColor = `#${type.color.toString(16)}`;
    document.getElementById('active-powerups').appendChild(icon);

    if (type.duration > 0) {
        setTimeout(() => {
            icon.remove();
        }, type.duration * 1000);
    }

    switch (type) {
        case state.POWERUP_TYPES.HEALTH:
            state.playerHP = Math.min(state.playerHP + 30, 100);
            updateHUD();
            break;
        case state.POWERUP_TYPES.AMMO:
            state.guns.leftGun.ammo = state.MAX_AMMO;
            state.guns.rightGun.ammo = state.MAX_AMMO;
            updateHUD();
            break;
        case state.POWERUP_TYPES.SPEED:
            {
                const originalSpeed = state.BASE_MOVE_SPEED;
                state.BASE_MOVE_SPEED *= 1.5;
                setTimeout(() => {
                    state.BASE_MOVE_SPEED = originalSpeed;
                }, type.duration * 1000);
            }
            break;
        case state.POWERUP_TYPES.DAMAGE:
            {
                const originalRecoil = state.RECOIL_STRENGTH;
                state.RECOIL_STRENGTH *= 1.5;
                setTimeout(() => {
                    state.RECOIL_STRENGTH = originalRecoil;
                }, type.duration * 1000);
            }
            break;
    }
}

/**
 * Faz o respawn dos power-ups quando o timer é atingido.
 */
export function updatePowerUps(delta) {
    const { powerUps, scene } = state;

    powerUps.forEach(powerUp => {
        if (!powerUp.active) {
            powerUp.respawnTimer += delta;
            if (powerUp.respawnTimer >= powerUp.type.respawnTime) {
                powerUp.active = true;
                powerUp.respawnTimer = 0;
                scene.add(powerUp.mesh);
            }
        } else {
            // Animação de rotação e partículas
            powerUp.mesh.rotation.y += delta;
            powerUp.particles.children.forEach(p => {
                p.position.y = Math.sin(performance.now() * 0.001 + p.uOffset) * 0.2;
            });
        }
    });
}

/**
 * Atualiza HUD (barra de vida, munição, etc.) – precisamos chamar também aqui.
 */
export function updateHUD() {
    const { playerHP, guns, MAX_AMMO, dashCooldownTimer, DASH_COOLDOWN } = state;

    // Health
    const healthFill = document.getElementById('healthFill');
    const healthText = document.getElementById('healthText');
    healthFill.style.width = `${playerHP}%`;
    healthText.textContent = playerHP;

    // Ammo
    const leftAmmoFill = document.getElementById('leftAmmoFill');
    const rightAmmoFill = document.getElementById('rightAmmoFill');
    leftAmmoFill.style.height = `${(guns.leftGun.ammo / MAX_AMMO) * 100}%`;
    rightAmmoFill.style.height = `${(guns.rightGun.ammo / MAX_AMMO) * 100}%`;

    // Dash cooldown
    const dashProgress = document.getElementById('dashProgress');
    const cooldownProgress = 1 - (dashCooldownTimer / DASH_COOLDOWN);
    dashProgress.style.background = `conic-gradient(#00ffff ${cooldownProgress * 100}%, 0%, rgba(0,0,0,0.3) 100%)`;
}
