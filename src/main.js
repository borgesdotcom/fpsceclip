import * as THREE from 'three';
// IMPORTANT: import socket.io-client
import { io } from 'socket.io-client';

// ---------------------------------
//  SCENE, RENDERER, ETC.
// ---------------------------------
let scene, renderer;

// We'll keep a reference to the local "playerGroup" which holds the camera + sphere + guns.
let playerGroup;
let camera;
let audioContextSuspended = true;

let socket;
const otherPlayers = {}; // Store each remote player's Group by their socket.id

let listener;
const sounds = {}; // Stores loaded audio buffers

// Movement, input
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;

let velocity = new THREE.Vector3();
let pitch = 0;
let yaw = 0;
const mouseSensitivity = 0.002;

// "Head-bob"
const baseHeight = 1.6;
const bobAmplitude = 0.04;
const bobFrequency = 8;
let walkTime = 0;

// "Turning tilt"
let rollAngle = 0;
let lastYaw = 0;
const turnRollFactor = 0.4;
const rollDamp = 6.0;

let isRunning = false;
let canDash = true;
let dashCooldownTimer = 0;
let isDashing = false;
let dashTimer = 0;
let currentGunTilt = 0;

const RUN_SPEED_MULTIPLIER = 1.5;
const BASE_MOVE_SPEED = 5.0;
const GUN_TILT_ANGLE = 0.4; // Radians to tilt guns down when running
const DASH_SPEED = 50.0;
const DASH_DURATION = 0.3;
const DASH_COOLDOWN = 2.0;
const DASH_ROLL_ANGLE = Math.PI / 2; // 60 degrees

// Timing
let prevTime = performance.now();

// Pointer lock elements
const blocker = document.getElementById('blocker');
const instructions = document.getElementById('instructions');

// Player stats
let playerHP = 100;  // local player's HP

const killFeedEl = document.getElementById('killFeed');
const killMessages = []; // will store { text, life } objects
const KILL_FEED_DURATION = 5; // each message lives 5 seconds

// Death/Respawn overlay
const respawnOverlayEl = document.getElementById('respawnOverlay');
let isDead = false;

// Gun/ammo config
const MAX_AMMO = 8;
const RELOAD_TIME = 0.6; // seconds
const RECOIL_STRENGTH = 0.06;
const RECOIL_DURATION = 0.05;

const hitMarkerEl = document.getElementById('hitMarker');
let hitMarkerTimer = 0;
let hitMarkerDuration = 0.2;

// For local player guns
const guns = {
    leftGun: { mesh: null, ammo: MAX_AMMO, muzzleFlashTimer: 0 },
    rightGun: { mesh: null, ammo: MAX_AMMO, muzzleFlashTimer: 0 }
};

// Reload
let isReloading = false;
let reloadTimer = 0;

// Recoil
let recoilTimer = 0;
let currentRecoil = 0;

// Projectiles
const projectiles = [];
const projectileSpeed = 50;
const projectileLifetime = 2;

// Shell casings
const shellCasings = [];
// Hit effects
const hitEffects = [];
// Environment
const environmentMeshes = [];

let lastWallNormal = new THREE.Vector3();
let lastWallTime = 0;
const wallJumpGracePeriod = 600; // ms
const wallJumpVerticalSpeed = 7.0;
const wallJumpHorizontalSpeed = 5.0;
const wallSlideSpeed = 1.5;
let isTouchingWall = false;

// Init
init();
animate();

