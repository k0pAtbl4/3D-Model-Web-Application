import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/**
 * Scroll-driven camera sequence over the 930.
 *
 * Model coordinates after recentre(): Y up, wheels on y = 0, the nose of the car
 * pointing towards +Z, footprint centred on x = z = 0. Shots are stored in
 * spherical coordinates around a target so that moving between them orbits the
 * car instead of cutting a straight line through the bodywork.
 */
const SHOTS = [
    {
        // Straight down, nose towards the bottom of the screen, car on the left.
        target: new THREE.Vector3(0, 0.6, 0),
        radius: 8.6,
        theta: 0,
        phi: 0.001,
        up: new THREE.Vector3(0, 0, -1),
        fov: 45,
        offsetX: -0.17
    },
    {
        // High and in front, filling the frame with the bonnet.
        target: new THREE.Vector3(0, 0.92, 1.45),
        radius: 4.0,
        theta: 0,
        phi: THREE.MathUtils.degToRad(55),
        up: new THREE.Vector3(0, 1, 0),
        fov: 40,
        offsetX: -0.17
    },
    {
        // Side on from the right, tight on the rear wheel. Rolled so the car stands
        // upright on screen with the nose pointing down.
        target: new THREE.Vector3(0.35, 0.5, -1.2),
        radius: 3.1,
        theta: THREE.MathUtils.degToRad(90),
        phi: THREE.MathUtils.degToRad(78),
        up: new THREE.Vector3(0, 0, -1),
        fov: 38,
        offsetX: -0.22
    },
    {
        // Rear three-quarter, centred, seen from a distance.
        target: new THREE.Vector3(0, 0.8, 0),
        radius: 11.5,
        theta: THREE.MathUtils.degToRad(132),
        phi: THREE.MathUtils.degToRad(68),
        up: new THREE.Vector3(0, 1, 0),
        fov: 30,
        offsetX: 0
    }
];

const NARROW_QUERY = window.matchMedia("(max-width: 900px)");
const TUNE = window.location.hash === "#tune";

const canvas = document.getElementById("scene");
const panels = Array.from(document.querySelectorAll(".panel"));
const navButtons = Array.from(document.querySelectorAll("#chapterNav button"));
const loaderOverlay = document.getElementById("loader");
const loaderFill = document.getElementById("loaderFill");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.05).texture;

const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(4, 8, 6);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0xbfd4ff, 1.1);
rimLight.position.set(-6, 3, -5);
scene.add(rimLight);

new GLTFLoader().load(
    "models/scene.gltf",
    (gltf) => {
        recentre(gltf.scene);
        scene.add(gltf.scene);
        loaderOverlay.classList.add("is-done");
    },
    (event) => {
        if (event.lengthComputable) {
            loaderFill.style.width = (event.loaded / event.total) * 100 + "%";
        }
    },
    (error) => {
        console.error("Could not load the model:", error);
        loaderOverlay.classList.add("is-done");
    }
);

/** Puts the model's footprint on the origin with its wheels on y = 0. */
function recentre(object) {
    const box = new THREE.Box3().setFromObject(object);
    const centre = box.getCenter(new THREE.Vector3());
    object.position.x -= centre.x;
    object.position.z -= centre.z;
    object.position.y -= box.min.y;
}

/** Scroll position as a continuous shot index in [0, SHOTS.length - 1]. */
function scrollProgress() {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    if (scrollable <= 0) {
        return 0;
    }
    const ratio = THREE.MathUtils.clamp(window.scrollY / scrollable, 0, 1);
    return ratio * (SHOTS.length - 1);
}

function smoothstep(t) {
    return t * t * (3 - 2 * t);
}

/** Blends two angles the short way round, so a wound-up turntable unwinds by the near side. */
function lerpAngle(from, to, t) {
    const turn = Math.PI * 2;
    let delta = (to - from) % turn;
    if (delta > Math.PI) {
        delta -= turn;
    } else if (delta < -Math.PI) {
        delta += turn;
    }
    return from + delta * t;
}

/* Radians per second the last shot turns through, and how much of the tail it applies over. */
const TURNTABLE_SPEED = 0.18;
const TURNTABLE_RANGE = [2.75, 3];
let turntable = 0;

