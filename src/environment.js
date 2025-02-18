// environment.js
import * as THREE from 'three';
import { state } from './state.js';

/**
 * Cria o chão e paredes iniciais, plataformas, etc.
 */
export function createEnvironment() {
    const { scene, environmentMeshes } = state;

    // Fundo azul
    scene.background = new THREE.Color(0xa0d8f0);

    // Iluminação
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    // Chão (plane grande)
    const floorGeo = new THREE.PlaneGeometry(200, 200);
    const floorMat = new THREE.MeshPhongMaterial({ color: 0x777777 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    environmentMeshes.push(floor);

    // Arena
    const arenaSize = 40;
    const wallHeight = 15;
    const wallThickness = 2;

    // Plataforma central
    const platformGeo = new THREE.BoxGeometry(arenaSize, 1, arenaSize);
    const platformMat = new THREE.MeshPhongMaterial({ color: 0x666666 });
    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.set(0, 0, 0);
    scene.add(platform);
    environmentMeshes.push(platform);

    // Paredes
    const northWall = createWall(arenaSize, wallHeight, wallThickness);
    northWall.position.set(0, wallHeight / 2, arenaSize / 2);
    scene.add(northWall);
    environmentMeshes.push(northWall);

    const southWall = createWall(arenaSize, wallHeight, wallThickness);
    southWall.position.set(0, wallHeight / 2, -arenaSize / 2);
    scene.add(southWall);
    environmentMeshes.push(southWall);

    const eastWall = createWall(wallThickness, wallHeight, arenaSize);
    eastWall.position.set(arenaSize / 2, wallHeight / 2, 0);
    scene.add(eastWall);
    environmentMeshes.push(eastWall);

    const westWall = createWall(wallThickness, wallHeight, arenaSize);
    westWall.position.set(-arenaSize / 2, wallHeight / 2, 0);
    scene.add(westWall);
    environmentMeshes.push(westWall);

    // Pilares verticais pra wall jump
    const pillarGeo = new THREE.BoxGeometry(4, wallHeight, 4);
    const pillarMat = new THREE.MeshPhongMaterial({ color: 0x555555 });
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const radius = arenaSize * 0.35;
        const pillar = new THREE.Mesh(pillarGeo, pillarMat);
        pillar.position.set(
            Math.cos(angle) * radius,
            wallHeight / 2,
            Math.sin(angle) * radius
        );
        scene.add(pillar);
        environmentMeshes.push(pillar);
    }

    // Plataforma elevada
    const platformHeight = 12;
    const highPlatformGeo = new THREE.BoxGeometry(15, 1, 15);
    const highPlatformMat = new THREE.MeshPhongMaterial({ color: 0x5a5a5a });
    const highPlatform = new THREE.Mesh(highPlatformGeo, highPlatformMat);
    highPlatform.position.set(0, platformHeight, 0);
    scene.add(highPlatform);
    environmentMeshes.push(highPlatform);

    // Plataforma flutuante
    const floatingPlatformGeo = new THREE.BoxGeometry(10, 1, 10);
    const floatingPlatformMat = new THREE.MeshPhongMaterial({ color: 0x666666 });
    const floatingPlatform = new THREE.Mesh(floatingPlatformGeo, floatingPlatformMat);
    floatingPlatform.position.set(0, 8, arenaSize / 4);
    scene.add(floatingPlatform);
    environmentMeshes.push(floatingPlatform);

    return { floor, platform, highPlatform, floatingPlatform };
}

export function createWall(width, height, depth) {
    return new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        new THREE.MeshPhongMaterial({
            color: 0x444444,
            shininess: 30
        })
    );
}

/**
 * Função de checagem de colisão do jogador com o ambiente.
 */
export function checkPlayerCollisions() {
    const {
        playerGroup,
        environmentMeshes,
        isTouchingWall,
        lastWallNormal,
        lastWallTime,
        velocity,
    } = state;

    state.isTouchingWall = false;
    let onGround = false;

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

                // Verifica se está colidindo com o chão
                if (normal.y > 1) {
                    onGround = true;
                    velocity.y = 0;
                }

                // Colisão com paredes
                if (Math.abs(normal.y) < 0.3) {
                    state.isTouchingWall = true;
                    lastWallNormal.copy(normal);
                    state.lastWallTime = performance.now();
                }

                const velocityDot = velocity.dot(normal);
                if (velocityDot < 0) {
                    velocity.addScaledVector(normal, -velocityDot);
                }
            }
        }
    }

    return onGround;
}