/**
 * init()
 */
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xa0d8f0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    // Floor
    const floorGeo = new THREE.PlaneGeometry(200, 200);
    const floorMat = new THREE.MeshPhongMaterial({ color: 0x777777 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    environmentMeshes.push(floor);

    // Arena Parameters
    const arenaSize = 40;
    const wallHeight = 15;
    const wallThickness = 2;
    const wallColor = 0x444444;

    // Central Platform
    const platform = new THREE.Mesh(
        new THREE.BoxGeometry(arenaSize, 1, arenaSize),
        new THREE.MeshPhongMaterial({ color: 0x666666 })
    );
    platform.position.set(0, 0, 0);
    scene.add(platform);
    environmentMeshes.push(platform);

    // Surrounding Walls with Textures
    const wallMat = new THREE.MeshPhongMaterial({ 
        color: wallColor,
        shininess: 30
    });

    // North Wall
    const northWall = createWall(arenaSize, wallHeight, wallThickness);
    northWall.position.set(0, wallHeight/2, arenaSize/2);
    scene.add(northWall);
    environmentMeshes.push(northWall);

    // South Wall
    const southWall = createWall(arenaSize, wallHeight, wallThickness);
    southWall.position.set(0, wallHeight/2, -arenaSize/2);
    scene.add(southWall);
    environmentMeshes.push(southWall);

    // East Wall
    const eastWall = createWall(wallThickness, wallHeight, arenaSize);
    eastWall.position.set(arenaSize/2, wallHeight/2, 0);
    scene.add(eastWall);
    environmentMeshes.push(eastWall);

    // West Wall
    const westWall = createWall(wallThickness, wallHeight, arenaSize);
    westWall.position.set(-arenaSize/2, wallHeight/2, 0);
    scene.add(westWall);
    environmentMeshes.push(westWall);

    // Vertical Pillars for Wall Jumping
    const pillarGeo = new THREE.BoxGeometry(4, wallHeight, 4);
    const pillarMat = new THREE.MeshPhongMaterial({ color: 0x555555 });
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const radius = arenaSize * 0.35;
        const pillar = new THREE.Mesh(pillarGeo, pillarMat);
        pillar.position.set(
            Math.cos(angle) * radius,
            wallHeight/2,
            Math.sin(angle) * radius
        );
        scene.add(pillar);
        environmentMeshes.push(pillar);
    }

    // Elevated Platforms
    const platformHeight = 12;
    const highPlatform = new THREE.Mesh(
        new THREE.BoxGeometry(15, 1, 15),
        new THREE.MeshPhongMaterial({ color: 0x5a5a5a })
    );
    highPlatform.position.set(0, platformHeight, 0);
    scene.add(highPlatform);
    environmentMeshes.push(highPlatform);

    listener = new THREE.AudioListener();
    scene.add(listener);

    // Audio Loader (add in init())
    const audioLoader = new THREE.AudioLoader();

    // Load sounds
    audioLoader.load('/sounds/gunshot.wav', (buffer) => sounds.gunshot = buffer);
    audioLoader.load('/sounds/reload.mp3', (buffer) => sounds.reload = buffer);
    audioLoader.load('sounds/dash.wav', (buffer) => sounds.dash = buffer);
    audioLoader.load('sounds/jump.wav', (buffer) => sounds.jump = buffer);
    audioLoader.load('sounds/hit.wav', (buffer) => sounds.hit = buffer);
    audioLoader.load('sounds/hurt.wav', (buffer) => sounds.hurt = buffer);
    audioLoader.load('sounds/death.mp3', (buffer) => sounds.death = buffer);
    audioLoader.load('sounds/enemyhit.mp3', (buffer) => sounds.enemyhit = buffer);

    // Floating Platforms
    const floatingPlatform = new THREE.Mesh(
        new THREE.BoxGeometry(10, 1, 10),
        new THREE.MeshPhongMaterial({ color: 0x666666 })
    );
    floatingPlatform.position.set(0, 8, arenaSize/4);
    scene.add(floatingPlatform);
    environmentMeshes.push(floatingPlatform);

    // Pointer lock
    instructions.addEventListener('click', () => {
        // Resolver o AudioContext primeiro
        if (listener.context.state === 'suspended') {
            listener.context.resume().then(() => {
                audioContextSuspended = false;
            });
        }
        
        // Resto do código original
        instructions.style.display = 'none';
        document.body.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', onPointerLockChange, false);
    document.addEventListener('pointerlockerror', onPointerLockError, false);

    // Events
    document.addEventListener('keydown', onKeyDown, false);
    document.addEventListener('keyup', onKeyUp, false);
    document.addEventListener('mousedown', onMouseDown, false);
    document.addEventListener('mousemove', onMouseMove, false);
    window.addEventListener('resize', onWindowResize, false);
    document.addEventListener('keydown', () => {
        if (isDead) {
          resuscitate();
        }
      });

    // Create the local player's group (sphere + camera + guns)
    createLocalPlayer();

    // Initialize Socket.IO
    initSocket();
    initBackgroundAudio();
}

/**
 * Create a local player group that includes:
 *  - A sphere to represent the body
 *  - Two guns on its sides
 *  - The camera (for first-person)
 */

function resuscitate() {
    isDead = false;
    respawnOverlayEl.style.display = 'none';
  
    // Reset local HP
    playerHP = 100;
  
    // Reset local position, e.g. (0,1,0) or any spawn point
    playerGroup.position.set(0, 0, 0);
  
    // Update server
    sendPlayerUpdate();
  }

  function initBackgroundAudio() {
    const audioLoader = new THREE.AudioLoader();
    audioLoader.load('/sounds/background.mp3', (buffer) => {
        const bgSound = new THREE.Audio(listener);
        bgSound.setBuffer(buffer);
        bgSound.setLoop(true);
        bgSound.setVolume(0.1);
        
        // Tocar apenas após interação do usuário
        document.addEventListener('click', () => {
            if (audioContextSuspended) {
                bgSound.play();
                audioContextSuspended = false;
            }
        }, { once: true });
    });
}

function createLocalPlayer() {
    // This group is the root transform for our local player
    playerGroup = new THREE.Group();
    scene.add(playerGroup);

    // Create the sphere (the "body")
    const bodyGeo = new THREE.SphereGeometry(0.5, 16, 16);
    // Make it slightly translucent so we can see from inside if desired
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0x5555ff, opacity: 0, transparent: true });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    // Lower it half its radius so it sits on the floor when y=0
    bodyMesh.position.set(0, 0.5, 0);

    playerGroup.add(bodyMesh);

    // Camera: Place it slightly above the sphere center
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0.5, 0); // inside or slightly above the sphere
    playerGroup.add(camera);

    // Create the two guns, attach them to the sphere
    // so that from the outside, others see them on the sphere’s sides.
    // We'll also keep references in our `guns` object for local shooting logic.
    const leftGun = createGunMesh();
    leftGun.position.set(-0.50, 0.6, -0.5);  // shift left from the center
    playerGroup.add(leftGun);
    guns.leftGun.mesh = leftGun;

    const rightGun = createGunMesh();
    rightGun.position.set(0.50, 0.6, -0.5); // shift right from the center
    playerGroup.add(rightGun);
    guns.rightGun.mesh = rightGun;
}