const shot = {
    target: new THREE.Vector3(),
    up: new THREE.Vector3(),
    radius: 0,
    theta: 0,
    phi: 0,
    fov: 45,
    offsetX: 0
};

/**
 * Blends the two shots either side of `p` into `shot`. The turntable is folded into the
 * last shot's own azimuth rather than added afterwards, so every blend runs between two
 * absolute angles and landing on a shot always gives that shot's exact framing.
 */
function sampleShots(p) {
    const index = THREE.MathUtils.clamp(Math.floor(p), 0, SHOTS.length - 2);
    const from = SHOTS[index];
    const to = SHOTS[index + 1];
    const t = smoothstep(THREE.MathUtils.clamp(p - index, 0, 1));
    const toTheta = index === SHOTS.length - 2 ? to.theta + turntable : to.theta;

    shot.target.lerpVectors(from.target, to.target, t);
    shot.up.lerpVectors(from.up, to.up, t).normalize();
    shot.radius = THREE.MathUtils.lerp(from.radius, to.radius, t);
    shot.theta = lerpAngle(from.theta, toTheta, t);
    shot.phi = THREE.MathUtils.lerp(from.phi, to.phi, t);
    shot.fov = THREE.MathUtils.lerp(from.fov, to.fov, t);
    shot.offsetX = THREE.MathUtils.lerp(from.offsetX, to.offsetX, t);
}

const position = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const screenUp = new THREE.Vector3();
const pan = new THREE.Vector3();
const lookAt = new THREE.Vector3();

/**
 * Places the camera for the sampled shot. Every value comes from the blended shot, so
 * scrolling back to a shot always restores that shot's exact framing.
 * The screen offset is a fraction of the viewport converted to a world-space pan at
 * the shot distance, so the left half of the screen keeps the car at any aspect ratio.
 */
function placeCamera() {
    const narrow = NARROW_QUERY.matches;
    // Field of view is vertical, so a narrow window crops the car sideways. Back off to compensate.
    const fit = THREE.MathUtils.clamp(1.5 / camera.aspect, 1, 2.8);
    const radius = shot.radius * fit;
    const theta = shot.theta;
    const offsetX = narrow ? 0 : shot.offsetX;
    const offsetY = narrow ? 0.16 : 0;

    position
        .set(
            Math.sin(shot.phi) * Math.sin(theta),
            Math.cos(shot.phi),
            Math.sin(shot.phi) * Math.cos(theta)
        )
        .multiplyScalar(radius)
        .add(shot.target);

    forward.copy(shot.target).sub(position).normalize();
    right.copy(forward).cross(shot.up).normalize();
    screenUp.copy(right).cross(forward).normalize();

    camera.fov = shot.fov;
    camera.updateProjectionMatrix();

    const viewHeight = 2 * radius * Math.tan(THREE.MathUtils.degToRad(shot.fov) / 2);
    const viewWidth = viewHeight * camera.aspect;
    pan.copy(right)
        .multiplyScalar(-offsetX * viewWidth)
        .addScaledVector(screenUp, -offsetY * viewHeight);

    camera.up.copy(shot.up);
    camera.position.copy(position).add(pan);
    lookAt.copy(shot.target).add(pan);
    camera.lookAt(lookAt);
}

/* How far either side of its shot a panel fades out, and how far it travels over that distance. */
const PANEL_FADE = 0.45;
const PANEL_TRAVEL = 110;

function updatePanels(p) {
    const narrow = NARROW_QUERY.matches;
    for (const panel of panels) {
        const index = Number(panel.dataset.chapter);
        const distance = (p - index) / PANEL_FADE;
        const opacity = THREE.MathUtils.clamp(1 - Math.abs(distance), 0, 1);
        // Panels follow the scroll: the one leaving rises, the one arriving comes up from below.
        const shift = -distance * PANEL_TRAVEL;
        panel.style.opacity = opacity;
        panel.style.pointerEvents = opacity > 0.6 ? "auto" : "none";
        panel.style.transform = narrow
            ? "translateY(" + shift + "px)"
            : "translate(0, calc(-50% + " + shift + "px))";
    }

    const active = Math.round(p);
    navButtons.forEach((button, index) => {
        button.classList.toggle("is-active", index === active);
    });
}

function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
}

