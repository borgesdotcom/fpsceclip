// state.js
import * as THREE from 'three';

export const state = {
    // Cena, renderizador, câmera
    scene: null,
    renderer: null,
    camera: null,

    // Conexão Socket
    socket: null,
    currentRoomId: null,

    // Grupos e objetos
    playerGroup: null,
    otherPlayers: {},
    environmentMeshes: [],

    // Áudio
    listener: null,
    sounds: {},

    // Power-ups
    POWERUP_TYPES: {
        HEALTH: { color: 0xff0000, duration: 0, respawnTime: 30 },
        AMMO: { color: 0xffff00, duration: 0, respawnTime: 20 },
        SPEED: { color: 0x00ff00, duration: 10, respawnTime: 45 },
        DAMAGE: { color: 0xff00ff, duration: 15, respawnTime: 60 }
    },
    powerUps: [],

    // Movimentação
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    velocity: new THREE.Vector3(),
    canJump: false,
    pitch: 0,
    yaw: 0,
    mouseSensitivity: 0.002,

    // Head-bob
    baseHeight: 1.6,
    bobAmplitude: 0.04,
    bobFrequency: 8,
    walkTime: 0,

    // Tilt ao virar
    rollAngle: 0,
    lastYaw: 0,
    turnRollFactor: 0.4,
    rollDamp: 6.0,

    // Sprint / Dash
    isRunning: false,
    canDash: true,
    dashCooldownTimer: 0,
    isDashing: false,
    dashTimer: 0,
    currentGunTilt: 0,
    RUN_SPEED_MULTIPLIER: 1.5,
    BASE_MOVE_SPEED: 5.0,
    GUN_TILT_ANGLE: 0.4,
    DASH_SPEED: 50.0,
    DASH_DURATION: 0.3,
    DASH_COOLDOWN: 2.0,
    DASH_ROLL_ANGLE: Math.PI / 2,

    // Timing
    prevTime: performance.now(),

    // Estado do jogador local
    playerHP: 100,

    // Sistema de kill feed
    killFeedEl: null,
    killMessages: [],
    KILL_FEED_DURATION: 5,

    // Respawn
    respawnOverlayEl: null,
    isDead: false,

    // Armas / Ammo
    MAX_AMMO: 8,
    RELOAD_TIME: 0.6,
    RECOIL_STRENGTH: 0.06,
    RECOIL_DURATION: 0.05,

    hitMarkerEl: null,
    hitMarkerTimer: 0,
    hitMarkerDuration: 0.2,

    guns: {
        leftGun: { mesh: null, ammo: 8, muzzleFlashTimer: 0 },
        rightGun: { mesh: null, ammo: 8, muzzleFlashTimer: 0 }
    },

    // Reload
    isReloading: false,
    reloadTimer: 0,

    // Recoil
    recoilTimer: 0,
    currentRecoil: 0,

    // Projetéis
    projectiles: [],
    projectileSpeed: 50,
    projectileLifetime: 2,

    // Shell casings
    shellCasings: [],

    // Efeitos de hit
    hitEffects: [],

    // Controle de paredes e pulo
    lastWallNormal: new THREE.Vector3(),
    lastWallTime: 0,
    wallJumpGracePeriod: 600,
    wallJumpVerticalSpeed: 7.0,
    wallJumpHorizontalSpeed: 5.0,
    wallSlideSpeed: 1.5,
    isTouchingWall: false,

    // Overlays de interface
    blocker: null,
    instructions: null,

    // Flag para audioContext
    audioContextSuspended: true,
    controlsOverlay: false
};