/**
 * A helper to create the same "sphere + guns" setup for remote players
 * (but we won't attach a camera to them, obviously).
 */
function createPlayerMesh(color = 0xff0000) {
    const group = new THREE.Group();

    // The sphere body
    const sphereGeo = new THREE.SphereGeometry(0.5, 16, 16);
    const sphereMat = new THREE.MeshPhongMaterial({ color });
    const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
    sphereMesh.position.set(0, 0.5, 0);
    group.add(sphereMesh);

    // Left gun
    const leftGun = createGunMesh();
    leftGun.position.set(-0.75, 0.3, 0);
    group.add(leftGun);

    // Right gun
    const rightGun = createGunMesh();
    rightGun.position.set(0.75, 0.3, 0);
    group.add(rightGun);

    // Store references to the guns & muzzle flashes in userData
    group.userData.leftGun = leftGun;
    group.userData.rightGun = rightGun;

    return group;
}

/**
 * Our "shotgun" or "gun" mesh generator
 */
function createGunMesh() {
    const gunGroup = new THREE.Group();

    // BODY
    const bodyGeo = new THREE.BoxGeometry(0.1, 0.15, 0.4);
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0x444444, shininess: 30 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0, 0, -0.2);
    gunGroup.add(body);

    // Pivot for the barrel
    const barrelPivot = new THREE.Group();
    barrelPivot.position.set(0, 0, -0.2);
    gunGroup.add(barrelPivot);

    // BARREL
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

    // STOCK
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

// ---------------------------------
//  POINTER LOCK HANDLERS
// ---------------------------------
function onPointerLockChange() {
    if (document.pointerLockElement === document.body) {
        blocker.style.display = 'none';
    } else {
        blocker.style.display = 'block';
        instructions.style.display = '';
    }
}

function onPointerLockError() {
    instructions.style.display = '';
}

// ---------------------------------
//  KEY/MOUSE EVENTS
// ---------------------------------
function onKeyDown(event) {
    switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
            moveForward = true;
            break;
        case 'KeyS':
        case 'ArrowDown':
            moveBackward = true;
            break;
        case 'KeyA':
        case 'ArrowLeft':
            moveLeft = true;
            break;
        case 'KeyD':
        case 'ArrowRight':
            moveRight = true;
            break;
        case 'Space':
            if (canJump) {
                velocity.y = 10.0;
                playSound(sounds.jump, 0.5);
                canJump = false;
            } else if (performance.now() - lastWallTime < wallJumpGracePeriod) {
                // Wall jump
                velocity.y = wallJumpVerticalSpeed;
                velocity.addScaledVector(lastWallNormal, wallJumpHorizontalSpeed);
                lastWallTime = 0; // Prevent multiple jumps
                playSound(sounds.jump, 0.5);
                canJump = false;
            }
            break;
        case 'KeyR':
            if (!isReloading) {
                startReload();
            }
            break;
        case 'ShiftLeft':
        case 'ShiftRight':
            isRunning = true;
            break;
        case 'KeyQ':
            if (canDash && !isDashing) {
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
            moveForward = false;
            break;
        case 'KeyS':
        case 'ArrowDown':
            moveBackward = false;
            break;
        case 'KeyA':
        case 'ArrowLeft':
            moveLeft = false;
            break;
        case 'KeyD':
        case 'ArrowRight':
            moveRight = false;
            break;
        case 'ShiftLeft':
        case 'ShiftRight':
            isRunning = false;
            break;
        default:
            break;
    }
}