for (const button of navButtons) {
    button.addEventListener("click", () => {
        const scrollable = document.documentElement.scrollHeight - window.innerHeight;
        const index = Number(button.dataset.chapter);
        window.scrollTo({
            top: (index / (SHOTS.length - 1)) * scrollable,
            behavior: "smooth"
        });
    });
}

window.addEventListener("resize", resize);
resize();

let progress = scrollProgress();
const clock = new THREE.Clock();
const offset = new THREE.Vector3();
let tuneBox = null;
const tuner = TUNE ? createTuner() : null;

/** How much of the last shot's turntable applies at this scroll position. */
function turntableWeight(p) {
    return THREE.MathUtils.smoothstep(p, TURNTABLE_RANGE[0], TURNTABLE_RANGE[1]);
}

/*
 * Dragging on the last shot turns the car by hand. The drag feeds the same turntable angle
 * the idle spin uses, so scrolling away still unwinds it by the shortest route.
 * Vertical drags are left to the browser, so a touch swipe still scrolls the page.
 */
let dragging = false;
let dragOriginX = 0;

canvas.addEventListener("pointerdown", (event) => {
    if (TUNE || turntableWeight(progress) < 0.5) {
        return;
    }
    dragging = true;
    dragOriginX = event.clientX;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("is-dragging");
});

canvas.addEventListener("pointermove", (event) => {
    if (!dragging) {
        return;
    }
    // A drag of one viewport height turns the car a full circle, matching OrbitControls.
    turntable -= ((event.clientX - dragOriginX) * Math.PI * 2) / window.innerHeight;
    dragOriginX = event.clientX;
});

function endDrag(event) {
    if (!dragging) {
        return;
    }
    dragging = false;
    canvas.releasePointerCapture(event.pointerId);
    canvas.classList.remove("is-dragging");
}

canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

function frame() {
    requestAnimationFrame(frame);
    const delta = Math.min(clock.getDelta(), 0.1);

    if (tuner) {
        tuner.update();
        reportTunedShot();
    } else {
        progress = THREE.MathUtils.damp(progress, scrollProgress(), 5, delta);
        const weight = turntableWeight(progress);
        if (!dragging) {
            turntable += weight * delta * TURNTABLE_SPEED;
        }
        canvas.classList.toggle("is-grabbable", weight >= 0.5);
        sampleShots(progress);
        placeCamera();
        updatePanels(progress);
    }

    renderer.render(scene, camera);
}

frame();

/*
 * Framing aid. Add #tune to the URL to take over the camera, orbit to a view you like
 * and read off a SHOTS entry for it. The screen offset is not part of this: frame the
 * subject centred, then set offsetX on the shot to push it off to one side.
 */
function createTuner() {
    // Starts from the wide three-quarter shot, which is a sane place to orbit from.
    sampleShots(SHOTS.length - 1);
    placeCamera();

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.target.copy(shot.target);
    camera.up.set(0, 1, 0);
    controls.update();

    for (const panel of panels) {
        panel.style.opacity = 0;
    }

    const box = document.createElement("pre");
    box.id = "tune";
    document.getElementById("stage").appendChild(box);
    tuneBox = box;

    window.addEventListener("keydown", (event) => {
        if (event.key.toLowerCase() === "f") {
            camera.fov = camera.fov === 45 ? 30 : camera.fov === 30 ? 60 : 45;
            camera.updateProjectionMatrix();
        }
    });

    return controls;
}

function reportTunedShot() {
    offset.copy(camera.position).sub(tuner.target);
    const radius = offset.length();
    const theta = THREE.MathUtils.radToDeg(Math.atan2(offset.x, offset.z));
    const phi = THREE.MathUtils.radToDeg(Math.acos(offset.y / radius));

    tuneBox.textContent = [
        "drag to orbit, scroll to zoom, F cycles fov",
        "",
        "target: new THREE.Vector3(" +
            tuner.target.x.toFixed(2) + ", " +
            tuner.target.y.toFixed(2) + ", " +
            tuner.target.z.toFixed(2) + "),",
        "radius: " + radius.toFixed(2) + ",",
        "theta: THREE.MathUtils.degToRad(" + theta.toFixed(1) + "),",
        "phi: THREE.MathUtils.degToRad(" + phi.toFixed(1) + "),",
        "up: new THREE.Vector3(0, 1, 0),",
        "fov: " + camera.fov.toFixed(0) + ","
    ].join("\n");
}