function startDash() {
    isDashing = true;
    dashTimer = 0;
    canDash = false;
    dashCooldownTimer = 0;

    // Calculate dash direction based on camera's forward direction
    const dashDirection = new THREE.Vector3();
    camera.getWorldDirection(dashDirection);
    dashDirection.y = 0; // Keep dash horizontal
    dashDirection.normalize();

    // Apply dash velocity
    velocity.addScaledVector(dashDirection, DASH_SPEED);
    playSound(sounds.dash, 0.6);
}

function onMouseDown(event) {
    // 0 = left click, 2 = right click
    if (event.button === 0) {
        shootGun(guns.leftGun, 'left');
    } else if (event.button === 2) {
        shootGun(guns.rightGun, 'right');
    }
}

function onMouseMove(event) {
    if (document.pointerLockElement === document.body) {
        yaw -= event.movementX * mouseSensitivity;
        pitch -= event.movementY * mouseSensitivity;

        const maxPitch = Math.PI / 2 - 0.01;
        if (pitch > maxPitch) pitch = maxPitch;
        if (pitch < -maxPitch) pitch = -maxPitch;
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ---------------------------------
//  SHOOTING
// ---------------------------------
function shootGun(gun, gunSide) {
    if (isReloading || gun.ammo <= 0 || isRunning) return;

    gun.ammo--;
    updateHUD();

    // Recoil
    recoilTimer = 0;

    // Show muzzle flash
    const muzzleFlash = gun.mesh.userData.muzzleFlash;
    if (muzzleFlash) {
        muzzleFlash.visible = true;
        gun.muzzleFlashTimer = 0;
    }

    // Eject shell
    ejectShell(gun.mesh);

    // Spawn projectile locally
    spawnProjectile(gun.mesh);

    // Tell server we shot
    if (socket) {
        socket.emit('shoot', gunSide);
    }

    playSound(sounds.gunshot, 0.4);
}

function ejectShell(gunMesh) {
    const shellGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.06, 8);
    const shellMat = new THREE.MeshPhongMaterial({ color: 0xb08d57 });
    const shell = new THREE.Mesh(shellGeo, shellMat);

    const worldPos = new THREE.Vector3();
    gunMesh.getWorldPosition(worldPos);
    shell.position.copy(worldPos);
    scene.add(shell);

    const shellVel = new THREE.Vector3(
        (Math.random() - 0.5) * 1.0,
        1 + Math.random() * 0.3,
        (Math.random() - 0.5) * 1.0
    );

    shellCasings.push({
        mesh: shell,
        velocity: shellVel,
        life: 1.5
    });
}

function spawnProjectile(gunMesh) {
    const projGeo = new THREE.SphereGeometry(0.05, 8, 8);
    const projMat = new THREE.MeshPhongMaterial({ color: 0xffffff });
    const projectile = new THREE.Mesh(projGeo, projMat);

    const muzzlePos = new THREE.Vector3();
    gunMesh.userData.muzzleFlash.getWorldPosition(muzzlePos);
    projectile.position.copy(muzzlePos);

    scene.add(projectile);

    // Direction from the camera's perspective
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.normalize();
    const projVel = dir.multiplyScalar(projectileSpeed);

    projectiles.push({
        mesh: projectile,
        velocity: projVel,
        life: 0,
        shooterId: socket.id,
    });
}

function checkPlayerCollision(projectile) {
    const projRadius = 0.05;
    const projPos = projectile.mesh.position;

    // 1. Check collision with other remote players
    for (let id in otherPlayers) {
        const other = otherPlayers[id];
        // The center of the remote player's sphere is at Y=0.5 in your code
        const otherPos = other.position.clone();
        otherPos.y += 0.5; // about the center of that player

        const distance = projPos.distanceTo(otherPos);
        // Player radius ~0.5, projectile radius 0.05
        if (distance < 0.5 + projRadius) {
            // We hit this remote player
            // Notify the server that 'id' was hit by 'shooterId'
            socket.emit('playerHit', {
                victimId: id,
                damage: 15,
                shooterId: projectile.shooterId
            });

            // If the local shooter is me, show a quick "hit marker"
            if (projectile.shooterId === socket.id) {
                playSound(sounds.enemyhit, 2);
                showHitMarker();
            }

            return true; // collision happened
        }
    }

    // 2. Optionally, also check collision with the local player if
    //    you allow self-damage or friendly fire with other local clients, etc.
    //    Usually you'd skip hitting yourself, but if you do want it:
    if (projectile.shooterId !== socket.id) {  
      // Only collide with me if I'm NOT the shooter
      const localPos = playerGroup.position.clone();
      localPos.y += 0.5;
      if (projPos.distanceTo(localPos) < 0.5 + projRadius) {
        // Projectile hit me (the local player):
        socket.emit('playerHit', {
          victimId: socket.id,
          damage: 15,
          shooterId: projectile.shooterId
        });
        // No hit marker for me, since I'm the one being hit here
        return true;
      }
    }

    return false;
}


// ---------------------------------
//  RELOAD
// ---------------------------------
function startReload() {
    isReloading = true;
    reloadTimer = 0;

    playSound(sounds.reload, 0.5);
}

function updateReloadAnimation(delta) {
    reloadTimer += delta;
    let progress = reloadTimer / RELOAD_TIME;
    if (progress > 1) progress = 1;

    const leftGun = guns.leftGun.mesh;
    const rightGun = guns.rightGun.mesh;
    if (!leftGun || !rightGun) return;

    let reloadPhase = progress < 0.5 ? (progress * 2) : (2 - progress * 2);

    // Calculate pull back distance and rotation for a dynamic pump action
    const pullBackDistance = reloadPhase * 0.3; // Adjust this value to control how far back the gun moves
    const tiltAngle = reloadPhase * Math.PI / 3;

    // Apply position and rotation to both guns
    leftGun.position.z = -0.5 - pullBackDistance; // Initial Z position is -0.5, pull back along local Z
    leftGun.rotation.x = tiltAngle; // Tilt the gun upwards

    rightGun.position.z = -0.5 - pullBackDistance;
    rightGun.rotation.x = tiltAngle;

    if (progress >= 1) {
        // Reload complete: reset ammo and gun transforms
        guns.leftGun.ammo = MAX_AMMO;
        guns.rightGun.ammo = MAX_AMMO;

        // Reset gun position and rotation
        leftGun.position.z = -0.5;
        leftGun.rotation.x = 0;
        rightGun.position.z = -0.5;
        rightGun.rotation.x = 0;

        isReloading = false;
        updateHUD();
    }
}

function updateHUD() {
    // Update health
    const healthFill = document.getElementById('healthFill');
    const healthText = document.getElementById('healthText');
    healthFill.style.width = `${playerHP}%`;
    healthText.textContent = playerHP;

    // Update ammo
    const leftAmmoFill = document.getElementById('leftAmmoFill');
    const rightAmmoFill = document.getElementById('rightAmmoFill');
    leftAmmoFill.style.height = `${(guns.leftGun.ammo / MAX_AMMO) * 100}%`;
    rightAmmoFill.style.height = `${(guns.rightGun.ammo / MAX_AMMO) * 100}%`;

    // Update dash cooldown
    const dashProgress = document.getElementById('dashProgress');
    const cooldownProgress = 1 - (dashCooldownTimer / DASH_COOLDOWN);
    dashProgress.style.background = `conic-gradient(#00ffff ${cooldownProgress * 100}%, 0%, rgba(0,0,0,0.3) 100%)`;
}

// ---------------------------------
//  SOCKET.IO
// ---------------------------------
function initSocket() {
    socket = io('http://localhost:3000');
    socket.on('connect', () => {
        console.log('Connected to server. My socket id:', socket.id);
    });

    // Current players
    socket.on('currentPlayers', (players) => {
        for (let id in players) {
            if (id !== socket.id) {
                createOtherPlayer(id, players[id]);
            }
        }
    });

    // A new player joined
    socket.on('newPlayer', (playerData) => {
        if (playerData.id !== socket.id) {
            createOtherPlayer(playerData.id, playerData);
        }
    });

    socket.on('playerKilled', ({ shooterId, victimId }) => {
        // 1) Add kill feed message
        addKillFeedMessage(`${shooterId} killed ${victimId}`);
      
        // 2) If I'm the victim, handle local death
        if (victimId === socket.id) {
          handleLocalPlayerDeath();
        }
      });

    // A remote player updated
    socket.on('playerUpdated', (id, state) => {
        // If the update is for ME (the local player):
        if (id === socket.id) {
            if (typeof state.hp !== 'undefined') {
                playerHP = state.hp;       // update local player's HP
                updateHUD();              // refresh HUD
            }
            // If you want position sync from server, you can also do it here
            // (optional, if you trust the server for authoritative positions)
            if (state.position) {
                playerGroup.position.set(state.position[0], state.position[1], state.position[2]);
            }
        }
        // Otherwise, it's for a REMOTE player
        else {
            const other = otherPlayers[id];
            if (!other) return;
    
            if (typeof state.hp !== 'undefined') {
                other.userData.hp = state.hp;
                // Optionally do something if the remote player has 0 HP, like hide them, etc.
            }
            if (state.position) {
                other.position.set(state.position[0], state.position[1], state.position[2]);
            }
            if (state.rotation) {
                other.rotation.set(state.rotation[0], state.rotation[1], state.rotation[2]);
            }
        }

        if (id === socket.id && state.hp < playerHP) {
            playSound(sounds.hurt, 0.6);
            if (state.hp <= 0) playSound(sounds.death, 0.8);
        }
    });

    // A remote player has fired
    socket.on('playerShot', (playerId, gunSide) => {
        console.log(`Player ${playerId} shot with ${gunSide} gun!`);
        const other = otherPlayers[playerId];
        if (!other) return;

        // Briefly show muzzle flash for that side
        const posAudio = new THREE.PositionalAudio(listener);
        posAudio.setBuffer(sounds.gunshot);
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
            // We don't have a separate timer per remote gun in this example,
            // so just hide it after a short timeout:
            setTimeout(() => {
                gunMesh.userData.muzzleFlash.visible = false;
            }, 50);
        }
    });

    // Player disconnected
    socket.on('playerDisconnected', (id) => {
        if (otherPlayers[id]) {
            scene.remove(otherPlayers[id]);
            delete otherPlayers[id];
        }
    });
}

function addKillFeedMessage(text) {
    killMessages.push({ text, life: KILL_FEED_DURATION });
  }

/**
 * Create the remote player as a sphere + guns
 */
function createOtherPlayer(id, playerData) {
    const color = 0xff0000; // or randomize
    const mesh = createPlayerMesh(color);

    mesh.position.set(
        playerData.position[0],
        playerData.position[1],
        playerData.position[2]
    );

    mesh.rotation.set(
        playerData.rotation[0],
        playerData.rotation[1],
        playerData.rotation[2]
    );

    mesh.userData.hp = playerData.hp || 100;
    mesh.userData.ammoLeft = playerData.ammoLeft || MAX_AMMO;
    mesh.userData.ammoRight = playerData.ammoRight || MAX_AMMO;

    scene.add(mesh);
    otherPlayers[id] = mesh;
}

// ---------------------------------
//  ANIMATION / MAIN LOOP
// ---------------------------------
function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    const delta = (time - prevTime) / 1000;
    prevTime = time;

    // 1) Turn tilt
    const currentYaw = yaw;
    const turnSpeed = currentYaw - lastYaw;
    lastYaw = currentYaw;
    rollAngle += turnSpeed * turnRollFactor;
    rollAngle -= rollAngle * rollDamp * delta;

    // 2) Movement input -> local velocity
    const inputVector = new THREE.Vector3();
    if (moveForward) inputVector.z -= 5;
    if (moveBackward) inputVector.z += 5;
    if (moveLeft) inputVector.x -= 5;
    if (moveRight) inputVector.x += 5;

    const yawRotation = new THREE.Euler(0, yaw, 0, 'YXZ');
    const movementDir = inputVector.clone().applyEuler(yawRotation);

    // 3) Friction & gravity
    const friction = 8.0;
    const moveSpeed = 10.0;
    const gravity = 9.8 * 3.0;

    velocity.x -= velocity.x * friction * delta;
    velocity.z -= velocity.z * friction * delta;
    velocity.y -= gravity * delta;

    // 4) Accelerate
    velocity.x += movementDir.x * moveSpeed * delta;
    velocity.z += movementDir.z * moveSpeed * delta;

    // 5) Update local player position
    playerGroup.position.x += velocity.x * delta;
    playerGroup.position.y += velocity.y * delta;
    playerGroup.position.z += velocity.z * delta;

    // 6) Check ground
    let onGround = false;
    if (playerGroup.position.y < 0) {
        // Using y=0 as ground for the sphere’s center
        velocity.y = 0;
        playerGroup.position.y = 0;
        canJump = true;
        onGround = true;
    }

    checkPlayerCollisions();

    if (isTouchingWall && !onGround) {
        velocity.y = Math.max(velocity.y, -wallSlideSpeed);
    }

    // 7) Head-bob
    const speedXZ = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
    const isMoving = speedXZ > 0.1 && onGround;
    if (isMoving) {
        walkTime += delta * (speedXZ * 0.3);
        const bobOffset = Math.sin(walkTime * bobFrequency) * bobAmplitude;
        // Slight camera vertical bob
        camera.position.y = 1.0 + bobOffset;
    } else {
        walkTime = 0;
        camera.position.y = 1.0; // reset
    }

    // 8) Recoil
    if (recoilTimer < RECOIL_DURATION) {
        recoilTimer += delta;
        const progress = recoilTimer / RECOIL_DURATION;
        currentRecoil = (1 - progress) * RECOIL_STRENGTH;
    } else {
        currentRecoil = 0;
    }
    const finalPitch = pitch - currentRecoil;

    // 9) Apply camera + group rotation
    // We rotate the playerGroup around Y for yaw,
    // and tilt the camera for pitch + roll if desired.
    playerGroup.rotation.y = yaw;
    camera.rotation.x = finalPitch;
    camera.rotation.z = rollAngle;

    guns.leftGun.mesh.rotation.x = camera.rotation.x;
    guns.leftGun.mesh.rotation.z = camera.rotation.z;
    guns.rightGun.mesh.rotation.x = camera.rotation.x;
    guns.rightGun.mesh.rotation.z = camera.rotation.z;

    // 10) Reload animation
    if (isReloading) {
        updateReloadAnimation(delta);
    }

    // Update movement speed based on running state
    const currentMoveSpeed = isRunning ? BASE_MOVE_SPEED * RUN_SPEED_MULTIPLIER : BASE_MOVE_SPEED;
    velocity.x += movementDir.x * currentMoveSpeed * delta;
    velocity.z += movementDir.z * currentMoveSpeed * delta;

    // Update gun tilt when running
    const targetTilt = isRunning ? GUN_TILT_ANGLE : 0;
    currentGunTilt = THREE.MathUtils.lerp(currentGunTilt, targetTilt, delta * 10);
    guns.leftGun.mesh.rotation.x = camera.rotation.x + currentGunTilt;
    guns.rightGun.mesh.rotation.x = camera.rotation.x + currentGunTilt;

    // Handle dash animation and cooldown
    if (isDashing) {
        dashTimer += delta;
        const progress = Math.min(dashTimer / DASH_DURATION, 1.0);
        const roll = Math.sin(progress * Math.PI) * DASH_ROLL_ANGLE;
        camera.rotation.z = roll;

        if (dashTimer >= DASH_DURATION) {
            isDashing = false;
            camera.rotation.z = 0;
        }
    }

    if (!canDash) {
        dashCooldownTimer += delta;
        dashCooldownTimer = Math.min(dashCooldownTimer, DASH_COOLDOWN);
        updateHUD();
    }

    // Update hit marker timer
    if (hitMarkerEl.style.display === 'block') {
        hitMarkerTimer += delta;
        if (hitMarkerTimer > hitMarkerDuration) {
            hitMarkerEl.style.display = 'none';
        }
    }

    // 11) Update muzzle flashes (for local guns)
    updateMuzzleFlashes(delta);

    // 12) Projectiles
    updateProjectiles(delta);

    // 13) Shell casings
    updateShellCasings(delta);

    // 14) Hit effects
    updateHitEffects(delta);

    // 15) Send local player state to server
    sendPlayerUpdate();

    updateKillFeed(delta);

    renderer.render(scene, camera);
}

function showHitMarker() {
    const hitMarker = document.createElement('div');
    hitMarker.className = 'hit-marker';
    document.getElementById('modern-hud').appendChild(hitMarker);
    setTimeout(() => hitMarker.remove(), 300);
}

function updateKillFeed(delta) {
    // Decrement life of each message
    for (let i = killMessages.length - 1; i >= 0; i--) {
      killMessages[i].life -= delta;
      if (killMessages[i].life <= 0) {
        killMessages.splice(i, 1);
      }
    }
  
    // Rebuild the killFeedEl's innerHTML
    killFeedEl.innerHTML = killMessages
      .map(msg => `<div>${msg.text}</div>`)
      .join('');
  }

/**
 * Send local player's data to server
 */
function sendPlayerUpdate() {
    if (!socket) return;
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
    const state = {
        position: pos,
        rotation: rot,
        hp: playerHP,
        ammoLeft: guns.leftGun.ammo,
        ammoRight: guns.rightGun.ammo
    };
    socket.emit('playerUpdate', state);
}

function playSound(buffer, volume = 1) {
    if (!buffer || audioContextSuspended) return;
    
    const sound = new THREE.Audio(listener);
    sound.setBuffer(buffer);
    sound.setVolume(volume);
    sound.play();
    setTimeout(() => sound.disconnect(), 3000);
}

/**
 * Update muzzle flashes for local guns
 */
function updateMuzzleFlashes(delta) {
    [guns.leftGun, guns.rightGun].forEach((gun) => {
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
 * Projectiles movement + collision
 */
function updateProjectiles(delta) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.life += delta;

        // Lifetime check
        if (p.life > projectileLifetime) {
            scene.remove(p.mesh);
            projectiles.splice(i, 1);
            continue;
        }

        // Move projectile
        p.mesh.position.addScaledVector(p.velocity, delta);

        // Check environment collision
        if (checkProjectileCollision(p.mesh)) {
            spawnHitEffect(p.mesh.position);
            scene.remove(p.mesh);
            projectiles.splice(i, 1);
            continue;
        }

        // Check player collision
        if (checkPlayerCollision(p)) {
            spawnHitEffect(p.mesh.position);
            scene.remove(p.mesh);
            projectiles.splice(i, 1);
            continue;
        }
    }
}

function handleLocalPlayerDeath() {
    isDead = true;
    // Stop movement, optionally zero out velocity
    velocity.set(0, 0, 0);
  
    // Show overlay
    respawnOverlayEl.style.display = 'flex'; // or 'block'
  }

function checkProjectileCollision(projMesh) {
    const radius = 0.05;
    const projPos = projMesh.position.clone();

    for (let envMesh of environmentMeshes) {
        const box = new THREE.Box3().setFromObject(envMesh);
        if (box.distanceToPoint(projPos) < radius) {
            return true;
        }
    }
    return false;
}

function spawnHitEffect(position) {
    const geo = new THREE.SphereGeometry(0.1, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
    const puff = new THREE.Mesh(geo, mat);
    puff.position.copy(position);
    scene.add(puff);

    hitEffects.push({ mesh: puff, life: 0 });
    const hitSound = new THREE.PositionalAudio(listener);
    hitSound.setBuffer(sounds.hit);
    hitSound.setRefDistance(20);
    const dummy = new THREE.Object3D();
    dummy.position.copy(position);
    scene.add(dummy);
    dummy.add(hitSound);
    hitSound.play();
    setTimeout(() => scene.remove(dummy), 2000);
}

function updateHitEffects(delta) {
    for (let i = hitEffects.length - 1; i >= 0; i--) {
        const eff = hitEffects[i];
        eff.life += delta;
        const scale = 1 + eff.life * 3;
        eff.mesh.scale.set(scale, scale, scale);
        eff.mesh.material.opacity = 0.8 - eff.life * 0.8;

        if (eff.life > 1) {
            scene.remove(eff.mesh);
            hitEffects.splice(i, 1);
        }
    }
}

function updateShellCasings(delta) {
    for (let i = shellCasings.length - 1; i >= 0; i--) {
        const shell = shellCasings[i];
        shell.life -= delta;
        if (shell.life < 0) {
            scene.remove(shell.mesh);
            shellCasings.splice(i, 1);
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

function checkPlayerCollisions() {
    isTouchingWall = false; // Reset each frame
    const playerSphere = new THREE.Sphere(
        new THREE.Vector3(
            playerGroup.position.x,
            playerGroup.position.y + 0.5,
            playerGroup.position.z
        ),
        0.5
    );

    for (const mesh of environmentMeshes) {
        const box = new THREE.Box3().setFromObject(mesh);
        if (box.intersectsSphere(playerSphere)) {
            const closestPoint = new THREE.Vector3();
            box.clampPoint(playerSphere.center, closestPoint);

            const direction = playerSphere.center.clone().sub(closestPoint);
            const distance = direction.length();

            if (distance < playerSphere.radius) {
                const overlap = playerSphere.radius - distance;
                const normal = direction.normalize();

                playerGroup.position.add(normal.multiplyScalar(overlap));

                const velocityDot = velocity.dot(normal);
                if (velocityDot < 0) {
                    velocity.addScaledVector(normal, -velocityDot);
                }

                // Update wall jump variables
                isTouchingWall = true;
                lastWallNormal.copy(normal);
                lastWallTime = performance.now();
            }
        }
    }
}

function createWall(width, height, depth) {
    return new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        new THREE.MeshPhongMaterial({ 
            color: 0x444444,
            shininess: 30
        })
    );
}